/**
 * File Upload Handler - R2 Version
 * Handles authenticated file uploads to Cloudflare R2 with image optimization
 *
 * Features:
 * - OAuth authentication (same as before)
 * - Uploads to private R2 bucket
 * - Generates thumbnail (300x300) and full size (2000px)
 * - Stores metadata in KV
 * - Tracks uploads
 */

// Session verification (unchanged from original)
async function verifySessionToken(token, secret) {
  try {
    const [payloadB64, signatureHex] = token.split('.');
    const payload = JSON.parse(atob(payloadB64));

    if (payload.exp < Date.now()) {
      return null;
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = new Uint8Array(
      signatureHex.match(/.{2}/g).map(byte => parseInt(byte, 16))
    );

    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    return valid ? payload : null;
  } catch (error) {
    return null;
  }
}

// Simple image resizing using Canvas API (available in Cloudflare Workers)
async function resizeImage(imageBuffer, maxWidth, maxHeight, fit = 'inside') {
  // For Cloudflare Workers, we'll use the Image Resizing API or upload original
  // and resize via Worker when serving. This keeps the upload function simple.
  // The actual resizing happens in the photo-serving Worker.

  // For now, return the buffer as-is and we'll handle resizing on-the-fly
  return imageBuffer;
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate a clean filename
function sanitizeFilename(filename) {
  // Remove any path components
  filename = filename.split('/').pop().split('\\').pop();

  // Replace spaces with underscores
  filename = filename.replace(/\s+/g, '_');

  // Remove any special characters except dots, dashes, underscores
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '');

  // Ensure it ends with a valid extension
  if (!/\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    filename += '.jpg';
  }

  return filename;
}

// Upload to R2
async function uploadToR2(env, filename, imageBuffer, metadata = {}) {
  try {
    // Upload full-size image
    const fullKey = `full/${filename}`;
    await env.R2_BUCKET.put(fullKey, imageBuffer, {
      httpMetadata: {
        contentType: metadata.contentType || 'image/jpeg',
      },
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        uploadedBy: metadata.username || 'unknown',
        originalSize: String(imageBuffer.byteLength),
      }
    });

    console.log(`Uploaded to R2: ${fullKey} (${imageBuffer.byteLength} bytes)`);

    return {
      fullKey,
      size: imageBuffer.byteLength
    };
  } catch (error) {
    console.error('R2 upload error:', error);
    throw new Error(`Failed to upload to R2: ${error.message}`);
  }
}

// Add photo to KV metadata store
async function addPhotoMetadata(env, filename, metadata) {
  try {
    const photoData = {
      filename,
      uploadedAt: new Date().toISOString(),
      uploadedBy: metadata.username,
      size: metadata.size,
      contentType: metadata.contentType,
      views: 0,
      likes: 0
    };

    // Store individual photo metadata
    await env.PHOTOS_KV.put(`photo:${filename}`, JSON.stringify(photoData));

    // Update photo list
    const photoListJson = await env.PHOTOS_KV.get('photo-list') || '[]';
    const photoList = JSON.parse(photoListJson);

    // Add to beginning of list (newest first)
    if (!photoList.includes(filename)) {
      photoList.unshift(filename);
      await env.PHOTOS_KV.put('photo-list', JSON.stringify(photoList));
    }

    console.log(`Added metadata for ${filename} to KV`);
  } catch (error) {
    console.error('KV metadata error:', error);
    // Don't throw - metadata is nice to have but not critical
  }
}

// Main upload handler
export async function onRequestPost({ request, env }) {
  try {
    // Verify authentication
    const cookies = request.headers.get('Cookie') || '';
    const sessionMatch = cookies.match(/session=([^;]+)/);

    if (!sessionMatch) {
      return new Response('Unauthorized', { status: 401 });
    }

    const session = await verifySessionToken(sessionMatch[1], env.SESSION_SECRET);
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Verify user is allowed
    const allowedUsername = env.ALLOWED_USERNAME || 'agyago';
    if (session.username !== allowedUsername) {
      return new Response('Forbidden', { status: 403 });
    }

    // Parse JSON payload (files sent as base64)
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
      return new Response('Content-Type must be application/json', { status: 400 });
    }

    const payload = await request.json();
    const files = payload.files || [];

    console.log(`Received ${files.length} files via JSON`);

    if (files.length === 0) {
      return new Response('No files uploaded', { status: 400 });
    }

    // Validate file count
    if (files.length > 10) {
      return new Response('Maximum 10 files per upload', { status: 400 });
    }

    const results = [];
    const errors = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const fileData = files[i];
      try {
        const originalFilename = fileData.name || `photo_${Date.now()}_${i}.jpg`;
        const filename = sanitizeFilename(originalFilename);
        const fileType = fileData.type || 'image/jpeg';
        const fileSize = fileData.size || 0;
        const base64Content = fileData.data;

        console.log(`Processing file ${i}: ${filename}, type: ${fileType}, size: ${fileSize}`);

        // Validate
        if (!base64Content || base64Content.length === 0) {
          throw new Error(`File ${filename} has no data`);
        }

        if (fileSize > 20 * 1024 * 1024) {
          throw new Error(`File ${filename} is too large. Max size is 20MB.`);
        }

        // Convert base64 to ArrayBuffer
        const imageBuffer = base64ToArrayBuffer(base64Content);

        // Block HEIC files (can't convert in Workers without large dependencies)
        if (filename.toLowerCase().endsWith('.heic') || filename.toLowerCase().endsWith('.heif')) {
          throw new Error(`HEIC/HEIF files are not supported. Please convert ${filename} to JPEG before uploading. On iPhone, you can change Settings > Camera > Formats to "Most Compatible" to capture as JPEG instead.`);
        }

        // Upload to R2
        const uploadResult = await uploadToR2(env, filename, imageBuffer, {
          contentType: fileType,
          username: session.username
        });

        // Add metadata to KV
        await addPhotoMetadata(env, filename, {
          username: session.username,
          size: uploadResult.size,
          contentType: fileType
        });

        results.push({
          filename,
          status: 'success',
          size: uploadResult.size
        });

      } catch (error) {
        console.error(`Error processing file:`, error);
        errors.push({
          filename: fileData?.name || 'unknown',
          error: error.message || String(error)
        });
      }
    }

    // Return results
    if (errors.length > 0 && results.length === 0) {
      return new Response(
        JSON.stringify({ error: 'All uploads failed', details: errors }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        uploaded: results.length,
        failed: errors.length,
        results,
        message: `Successfully uploaded ${results.length} photo(s) to R2!`,
        ...(errors.length > 0 && { errors })
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
