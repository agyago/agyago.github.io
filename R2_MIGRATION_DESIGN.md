# R2 Migration Design Document

## 🎯 Overview
Migrate photo storage from GitHub repository to Cloudflare R2 while maintaining all existing functionality and staying on free tier.

---

## 📊 Architecture Comparison

### **CURRENT: GitHub Storage**
```
┌─────────────┐
│   iPhone    │
│  /upload    │
└──────┬──────┘
       │ 1. Upload photos
       ▼
┌─────────────────────┐
│ Cloudflare Function │
│   /api/upload.js    │
└──────┬──────────────┘
       │ 2. Commit to GitHub repo
       ▼
┌─────────────────────┐
│   GitHub Repo       │
│   /uploads/*.jpg    │  ◄── PHOTOS STORED HERE (bloats repo)
└──────┬──────────────┘
       │ 3. Push triggers
       ▼
┌─────────────────────┐
│  GitHub Actions     │
│  optimize-images    │
└──────┬──────────────┘
       │ 4. Optimize (resize, WebP)
       ▼
┌─────────────────────┐
│   GitHub Repo       │
│   /uploads/*.jpg    │  ◄── OPTIMIZED PHOTOS REPLACE ORIGINALS
└──────┬──────────────┘
       │ 5. Cloudflare Pages builds
       ▼
┌─────────────────────┐
│   Gallery Page      │
│   cheezychinito.com │
│   /gallery          │
└─────────────────────┘
       │ 6. User visits
       ▼
Photos served via Cloudflare Pages CDN
```

### **PROPOSED: R2 Storage**
```
┌─────────────┐
│   iPhone    │
│  /upload    │
└──────┬──────┘
       │ 1. Upload photos
       ▼
┌─────────────────────┐
│ Cloudflare Function │
│   /api/upload.js    │
└──────┬──────────────┘
       │ 2. Save ORIGINAL to R2 (full resolution)
       ▼
┌─────────────────────┐
│  R2 Bucket          │
│  /originals/*.jpg   │  ◄── ORIGINAL PHOTOS (full size)
└─────────────────────┘
       │
       └─────────────┐
                     │ 3. Trigger optimization
                     ▼
       ┌─────────────────────┐
       │ Cloudflare Function │
       │  /api/optimize.js   │  ◄── NEW: Image optimization
       └──────┬──────────────┘
              │ 4. Download from R2, optimize, upload back
              ▼
       ┌─────────────────────┐
       │  R2 Bucket          │
       │  /optimized/*.jpg   │  ◄── OPTIMIZED PHOTOS
       │  /optimized/*.webp  │
       └─────────────────────┘
              │
              │ 5. Update metadata
              ▼
       ┌─────────────────────┐
       │  D1 Database        │  ◄── NEW: Track photo metadata
       │  (Free Tier)        │      (filename, upload date, sizes)
       └─────────────────────┘
              │
              │ 6. User visits gallery
              ▼
       ┌─────────────────────┐
       │   Gallery Page      │
       │   /gallery          │
       │  (loads from R2)    │
       └─────────────────────┘
              │
              ▼
Photos served via R2 public URL or Cloudflare Images
```

---

## 🔄 Question 1: Upload Flow & Image Optimization

### Current Flow (GitHub Actions)
1. Upload → Commit to GitHub
2. GitHub Actions runs:
   - Downloads image
   - Uses sharp-cli to resize (max 2000px)
   - Converts to WebP
   - Compresses JPEG
   - Commits back to repo

### NEW Flow (R2 + Cloudflare Workers)

**Option A: Cloudflare Function Optimization (RECOMMENDED)**
```javascript
// /api/upload.js - ENHANCED VERSION

1. Receive photo from iPhone
2. Upload ORIGINAL to R2: /originals/IMG_1234.jpg
3. Immediately optimize using Cloudflare's built-in APIs:
   - Resize to max 2000px width
   - Convert to WebP
   - Compress JPEG (quality 85)
4. Upload OPTIMIZED to R2: /optimized/IMG_1234.jpg and .webp
5. Add entry to D1 database (or JSON file in R2)
6. Return success to iPhone

✅ Happens in real-time (no waiting for GitHub Actions)
✅ All free tier (Cloudflare Workers: 100k requests/day)
✅ Faster upload experience
```

**Option B: Keep GitHub Actions (Hybrid)**
```javascript
// /api/upload.js - Upload to R2
// Then commit a TRIGGER file to GitHub
// GitHub Actions downloads from R2, optimizes, uploads back

❌ More complex
❌ Slower (waits for GitHub Actions)
✅ Keeps existing optimization workflow
```

**My Recommendation: Option A**
- Faster for you
- Simpler architecture
- All on Cloudflare (easier to manage)
- Can use Cloudflare's native image optimization

---

## 🖼️ Question 2: Will Lightbox/Gallery Break?

### Current Gallery Code
```html
<!-- _includes/image-gallery.html -->
<img src="//images.weserv.nl/?url={{ site.url }}{{ file.path }}&w=300&h=300&output=jpg&q=50&t=square" />
```

**This loads from:** `https://cheezychinito.com/uploads/IMG_1234.jpg`

### NEW Gallery Code (R2)
```html
<!-- _includes/image-gallery.html -->
<img src="https://r2.cheezychinito.com/optimized/IMG_1234.jpg?w=300&h=300" />
```

**Or with Cloudflare Image Resizing:**
```html
<img src="https://cheezychinito.com/cdn-cgi/image/width=300,height=300,fit=cover,quality=85/r2/optimized/IMG_1234.jpg" />
```

### Changes Needed:
1. ✅ **Lightbox.js** - NO CHANGES (just changes URLs)
2. ✅ **Likes system** - NO CHANGES (uses photo filename, not URL)
3. ✅ **Gallery layout** - NO CHANGES (same HTML structure)
4. ⚠️ **Image paths** - MUST UPDATE to load from R2 instead of `/uploads`

### Migration Strategy:
```liquid
<!-- HYBRID APPROACH: Check both locations -->
{% for photo in site.data.gallery %}
  {% if photo.in_r2 %}
    <img src="https://r2.cheezychinito.com/optimized/{{ photo.filename }}" />
  {% else %}
    <img src="{{ site.url }}/uploads/{{ photo.filename }}" />
  {% endif %}
{% endfor %}
```

**Answer: Gallery will NOT break, but we need to update image paths.**

---

## 🔀 Question 3: Hybrid vs Full Migration

### Option A: **Hybrid Approach** (Old in GitHub, New in R2)

```
GitHub /uploads/
├── IMG_0162.jpg  ◄── OLD (keep here)
├── IMG_0515.jpg  ◄── OLD (keep here)
└── ...

R2 /optimized/
├── IMG_9999.jpg  ◄── NEW (from today onwards)
└── ...
```

**Pros:**
- ✅ Faster to implement (no migration of old files)
- ✅ Less chance of breaking gallery immediately
- ✅ Can test R2 with new uploads first

**Cons:**
- ❌ Tech debt (two systems to maintain)
- ❌ Gallery code more complex (checks two locations)
- ❌ Old photos still bloat GitHub repo
- ❌ Inconsistent experience (some from GitHub, some from R2)
- ❌ Will eventually need to migrate anyway

### Option B: **Full Migration** (Everything to R2)

```
R2 /optimized/
├── IMG_0162.jpg  ◄── MIGRATED
├── IMG_0515.jpg  ◄── MIGRATED
├── IMG_9999.jpg  ◄── NEW
└── ...

GitHub /uploads/  ◄── DELETED (repo shrinks to <1MB)
```

**Pros:**
- ✅ Clean architecture (single source of truth)
- ✅ Simple gallery code (always loads from R2)
- ✅ Repo shrinks from 41MB to <1MB (faster deployments)
- ✅ No tech debt
- ✅ Consistent experience for all photos

**Cons:**
- ⚠️ Need to migrate 17 existing photos (~30 minutes work)
- ⚠️ Need to test gallery thoroughly before deleting from GitHub
- ⚠️ Slight risk if migration has issues

### My **STRONG Recommendation: Full Migration**

**Why?**
1. You only have **17 photos** - migration takes <30 minutes
2. Hybrid approach = permanent tech debt you'll regret later
3. When you have 100+ photos, migration becomes scary
4. Do it right the first time = sleep better at night
5. We can test BEFORE deleting from GitHub (safe rollback)

**Migration Plan:**
```bash
1. Create R2 bucket
2. Upload all 17 existing photos to R2
3. Test gallery thoroughly (old URLs still work via GitHub)
4. Update gallery to use R2 URLs
5. Test again
6. Once confident, delete /uploads from GitHub
7. Repo shrinks to <1MB, deployments get faster
```

---

## 🔐 Question 4: OAuth Changes

### Current OAuth Flow
```
1. /upload.html → /api/auth/login
2. Redirect to GitHub OAuth
3. GitHub → /api/auth/callback
4. Set session cookie
5. /upload.html → /api/upload.js (authenticated)
6. /api/upload.js commits to GitHub using GITHUB_TOKEN
```

### NEW OAuth Flow
```
1. /upload.html → /api/auth/login     ◄── NO CHANGE
2. Redirect to GitHub OAuth            ◄── NO CHANGE
3. GitHub → /api/auth/callback         ◄── NO CHANGE
4. Set session cookie                  ◄── NO CHANGE
5. /upload.html → /api/upload.js (authenticated)  ◄── NO CHANGE
6. /api/upload.js uploads to R2 using R2_ACCESS_KEY  ◄── ONLY CHANGE
```

### Changes Needed:
- ✅ **Login flow** - NO CHANGES
- ✅ **Session handling** - NO CHANGES
- ✅ **Authentication** - NO CHANGES
- ⚠️ **Upload destination** - Change from GitHub API to R2 API

### New Environment Variables Needed:
```bash
# Keep existing
GITHUB_CLIENT_ID          ◄── KEEP (for OAuth)
GITHUB_CLIENT_SECRET      ◄── KEEP (for OAuth)
SESSION_SECRET            ◄── KEEP (for sessions)
ALLOWED_USERNAME          ◄── KEEP (for auth)

# Can REMOVE (no longer committing to GitHub)
GITHUB_TOKEN              ◄── DELETE (not needed!)
REPO_OWNER                ◄── DELETE
REPO_NAME                 ◄── DELETE
REPO_BRANCH               ◄── DELETE

# NEW for R2
R2_ACCOUNT_ID             ◄── ADD (from Cloudflare)
R2_ACCESS_KEY_ID          ◄── ADD (from R2 API tokens)
R2_SECRET_ACCESS_KEY      ◄── ADD (from R2 API tokens)
R2_BUCKET_NAME            ◄── ADD (e.g., "cheezychinito-photos")
```

**Answer: OAuth stays EXACTLY the same. Only the upload destination changes.**

---

## 💾 Data Storage Strategy

### Option 1: D1 Database (RECOMMENDED)
```sql
-- Track photos in D1 (Cloudflare's free SQLite)
CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_size INTEGER,
  optimized_size INTEGER,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  optimized BOOLEAN DEFAULT 0
);
```

**Pros:**
- ✅ Free tier: 100k reads/day, 1k writes/day
- ✅ Can query photos efficiently
- ✅ Can add metadata (tags, descriptions later)
- ✅ Integrates well with your existing likes system

### Option 2: Simple JSON file in R2
```json
{
  "photos": [
    {
      "filename": "IMG_1234.jpg",
      "uploaded": "2024-11-15",
      "size": 1234567
    }
  ]
}
```

**Pros:**
- ✅ Simpler to implement
- ✅ No database setup

**Cons:**
- ❌ Harder to query
- ❌ Risk of conflicts with multiple uploads

**Recommendation: Start with D1** - it's free and more robust.

---

## 🚀 Implementation Plan

### Phase 1: Setup (Day 1 - 30 minutes)
- [ ] Create R2 bucket
- [ ] Generate R2 API tokens
- [ ] Create D1 database
- [ ] Add R2 environment variables to Cloudflare

### Phase 2: Update Upload Function (Day 1 - 1 hour)
- [ ] Modify `/functions/api/upload.js` to upload to R2
- [ ] Add image optimization (resize, WebP conversion)
- [ ] Update to save metadata in D1
- [ ] Test upload from iPhone

### Phase 3: Migrate Existing Photos (Day 1 - 30 minutes)
- [ ] Upload 17 existing photos from `/uploads` to R2
- [ ] Optimize them
- [ ] Add to D1 database

### Phase 4: Update Gallery (Day 1 - 1 hour)
- [ ] Create new data file for gallery (queries D1 or R2)
- [ ] Update `_includes/image-gallery.html` to load from R2
- [ ] Test lightbox functionality
- [ ] Test likes functionality

### Phase 5: Deploy & Test (Day 1 - 30 minutes)
- [ ] Deploy to Cloudflare Pages
- [ ] Test full upload flow
- [ ] Verify gallery works
- [ ] Check old and new photos display correctly

### Phase 6: Cleanup (Day 2 - 15 minutes)
- [ ] Delete `/uploads` folder from GitHub
- [ ] Remove GitHub-related env vars
- [ ] Remove GitHub Actions workflow

**Total Time: ~3.5 hours**

---

## 💰 Cost Analysis

### Current Setup (GitHub)
| Resource | Usage | Cost |
|----------|-------|------|
| GitHub repo | 41MB | $0 |
| GitHub Actions | ~20 runs/month | $0 |
| Cloudflare Pages | 500 builds/month | $0 |
| **TOTAL** | | **$0/month** |

### NEW Setup (R2)
| Resource | Free Tier | Your Usage | Cost |
|----------|-----------|------------|------|
| **R2 Storage** | 10 GB | 0.041 GB | $0 |
| **R2 Class A ops** | 10M/month | ~20/month | $0 |
| **R2 Class B ops** | 100M/month | ~1k/month | $0 |
| **R2 Bandwidth** | Unlimited | Unlimited | $0 |
| **D1 Database** | 100k reads/day | ~100/day | $0 |
| **Workers/Functions** | 100k req/day | ~50/day | $0 |
| **Cloudflare Pages** | 500 builds/month | ~10/month | $0 |
| **TOTAL** | | | **$0/month** |

**Headroom before any costs:**
- Can store up to **10 GB** of photos (currently 0.041 GB = **244x headroom**)
- Can upload **10 million photos/month** (currently 20 = **500,000x headroom**)
- Can serve **100 million page views/month** (currently ~1k = **100,000x headroom**)

**When would you start paying?**
- If you exceed 10 GB storage → $0.015/GB/month = $0.60/month for 50GB
- You'd need ~**5,000 photos** before costs kick in

---

## 🎯 Recommendation Summary

1. **✅ Do Full Migration** (not hybrid)
   - Cleaner architecture
   - Only 17 photos to migrate (easy!)
   - No tech debt

2. **✅ Use Cloudflare Functions for optimization** (not GitHub Actions)
   - Faster upload experience
   - Simpler to maintain
   - All in one place

3. **✅ Use D1 database** for metadata
   - Free tier is generous
   - Better than JSON files
   - Can add features later (tags, search)

4. **✅ OAuth stays the same**
   - No changes to login flow
   - Just change upload destination

5. **✅ Timeline: 1 day implementation**
   - Setup: 30 min
   - Code changes: 2 hours
   - Testing: 1 hour
   - Total: ~3.5 hours

---

## 🤔 Questions to Decide

Before I start coding, please confirm:

1. **Full migration or hybrid?** (I recommend full)
2. **Use D1 database or JSON file?** (I recommend D1)
3. **Should I preserve original full-resolution photos in R2?** (I recommend yes - keep originals in `/originals/` folder)
4. **Gallery URL structure preference:**
   - Option A: `https://r2.cheezychinito.com/photo.jpg` (custom subdomain)
   - Option B: `https://cheezychinito.com/photos/photo.jpg` (Cloudflare Workers proxy)
   - Option C: Direct R2 URL (longer, less pretty)

Let me know your preferences and I'll start implementing! 🚀
