---
layout: post
title: "Migrating a Photo Gallery from GitHub to Cloudflare R2"
date: 2025-11-18
description: migrating using serverlsess workers
tags: [cloudflare, serverless, tutorial]
---

Ever felt limited storing photos in your GitHub repository? Here's how I migrated a photo gallery from GitHub storage to Cloudflare R2 with full control, better performance, and zero monthly costs.

## The Problem

I had a photo gallery on a static Jekyll site with photos stored in the GitHub repo. Issues:
- **Storage limits** - GitHub repositories get slow with large files
- **No access control** - Anyone can download photos directly from repo
- **SEO split** - Image URLs point to GitHub, not my domain
- **Build times** - Large photos slow down GitHub Pages builds
- **Hotlinking** - External sites can hotlink directly to GitHub URLs

Traditional solutions would require AWS S3 + CloudFront ($$$), setting up nginx with auth, or expensive CDN services.

## The Solution: Cloudflare R2 + Workers

**Cloudflare R2** is S3-compatible object storage with **zero egress fees**. Combined with **Cloudflare Workers** (edge functions), you get a private photo server with full control.

**Stack:**
- Cloudflare R2 (private photo storage)
- Cloudflare Workers (photo server with referer protection)
- Cloudflare Pages Functions (upload API)
- Cloudflare KV (metadata storage)
- weserv.nl (free image optimization CDN)

**Total cost:** $0/month (R2 free tier: 10GB storage, unlimited bandwidth)

## Architecture Overview

```
User Browser
    ↓
Your Site (cheezychinito.com/gallery)
    ↓
/api/photos → Returns photo list from KV
    ↓
weserv.nl → Fetches from photos.cheezychinito.com (Worker)
    ↓
Worker → Checks referer, serves from R2
    ↓
Private R2 Bucket (full-size originals)
```

**Key benefit:** Photos in private R2, only accessible through your Worker. No direct access, no hotlinking.

## Step 1: Create R2 Bucket

```bash
# Install wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create private R2 bucket
wrangler r2 bucket create photo-gallery

# List buckets to verify
wrangler r2 bucket list
```

**Important:** Keep the bucket private (default). Your Worker will be the gatekeeper.

## Step 2: Create KV Namespace for Metadata

```bash
# Create KV namespace for photo list and metadata
wrangler kv namespace create PHOTOS_KV --preview false

# Note the ID from output (you'll need it)
```

The KV namespace stores:
- Photo list (which photos exist)
- Metadata (upload date, views, likes)
- View counts and analytics

**Why KV for metadata?** Fast edge reads, perfect for frequently accessed data like photo lists.

## Step 3: Deploy Photo Server Worker

Create `workers/photo-server.js`:

```javascript
/**
 * Photo Server Worker
 * Serves photos from private R2 bucket with referer protection
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const filename = url.pathname.replace('/', '');

    // Security: Check referer to prevent hotlinking
    const referer = request.headers.get('Referer') || '';
    const userAgent = request.headers.get('User-Agent') || '';

    // Allow these sources:
    // 1. Your site
    // 2. weserv.nl (image CDN)
    // 3. Direct browser navigation (empty referer)
    const isFromYourSite = referer.includes('yoursite.com');
    const isFromWeserv = referer.includes('images.weserv.nl') ||
                         userAgent.includes('Weserv');
    const isDirectBrowser = !referer ||
                            request.headers.get('Sec-Fetch-Site') === 'same-origin';

    // Block hotlinking
    if (!isFromYourSite && !isFromWeserv && !isDirectBrowser && referer) {
      return new Response('Hotlinking not allowed', { status: 403 });
    }

    // Validate filename (prevent directory traversal)
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return new Response('Invalid filename', { status: 400 });
    }

    try {
      // Get photo from R2
      const object = await env.R2_BUCKET.get(`full/${filename}`);

      if (!object) {
        return new Response('Photo not found', { status: 404 });
      }

      // Track view (async, doesn't slow down response)
      ctx.waitUntil(trackView(env, filename));

      // Serve with caching headers
      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=31536000'); // 1 year
      headers.set('ETag', object.etag);

      return new Response(object.body, { headers });

    } catch (error) {
      console.error('Error serving photo:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }
};

async function trackView(env, filename) {
  try {
    const viewKey = `views:${filename}`;
    const currentViews = await env.PHOTOS_KV.get(viewKey) || '0';
    const newViews = parseInt(currentViews) + 1;
    await env.PHOTOS_KV.put(viewKey, newViews.toString());
  } catch (error) {
    console.error('View tracking failed:', error);
  }
}
```

**Why referer checking?** Prevents people from bypassing your site and hotlinking directly to R2 URLs.

Create `workers/wrangler.toml`:

```toml
name = "photo-server"
main = "photo-server.js"
compatibility_date = "2024-11-16"
account_id = "YOUR_ACCOUNT_ID"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "photo-gallery"

[[kv_namespaces]]
binding = "PHOTOS_KV"
id = "YOUR_KV_NAMESPACE_ID"
```

Deploy:

```bash
cd workers
wrangler deploy
```

## Step 4: Add Custom Domain to Worker

```bash
# Add custom domain (e.g., photos.yoursite.com)
# Go to Cloudflare Dashboard → Workers & Pages → photo-server
# → Settings → Domains & Routes → Add Custom Domain
```

Or via CLI:

```bash
wrangler deploy --route photos.yoursite.com/*
```

Now your photos are accessible at `https://photos.yoursite.com/photo.jpg`

## Step 5: Create Photo List API

Create `functions/api/photos.js` in your Pages project:

```javascript
/**
 * Photo List API
 * Returns list of all photos from KV store
 */
export async function onRequestGet({ request, env }) {
  try {
    // Get photo list from KV
    const photoListJson = await env.PHOTOS_KV.get('photo-list');

    if (!photoListJson) {
      return new Response(
        JSON.stringify({ photos: [] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const photoList = JSON.parse(photoListJson);

    return new Response(
      JSON.stringify({
        count: photoList.length,
        photos: photoList
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60'
        }
      }
    );

  } catch (error) {
    console.error('Error fetching photo list:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch photos' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

## Step 6: Dynamic Gallery with weserv.nl

Create `_includes/image-gallery-r2.html`:

```html
<div id="gallery-container">
  <div class="gallery-loading">
    <p>Loading photos...</p>
  </div>
</div>

<ul class="image-gallery" id="gallery-grid" style="display: none;">
  <!-- Photos loaded dynamically -->
</ul>

<script>
  (async function loadGallery() {
    const container = document.getElementById('gallery-container');
    const grid = document.getElementById('gallery-grid');

    try {
      // Fetch photo list from API
      const response = await fetch('/api/photos');
      const data = await response.json();
      const photos = data.photos || [];

      if (photos.length === 0) {
        container.innerHTML = '<p>No photos yet.</p>';
        return;
      }

      const PHOTO_SERVER = 'https://photos.yoursite.com';

      container.style.display = 'none';
      grid.style.display = '';

      // Render each photo
      photos.forEach(photo => {
        const filename = photo.filename || photo;

        // Use weserv.nl for FREE image optimization
        const thumbUrl = `//images.weserv.nl/?url=${PHOTO_SERVER}/${filename}&w=300&h=300&output=jpg&q=50&t=square`;
        const fullUrl = `//images.weserv.nl/?url=${PHOTO_SERVER}/${filename}&w=2000&output=jpg&q=85`;

        const li = document.createElement('li');
        li.className = 'gallery-item';
        li.innerHTML = `
          <a href="${fullUrl}"
             class="lightbox-image"
             data-photo="${filename}">
            <img src="${thumbUrl}"
                 alt="${filename}"
                 loading="lazy" />
          </a>
        `;
        grid.appendChild(li);
      });

      // Attach lightbox handlers
      attachLightboxHandlers(grid);

    } catch (error) {
      console.error('Gallery loading error:', error);
      container.innerHTML = '<p>Failed to load gallery</p>';
    }
  })();

  function attachLightboxHandlers(grid) {
    const links = grid.querySelectorAll('a.lightbox-image');
    links.forEach(link => {
      link.addEventListener('click', function(event) {
        event.preventDefault();

        // Create lightbox popup
        document.getElementById('lightbox').innerHTML = `
          <a id="close"></a>
          <a id="next">&rsaquo;</a>
          <a id="prev">&lsaquo;</a>
          <div class="img" style="background: url('${this.href}') center/contain no-repeat;">
            <img src="${this.href}" alt="${this.dataset.photo}" />
          </div>
        `;
        document.getElementById('lightbox').style.display = 'block';

        // Enable prev/next navigation
        if (typeof setGallery === 'function') {
          setGallery(this);
        }
      });
    });
  }
</script>
```

**Why weserv.nl?** Free image resizing CDN. It fetches from your Worker, optimizes images on-the-fly, and caches them globally.

## Step 7: Upload Handler

Create `functions/api/upload.js`:

```javascript
/**
 * Upload Handler
 * Uploads photos to R2 with authentication
 */

// Add session verification here (OAuth, etc.)
async function verifySession(request, env) {
  // Your auth logic
  return { username: 'authenticated-user' };
}

export async function onRequestPost({ request, env }) {
  try {
    // Verify authentication
    const session = await verifySession(request, env);
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Parse JSON payload (files as base64)
    const payload = await request.json();
    const files = payload.files || [];

    if (files.length === 0) {
      return new Response('No files uploaded', { status: 400 });
    }

    const results = [];

    for (const fileData of files) {
      const filename = sanitizeFilename(fileData.name);
      const imageBuffer = base64ToArrayBuffer(fileData.data);

      // Block HEIC files (can't convert in Workers)
      if (filename.toLowerCase().endsWith('.heic')) {
        throw new Error(`HEIC not supported. Convert ${filename} to JPEG first.`);
      }

      // Upload to R2
      await env.R2_BUCKET.put(`full/${filename}`, imageBuffer, {
        httpMetadata: { contentType: fileData.type || 'image/jpeg' }
      });

      // Add to KV photo list
      await addPhotoToKV(env, filename, session.username);

      results.push({ filename, status: 'success' });
    }

    return new Response(
      JSON.stringify({
        success: true,
        uploaded: results.length,
        results
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function sanitizeFilename(filename) {
  return filename
    .split('/').pop()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function addPhotoToKV(env, filename, username) {
  // Update photo list
  const photoListJson = await env.PHOTOS_KV.get('photo-list') || '[]';
  const photoList = JSON.parse(photoListJson);

  if (!photoList.includes(filename)) {
    photoList.unshift(filename); // Add to beginning (newest first)
    await env.PHOTOS_KV.put('photo-list', JSON.stringify(photoList));
  }
}
```

## Step 8: Migrate Existing Photos

Create a migration script `migrate-photos.sh`:

```bash
#!/bin/bash

echo "Migrating photos to R2..."
count=0

for photo in uploads/*.jpg uploads/*.jpeg uploads/*.png; do
  [ -f "$photo" ] || continue
  filename=$(basename "$photo")
  echo -n "$filename... "
  wrangler r2 object put "photo-gallery/full/$filename" --file="$photo" --remote
  if [ $? -eq 0 ]; then
    echo "✓"
    ((count++))
  else
    echo "✗"
  fi
done

echo ""
echo "Migrated $count photos to R2!"
```

Run it:

```bash
chmod +x migrate-photos.sh
./migrate-photos.sh
```

Then update KV with photo list:

```bash
# Create photo list JSON
ls uploads/*.{jpg,jpeg,png} | xargs -n1 basename | jq -R -s -c 'split("\n")[:-1]' > /tmp/photo-list.json

# Upload to KV
wrangler kv key put "photo-list" --path /tmp/photo-list.json --namespace-id YOUR_KV_NAMESPACE_ID --remote
```

## Step 9: Bind KV to Pages Functions

1. Go to Cloudflare Dashboard → Workers & Pages → Your site
2. Settings → Functions → KV namespace bindings
3. Add binding:
   - Variable name: `PHOTOS_KV`
   - KV namespace: Select your namespace
4. Save and redeploy

Done! Your gallery now loads from R2.

## Debugging Story: The Lightbox Redirect Bug 🐛

When I first deployed this, clicking photos **redirected to weserv.nl URLs** instead of opening the lightbox. Here's what went wrong:

**Problem:** Lightbox.js only detects links ending in `.jpg`, `.png`, etc. But weserv.nl URLs end in `&q=85`, so lightbox ignored them!

**Solution #1 (Failed):** Add `.jpg` to weserv.nl URL → Broke weserv's query parsing

**Solution #2 (Failed):** Modify lightbox.js regex → Too brittle, breaks on updates

**Solution #3 (Success!):** Manually attach click handlers in the gallery script:

```javascript
link.addEventListener('click', function(event) {
  event.preventDefault(); // Stop redirect!
  // Manually create lightbox
  document.getElementById('lightbox').innerHTML = '...';
  document.getElementById('lightbox').style.display = 'block';

  // Enable prev/next navigation
  if (typeof setGallery === 'function') {
    setGallery(this);
  }
});
```

**Lesson:** When loading content dynamically, JavaScript libraries that run on `DOMContentLoaded` won't see your new elements. Manually attach handlers after dynamic insertion!

## Why This Approach is Great

✅ **Free** - R2's 10GB free tier = ~3,000 photos at 3MB each
✅ **Fast** - R2 CDN + weserv.nl optimization = global low latency
✅ **Private** - Photos in private bucket, only accessible via your Worker
✅ **SEO** - All traffic counts for your domain, not GitHub/external CDN
✅ **No hotlinking** - Referer protection blocks external sites
✅ **Optimized** - weserv.nl auto-resizes (300x300 thumbs, 2000px full)
✅ **Scalable** - Handles traffic spikes, no server management

## Image Optimization Breakdown

**Original photo in R2:** 2.6 MB
**Full-size via weserv.nl:** 997 KB (62% smaller)
**Thumbnail via weserv.nl:** 13 KB (99.5% smaller)

weserv.nl optimizes on-the-fly:
- Resizes (max 2000px for full, 300x300 for thumbs)
- Compresses (quality 85 for full, 50 for thumbs)
- Converts to optimal JPEG format
- Caches globally on their CDN

**All for free!**

## Monitoring Your Gallery

```bash
# List all photos in R2
wrangler r2 object list photo-gallery

# Check photo list in KV
wrangler kv key get "photo-list" --namespace-id YOUR_KV_NAMESPACE_ID --remote

# Check views for a specific photo
wrangler kv key get "views:IMG_123.jpg" --namespace-id YOUR_KV_NAMESPACE_ID --remote

# Download a photo from R2 (for backup)
wrangler r2 object get "photo-gallery/full/IMG_123.jpg" --file=./backup.jpg --remote
```

## Alternatives Considered

**Why not keep photos in GitHub repo?** Limited storage, slow builds, no access control, hotlinking issues.

**Why not AWS S3?** Egress fees! R2 has **zero egress fees** - unlimited bandwidth for free.

**Why not Cloudflare Images?** Costs $5/month for 100k images served. weserv.nl is free and does the same job for smaller galleries.

**Why not pre-generate thumbnails?** Saves a bit of bandwidth but adds complexity. weserv.nl handles it automatically.

## Tips & Tricks

### Tip 1: HEIC Files from iPhone
Cloudflare Workers can't convert HEIC to JPEG (libraries too large). Tell iPhone users to change camera settings:

**Settings → Camera → Formats → Most Compatible**

This captures photos as JPEG instead of HEIC.

### Tip 2: Bulk Upload via Wrangler
Upload multiple photos at once:

```bash
for photo in *.jpg; do
  wrangler r2 object put "photo-gallery/full/$photo" --file="$photo" --remote
done
```

### Tip 3: Verify weserv.nl is Working
Check image sizes in browser DevTools (Network tab):
- Thumbnails should be ~10-50 KB
- Full-size should be ~200-500 KB
- If you see MB sizes, weserv.nl isn't working

### Tip 4: Add Upload Progress Bar
Modify upload.js to return progress updates via Server-Sent Events for better UX on slow connections.

### Tip 5: Private Gallery with Auth
Add OAuth (GitHub, Google) to upload.js and photos.js to create a private photo gallery only visible to authenticated users.

## Common Gotchas

### Gotcha 1: KV Namespace Not Bound
**Error:** `env.PHOTOS_KV is undefined`
**Fix:** Add KV binding in Cloudflare Dashboard → Pages → Settings → Functions

### Gotcha 2: Worker Blocking weserv.nl
**Error:** Thumbnails don't load
**Fix:** Add weserv.nl to allowed referers in Worker:
```javascript
const isFromWeserv = referer.includes('images.weserv.nl');
```

### Gotcha 3: Photo List Not Updating
**Error:** New photos don't appear in gallery
**Fix:** Check that `addPhotoToKV()` is actually updating the `photo-list` key. Verify with:
```bash
wrangler kv key get "photo-list" --namespace-id YOUR_ID --remote
```

### Gotcha 4: CORS Issues
**Error:** `Fetch blocked by CORS policy`
**Fix:** Add CORS headers to photos.js:
```javascript
headers.set('Access-Control-Allow-Origin', '*');
```

## Conclusion

Migrating from GitHub storage to Cloudflare R2 gives you:
- Full control over photo access
- Better performance via edge CDN
- Zero monthly costs (stays free forever)
- Professional features (view tracking, referer protection)
- Scalability without infrastructure management

