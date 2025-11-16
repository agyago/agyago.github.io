# R2 Migration - Quick Start Checklist

**Total time:** 30-45 minutes
**Cost:** $0/month

## 🎯 What I Need To Do on Cloudflare

### 1. Create R2 Bucket (5 min)
- [ ] Go to Cloudflare Dashboard → R2
- [ ] Create bucket: `cheezychinito-photos`
- [ ] Keep it PRIVATE

### 2. Create KV Namespace (2 min)
- [ ] Go to Workers & Pages → KV
- [ ] Create namespace: `PHOTOS_KV`
- [ ] Save the Namespace ID

### 3. Create R2 API Token (3 min)
- [ ] Go to R2 → Manage R2 API Tokens
- [ ] Create token with Read & Write permissions
- [ ] Save Access Key ID and Secret Access Key

### 4. Create Worker (5 min)
- [ ] Go to Workers & Pages → Create Worker
- [ ] Name it: `photo-server`
- [ ] Copy `/workers/photo-server.js` code into it
- [ ] Deploy

### 5. Configure Worker (5 min)
- [ ] Add R2 binding: `R2_BUCKET` → `cheezychinito-photos`
- [ ] Add KV binding: `PHOTOS_KV` → `PHOTOS_KV`
- [ ] Add custom domain: `photos.cheezychinito.com`

### 6. Update Pages Environment Variables (5 min)
**Add:**
- [ ] `R2_ACCOUNT_ID`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `R2_BUCKET_NAME`

**Remove:**
- [ ] `GITHUB_TOKEN`
- [ ] `REPO_OWNER`
- [ ] `REPO_NAME`
- [ ] `REPO_BRANCH`

**Add KV Binding to Pages:**
- [ ] Pages → Functions → Add binding: `PHOTOS_KV`

### 7. Migrate 17 Photos (10 min)
**Easy way:**
- [ ] Go to R2 → Your bucket → Upload
- [ ] Upload all 17 photos from `/uploads`
- [ ] Move them to `full/` folder

**Or via command line:**
```bash
chmod +x scripts/migrate-photos.sh
./scripts/migrate-photos.sh
```

### 8. Update Code (5 min)
```bash
# Rename upload function
mv functions/api/upload.js functions/api/upload-github.js.bak
mv functions/api/upload-r2.js functions/api/upload.js

# Update gallery page
# Change: {% include image-gallery.html folder="/uploads" %}
# To: {% include image-gallery-r2.html %}

# Commit and push
git add -A
git commit -m "Migrate to R2"
git push origin main
```

### 9. Test (5 min)
- [ ] Visit `/gallery` - photos load?
- [ ] Visit `/upload` - can upload?
- [ ] Click photo - lightbox works?
- [ ] Try direct photo URL - redirects to gallery?

### 10. Clean Up (1 min)
**After testing for a day:**
```bash
git rm -rf uploads/
git rm .github/workflows/optimize-images.yml
git commit -m "Clean up old files"
git push
```

---

## 📋 Environment Variables Summary

| Variable | Old | New | Action |
|----------|-----|-----|--------|
| `GITHUB_CLIENT_ID` | ✅ Keep | ✅ Keep | No change |
| `GITHUB_CLIENT_SECRET` | ✅ Keep | ✅ Keep | No change |
| `SESSION_SECRET` | ✅ Keep | ✅ Keep | No change |
| `ALLOWED_USERNAME` | ✅ Keep | ✅ Keep | No change |
| `SITE_URL` | ✅ Keep | ✅ Keep | No change |
| `GITHUB_TOKEN` | ✅ Had | ❌ Remove | DELETE |
| `REPO_OWNER` | ✅ Had | ❌ Remove | DELETE |
| `REPO_NAME` | ✅ Had | ❌ Remove | DELETE |
| `REPO_BRANCH` | ✅ Had | ❌ Remove | DELETE |
| `R2_ACCOUNT_ID` | - | ✅ Add | NEW |
| `R2_ACCESS_KEY_ID` | - | ✅ Add | NEW |
| `R2_SECRET_ACCESS_KEY` | - | ✅ Add | NEW |
| `R2_BUCKET_NAME` | - | ✅ Add | NEW |

---

## 🎯 Expected Results

**After migration:**
- ✅ All 17 photos visible in gallery
- ✅ Upload works from iPhone
- ✅ Lightbox works
- ✅ Likes work
- ✅ Direct photo URLs redirect to gallery
- ✅ Hotlinking blocked
- ✅ Views tracked in KV
- ✅ Repo size: 41MB → <1MB
- ✅ Cost: $0/month

---

## 🆘 If Something Breaks

1. **Gallery shows no photos:**
   - Did you upload photos to R2?
   - Did you update gallery.html?
   - Check `/api/photos` endpoint

2. **Upload fails:**
   - Check environment variables
   - Check R2 API token permissions
   - Check browser console

3. **Photos don't load:**
   - Check Worker is deployed
   - Check `photos.cheezychinito.com` domain
   - Check R2 bindings

4. **Quick rollback:**
   ```bash
   # Restore old upload function
   mv functions/api/upload-github.js.bak functions/api/upload.js

   # Restore old gallery
   # Change back to: {% include image-gallery.html folder="/uploads" %}

   # Push
   git push origin main
   ```

---

See **R2_SETUP_GUIDE.md** for detailed step-by-step instructions.
