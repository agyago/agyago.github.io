/**
 * OAuth Login Initiation
 * Redirects user to GitHub OAuth authorization page
 */
export async function onRequest({ env }) {
  try {
    // Validate required environment variables
    if (!env.GITHUB_CLIENT_ID) {
      return new Response(
        'Configuration Error: GITHUB_CLIENT_ID is not configured. Please add it to your Cloudflare Pages environment variables.',
        {
          status: 500,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    if (!env.SITE_URL) {
      return new Response(
        'Configuration Error: SITE_URL is not configured. Please add it to your Cloudflare Pages environment variables.',
        {
          status: 500,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    const clientId = env.GITHUB_CLIENT_ID;
    const redirectUri = `${env.SITE_URL}/api/auth/callback`;

    // Generate random state for CSRF protection
    const state = crypto.randomUUID();

    // Build GitHub OAuth URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo', // Permission to write to repository
      state: state
    });

    const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

    // Store state in secure cookie for verification in callback
    return new Response(null, {
      status: 302,
      headers: {
        'Location': githubAuthUrl,
        'Set-Cookie': `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` // 10 min expiry
      }
    });

  } catch (error) {
    console.error('OAuth login error:', error);
    return new Response(
      `Login failed: ${error.message}`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}
