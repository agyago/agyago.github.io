# ⚡ Super Quick Setup - Just Copy/Paste!

**Total time:** 15-20 minutes
**Difficulty:** Easy - just copy/paste into terminal

---

## 🚀 ONE-COMMAND SETUP

### **Step 1: Run Automated Setup**

Copy and paste this entire block into your terminal:

```bash
# Install Wrangler & Login
npm install -g wrangler && \
wrangler login && \

# Create R2 bucket
wrangler r2 bucket create cheezychinito-photos && \

# Create KV namespace (save the ID that's printed!)
wrangler kv:namespace create "PHOTOS_KV" && \

echo "" && \
echo "✅ R2 bucket and KV namespace created!" && \
echo "" && \
echo "⚠️  IMPORTANT: Copy the KV namespace ID above (the long string after 'id =')" && \
echo "You'll need it in the next step!"
```

✅ This creates your R2 bucket and KV namespace

**⚠️ SAVE THE KV ID** that's printed (looks like: `abc123def456...`)

---

### **Step 2: Update Config & Deploy**

Replace `YOUR_KV_ID_HERE` with the ID from Step 1, then copy/paste:

```bash
# Get your account ID
ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}')

# Your KV ID from Step 1
KV_ID="YOUR_KV_ID_HERE"  # ⚠️ REPLACE THIS!

# Update wrangler.toml
cd workers && \
sed -i.bak "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" wrangler.toml && \
sed -i.bak "s/YOUR_KV_NAMESPACE_ID/$KV_ID/g" wrangler.toml && \

# Deploy Worker
wrangler deploy && \
cd .. && \

echo "✅ Worker deployed!"
```

**On Mac?** Use this instead (double quotes on -i):
```bash
ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}')
KV_ID="YOUR_KV_ID_HERE"  # ⚠️ REPLACE THIS!

cd workers && \
sed -i '' "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" wrangler.toml && \
sed -i '' "s/YOUR_KV_NAMESPACE_ID/$KV_ID/g" wrangler.toml && \
wrangler deploy && \
cd ..
```

✅ Worker is now live!

---

### **Step 3: Add Custom Domain**

```bash
wrangler custom-domains add photos.cheezychinito.com --worker photo-server
```

✅ Wait 1-2 minutes for DNS

**Test:** Visit `https://photos.cheezychinito.com/` (should show error - that's good!)

---

### **Step 4: Get R2 API Credentials**

```bash
wrangler r2 bucket credentials create cheezychinito-photos
```

✅ **COPY AND SAVE:**
- `Access Key ID`
- `Secret Access Key`

You'll add these to Cloudflare Pages Dashboard next.

---

### **Step 5: Migrate Photos**

```bash
chmod +x scripts/migrate-photos.sh && \
./scripts/migrate-photos.sh
```

✅ All 17 photos uploaded!

---

### **Step 6: Configure Pages (Dashboard Only)**

**This step must be done in browser:**

1. Go to: https://dash.cloudflare.com
2. Navigate to: **Pages** → Your Site → **Settings** → **Environment Variables**
3. Add these variables (Production):

```
R2_ACCOUNT_ID = <from wrangler whoami>
R2_ACCESS_KEY_ID = <from Step 4>
R2_SECRET_ACCESS_KEY = <from Step 4>
R2_BUCKET_NAME = cheezychinito-photos
```

4. Go to **Settings** → **Functions**
5. Add KV binding:
   - Variable: `PHOTOS_KV`
   - Namespace: Select `PHOTOS_KV`

6. **Remove these old variables:**
   - `GITHUB_TOKEN`
   - `REPO_OWNER`
   - `REPO_NAME`
   - `REPO_BRANCH`

✅ Pages configured!

---

### **Step 7: Update Code & Deploy**

```bash
# Backup old upload function
mv functions/api/upload.js functions/api/upload-github.js.bak && \

# Use new R2 upload function
mv functions/api/upload-r2.js functions/api/upload.js && \

echo "✅ Upload function updated!" && \
echo "" && \
echo "⚠️  Now edit gallery.html:" && \
echo "   Change: {% include image-gallery.html folder=\"/uploads\" %}" && \
echo "   To:     {% include image-gallery-r2.html %}"
```

**Manually edit `gallery.html`:**
- Find: `{% include image-gallery.html folder="/uploads" %}`
- Replace with: `{% include image-gallery-r2.html %}`

Then deploy:

```bash
git add -A && \
git commit -m "Migrate to Cloudflare R2" && \
git push origin main
```

✅ Wait for Cloudflare Pages deployment (~1-2 minutes)

---

### **Step 8: Test**

Visit these URLs:

1. `https://cheezychinito.com/gallery` - Photos load? ✅
2. `https://cheezychinito.com/upload` - Can upload? ✅
3. Click a photo - Lightbox works? ✅
4. Try direct photo URL - Redirects to gallery? ✅

---

## 🎉 DONE!

If all tests pass, you're done! Your site now uses R2 with:

- ✅ Private bucket (no bypassing)
- ✅ Referer protection
- ✅ View tracking
- ✅ Faster loading
- ✅ $0/month cost

---

## 🧹 Clean Up (Optional - After a Few Days)

Once you've tested everything:

```bash
git rm -rf uploads/ && \
git rm .github/workflows/optimize-images.yml && \
git commit -m "Clean up old files" && \
git push origin main
```

✅ Repo shrinks from 41MB → <1MB!

---

## 🆘 Quick Troubleshooting

**"Command not found: wrangler"**
```bash
npm install -g wrangler
```

**"Not logged in"**
```bash
wrangler login
```

**"Photos don't load"**
- Check Pages environment variables are set
- Check KV binding is added to Pages Functions
- Check browser console for errors

**"Upload fails"**
- Check R2 credentials in Pages env vars
- Try logging out and back in on /upload page

**Need help?** See full guide: `R2_WRANGLER_SETUP.md`

---

## 📋 Quick Reference

```bash
# View logs
wrangler tail photo-server

# List R2 files
wrangler r2 object list cheezychinito-photos

# Redeploy Worker
cd workers && wrangler deploy && cd ..

# Upload single photo
wrangler r2 object put cheezychinito-photos/full/IMG_1234.jpg --file=photo.jpg
```
