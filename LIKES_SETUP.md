# Photo Likes System Setup Guide

This guide will help you set up the Instagram-style heart/like button system for your photo gallery using Cloudflare D1 database.

## Overview

- **Database**: Cloudflare D1 (serverless SQLite)
- **Authentication**: Anonymous (IP-based, one like per IP per photo)
- **API**: `/api/likes` (GET for counts, POST to toggle)
- **UI**: Heart button with count display

## Prerequisites

- Cloudflare Pages account with your site deployed
- `wrangler` CLI installed (`npm install -g wrangler`)
- Logged in to Cloudflare via CLI (`wrangler login`)

## Step 1: Create D1 Database

```bash
# Create the database
wrangler d1 create photo-likes

# Output will show:
# ✅ Successfully created DB 'photo-likes'
#
# [[d1_databases]]
# binding = "DB"
# database_name = "photo-likes"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Save the `database_id` - you'll need it in Step 3!**

## Step 2: Initialize Database Schema

Run the schema SQL to create the likes table:

```bash
wrangler d1 execute photo-likes --file=./schema.sql
```

This creates:
- `likes` table with columns: `id`, `photo_name`, `ip_hash`, `created_at`
- UNIQUE constraint on `(photo_name, ip_hash)` to prevent duplicate likes
- Indexes for fast lookups

Verify the table was created:

```bash
wrangler d1 execute photo-likes --command="SELECT name FROM sqlite_master WHERE type='table';"
```

## Step 3: Bind D1 Database to Cloudflare Pages

You need to bind the D1 database to your Pages project so the API can access it.

### Option A: Using Cloudflare Dashboard (Recommended)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → Your site (e.g., `agyago-github-io`)
3. Click **Settings** tab
4. Scroll to **Functions** section
5. Find **D1 database bindings**
6. Click **Add binding**
   - **Variable name**: `DB`
   - **D1 database**: Select `photo-likes`
7. Click **Save**

### Option B: Using wrangler CLI

If your project has a `wrangler.toml` file:

```toml
name = "agyago-github-io"

[[d1_databases]]
binding = "DB"
database_name = "photo-likes"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # From Step 1
```

Then deploy:

```bash
wrangler pages deploy
```

## Step 4: Test the API

Once deployed, test the likes API:

### Get like count (should return 0 initially)

```bash
curl "https://yourdomain.com/api/likes?photo=IMG_0162.jpg"
```

Expected response:
```json
{
  "photo": "IMG_0162.jpg",
  "count": 0,
  "liked": false
}
```

### Add a like

```bash
curl -X POST https://yourdomain.com/api/likes \
  -H "Content-Type: application/json" \
  -d '{"photo":"IMG_0162.jpg"}'
```

Expected response:
```json
{
  "action": "liked",
  "photo": "IMG_0162.jpg",
  "count": 1,
  "liked": true
}
```

### Toggle (unlike)

```bash
curl -X POST https://yourdomain.com/api/likes \
  -H "Content-Type: application/json" \
  -d '{"photo":"IMG_0162.jpg"}'
```

Expected response:
```json
{
  "action": "unliked",
  "photo": "IMG_0162.jpg",
  "count": 0,
  "liked": false
}
```

## Step 5: Verify on Your Gallery Page

1. Visit your gallery page (e.g., `https://yourdomain.com/gallery`)
2. You should see heart buttons (♡) below each photo with "0" count
3. Click a heart - it should turn red (♥) and count should increment
4. Click again - it should turn back to outline (♡) and count should decrement

## Troubleshooting

### Error: "DB is not defined"

**Problem**: D1 database binding is missing

**Solution**:
- Check Step 3 - make sure you added the D1 binding with variable name `DB`
- Redeploy your site after adding the binding
- Wait a few minutes for changes to propagate

### Error: "no such table: likes"

**Problem**: Database schema not initialized

**Solution**:
- Run Step 2 again: `wrangler d1 execute photo-likes --file=./schema.sql`
- Verify table exists: `wrangler d1 execute photo-likes --command="SELECT * FROM likes;"`

### Hearts don't appear or count stays at 0

**Problem**: JavaScript not loading or API error

**Solution**:
- Open browser console (F12) and check for errors
- Verify `/js/likes.js` is loaded
- Check Network tab for API call status
- Verify API response in Network tab

### Likes don't persist / reset on page reload

**Problem**: Database binding issue or API not saving correctly

**Solution**:
- Check browser console for errors
- Test API directly with curl (Step 4)
- Check Cloudflare Pages Functions logs in dashboard

## Monitoring

### View all likes in database

```bash
wrangler d1 execute photo-likes --command="SELECT photo_name, COUNT(*) as likes FROM likes GROUP BY photo_name;"
```

### Get total like count across all photos

```bash
wrangler d1 execute photo-likes --command="SELECT COUNT(*) as total_likes FROM likes;"
```

### View recent likes

```bash
wrangler d1 execute photo-likes --command="SELECT * FROM likes ORDER BY created_at DESC LIMIT 10;"
```

## Features

✅ **Anonymous likes** - No login required, tracked by IP hash
✅ **One like per IP per photo** - Database enforces uniqueness
✅ **Instant feedback** - Heart animates on click
✅ **Privacy-focused** - IPs are hashed with SHA-256
✅ **Free** - Cloudflare D1 free tier: 5GB storage, 5M reads/day
✅ **Fast** - Edge database with low latency

## Security Notes

- IP addresses are hashed with SHA-256 before storage (privacy)
- UNIQUE constraint prevents duplicate likes (database-level enforcement)
- No authentication required (anonymous likes)
- No rate limiting implemented (consider adding if you get abuse)

## Cost

**Free tier limits (more than enough for personal sites):**

- 5 GB storage
- 5 million reads per day
- 100,000 writes per day

Unless you have millions of visitors daily, you'll never exceed these limits!

## File Structure

```
├── schema.sql                    # Database schema
├── functions/api/likes.js        # Likes API (GET/POST)
├── _includes/image-gallery.html  # Gallery with heart buttons
├── css/likes.css                 # Heart button styling
├── js/likes.js                   # Client-side likes logic
└── LIKES_SETUP.md               # This file
```

## Next Steps

After setup is complete:

1. Test likes on your gallery page
2. Monitor likes in D1 database
3. (Optional) Add rate limiting to prevent spam
4. (Optional) Add admin dashboard to view popular photos

Enjoy your new Instagram-style likes system! ♥
