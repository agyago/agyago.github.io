/**
 * Check Authentication Status
 * Returns whether user is authenticated and their username
 */

async function verifySessionToken(token, secret) {
  try {
    const [payloadB64, signatureHex] = token.split('.');
    const payload = JSON.parse(atob(payloadB64));

    // Check expiration
    if (payload.exp < Date.now()) {
      return null;
    }

    // Verify signature
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

export async function onRequest({ request, env }) {
  const cookies = request.headers.get('Cookie') || '';
  const sessionMatch = cookies.match(/session=([^;]+)/);

  if (!sessionMatch) {
    return new Response(JSON.stringify({ authenticated: false }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const sessionToken = sessionMatch[1];
  const session = await verifySessionToken(sessionToken, env.SESSION_SECRET);

  if (!session) {
    return new Response(JSON.stringify({ authenticated: false }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    authenticated: true,
    username: session.username
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
