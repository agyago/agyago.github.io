# 🚀 R2 Setup - Wrangler CLI Edition (Copy/Paste Ready!)

**Time:** ~20 minutes
**Cost:** $0/month

This guide uses Wrangler CLI for everything. Just copy/paste the commands!

---

## 📋 Prerequisites

You need:
- Node.js installed
- Terminal access
- Cloudflare account

---

## 🎯 Quick Start (Copy/Paste These Commands)

### **Step 1: Install & Login**

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare (opens browser)
wrangler login

# Check you're logged in
wrangler whoami
```

✅ You should see your account details

---

### **Step 2: Create R2 Bucket**

```bash
# Create R2 bucket
wrangler r2 bucket create cheezychinito-photos

# Verify it was created
wrangler r2 bucket list
```

✅ You should see `cheezychinito-photos` in the list

---

### **Step 3: Create KV Namespace**

```bash
# Create KV namespace
wrangler kv:namespace create "PHOTOS_KV"
```

✅ **IMPORTANT:** Copy the `id` from the output. It looks like:
```
{ binding = "PHOTOS_KV", id = "abc123def456..." }
```

**Save this ID!** You'll need it in the next step.

---

### **Step 4: Update wrangler.toml**

```bash
# Get your Account ID
wrangler whoami
```

Copy your Account ID, then edit `workers/wrangler.toml`:

1. Replace `YOUR_ACCOUNT_ID` with your actual account ID
2. Replace `YOUR_KV_NAMESPACE_ID` with the KV ID from Step 3

**Or use this command to do it automatically:**

```bash
# Get Account ID
ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}')

# Update wrangler.toml (Mac/Linux)
sed -i "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" workers/wrangler.toml

# On Mac, if above doesn't work, use:
sed -i '' "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" workers/wrangler.toml

# Manually replace YOUR_KV_NAMESPACE_ID with the ID from Step 3
# Or run the setup script below
```

---

### **Step 5: Deploy Worker**

```bash
# Navigate to workers directory
cd workers

# Deploy the Worker
wrangler deploy

# Go back to root
cd ..
```

✅ Worker is now live! It will show you the URL (like `photo-server.your-subdomain.workers.dev`)

---

### **Step 6: Add Custom Domain**

```bash
# Add custom domain to Worker
wrangler custom-domains add photos.cheezychinito.com --worker photo-server
```

✅ Wait 1-2 minutes for DNS propagation

**Test:** Visit `https://photos.cheezychinito.com/` - you should see an error (that's good! Worker is running)

---

### **Step 7: Get R2 API Credentials (for Pages)**

You need these for Cloudflare Pages environment variables:

```bash
# Generate R2 API credentials
wrangler r2 bucket credentials create cheezychinito-photos
```

✅ **SAVE THESE VALUES:**
```
Access Key ID: abc123...
Secret Access Key: xyz789...
```

You'll add these to Pages environment variables in Step 9.

---

### **Step 8: Migrate Existing Photos**

```bash
# Make script executable
chmod +x scripts/migrate-photos.sh

# Run migration
./scripts/migrate-photos.sh
```

✅ All 17 photos uploaded to R2!

---

### **Step 9: Configure Pages Environment Variables**

**This step must be done in Dashboard** (can't use Wrangler for Pages yet).

Go to: **Cloudflare Dashboard** → **Pages** → **Your Site** → **Settings** → **Environment Variables**

**ADD these variables (Production):**

| Variable | Value | Where to get it |
|----------|-------|-----------------|
| `R2_ACCOUNT_ID` | Your account ID | From `wrangler whoami` |
| `R2_ACCESS_KEY_ID` | Access Key ID | From Step 7 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key | From Step 7 |
| `R2_BUCKET_NAME` | `cheezychinito-photos` | The bucket name |

**ADD KV Binding to Pages Functions:**
- Go to **Pages** → **Settings** → **Functions**
- Click **"Add binding"** under KV Namespaces
- Variable name: `PHOTOS_KV`
- KV namespace: Select `PHOTOS_KV`
- Click **Save**

**REMOVE these old variables:**
- ❌ `GITHUB_TOKEN`
- ❌ `REPO_OWNER`
- ❌ `REPO_NAME`
- ❌ `REPO_BRANCH`

---

### **Step 10: Update Your Code**

```bash
# Rename upload function
mv functions/api/upload.js functions/api/upload-github.js.bak
mv functions/api/upload-r2.js functions/api/upload.js

# Update gallery.html
# Change: {% include image-gallery.html folder="/uploads" %}
# To:     {% include image-gallery-r2.html %}
```

Edit `gallery.html` manually to change that one line.

---

### **Step 11: Deploy to GitHub**

```bash
# Add all changes
git add -A

# Commit
git commit -m "Switch to R2 for photo storage

- Migrate from GitHub to Cloudflare R2
- Add photo-server Worker with referer protection
- Add view tracking via KV
- Update gallery to load from R2"

# Push
git push origin main
```

✅ Wait for Cloudflare Pages deployment (~1-2 minutes)

---

### **Step 12: Test Everything**

```bash
# Test gallery
open https://cheezychinito.com/gallery

# Or manually visit these URLs:
# 1. https://cheezychinito.com/gallery - photos load?
# 2. https://cheezychinito.com/upload - can upload?
# 3. Click a photo - lightbox works?
# 4. Try direct photo URL - redirects to gallery?
```

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Gallery shows all photos
- [ ] Lightbox works when clicking photos
- [ ] Likes/hearts work
- [ ] Upload page works (login & upload)
- [ ] Direct photo URLs redirect to gallery
- [ ] New uploads appear in gallery

---

## 🧹 Clean Up (After Testing)

Once everything works for a few days:

```bash
# Delete old uploads folder
git rm -rf uploads/

# Delete old GitHub Actions workflow
git rm .github/workflows/optimize-images.yml

# Commit
git commit -m "Clean up old GitHub storage files"
git push origin main
```

✅ Your repo shrinks from 41MB → <1MB!

---

## 🛠️ Useful Wrangler Commands

```bash
# View Worker logs (live tail)
wrangler tail photo-server

# List R2 objects
wrangler r2 object list cheezychinito-photos

# List R2 objects in a folder
wrangler r2 object list cheezychinito-photos --prefix=full/

# Upload single file to R2
wrangler r2 object put cheezychinito-photos/full/IMG_1234.jpg --file=uploads/IMG_1234.jpg

# Download file from R2
wrangler r2 object get cheezychinito-photos/full/IMG_1234.jpg --file=downloaded.jpg

# Delete R2 object
wrangler r2 object delete cheezychinito-photos/full/IMG_1234.jpg

# View KV keys
wrangler kv:key list --namespace-id=YOUR_KV_ID

# Get KV value
wrangler kv:key get "photo-list" --namespace-id=YOUR_KV_ID

# Put KV value
wrangler kv:key put "test-key" "test-value" --namespace-id=YOUR_KV_ID

# Redeploy Worker
cd workers && wrangler deploy && cd ..

# Delete Worker (if needed)
wrangler delete photo-server
```

---

## 🚀 Even Easier: Automated Setup Script

Run this script to automate Steps 1-6:

```bash
# Make it executable
chmod +x scripts/setup-r2-wrangler.sh

# Run it
./scripts/setup-r2-wrangler.sh
```

This will:
1. ✅ Install Wrangler (if needed)
2. ✅ Login to Cloudflare
3. ✅ Create R2 bucket
4. ✅ Create KV namespace
5. ✅ Update wrangler.toml with your IDs
6. ✅ Deploy Worker
7. ✅ Add custom domain

Then you just need to:
- Migrate photos (Step 8)
- Configure Pages env vars (Step 9)
- Update code (Step 10)
- Deploy (Step 11)

---

## 📊 Cost Verification

```bash
# Check R2 storage usage
wrangler r2 bucket list

# Check Worker metrics
wrangler tail photo-server --format=pretty
```

You should see:
- R2 Storage: ~0.04 GB / 10 GB free (0.4% used)
- Worker Requests: Well within 100k/day free tier

---

## 🆘 Troubleshooting

### "Not logged in"
```bash
wrangler logout
wrangler login
```

### "Bucket already exists"
```bash
# List buckets
wrangler r2 bucket list

# Use existing bucket - skip creation
```

### "Worker deployment failed"
```bash
# Check wrangler.toml is in workers/ directory
cd workers
cat wrangler.toml

# Make sure Account ID and KV ID are filled in
# Redeploy
wrangler deploy
```

### "Custom domain failed"
```bash
# Check domain is in Cloudflare
wrangler domains list

# Try adding via Dashboard instead:
# Dashboard → Workers → photo-server → Triggers → Custom Domains
```

### "Photos not uploading"
- Check Pages environment variables are set
- Check R2 API credentials are correct
- Check KV binding is added to Pages Functions

---

## 🎉 Done!

Your gallery is now running on R2 with:
- ✅ Private R2 bucket
- ✅ Referer protection
- ✅ View tracking
- ✅ Faster loading
- ✅ $0/month cost

All via easy copy/paste commands! 🚀
