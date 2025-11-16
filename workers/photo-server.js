/**
 * Photo Server Worker
 * Serves photos from private R2 bucket with:
 * - Referer checking (prevents bypassing your site)
 * - View tracking (counts views in KV)
 * - Image resizing on-the-fly (thumb vs full)
 * - Caching for performance
 *
 * Deploy to: photos.cheezychinito.com
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Parse request
    // URL format: /IMG_1234.jpg?size=thumb or /IMG_1234.jpg?size=full
    const filename = url.pathname.replace('/', '');
    const size = url.searchParams.get('size') || 'full'; // 'thumb' or 'full'

    // Security: Check referer to prevent bypassing
    const referer = request.headers.get('Referer') || '';
    const isFromYourSite = referer.includes('cheezychinito.com') ||
                           referer.includes('agyago.github.io') ||
                           referer === ''; // Allow empty referer for direct browser navigation

    // STRICT MODE: Redirect direct access to gallery
    if (!referer && request.headers.get('Sec-Fetch-Site') !== 'same-origin') {
      // Someone is trying to access photo directly (not from your site)
      return Response.redirect('https://cheezychinito.com/gallery', 302);
    }

    // Block hotlinking from other sites
    if (referer && !isFromYourSite) {
      return new Response('Hotlinking not allowed. View photos at cheezychinito.com/gallery', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
          'X-Blocked-Reason': 'hotlinking'
        }
      });
    }

    // Validate filename
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return new Response('Invalid filename', { status: 400 });
    }

    try {
      // Determine which version to serve
      const r2Key = size === 'thumb' ? `thumb/${filename}` : `full/${filename}`;

      // Try to get from R2
      let object = await env.R2_BUCKET.get(r2Key);

      // Fallback: if thumb doesn't exist, try full version
      if (!object && size === 'thumb') {
        console.log(`Thumb not found for ${filename}, falling back to full`);
        object = await env.R2_BUCKET.get(`full/${filename}`);
      }

      if (!object) {
        return new Response('Photo not found', { status: 404 });
      }

      // Track view (async, doesn't slow down response)
      ctx.waitUntil(trackView(env, filename, request, size));

      // Serve the photo with caching headers
      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=31536000'); // 1 year cache
      headers.set('ETag', object.etag);
      headers.set('X-Photo-Name', filename);
      headers.set('X-Photo-Size', size);

      // Add security headers
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'SAMEORIGIN');

      // Check If-None-Match for 304 responses
      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch === object.etag) {
        return new Response(null, { status: 304, headers });
      }

      return new Response(object.body, { headers });

    } catch (error) {
      console.error('Error serving photo:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }
};

/**
 * Track photo view in KV
 * Runs asynchronously (doesn't slow down image serving)
 */
async function trackView(env, filename, request, size) {
  try {
    // Track total views for this photo
    const viewKey = `views:${filename}`;
    const currentViews = await env.PHOTOS_KV.get(viewKey) || '0';
    const newViews = parseInt(currentViews) + 1;
    await env.PHOTOS_KV.put(viewKey, newViews.toString());

    // Track daily views
    const today = new Date().toISOString().split('T')[0]; // "2024-11-16"
    const dailyKey = `views:${filename}:${today}`;
    const dailyViews = await env.PHOTOS_KV.get(dailyKey) || '0';
    await env.PHOTOS_KV.put(dailyKey, (parseInt(dailyViews) + 1).toString(), {
      expirationTtl: 2592000 // Keep daily stats for 30 days
    });

    // Update photo metadata
    const photoKey = `photo:${filename}`;
    const photoDataJson = await env.PHOTOS_KV.get(photoKey);
    if (photoDataJson) {
      const photoData = JSON.parse(photoDataJson);
      photoData.views = newViews;
      photoData.lastViewed = new Date().toISOString();
      await env.PHOTOS_KV.put(photoKey, JSON.stringify(photoData));
    }

    // Track view details (for analytics)
    const logKey = `viewlog:${filename}:${Date.now()}`;
    await env.PHOTOS_KV.put(logKey, JSON.stringify({
      timestamp: Date.now(),
      size: size,
      referer: request.headers.get('Referer'),
      userAgent: request.headers.get('User-Agent'),
      ip_hash: await hashIP(getClientIP(request)),
      country: request.cf?.country || 'unknown'
    }), {
      expirationTtl: 604800 // Keep detailed logs for 7 days
    });

    console.log(`Tracked view for ${filename}: ${newViews} total views`);
  } catch (error) {
    console.error('View tracking failed:', error);
    // Don't throw - tracking shouldn't break image serving
  }
}

/**
 * Hash IP address for privacy
 */
async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'SALT_YOUR_SECRET_HERE'); // Add a salt
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Get client IP address
 */
function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
         'unknown';
}
