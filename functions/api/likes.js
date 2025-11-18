// Likes API for photo gallery
// GET: Returns like count and whether current IP has liked
// POST: Toggles like (add/remove)

import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limit.js';

async function hashIP(ip, salt) {
  const encoder = new TextEncoder();
  // Use environment variable for salt, fallback to default if not set
  const actualSalt = salt || 'default-salt-change-in-production';
  const data = encoder.encode(ip + actualSalt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getClientIP(request) {
  // Cloudflare provides the real IP in CF-Connecting-IP header
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0] ||
         'unknown';
}

// GET /api/likes?photo=IMG_0162.jpg
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const photoName = url.searchParams.get('photo');

  if (!photoName) {
    return new Response(JSON.stringify({ error: 'Missing photo parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const clientIP = getClientIP(request);

    // Rate limiting: 30 requests per minute for GET
    const rateLimit = await checkRateLimit(env, clientIP, 'likes-get', {
      maxRequests: 30,
      windowSeconds: 60
    });

    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: rateLimit.retryAfter
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...getRateLimitHeaders(rateLimit)
        }
      });
    }

    const ipHash = await hashIP(clientIP, env.IP_HASH_SALT);

    // Get total like count for this photo
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM likes WHERE photo_name = ?'
    ).bind(photoName).first();

    // Check if current IP has liked this photo
    const likedResult = await env.DB.prepare(
      'SELECT COUNT(*) as liked FROM likes WHERE photo_name = ? AND ip_hash = ?'
    ).bind(photoName, ipHash).first();

    return new Response(JSON.stringify({
      photo: photoName,
      count: countResult.count || 0,
      liked: (likedResult.liked || 0) > 0
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...getRateLimitHeaders(rateLimit)
      }
    });

  } catch (error) {
    console.error('Error fetching likes:', error);
    return new Response(JSON.stringify({
      error: 'Database error',
      count: 0,
      liked: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// POST /api/likes
// Body: { photo: "IMG_0162.jpg" }
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const photoName = body.photo;

    if (!photoName) {
      return new Response(JSON.stringify({ error: 'Missing photo in request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const clientIP = getClientIP(request);

    // Rate limiting: 10 likes/unlikes per minute (more strict than GET)
    const rateLimit = await checkRateLimit(env, clientIP, 'likes-post', {
      maxRequests: 10,
      windowSeconds: 60
    });

    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: rateLimit.retryAfter
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...getRateLimitHeaders(rateLimit)
        }
      });
    }

    const ipHash = await hashIP(clientIP, env.IP_HASH_SALT);
    const timestamp = Date.now();

    // Check if already liked
    const existingLike = await env.DB.prepare(
      'SELECT id FROM likes WHERE photo_name = ? AND ip_hash = ?'
    ).bind(photoName, ipHash).first();

    if (existingLike) {
      // Unlike - remove the like
      await env.DB.prepare(
        'DELETE FROM likes WHERE photo_name = ? AND ip_hash = ?'
      ).bind(photoName, ipHash).run();

      // Get updated count
      const countResult = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM likes WHERE photo_name = ?'
      ).bind(photoName).first();

      return new Response(JSON.stringify({
        action: 'unliked',
        photo: photoName,
        count: countResult.count || 0,
        liked: false
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...getRateLimitHeaders(rateLimit)
        }
      });

    } else {
      // Like - add new like
      await env.DB.prepare(
        'INSERT INTO likes (photo_name, ip_hash, created_at) VALUES (?, ?, ?)'
      ).bind(photoName, ipHash, timestamp).run();

      // Get updated count
      const countResult = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM likes WHERE photo_name = ?'
      ).bind(photoName).first();

      return new Response(JSON.stringify({
        action: 'liked',
        photo: photoName,
        count: countResult.count || 0,
        liked: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...getRateLimitHeaders(rateLimit)
        }
      });
    }

  } catch (error) {
    console.error('Error toggling like:', error);
    return new Response(JSON.stringify({
      error: 'Failed to toggle like',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
