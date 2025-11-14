/**
 * Get Comments for a Photo
 * GET /api/comments?photo=IMG_0162.jpg
 */
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const photoName = url.searchParams.get('photo');

    if (!photoName) {
      return new Response(JSON.stringify({ error: 'Missing photo parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Query D1 database
    const { results } = await env.DB.prepare(
      'SELECT id, photo_name, author_name, comment_text, created_at FROM comments WHERE photo_name = ? ORDER BY created_at DESC'
    ).bind(photoName).all();

    return new Response(JSON.stringify({ comments: results }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    console.error('Error fetching comments:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch comments' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Add a Comment
 * POST /api/comments
 * Body: { photo: "IMG_0162.jpg", author: "John", text: "Great photo!" }
 */
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { photo, author, text } = body;

    // Validation
    if (!photo || !text) {
      return new Response(JSON.stringify({ error: 'Missing photo or text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (text.length > 1000) {
      return new Response(JSON.stringify({ error: 'Comment too long (max 1000 characters)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting: Check IP
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = await hashIP(clientIP);

    // Check if IP posted in last 60 seconds
    const recentCheck = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM comments WHERE ip_hash = ? AND created_at > ?'
    ).bind(ipHash, Date.now() - 60000).first();

    if (recentCheck && recentCheck.count >= 3) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait before commenting again.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Insert comment
    const result = await env.DB.prepare(
      'INSERT INTO comments (photo_name, author_name, comment_text, created_at, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      photo,
      author || 'Anonymous',
      text,
      Date.now(),
      ipHash,
      request.headers.get('User-Agent') || 'unknown'
    ).run();

    // Get the inserted comment
    const newComment = await env.DB.prepare(
      'SELECT id, photo_name, author_name, comment_text, created_at FROM comments WHERE id = ?'
    ).bind(result.meta.last_row_id).first();

    return new Response(JSON.stringify({ comment: newComment }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error adding comment:', error);
    return new Response(JSON.stringify({ error: 'Failed to add comment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Hash IP for privacy (one-way hash)
async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
