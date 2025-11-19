# Automatic Photo Watermarking

Your photo upload system now **automatically adds a "cheezychinito" watermark** to every photo during upload! No more manual editing needed.

## How It Works

When you upload photos:

1. Photo is received by the upload handler
2. **Watermark is automatically added** (bottom-left corner)
3. Watermarked photo is saved to R2 storage
4. Original unwatermarked version is never stored

**Result:** All photos displayed on your site have the watermark built-in!

---

## Configuration

Edit `functions/api/upload.js` to customize the watermark (lines 16-29):

```javascript
const WATERMARK_CONFIG = {
  enabled: true,  // Set to false to disable watermarking
  text: 'cheezychinito',  // Watermark text
  position: 'bottom-left',  // bottom-left, bottom-right, top-left, top-right
  fontSize: 28,
  color: 'white',
  opacity: 0.85,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',  // Semi-transparent black box
  padding: 25,
  backgroundPadding: 12
};
```

### Options Explained:

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Turn watermarking on/off | `true` |
| `text` | Watermark text | `'cheezychinito'` |
| `position` | Where to place watermark | `'bottom-left'` |
| `fontSize` | Text size in pixels | `28` |
| `color` | Text color | `'white'` |
| `opacity` | Text transparency (0-1) | `0.85` |
| `backgroundColor` | Background box color/transparency | `'rgba(0, 0, 0, 0.6)'` |
| `padding` | Distance from edge | `25` |
| `backgroundPadding` | Padding around text inside box | `12` |

### Position Options:

- `'bottom-left'` - Like your manual watermark on IMG_0599
- `'bottom-right'` - Bottom right corner
- `'top-left'` - Top left corner
- `'top-right'` - Top right corner

---

## Examples

### Current Style (Matches Your Manual Watermark)

```javascript
{
  text: 'cheezychinito',
  position: 'bottom-left',
  fontSize: 28,
  color: 'white',
  opacity: 0.85,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  padding: 25,
  backgroundPadding: 12
}
```

**Result:** White text on semi-transparent black background, bottom-left corner

---

### Subtle Watermark

```javascript
{
  text: 'cheezychinito',
  position: 'bottom-right',
  fontSize: 18,
  color: 'white',
  opacity: 0.5,
  backgroundColor: null,  // No background box
  padding: 15
}
```

**Result:** Small, semi-transparent text, no background

---

### Bold Watermark

```javascript
{
  text: '© CHEEZYCHINITO',
  position: 'bottom-left',
  fontSize: 36,
  color: 'yellow',
  opacity: 1.0,
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  padding: 30,
  backgroundPadding: 15
}
```

**Result:** Large, bright watermark, hard to miss

---

## Disable Watermarking

To temporarily disable watermarking:

```javascript
const WATERMARK_CONFIG = {
  enabled: false,  // Turn off watermarking
  // ... rest of config
};
```

Then redeploy:

```bash
git add functions/api/upload.js
git commit -m "Disable watermarking"
git push
```

---

## Testing

Upload a test photo and check:

1. **During upload:** Check Cloudflare Pages logs for:
   ```
   Adding watermark to IMG_1234.jpg...
   Watermark added to IMG_1234.jpg
   ```

2. **After upload:** View the photo on your site - watermark should appear in the bottom-left corner

3. **Compare:** Your new auto-watermarked photos should match the style of IMG_0599

---

## Troubleshooting

### Watermark Not Appearing

**Check 1:** Is watermarking enabled?
```javascript
enabled: true  // Must be true
```

**Check 2:** Check Cloudflare Pages logs during upload
- Go to Cloudflare Dashboard → Pages → Your site → Deployment logs
- Look for "Adding watermark" messages

**Check 3:** Browser cache
- Clear browser cache (Ctrl+Shift+R)
- Watermark is added during upload, not during viewing

### Watermark Too Small/Large

Adjust `fontSize`:
```javascript
fontSize: 36,  // Larger
// or
fontSize: 18,  // Smaller
```

### Watermark Not Readable

Increase background opacity:
```javascript
backgroundColor: 'rgba(0, 0, 0, 0.8)',  // Darker background
```

Or increase text opacity:
```javascript
opacity: 1.0,  // Fully opaque
```

### Watermark Cuts Off Edge

Increase padding:
```javascript
padding: 35,  // More space from edge
```

---

## Technical Details

- **Uses Cloudflare Workers Canvas API** - No external dependencies
- **Processes images on upload** - Zero performance impact when viewing
- **Fallback behavior** - If watermarking fails, uploads original image (doesn't break uploads)
- **Supported formats** - JPEG, PNG (HEIC not supported, convert first)
- **Image quality** - Saved at 92% JPEG quality (high quality)

---

## Cost

**$0** - Watermarking happens in Cloudflare Workers, which is free for your usage level.

---

## Future Enhancements

Ideas for the future:

1. **Image watermark** - Use a logo instead of text
2. **Dynamic watermark** - Different text per photo (e.g., date taken)
3. **Multiple positions** - Watermark in multiple corners
4. **Rotation** - Angled watermark across image
5. **Per-upload toggle** - Choose watermark on/off when uploading

Let me know if you want any of these!
