/**
 * Delete a Comment (Admin Only)
 * DELETE /api/comments/123
 */

// Session verification (same as upload.js)
async function verifySession(sessionToken, secret) {
  try {
    const [payloadB64, signatureHex] = sessionToken.split('.');
    const payload = JSON.parse(atob(payloadB64));

    if (payload.exp < Date.now()) return null;

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
  } catch {
    return null;
  }
}

export async function onRequestDelete({ request, env, params }) {
  try {
    // Verify authentication (admin only)
    const cookies = request.headers.get('Cookie') || '';
    const sessionMatch = cookies.match(/session=([^;]+)/);

    if (!sessionMatch) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const session = await verifySession(sessionMatch[1], env.SESSION_SECRET);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify user is allowed
    const allowedUsername = env.ALLOWED_USERNAME || 'agyago';
    if (session.username !== allowedUsername) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delete comment
    const commentId = params.id;
    const result = await env.DB.prepare(
      'DELETE FROM comments WHERE id = ?'
    ).bind(commentId).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: 'Comment not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error deleting comment:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete comment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
