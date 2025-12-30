# GitHub OAuth Setup Guide for Photo Upload

This guide explains how to set up GitHub OAuth authentication for the photo upload feature on your Cloudflare Pages site.

## Understanding the Different Types of GitHub Tokens

There are TWO different types of GitHub credentials, and it's important to use the correct one:

### 1. GitHub OAuth App Credentials (REQUIRED for login) ✅
- **Client ID** and **Client Secret** from a GitHub OAuth App
- Used for the "Login with GitHub" button
- Allows users to authenticate with their GitHub account

### 2. GitHub Personal Access Token (NOT used for login) ❌
- A token you generate from GitHub Settings → Developer Settings → Personal Access Tokens
- Used for API calls to GitHub (like uploading files to repositories)
- **This is NOT what you need for the login functionality**

## Required Environment Variables

You need to configure these environment variables in Cloudflare Pages:

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `GITHUB_CLIENT_ID` | OAuth App Client ID | GitHub OAuth App settings |
| `GITHUB_CLIENT_SECRET` | OAuth App Client Secret | GitHub OAuth App settings |
| `SESSION_SECRET` | Random secret for session tokens | Generate a random string |
| `SITE_URL` | Your site URL | `https://www.cheezychinito.com` |
| `ALLOWED_USERNAME` | GitHub username allowed to upload | Your GitHub username (e.g., `agyago`) |

## Step-by-Step Setup

### Step 1: Create a GitHub OAuth App

1. Go to GitHub: https://github.com/settings/developers
2. Click **"OAuth Apps"** in the left sidebar
3. Click **"New OAuth App"**
4. Fill in the details:
   - **Application name**: `Photo Upload - cheezychinito.com`
   - **Homepage URL**: `https://www.cheezychinito.com`
   - **Authorization callback URL**: `https://www.cheezychinito.com/api/auth/callback`
   - **Enable Device Flow**: Leave unchecked
5. Click **"Register application"**

### Step 2: Get Your OAuth Credentials

After creating the OAuth App:

1. You'll see the **Client ID** - copy this
2. Click **"Generate a new client secret"**
3. Copy the **Client Secret** (you can only see this once!)

### Step 3: Configure Cloudflare Pages Environment Variables

1. Go to your Cloudflare Dashboard
2. Navigate to **Workers & Pages** → Your Pages project
3. Go to **Settings** → **Environment variables**
4. Add the following variables (click **"Add variable"** for each):

   **For Production:**
   ```
   GITHUB_CLIENT_ID = <paste your Client ID>
   GITHUB_CLIENT_SECRET = <paste your Client Secret>
   SESSION_SECRET = <generate a random 32+ character string>
   SITE_URL = https://www.cheezychinito.com
   ALLOWED_USERNAME = agyago
   ```

   **Note:** To generate a secure random `SESSION_SECRET`, you can use:
   ```bash
   openssl rand -base64 32
   ```

5. Click **"Save"**
6. **Important:** Redeploy your site for the changes to take effect
   - Go to **Deployments** tab
   - Click **"Retry deployment"** on the latest deployment
   - OR push a new commit to trigger a deployment

### Step 4: Test the Login

1. Visit `https://www.cheezychinito.com/upload.html`
2. Click **"Login with GitHub"**
3. You should be redirected to GitHub to authorize the app
4. After authorization, you'll be redirected back and logged in

## Troubleshooting

### Error: "Configuration Error: Missing environment variables"

This means one or more required environment variables are not set. The error message will tell you which ones are missing.

**Solution:** Follow Step 3 above to add all required environment variables.

### Error: "GitHub OAuth error: bad_verification_code"

This usually happens when:
- The OAuth App's callback URL doesn't match your `SITE_URL`
- You're using an expired authorization code

**Solution:**
1. Check that your OAuth App's callback URL is exactly: `https://www.cheezychinito.com/api/auth/callback`
2. Make sure `SITE_URL` is set to: `https://www.cheezychinito.com`
3. Try logging in again (the authorization code expires after one use)

### Error: "Access Denied: Only [username] can upload photos"

This means you're logged in with a different GitHub account than the one specified in `ALLOWED_USERNAME`.

**Solution:** Make sure `ALLOWED_USERNAME` matches your GitHub username exactly.

### Error: "Invalid state parameter"

This is a CSRF protection error that happens when:
- Your cookies are blocked
- The login session expired (>10 minutes)

**Solution:** Clear your cookies and try logging in again.

## Security Notes

- **Never commit** `GITHUB_CLIENT_SECRET` or `SESSION_SECRET` to your repository
- These credentials should only be stored in Cloudflare Pages environment variables
- The `GITHUB_CLIENT_SECRET` is different from a Personal Access Token
- OAuth credentials are specific to your OAuth App and cannot be reused from other apps

## What This OAuth Setup Does

1. User clicks "Login with GitHub" on `/upload.html`
2. They're redirected to GitHub to authorize your OAuth App
3. GitHub redirects back to your site with an authorization code
4. Your Cloudflare Function exchanges the code for an access token
5. The access token is used to get the user's GitHub username
6. If the username matches `ALLOWED_USERNAME`, a session is created
7. The user can now upload photos

## Need Help?

If you're still having issues after following this guide:

1. Check the Cloudflare Pages logs:
   - Go to your Pages project → **Deployments** → Click on a deployment → **Functions**
2. Look for console.error messages that might indicate what's wrong
3. Make sure all environment variables are spelled exactly as shown above
4. Verify your OAuth App callback URL matches exactly
