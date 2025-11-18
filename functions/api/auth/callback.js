/**
 * OAuth Callback Handler
 * Receives OAuth code from GitHub, exchanges for token, creates session
 */

// Simple JWT-like session token creation
async function createSessionToken(username, secret) {
  const payload = {
    username: username,
    exp: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
  };

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, data);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return btoa(JSON.stringify(payload)) + '.' + signatureHex;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    return new Response(`OAuth Error: ${error}`, {
      status: 400,
      headers: { 'Content-Type': 'text/html' }
    });
  }

  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }

  // Validate state parameter (CSRF protection)
  const cookies = request.headers.get('Cookie') || '';
  const stateCookie = cookies.split(';')
    .find(c => c.trim().startsWith('oauth_state='))
    ?.split('=')[1];

  if (!state || !stateCookie || state !== stateCookie) {
    return new Response('Invalid state parameter. Possible CSRF attack detected.', {
      status: 403,
      headers: { 'Content-Type': 'text/html' }
    });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: code
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;

    // Get user information
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'PhotoUpload-App'
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user information');
    }

    const userData = await userResponse.json();

    // Verify user is allowed
    const allowedUsername = env.ALLOWED_USERNAME || 'agyago';
    if (userData.login !== allowedUsername) {
      return new Response(
        `Access Denied: Only ${allowedUsername} can upload photos.`,
        {
          status: 403,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Create encrypted session token
    const sessionToken = await createSessionToken(userData.login, env.SESSION_SECRET);

    // Set secure cookie and redirect to upload page
    // Clear the oauth_state cookie after successful authentication
    const sessionCookie = `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`;
    const clearStateCookie = 'oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/upload.html',
        'Set-Cookie': [sessionCookie, clearStateCookie]
      }
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(
      `Authentication failed: ${error.message}`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}
