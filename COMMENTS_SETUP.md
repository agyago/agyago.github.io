# Photo Comments System Setup Guide

This guide will help you set up the Cloudflare D1 database for the photo comments feature.

## What You'll Get

- 💬 **Anonymous comments** on gallery photos
- 🔒 **Admin moderation** (only you can delete comments)
- ⚡ **Fast & free** (Cloudflare D1 serverless database)
- 📱 **Mobile friendly** UI
- 🛡️ **Rate limiting** to prevent spam

---

## Prerequisites

- Cloudflare Pages account (you already have this!)
- Site deployed on Cloudflare Pages
- Wrangler CLI (for D1 setup)

---

## Step 1: Install Wrangler CLI

Wrangler is Cloudflare's command-line tool for managing Workers and D1 databases.

```bash
npm install -g wrangler

# Or use npx if you don't want to install globally
npx wrangler --version
```

---

## Step 2: Login to Cloudflare

```bash
wrangler login
```

This will open your browser to authenticate with Cloudflare.

---

## Step 3: Create D1 Database

```bash
# Create database
wrangler d1 create photo-comments

# Output will show:
# ✅ Successfully created DB 'photo-comments'
#
# [[d1_databases]]
# binding = "DB"
# database_name = "photo-comments"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Save the `database_id`** - you'll need it in the next step!

---

## Step 4: Initialize Database Schema

Run the SQL schema to create the comments table:

```bash
# From your repository root
wrangler d1 execute photo-comments --file=./schema.sql
```

You should see:
```
🌀 Executing on photo-comments (xxxxxxxx):
🚣 Executed 3 commands in 0.123ms
```

---

## Step 5: Bind D1 to Cloudflare Pages

### Option A: Via Cloudflare Dashboard (Easier)

1. Go to: https://dash.cloudflare.com
2. Navigate to **Pages** → Your project
3. Go to **Settings** → **Functions**
4. Scroll to **D1 database bindings**
5. Click **Add binding**
6. Fill in:
   - **Variable name**: `DB`
   - **D1 database**: Select `photo-comments`
7. Click **Save**

### Option B: Via wrangler.toml (Alternative)

If you're using a local wrangler.toml file:

```toml
# wrangler.toml
name = "agyago-github-io"

[[d1_databases]]
binding = "DB"  # Must be "DB" to match code
database_name = "photo-comments"
database_id = "your-database-id-here"
```

---

## Step 6: Redeploy Site

After binding the database, Cloudflare Pages needs to redeploy:

### Automatic Redeploy:
Push any commit to trigger rebuild:
```bash
git commit --allow-empty -m "Trigger rebuild for D1 binding"
git push
```

### Manual Redeploy:
1. Cloudflare Dashboard → Pages → Your project
2. **Deployments** tab
3. Click **"..."** → **Retry deployment**

---

## Step 7: Test Comments

1. Go to your gallery: `https://www.cheezychinito.com/gallery`
2. Click "💬 0 comments" under any photo
3. Comments section should expand
4. Try adding a comment!

---

## Verification

### Test the API endpoints:

**Get comments (should return empty array initially):**
```bash
curl "https://www.cheezychinito.com/api/comments?photo=IMG_0162.jpg"
# Expected: {"comments":[]}
```

**Post a test comment:**
```bash
curl -X POST https://www.cheezychinito.com/api/comments \
  -H "Content-Type: application/json" \
  -d '{"photo":"IMG_0162.jpg","author":"Test","text":"Hello!"}'
# Expected: {"comment":{...}}
```

**Check D1 database directly:**
```bash
wrangler d1 execute photo-comments --command="SELECT * FROM comments LIMIT 10"
```

---

## Troubleshooting

### "DB is not defined" error

**Problem:** D1 binding not configured

**Solution:**
- Check Cloudflare Pages → Settings → Functions → D1 bindings
- Make sure variable name is exactly `DB` (uppercase)
- Redeploy the site

### Comments don't load

**Problem:** Database not initialized or API endpoint issue

**Solution:**
```bash
# Check if database exists
wrangler d1 list

# Check if table exists
wrangler d1 execute photo-comments --command="SELECT name FROM sqlite_master WHERE type='table'"

# Should show: comments
```

### Rate limit errors

**Problem:** Posting too many comments too quickly

**Solution:** Wait 60 seconds between comments from the same IP (anti-spam measure)

### Can't delete comments

**Problem:** Not logged in as admin

**Solution:**
1. Go to `/upload.html`
2. Login with GitHub OAuth
3. Then delete buttons will appear on comments

---

## Database Management

### View all comments:
```bash
wrangler d1 execute photo-comments --command="SELECT * FROM comments ORDER BY created_at DESC"
```

### Count comments per photo:
```bash
wrangler d1 execute photo-comments --command="SELECT photo_name, COUNT(*) as count FROM comments GROUP BY photo_name"
```

### Delete a specific comment:
```bash
wrangler d1 execute photo-comments --command="DELETE FROM comments WHERE id = 1"
```

### Delete all comments (careful!):
```bash
wrangler d1 execute photo-comments --command="DELETE FROM comments"
```

---

## Rate Limiting Details

**Current limits (in `functions/api/comments/index.js`):**
- Max 3 comments per 60 seconds per IP
- Max comment length: 1000 characters
- Max author name length: 50 characters

**To adjust limits, edit:**
```javascript
// functions/api/comments/index.js
// Line ~50
if (recentCheck && recentCheck.count >= 3) {  // Change 3 to your limit
```

---

## Cost & Limits

**Cloudflare D1 Free Tier:**
- ✅ 5 GB storage (thousands of comments)
- ✅ 5 million reads per day
- ✅ 100,000 writes per day
- ✅ More than enough for personal gallery

**Your expected usage:**
- ~10-50 comments/day: **FREE**
- ~100-500 page views/day: **FREE**

You'll never hit the limits with a personal photo gallery!

---

## Security Features

1. **Rate Limiting** - Max 3 comments per minute per IP
2. **IP Hashing** - IPs stored as SHA-256 hash (privacy-friendly)
3. **Admin-only Delete** - Only OAuth-authenticated admin can delete
4. **XSS Prevention** - All HTML escaped in display
5. **Input Validation** - Length limits on all fields

---

## Future Enhancements

Ideas for later (if you want):

1. **Require OAuth for comments** - No anonymous comments
2. **Email notifications** - Get notified when someone comments
3. **Spam filtering** - Integrate with Cloudflare Turnstile (captcha)
4. **Comment replies** - Nested comment threads
5. **Like/reaction counts** - Heart or star reactions

---

## Uninstall (if needed)

To remove the comments system:

1. **Delete D1 database:**
```bash
wrangler d1 delete photo-comments
```

2. **Remove files:**
```bash
rm -rf functions/api/comments
rm css/comments.css
rm js/comments.js
rm schema.sql
```

3. **Revert gallery changes:**
```bash
git restore _includes/image-gallery.html
```

---

## Summary

**Files created:**
- `schema.sql` - Database schema
- `functions/api/comments/index.js` - GET/POST endpoints
- `functions/api/comments/[id].js` - DELETE endpoint
- `css/comments.css` - Styling
- `js/comments.js` - Frontend logic
- `_includes/image-gallery.html` - Updated with comments UI

**What YOU need to do:**
1. ✅ Install Wrangler
2. ✅ Create D1 database
3. ✅ Run schema.sql
4. ✅ Bind database to Pages
5. ✅ Redeploy site
6. ✅ Test!

---

## Need Help?

**Common issues:**
- DB binding not found → Check variable name is `DB` (uppercase)
- API errors → Check Cloudflare Functions logs
- Comments not saving → Check D1 execute permissions

**Useful commands:**
```bash
# Check D1 databases
wrangler d1 list

# View recent comments
wrangler d1 execute photo-comments --command="SELECT * FROM comments ORDER BY created_at DESC LIMIT 5"

# Check table schema
wrangler d1 execute photo-comments --command=".schema comments"
```

---

🎉 **Enjoy your new comments system!**

Now your visitors can engage with your photos while you maintain full control over moderation.
