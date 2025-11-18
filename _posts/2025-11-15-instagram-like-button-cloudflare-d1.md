---
layout: post
title: "Building an Instagram-Style Like Button with Cloudflare D1 (No Backend Required)"
date: 2025-11-15
description: Photo Gallery with like button
catetags:tags: [cloudflare, serverless, tutorial]
---

Ever wanted to add engagement features to your static site without spinning up a backend server? Here's how I built an Instagram-style like button using Cloudflare D1 (serverless SQLite) that works on the edge with zero infrastructure.

## The Problem

I had a photo gallery on a static site (Jekyll + GitHub Pages) and wanted visitors to like photos. Requirements:
- No login required (anonymous likes)
- One like per person per photo
- Fast and free
- No backend server to maintain

Traditional solutions would require setting up Express.js, managing a database server, handling authentication... way too complex for a simple like button!

## The Solution: Cloudflare D1 + Pages Functions

**Cloudflare D1** is a serverless SQLite database that runs at the edge. Combined with **Cloudflare Pages Functions** (serverless API endpoints), you can build a complete like system without any servers.

**Stack:**
- Cloudflare D1 (database)
- Cloudflare Pages Functions (API)
- Vanilla JavaScript (frontend)
- IP hashing for privacy (SHA-256)

**Total cost:** $0 (D1 free tier: 5GB storage, 5M reads/day)

## Step 1: Database Schema

Create `schema.sql` - super simple, just 4 columns:

```sql
-- One like per IP per photo (enforced by UNIQUE constraint)
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_name TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(photo_name, ip_hash)  -- Database-level enforcement!
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_photo_name ON likes(photo_name);
CREATE INDEX IF NOT EXISTS idx_ip_hash ON likes(ip_hash);
```

**Why UNIQUE constraint?** Prevents duplicate likes at the database level. If someone tries to like twice, the INSERT fails gracefully - no application logic needed!

## Step 2: API Endpoint

Create `functions/api/likes.js`:

```javascript
// Hash IP addresses for privacy (SHA-256)
async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0] ||
         'unknown';
}

// GET /api/likes?photo=IMG_123.jpg
// Returns: { photo, count, liked }
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const photoName = url.searchParams.get('photo');

  if (!photoName) {
    return new Response(JSON.stringify({ error: 'Missing photo parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const clientIP = getClientIP(request);
  const ipHash = await hashIP(clientIP);

  // Get total likes
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM likes WHERE photo_name = ?'
  ).bind(photoName).first();

  // Check if current user liked it
  const likedResult = await env.DB.prepare(
    'SELECT COUNT(*) as liked FROM likes WHERE photo_name = ? AND ip_hash = ?'
  ).bind(photoName, ipHash).first();

  return new Response(JSON.stringify({
    photo: photoName,
    count: countResult.count || 0,
    liked: (likedResult.liked || 0) > 0
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// POST /api/likes
// Body: { photo: "IMG_123.jpg" }
// Toggles like/unlike
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const photoName = body.photo;

  if (!photoName) {
    return new Response(JSON.stringify({ error: 'Missing photo' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const clientIP = getClientIP(request);
  const ipHash = await hashIP(clientIP);
  const timestamp = Date.now();

  // Check if already liked
  const existingLike = await env.DB.prepare(
    'SELECT id FROM likes WHERE photo_name = ? AND ip_hash = ?'
  ).bind(photoName, ipHash).first();

  if (existingLike) {
    // Unlike
    await env.DB.prepare(
      'DELETE FROM likes WHERE photo_name = ? AND ip_hash = ?'
    ).bind(photoName, ipHash).run();
  } else {
    // Like
    await env.DB.prepare(
      'INSERT INTO likes (photo_name, ip_hash, created_at) VALUES (?, ?, ?)'
    ).bind(photoName, ipHash, timestamp).run();
  }

  // Get updated count
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM likes WHERE photo_name = ?'
  ).bind(photoName).first();

  return new Response(JSON.stringify({
    action: existingLike ? 'unliked' : 'liked',
    photo: photoName,
    count: countResult.count || 0,
    liked: !existingLike
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Why IP hashing?** Privacy! We never store raw IP addresses. The hash is one-way - can't reverse it to get the original IP.

## Step 3: Frontend JavaScript

Create `js/likes.js`:

```javascript
// Load like status when page loads
document.addEventListener('DOMContentLoaded', function() {
  const photoLikes = document.querySelectorAll('.photo-likes');
  photoLikes.forEach(function(likeDiv) {
    const photoName = likeDiv.getAttribute('data-photo');
    loadLikeStatus(photoName, likeDiv);
  });
});

async function loadLikeStatus(photoName, likeDiv) {
  try {
    const response = await fetch(`/api/likes?photo=${encodeURIComponent(photoName)}`);
    const data = await response.json();

    const button = likeDiv.querySelector('.like-button');
    const heart = button.querySelector('.heart');
    const countSpan = button.querySelector('.like-count');

    countSpan.textContent = data.count;

    if (data.liked) {
      heart.textContent = '❤️'; // Red heart
      button.classList.add('liked');
    } else {
      heart.textContent = '🤍'; // White heart
      button.classList.remove('liked');
    }
  } catch (error) {
    console.error('Error loading like status:', error);
  }
}

async function toggleLike(photoName, button) {
  if (button.classList.contains('loading')) return;

  button.classList.add('loading');

  try {
    const response = await fetch('/api/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo: photoName })
    });

    const data = await response.json();

    const heart = button.querySelector('.heart');
    const countSpan = button.querySelector('.like-count');

    countSpan.textContent = data.count;

    if (data.liked) {
      heart.textContent = '❤️';
      button.classList.add('liked');
    } else {
      heart.textContent = '🤍';
      button.classList.remove('liked');
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    alert('Failed to update like. Please try again.');
  } finally {
    button.classList.remove('loading');
  }
}
```

## Step 4: HTML Structure

```html
<div class="photo-likes" data-photo="IMG_123.jpg">
  <button class="like-button" onclick="toggleLike('IMG_123.jpg', this)">
    <span class="heart">🤍</span>
    <span class="like-count">0</span>
  </button>
</div>
```

## Step 5: CSS Styling

```css
.like-button {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(255, 255, 255, 1);
  cursor: pointer;
  padding: 6px 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
}

.like-button:hover {
  transform: scale(1.08);
}

.like-button .heart {
  font-size: 14px;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.like-button.liked .heart {
  animation: likeAnimation 0.4s ease-in-out;
}

@keyframes likeAnimation {
  0% { transform: scale(1); }
  15% { transform: scale(1.3); }
  30% { transform: scale(0.95); }
  45% { transform: scale(1.1); }
  60% { transform: scale(1); }
}

.like-count {
  font-size: 11px;
  font-weight: 600;
}
```

## Step 6: Deploy

### Create D1 Database

```bash
# Install wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create database
wrangler d1 create photo-likes

# Initialize schema
wrangler d1 execute photo-likes --remote --file=./schema.sql
```

### Bind to Cloudflare Pages

1. Go to Cloudflare Dashboard → Workers & Pages → Your site
2. Settings → Functions → D1 database bindings
3. Add binding:
   - Variable name: `DB`
   - D1 database: `photo-likes`
4. Save

Done! Deploy your site and the likes will work immediately.

## Debugging Story: The Emoji Sizing Nightmare 😅

When I first implemented this, the heart emoji was **HUGE** on mobile - bigger than the close button! Here's what I learned:

**Problem:** Emoji font sizes don't always respect CSS `font-size`

**Solution #1 (Failed):** Set `font-size: 16px` → Still huge on iPhone

**Solution #2 (Failed):** Force with `width: 16px; height: 16px` → Worked on desktop, still huge on mobile

**Solution #3 (Success!):** Mobile CSS had `font-size: 28px` override! Desktop was 16px, mobile was 28px. Cut mobile to 14px and boom - perfect size.

**Lesson:** Always check your media queries! Desktop and mobile can have different overrides.

## Why This Approach is Great

✅ **Free** - D1 free tier is generous (5M reads/day)
✅ **Fast** - Runs at the edge (low latency worldwide)
✅ **Simple** - No backend servers to maintain
✅ **Private** - IPs are hashed, never stored
✅ **Scalable** - Cloudflare handles traffic spikes
✅ **Database-enforced** - UNIQUE constraint prevents duplication

## Monitoring Your Likes

```bash
# See most-liked photos
wrangler d1 execute photo-likes --remote --command="
  SELECT photo_name, COUNT(*) as likes
  FROM likes
  GROUP BY photo_name
  ORDER BY likes DESC
  LIMIT 10
"

# Total likes across all photos
wrangler d1 execute photo-likes --remote --command="
  SELECT COUNT(*) as total_likes FROM likes
"
```

## Alternatives Considered

**Why not comments?** Too complex, mostly spam/bots nowadays. Likes are simpler and more engaging for photo galleries.

**Why not third-party services?** (Disqus, etc.) Heavy, slow, privacy concerns, expensive.

**Why not KV?** D1's SQL is better for counting/querying. KV is great for caching, but not for relational data.

## Next Steps

- Add rate limiting (optional - D1 UNIQUE constraint already prevents spam)
- Show "popular photos" section (query by like count)
- Add admin dashboard to view analytics
- Animate the heart with more flair

## Conclusion

You can build surprisingly powerful features with serverless tools! This like system:
- Handles unlimited traffic
- Costs $0/month
- Requires no backend maintenance
- Works globally with low latency

All thanks to Cloudflare's edge platform. No servers, no headaches, just fast, free engagement features for your static site.
