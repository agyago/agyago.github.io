# 🚀 R2 Migration Setup Guide

This guide walks you through migrating your photo gallery from GitHub to Cloudflare R2.

**Time required:** ~30-45 minutes
**Cost:** $0/month (100% free tier)

---

## 📋 What You Need to Do

I've created all the code on my side. Here's what you need to do on Cloudflare's dashboard:

### ✅ Checklist Overview

- [ ] **Step 1:** Create R2 bucket (5 min)
- [ ] **Step 2:** Create KV namespace (2 min)
- [ ] **Step 3:** Create Cloudflare Worker for photo serving (5 min)
- [ ] **Step 4:** Configure environment variables (5 min)
- [ ] **Step 5:** Deploy Worker to custom domain (5 min)
- [ ] **Step 6:** Migrate existing 17 photos (10 min)
- [ ] **Step 7:** Update gallery page (2 min)
- [ ] **Step 8:** Test everything (5 min)
- [ ] **Step 9:** Clean up (1 min)

---

## 📦 Step 1: Create R2 Bucket

1. Go to Cloudflare Dashboard: https://dash.cloudflare.com
2. Click **R2** in the left sidebar
3. Click **"Create bucket"**
4. Fill in:
   - **Bucket name:** `cheezychinito-photos` (or any name you prefer)
   - **Location:** Automatic (recommended)
5. Click **"Create bucket"**

**✅ Done!** Your bucket is created. Keep it **PRIVATE** (don't enable public access).

**Note the bucket name** - you'll need it later.

---

## 🗄️ Step 2: Create KV Namespace

1. In Cloudflare Dashboard, click **Workers & Pages**
2. Click **KV** tab
3. Click **"Create namespace"**
4. Fill in:
   - **Namespace name:** `PHOTOS_KV`
5. Click **"Add"**

**✅ Done!** Copy the **Namespace ID** (you'll need it later).

---

## 🔑 Step 3: Create R2 API Token

1. In Cloudflare Dashboard, go to **R2**
2. Click **"Manage R2 API Tokens"** (top right)
3. Click **"Create API token"**
4. Fill in:
   - **Token name:** `R2 Photo Upload`
   - **Permissions:**
     - ✅ Object Read & Write
   - **TTL:** Forever (or your preference)
   - **Bucket:** Select your bucket (`cheezychinito-photos`)
5. Click **"Create API Token"**
6. **⚠️ COPY AND SAVE THESE VALUES IMMEDIATELY:**
   - `Access Key ID`
   - `Secret Access Key`
   - You won't see the secret again!

**✅ Done!** Keep these credentials safe.

---

## 👷 Step 4: Create Cloudflare Worker

1. In Cloudflare Dashboard, click **Workers & Pages**
2. Click **"Create application"** → **"Create Worker"**
3. Give it a name: `photo-server`
4. Click **"Deploy"**
5. After deployment, click **"Edit code"**
6. **Delete all the default code**
7. **Copy and paste the entire contents of `/workers/photo-server.js`** (from this repo)
8. Click **"Save and Deploy"**

**✅ Done!** Your Worker is deployed.

---

## 🔗 Step 5: Configure Worker Bindings

Now we need to connect the Worker to R2 and KV:

1. Still in the Worker editor, click **"Settings"** (top menu)
2. Click **"Variables"** (left sidebar)
3. Scroll down to **"R2 Bucket Bindings"**
4. Click **"Add binding"**
   - **Variable name:** `R2_BUCKET`
   - **R2 bucket:** Select `cheezychinito-photos`
   - Click **"Save"**
5. Scroll to **"KV Namespace Bindings"**
6. Click **"Add binding"**
   - **Variable name:** `PHOTOS_KV`
   - **KV namespace:** Select `PHOTOS_KV`
   - Click **"Save"**

**✅ Done!** Worker can now access R2 and KV.

---

## 🌐 Step 6: Add Custom Domain to Worker

Make the Worker accessible at `photos.cheezychinito.com`:

1. In Worker settings, click **"Triggers"** (left sidebar)
2. Scroll to **"Custom Domains"**
3. Click **"Add Custom Domain"**
4. Enter: `photos.cheezychinito.com`
5. Click **"Add Custom Domain"**
6. Cloudflare will automatically configure DNS

**✅ Done!** Wait 1-2 minutes for DNS to propagate.

**Test:** Visit `https://photos.cheezychinito.com/` - you should see a 400 error (that's good! It means the Worker is running).

---

## ⚙️ Step 7: Update Cloudflare Pages Environment Variables

Update your Pages project to use R2 instead of GitHub:

1. Go to **Pages** → Select your site
2. Go to **Settings** → **Environment variables**
3. **ADD these new variables** (for Production):

   | Variable Name | Value | Where to get it |
   |--------------|-------|-----------------|
   | `R2_ACCOUNT_ID` | Your account ID | Cloudflare Dashboard → R2 → Account ID (top right) |
   | `R2_ACCESS_KEY_ID` | From Step 3 | The Access Key ID you saved |
   | `R2_SECRET_ACCESS_KEY` | From Step 3 | The Secret Access Key you saved |
   | `R2_BUCKET_NAME` | `cheezychinito-photos` | The bucket name from Step 1 |

4. **REMOVE these old variables** (no longer needed):
   - ❌ `GITHUB_TOKEN`
   - ❌ `REPO_OWNER`
   - ❌ `REPO_NAME`
   - ❌ `REPO_BRANCH`

5. **KEEP these variables** (still needed for OAuth):
   - ✅ `GITHUB_CLIENT_ID`
   - ✅ `GITHUB_CLIENT_SECRET`
   - ✅ `SESSION_SECRET`
   - ✅ `ALLOWED_USERNAME`
   - ✅ `SITE_URL`

6. Click **"Save"**

**✅ Done!** Your Pages project is configured for R2.

---

## 🔄 Step 8: Update Pages Functions Bindings

Add KV binding to your Pages project:

1. Still in Pages settings, go to **"Functions"** (left sidebar)
2. Scroll to **"KV namespace bindings"**
3. Click **"Add binding"**
   - **Variable name:** `PHOTOS_KV`
   - **KV namespace:** Select `PHOTOS_KV`
   - Click **"Save"**

**✅ Done!**

---

## 📸 Step 9: Migrate Existing Photos

Now let's move your 17 existing photos from GitHub to R2:

### Option A: Manual Upload via Dashboard (Easiest)

1. Go to **R2** → Select your bucket
2. Click **"Upload"**
3. Select all 17 photos from your local `/uploads` folder
4. Upload them all at once
5. They will be placed in the root - **move them to `full/` folder**:
   - Select all uploaded photos
   - Click **"Move"**
   - Enter destination: `full/`
   - Click **"Move"**

### Option B: Using Wrangler CLI (Faster for many files)

```bash
# Install wrangler if you haven't
npm install -g wrangler

# Login
wrangler login

# Run migration script
chmod +x scripts/migrate-photos.sh
./scripts/migrate-photos.sh
```

**✅ Done!** All 17 photos are now in R2.

---

## 🖼️ Step 10: Update Gallery Page

Replace the old gallery include with the new R2 version:

1. Open `gallery.html`
2. **Change this:**
   ```html
   {% include image-gallery.html folder="/uploads" %}
   ```

   **To this:**
   ```html
   {% include image-gallery-r2.html %}
   ```

3. Save the file

**✅ Done!** Gallery will now load from R2.

---

## 🚀 Step 11: Deploy Changes

1. **Rename the upload function:**
   ```bash
   # Delete or rename old version
   mv functions/api/upload.js functions/api/upload-github.js.bak

   # Rename new version
   mv functions/api/upload-r2.js functions/api/upload.js
   ```

2. **Commit and push:**
   ```bash
   git add -A
   git commit -m "Migrate photo gallery to Cloudflare R2

   - Switch from GitHub storage to private R2 bucket
   - Add photo-serving Worker with referer protection
   - Add view tracking via KV
   - Update gallery to load from R2
   - Migrate 17 existing photos to R2"

   git push origin main
   ```

3. **Wait for Cloudflare Pages deployment** (~1-2 minutes)

**✅ Done!** Your site is now using R2.

---

## ✅ Step 12: Test Everything

### Test 1: Gallery Page
1. Visit: `https://cheezychinito.com/gallery`
2. ✅ You should see all 17 photos
3. ✅ Photos should load quickly
4. ✅ Click a photo - lightbox should work
5. ✅ Likes/hearts should work

### Test 2: Upload New Photo
1. Visit: `https://cheezychinito.com/upload`
2. ✅ Login with GitHub (should work as before)
3. ✅ Upload a test photo from your iPhone
4. ✅ Should see success message
5. ✅ Refresh gallery - new photo should appear

### Test 3: Referer Protection
1. Open browser dev tools (F12)
2. Copy a photo URL from the gallery
3. Open it in a new tab directly
4. ✅ Should redirect you back to gallery (protection working!)

### Test 4: View Tracking
1. Open browser console
2. View several photos
3. Check console for tracking messages
4. ✅ Views should be counted

**If all tests pass: 🎉 Migration successful!**

---

## 🧹 Step 13: Clean Up (After confirming everything works)

Once you've tested for a day or two and everything works:

1. **Delete GitHub uploads folder:**
   ```bash
   git rm -rf uploads/
   git commit -m "Remove uploads folder (now using R2)"
   git push
   ```

2. **Delete old GitHub Actions workflow:**
   ```bash
   git rm .github/workflows/optimize-images.yml
   git commit -m "Remove image optimization workflow (now done during upload)"
   git push
   ```

3. **Archive old upload function:**
   ```bash
   rm functions/api/upload-github.js.bak
   ```

**✅ Done!** Your repo is now clean and ~41MB smaller!

---

## 📊 Verify Cost Savings

Check your free tier usage:

1. **R2 Dashboard** → Your bucket → **Metrics**
   - Storage: Should show ~0.04 GB / 10 GB (0.4% used)
   - Operations: Should show ~20 / 10,000,000 per month

2. **Workers Dashboard** → `photo-server` → **Metrics**
   - Requests: Should show your gallery views
   - All within free tier (100k/day)

3. **KV Dashboard** → `PHOTOS_KV` → **Metrics**
   - Reads: Gallery page loads + view tracking
   - Writes: Uploads + view tracking
   - All within free tier

**You're using:**
- R2 Storage: ~0.4% of free tier
- Workers: ~20% of daily free tier (assuming 20k requests/day)
- KV: <1% of free tier

**Plenty of headroom before any costs!** 🎉

---

## 🆘 Troubleshooting

### Photos don't appear in gallery
- Check: Did you update `gallery.html` to use `image-gallery-r2.html`?
- Check: Did you push changes and wait for Pages deployment?
- Check: Browser console for errors
- Check: `/api/photos` endpoint returns photo list

### "Unauthorized" when uploading
- Check: Environment variables are set in Pages
- Check: OAuth still configured (CLIENT_ID, CLIENT_SECRET)
- Try: Log out and log back in

### Photos redirect to gallery when clicked
- This is expected! Referer protection is working
- Photos only load when viewed through your gallery page

### Worker not accessible
- Check: Custom domain added (`photos.cheezychinito.com`)
- Wait: DNS propagation takes 1-2 minutes
- Check: Worker is deployed and running

### Migration script fails
- Check: Wrangler installed (`npm install -g wrangler`)
- Check: Logged in (`wrangler login`)
- Check: Bucket name is correct in script

---

## 📈 Next Steps (Optional)

Once everything is working, you can:

1. **Add analytics:**
   - Track which photos are most popular
   - See views by country (using Cloudflare data)
   - Build a "Popular Photos" section

2. **Add more features:**
   - Comments on photos
   - Tags/categories
   - Search functionality
   - Photo albums/collections

3. **Optimize further:**
   - Pre-generate WebP versions
   - Add lazy loading
   - Implement virtual scrolling for large galleries

---

## 🎉 Success!

You've successfully migrated to R2! Your site now has:

- ✅ **Faster loading** - R2 CDN is optimized for files
- ✅ **Smaller repo** - 41MB → <1MB
- ✅ **Better security** - Private bucket + referer checking
- ✅ **View tracking** - Know which photos are popular
- ✅ **No hotlinking** - Others can't steal your bandwidth
- ✅ **Scalable** - Can handle 10GB / 10,000 photos on free tier
- ✅ **Still $0/month** - All within free tiers

Congratulations! 🚀

---

## 📞 Need Help?

If you run into issues:
1. Check the troubleshooting section above
2. Check Cloudflare Workers logs: Dashboard → Workers → `photo-server` → Logs
3. Check browser console for JavaScript errors
4. Check Pages deployment logs: Dashboard → Pages → Your site → Deployments

---

## 📝 Summary of Changes

**What changed:**
- Photos stored in R2 (not GitHub)
- Upload function writes to R2 (not GitHub API)
- Gallery loads from KV/R2 (not Jekyll static files)
- Photos served via Worker (not GitHub Pages)
- View tracking added (KV)
- Referer protection added (Worker)

**What stayed the same:**
- OAuth login (exact same flow)
- Upload page UI (exact same)
- Gallery layout (exact same)
- Lightbox (exact same)
- Likes system (exact same)
- Custom domain (exact same)

**Net result:**
- Everything works the same for users
- But faster, more secure, and more scalable
- Still 100% free!
