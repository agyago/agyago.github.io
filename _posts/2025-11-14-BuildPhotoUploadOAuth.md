---
layout: post
title: "How I Built a Secure Photo Upload System with GitHub OAuth and Cloudflare Pages"
description: "Step-by-step guide to building a serverless photo upload system using GitHub OAuth for authentication, Cloudflare Pages Functions for the backend, and the GitHub API for storage. Learn how to handle file uploads securely without exposing credentials."
tags: cloudflare oauth authentication serverless javascript github-api tutorial
date: 2025-11-14
---

# How I Built a Secure Photo Upload System with GitHub OAuth and Cloudflare Pages

I wanted a simple way to upload photos to my personal website's gallery from my phone. But I quickly realized that building a secure upload system is tricky - how do you allow uploads without exposing your credentials to the internet?

After some trial and error, I built a solution using **GitHub OAuth**, **Cloudflare Pages Functions**, and the **GitHub API**. Best of all, it's completely free and runs on serverless infrastructure.

Here's how I did it.

## The Problem

My photo gallery was static - hosted on GitHub Pages with images stored in the repository. To add photos, I had to:

1. Connect to my computer
2. Add images to the repo
3. Commit and push
4. Wait for deployment

Not ideal when I want to quickly share a photo from my phone.

**Requirements:**
- Upload from mobile (iPhone/Android)
- Secure (only I can upload)
- Free to run
- No backend server to maintain
- Images stored in GitHub (version controlled)

## The Solution Architecture

```
Mobile Phone
    ↓ Select photo
Upload Page (Static HTML)
    ↓ Convert to Base64, send as JSON
Cloudflare Pages Function (Serverless)
    ↓ Verify OAuth session
    ↓ Upload via GitHub API
GitHub Repository
    ↓ Trigger GitHub Action
Auto-optimize images
    ↓ Deploy
Live Gallery Updated!
```

## Why This Stack?

**GitHub OAuth** - Industry-standard authentication, no passwords to manage

**Cloudflare Pages Functions** - Free serverless functions (100K requests/day)

**GitHub API** - Free storage, version control, automatic deployments

**Base64 + JSON** - Works around binary upload limitations in serverless environments

## Part 1: Understanding OAuth Flow

OAuth might seem complex, but the concept is simple: instead of storing passwords, you redirect users to GitHub for authentication.

**The Flow:**

```
1. User clicks "Login with GitHub"
   → Redirect to GitHub OAuth page

2. GitHub shows: "Authorize this app?"
   → User clicks "Authorize"

3. GitHub redirects back with temporary code
   → Your backend exchanges code for access token

4. Backend creates session cookie
   → User is logged in!
```

**Why OAuth is secure:**
- Your app never sees the user's GitHub password
- GitHub confirms identity
- Tokens can be revoked instantly
- Scoped permissions (only access what's needed)

## Part 2: Setting Up GitHub OAuth App

First, create an OAuth application in GitHub:

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: "Photo Upload App"
   - **Homepage URL**: `https://yourdomain.com`
   - **Authorization callback URL**: `https://yourdomain.com/api/auth/callback`
4. Save the **Client ID** and **Client Secret**

**Important:** Never commit Client Secret to your repository! Store it as an environment variable.

## Part 3: Building the Upload Interface

Create a mobile-friendly upload page (`upload.html`):

```html
<div id="authSection">
  <h1>Upload Photos</h1>
  <a href="/api/auth/login">
    <button>Login with GitHub</button>
  </a>
</div>

<div id="uploadSection" style="display:none">
  <h2>Welcome, <span id="username"></span>!</h2>
  <input type="file" id="fileInput" accept="image/*" multiple>
  <button onclick="uploadFiles()">Upload</button>
  <div id="status"></div>
</div>

<script>
// Check if user is authenticated
window.addEventListener('DOMContentLoaded', async () => {
  const response = await fetch('/api/auth/status');
  if (response.ok) {
    const data = await response.json();
    if (data.authenticated) {
      showUploadSection(data.username);
    }
  }
});

function showUploadSection(username) {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('uploadSection').style.display = 'block';
  document.getElementById('username').textContent = username;
}
</script>
```

## Part 4: OAuth Login Handler (Serverless Function)

Create `functions/api/auth/login.js`:

```javascript
export async function onRequest({ env }) {
  const clientId = env.GITHUB_CLIENT_ID;
  const redirectUri = `${env.SITE_URL}/api/auth/callback`;

  const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${clientId}&` +
    `redirect_uri=${redirectUri}&` +
    `scope=repo`;

  return Response.redirect(githubAuthUrl, 302);
}
```

## Part 5: OAuth Callback Handler

Create `functions/api/auth/callback.js`:

```javascript
async function createSessionToken(username, secret) {
  const payload = {
    username: username,
    exp: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
  };

  // Create HMAC signature
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

  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }

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
  const accessToken = tokenData.access_token;

  // Get user information
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  const userData = await userResponse.json();

  // Verify user is allowed (only your username)
  const allowedUsername = env.ALLOWED_USERNAME;
  if (userData.login !== allowedUsername) {
    return new Response('Access Denied', { status: 403 });
  }

  // Create encrypted session token
  const sessionToken = await createSessionToken(userData.login, env.SESSION_SECRET);

  // Set cookie and redirect
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/upload.html',
      'Set-Cookie': `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
    }
  });
}
```

## Part 6: File Upload Handler

Here's where it gets interesting. **Cloudflare Workers don't handle binary FormData well**, so we convert files to Base64 in the browser and send as JSON.

**Frontend (upload.html):**

```javascript
async function uploadFiles() {
  const files = document.getElementById('fileInput').files;

  // Convert files to Base64
  const filesData = await Promise.all(
    Array.from(files).map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1]; // Remove data URL prefix
          resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64
          });
        };
        reader.readAsDataURL(file);
      });
    })
  );

  // Send as JSON
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: filesData })
  });

  if (response.ok) {
    document.getElementById('status').textContent = 'Upload successful!';
  }
}
```

**Backend (`functions/api/upload.js`):**

```javascript
async function verifySession(sessionToken, secret) {
  try {
    const [payloadB64, signatureHex] = sessionToken.split('.');
    const payload = JSON.parse(atob(payloadB64));

    // Check expiration
    if (payload.exp < Date.now()) return null;

    // Verify HMAC signature
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

async function uploadToGitHub(filename, base64Content, token, owner, repo, branch) {
  const path = `uploads/${filename}`;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `Add photo: ${filename}`,
      content: base64Content, // Already base64 encoded!
      branch: branch
    })
  });

  return response.json();
}

export async function onRequestPost({ request, env }) {
  // Verify authentication
  const cookies = request.headers.get('Cookie') || '';
  const sessionMatch = cookies.match(/session=([^;]+)/);

  if (!sessionMatch) {
    return new Response('Unauthorized', { status: 401 });
  }

  const session = await verifySession(sessionMatch[1], env.SESSION_SECRET);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Parse JSON body
  const payload = await request.json();
  const files = payload.files || [];

  // Upload each file to GitHub
  const results = [];
  for (const fileData of files) {
    try {
      await uploadToGitHub(
        fileData.name,
        fileData.data,
        env.GITHUB_TOKEN,
        env.REPO_OWNER,
        env.REPO_NAME,
        env.REPO_BRANCH
      );
      results.push({ filename: fileData.name, status: 'success' });
    } catch (error) {
      results.push({ filename: fileData.name, status: 'failed', error: error.message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

## Part 7: Environment Variables

In your Cloudflare Pages settings, add these environment variables:

```
GITHUB_CLIENT_ID=Iv1.xxxxx
GITHUB_CLIENT_SECRET=xxxxx
GITHUB_TOKEN=ghp_xxxxx (Personal Access Token with repo scope)
SESSION_SECRET=random-secret-key
ALLOWED_USERNAME=your-github-username
SITE_URL=https://yourdomain.com
REPO_OWNER=your-github-username
REPO_NAME=your-repo-name
REPO_BRANCH=main
```

**Security Note:** These are stored encrypted on Cloudflare's servers and never exposed to the browser.

## Part 8: GitHub Personal Access Token

The upload function needs a GitHub token to commit files:

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Select scope: `repo` (Full control of private repositories)
4. Copy token and add to Cloudflare environment variables

## Why Base64 Instead of FormData?

I originally tried using `FormData` for file uploads, but discovered that **Cloudflare Workers/Pages Functions strip binary data** from multipart form data. The files arrived as empty objects with metadata but no content.

**Solution: Convert to Base64 in the browser, send as JSON**

Pros:
- Works perfectly with Cloudflare Workers
- JSON is fully supported
- Simpler error handling

Cons:
- Files are ~33% larger during transfer (acceptable for images under 10MB)
- Slight processing overhead in browser

The GitHub API accepts Base64-encoded content anyway, so it's perfect for this use case!

## Troubleshooting Common Issues

### "Unauthorized" after login

- Check `SESSION_SECRET` matches between callback and upload handlers
- Verify cookie is being set with `HttpOnly; Secure; SameSite=Lax`
- Check session expiration isn't in the past

### "Access Denied" during OAuth

- Verify `ALLOWED_USERNAME` matches your GitHub username exactly (case-sensitive)
- Check OAuth callback URL in GitHub app settings matches your actual domain

### Files upload but appear empty

- Make sure you're sending Base64, not binary
- Verify `Content-Type: application/json` header
- Check Base64 string doesn't include `data:image/jpeg;base64,` prefix

### GitHub API rate limiting

- Authenticated requests: 5,000/hour (plenty for personal use)
- If exceeded, wait or use conditional requests

## Optional: Image Optimization with GitHub Actions

Add automatic image optimization when files are uploaded:

`.github/workflows/optimize-images.yml`:

```yaml
name: Optimize Images

on:
  push:
    paths:
      - 'uploads/**'

jobs:
  optimize:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Optimize images
        run: |
          npm install -g sharp-cli
          find uploads -name "*.jpg" -exec \
            sharp {} --resize 2000 --jpeg-quality 85 --output {} \;

      - name: Commit optimized images
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add uploads/
          git diff --quiet || git commit -m "Optimize images"
          git push
```

## Security Best Practices

1. **Never expose tokens in frontend code**
   - All sensitive credentials in environment variables
   - Server-side only access

2. **Use HttpOnly cookies**
   - Prevents XSS attacks from stealing session tokens

3. **Validate user on every request**
   - Check session signature
   - Verify username matches allowed list

4. **Rate limiting**
   - Cloudflare provides automatic DDoS protection
   - Add custom limits if needed

5. **HTTPS only**
   - Cloudflare Pages provides free SSL
   - Cookies marked as `Secure`

## Cost Analysis

**Total monthly cost: $0**

- Cloudflare Pages: Free (500 builds/month, unlimited bandwidth)
- Cloudflare Functions: Free (100,000 requests/day)
- GitHub: Free (public repos, unlimited storage, 2,000 Action minutes/month)
- GitHub OAuth: Free

For a personal photo gallery with occasional uploads, you'll never hit any limits.

## Lessons Learned

1. **Serverless has limitations** - Binary file handling required workarounds
2. **Base64 is a valid solution** - Don't overcomplicate with streaming/chunking
3. **OAuth is easier than expected** - Especially with GitHub's excellent docs
4. **Security requires layers** - Session tokens, HMAC signatures, scoped permissions
5. **Free tier is generous** - You can build real applications without cost

## Conclusion

Building a secure upload system doesn't require complex infrastructure. With serverless functions, OAuth, and creative use of existing APIs, you can create a production-ready solution that costs nothing to run.

The complete flow takes less than 2 seconds from phone to GitHub, and automated optimization ensures photos look great without manual work.

**Key Takeaways:**
- OAuth provides security without managing passwords
- Cloudflare Pages Functions are powerful and free
- Base64 + JSON works around binary upload limitations
- GitHub API is perfect for version-controlled storage
- Entire stack costs $0 and scales globally

Now I can upload photos from anywhere with just a few taps - exactly what I wanted!

---

**Tech Stack:**
- Frontend: HTML, JavaScript (Vanilla)
- Backend: Cloudflare Pages Functions (Workers)
- Authentication: GitHub OAuth
- Storage: GitHub API
- Optimization: GitHub Actions


---
