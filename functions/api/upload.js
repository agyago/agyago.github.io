/**
 * File Upload Handler
 * Handles authenticated file uploads to GitHub repository
 */

// Session verification (same as status.js)
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

// Upload file to GitHub via API
async function uploadToGitHub(filename, content, githubToken, repoOwner, repoName, branch) {
  const path = `uploads/${filename}`;
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`;

  // Check if file already exists
  let sha = null;
  try {
    const checkResponse = await fetch(url, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'PhotoUpload-App'
      }
    });
    if (checkResponse.ok) {
      const existing = await checkResponse.json();
      sha = existing.sha;
    }
  } catch (error) {
    // File doesn't exist, which is fine
  }

  // Upload or update file
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'PhotoUpload-App'
    },
    body: JSON.stringify({
      message: `Add photo: ${filename}`,
      content: content,
      branch: branch,
      ...(sha && { sha })
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${error}`);
  }

  return await response.json();
}

// Validate file
function validateFile(file, filename) {
  const maxSize = 20 * 1024 * 1024; // 20MB
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];

  // Check filename exists
  if (!filename) {
    throw new Error('File has no name');
  }

  // Check size
  if (file.size > maxSize) {
    throw new Error(`File ${filename} is too large. Max size is 20MB.`);
  }

  // Check type
  const fileType = file.type ? file.type.toLowerCase() : '';
  if (!allowedTypes.includes(fileType) &&
      !allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext))) {
    throw new Error(`File ${filename} is not a supported image type.`);
  }

  // Check filename for malicious patterns
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error(`Invalid filename: ${filename}`);
  }

  return true;
}

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

    // Parse multipart form data
    const formData = await request.formData();
    const files = formData.getAll('files');

    if (files.length === 0) {
      return new Response('No files uploaded', { status: 400 });
    }

    // Validate file count
    if (files.length > 10) {
      return new Response('Maximum 10 files per upload', { status: 400 });
    }

    // Get GitHub configuration
    const githubToken = env.GITHUB_TOKEN;
    const repoOwner = env.REPO_OWNER || 'agyago';
    const repoName = env.REPO_NAME || 'agyago.github.io';
    const branch = env.REPO_BRANCH || 'main';

    const results = [];
    const errors = [];

    // Process each file
    for (const file of files) {
      try {
        // Log file details for debugging
        const filename = file?.name || 'unnamed';
        const fileType = file?.type || 'unknown';
        const fileSize = file?.size || 0;

        console.log(`Processing file: ${filename}, type: ${fileType}, size: ${fileSize}`);

        validateFile(file, filename);

        // Convert file to base64
        const arrayBuffer = await file.arrayBuffer();
        const base64Content = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ''
          )
        );

        // Upload to GitHub
        await uploadToGitHub(
          filename,
          base64Content,
          githubToken,
          repoOwner,
          repoName,
          branch
        );

        results.push({ filename, status: 'success' });
      } catch (error) {
        console.error(`Error processing file:`, error);
        errors.push({
          filename: file?.name || 'unknown',
          error: error.message || String(error),
          stack: error.stack
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
