/**
 * OAuth Login Initiation
 * Redirects user to GitHub OAuth authorization page
 */
export async function onRequest({ env }) {
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
  return Response.redirect(githubAuthUrl, {
    status: 302,
    headers: {
      'Set-Cookie': `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` // 10 min expiry
    }
  });
}
