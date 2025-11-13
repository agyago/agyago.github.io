# Photo Upload System Setup Guide

This guide will help you set up the secure OAuth-based photo upload system for your gallery.

## 🎯 Overview

The upload system consists of:
1. **Upload page** (`/upload.html`) - Mobile-friendly interface
2. **OAuth authentication** - GitHub login for security
3. **Cloudflare Pages Functions** - Serverless backend
4. **GitHub Actions** - Automatic image optimization

## 📋 Prerequisites

- GitHub account (you already have this!)
- Cloudflare Pages account (you mentioned you have this)
- Your site deployed on Cloudflare Pages

---

## 🚀 Setup Steps

### Step 1: Create GitHub OAuth App

1. Go to GitHub Settings: https://github.com/settings/developers
2. Click **"OAuth Apps"** in the left sidebar
3. Click **"New OAuth App"** button
4. Fill in the form:
   - **Application name**: `Photo Upload for agyago.github.io`
   - **Homepage URL**: `https://agyago.github.io` (or your custom domain)
   - **Application description**: `Secure photo upload for personal gallery`
   - **Authorization callback URL**: `https://agyago.github.io/api/auth/callback`
     - ⚠️ **Important**: If using custom domain (cheezychinito.com), use that instead!
5. Click **"Register application"**
6. You'll see two important values:
   - **Client ID** - Copy this (e.g., `Iv1.1234567890abcdef`)
   - **Client Secret** - Click "Generate a new client secret" and copy it
   - ⚠️ **Save these immediately!** The secret won't be shown again.

---

### Step 2: Create GitHub Personal Access Token

This token allows the upload system to commit files to your repository.

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Fill in:
   - **Note**: `Photo Upload System`
   - **Expiration**: `No expiration` (or 90 days if you prefer)
   - **Scopes**: Check ✅ **`repo`** (Full control of private repositories)
4. Click **"Generate token"**
5. **Copy the token immediately** (starts with `ghp_...`)
   - ⚠️ You won't be able to see it again!

---

### Step 3: Generate Session Secret

This is used to encrypt session cookies.

Run this command in your terminal (Mac/Linux) or use an online UUID generator:

```bash
# Generate a random secret
openssl rand -hex 32
```

Or use this online tool: https://www.uuidgenerator.net/version4

Copy the generated string.

---

### Step 4: Configure Cloudflare Pages Environment Variables

1. Go to your Cloudflare Dashboard: https://dash.cloudflare.com
2. Navigate to **Pages** → Select your site (`agyago-github-io`)
3. Go to **Settings** → **Environment variables**
4. Add the following variables for **Production**:

   | Variable Name | Value | Example |
   |--------------|--------|---------|
   | `GITHUB_CLIENT_ID` | From Step 1 | `Iv1.1234567890abcdef` |
   | `GITHUB_CLIENT_SECRET` | From Step 1 | `abcdef1234567890...` |
   | `GITHUB_TOKEN` | From Step 2 | `ghp_abc123...` |
   | `SESSION_SECRET` | From Step 3 | `a1b2c3d4e5f6...` |
   | `ALLOWED_USERNAME` | Your GitHub username | `agyago` |
   | `SITE_URL` | Your site URL | `https://agyago.github.io` |
   | `REPO_OWNER` | Your GitHub username | `agyago` |
   | `REPO_NAME` | Your repository name | `agyago.github.io` |
   | `REPO_BRANCH` | Branch to upload to | `main` |

5. Click **"Save"** for each variable
6. **Important**: Also add these to **Preview** environment if you want to test before production

---

### Step 5: Deploy to Cloudflare Pages

1. Commit all the new files to your repository:
   ```bash
   git add upload.html functions/ .github/workflows/optimize-images.yml
   git commit -m "Add secure photo upload system with OAuth"
   git push origin main
   ```

2. Cloudflare Pages will automatically detect the changes and deploy
3. Wait for deployment to complete (usually 1-2 minutes)

---

### Step 6: Test the Upload System

1. On your iPhone, open Safari or Chrome
2. Navigate to: `https://agyago.github.io/upload.html`
3. You should see a "Login with GitHub" button
4. Click the button
5. You'll be redirected to GitHub to authorize
6. Click "Authorize" on GitHub
7. You'll be redirected back to the upload page
8. You should now see the file upload interface!

**Try uploading a photo:**
1. Tap "Tap to select photos"
2. Choose 1-2 photos from your camera roll
3. See the preview
4. Click "Upload to Gallery"
5. Wait for success message
6. Check your gallery in ~1 minute to see the optimized photos!

---

## 🔒 Security Features

✅ **OAuth Authentication** - Only you can login (checks GitHub username)
✅ **Server-side tokens** - GitHub tokens never exposed to browser
✅ **Encrypted sessions** - Session cookies are HMAC-signed
✅ **File validation** - Only images allowed, max 20MB
✅ **Rate limiting** - Max 10 files per upload
✅ **HTTPS only** - All traffic encrypted
✅ **Same-site cookies** - CSRF protection

---

## 📱 Usage

### From iPhone:

1. Open `agyago.github.io/upload` in Safari/Chrome
2. Login once (stays logged in for 30 days)
3. Select photos
4. Upload!
5. Check gallery in ~1 minute

### What Happens Behind the Scenes:

```
Your iPhone
    ↓ Upload photos
Cloudflare Function (verifies you, uploads to GitHub)
    ↓ Commits to /uploads folder
GitHub Repository
    ↓ Triggers GitHub Action
Image Optimization (resize, compress, WebP conversion)
    ↓ Commits optimized images
Live Gallery Updated! 🎉
```

---

## 🛠️ Troubleshooting

### "Unauthorized" error when uploading
- Check that `ALLOWED_USERNAME` matches your GitHub username exactly
- Try logging out and back in

### "OAuth callback failed"
- Verify `SITE_URL` environment variable matches your actual domain
- Check OAuth app callback URL matches: `https://[your-domain]/api/auth/callback`

### Upload works but images don't appear on gallery
- Check GitHub Actions tab for errors: https://github.com/agyago/agyago.github.io/actions
- Verify the optimize-images workflow ran successfully
- Check that /uploads folder has the images

### "Failed to fetch user information"
- Check that `GITHUB_CLIENT_SECRET` is correct in Cloudflare
- Try regenerating the OAuth app client secret and updating Cloudflare

### Session expires too quickly
- Sessions last 30 days by default
- Check browser isn't clearing cookies
- Try using Safari instead of Chrome (better cookie handling on iOS)

---

## 🎨 Customization

### Change upload limits

Edit `/functions/api/upload.js`:

```javascript
const maxSize = 20 * 1024 * 1024; // Change to 50MB: 50 * 1024 * 1024
```

```javascript
if (files.length > 10) {  // Change to 20: files.length > 20
```

### Change image quality

Edit `.github/workflows/optimize-images.yml`:

```yaml
sharp-cli jpeg ... --quality 85  # Change to 90 for higher quality
```

### Allow multiple users

Update `ALLOWED_USERNAME` in Cloudflare to comma-separated:
```
agyago,friendusername,anotherusername
```

Then update `/functions/api/auth/callback.js`:
```javascript
const allowedUsernames = env.ALLOWED_USERNAME.split(',');
if (!allowedUsernames.includes(userData.login)) {
  return new Response('Access Denied', { status: 403 });
}
```

---

## 🔄 Maintenance

### Rotate GitHub Token (Recommended every 30-90 days)

1. Generate new token: https://github.com/settings/tokens
2. Update `GITHUB_TOKEN` in Cloudflare Pages
3. Old token will stop working immediately

### Rotate OAuth Secret

1. GitHub → OAuth Apps → Your app → "Regenerate client secret"
2. Update `GITHUB_CLIENT_SECRET` in Cloudflare
3. All users will need to re-authorize (logout/login)

### Revoke Access

Go to GitHub → Settings → Applications → Authorized OAuth Apps → Revoke

---

## 📊 Monitoring

### Check uploads
- GitHub → Repository → `/uploads` folder

### Check optimization logs
- GitHub → Actions → "Optimize Uploaded Images" workflow

### Check Cloudflare logs
- Cloudflare Dashboard → Pages → Your site → Functions logs (if enabled)

---

## ✅ Checklist

Before going live:

- [ ] GitHub OAuth App created
- [ ] GitHub Personal Access Token created
- [ ] Session secret generated
- [ ] All 9 environment variables added to Cloudflare Pages
- [ ] Code deployed to GitHub
- [ ] Cloudflare Pages deployment successful
- [ ] Tested login on iPhone
- [ ] Tested photo upload
- [ ] Verified image optimization worked
- [ ] Checked gallery shows new photos

---

## 🆘 Need Help?

- **OAuth issues**: Check callback URL matches exactly
- **Upload issues**: Check GitHub token has `repo` scope
- **Optimization issues**: Check GitHub Actions logs
- **General issues**: Check browser console for JavaScript errors

---

## 🎉 You're Done!

Once setup is complete, uploading photos is as easy as:

1. Open `/upload.html` on your iPhone
2. Select photos
3. Click upload
4. Done! 🎉

Photos will be automatically optimized and appear on your gallery in about 1 minute.

Enjoy your new photo upload system! 📸
