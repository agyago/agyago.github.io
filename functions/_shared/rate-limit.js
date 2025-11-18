/**
 * Rate Limiting Utility
 * Uses Cloudflare KV to track request counts per IP address
 */

/**
 * Check if request should be rate limited
 * @param {object} env - Environment bindings (must include PHOTOS_KV)
 * @param {string} clientIP - Client IP address
 * @param {string} endpoint - Endpoint identifier (e.g., 'upload', 'likes')
 * @param {object} limits - Rate limit configuration
 * @returns {object} - { allowed: boolean, retryAfter: number }
 */
export async function checkRateLimit(env, clientIP, endpoint, limits = {}) {
  const {
    maxRequests = 10,     // Maximum requests allowed
    windowSeconds = 60,   // Time window in seconds
  } = limits;

  try {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const key = `ratelimit:${endpoint}:${clientIP}`;

    // Get existing rate limit data
    const dataJson = await env.PHOTOS_KV.get(key);
    let data = dataJson ? JSON.parse(dataJson) : null;

    // Initialize or reset if window expired
    if (!data || (now - data.windowStart) > windowMs) {
      data = {
        windowStart: now,
        count: 0
      };
    }

    // Increment count
    data.count++;

    // Check if limit exceeded
    if (data.count > maxRequests) {
      const retryAfter = Math.ceil((data.windowStart + windowMs - now) / 1000);
      return {
        allowed: false,
        retryAfter,
        limit: maxRequests,
        remaining: 0
      };
    }

    // Store updated data with expiration
    await env.PHOTOS_KV.put(key, JSON.stringify(data), {
      expirationTtl: windowSeconds + 60 // Add buffer to TTL
    });

    return {
      allowed: true,
      retryAfter: 0,
      limit: maxRequests,
      remaining: maxRequests - data.count
    };

  } catch (error) {
    console.error('Rate limit check failed:', error);
    // On error, allow request (fail open)
    return {
      allowed: true,
      retryAfter: 0,
      limit: maxRequests,
      remaining: maxRequests
    };
  }
}

/**
 * Create rate limit response headers
 * @param {object} rateLimitResult - Result from checkRateLimit
 * @returns {object} - Headers object
 */
export function getRateLimitHeaders(rateLimitResult) {
  return {
    'X-RateLimit-Limit': String(rateLimitResult.limit),
    'X-RateLimit-Remaining': String(rateLimitResult.remaining),
    ...(rateLimitResult.retryAfter > 0 && {
      'Retry-After': String(rateLimitResult.retryAfter)
    })
  };
}
