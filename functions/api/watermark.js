/**
 * Image Watermarking for Cloudflare Workers
 * Adds "cheezychinito" watermark to bottom-left corner of photos
 *
 * This uses pure JavaScript image manipulation (no external dependencies)
 * Works with JPEG/PNG images
 */

/**
 * Add watermark to image
 * @param {ArrayBuffer} imageBuffer - Original image data
 * @param {string} text - Watermark text (default: "cheezychinito")
 * @param {Object} options - Watermark options
 * @returns {Promise<ArrayBuffer>} - Watermarked image
 */
export async function addWatermark(imageBuffer, text = 'cheezychinito', options = {}) {
  const {
    position = 'bottom-left',  // bottom-left, bottom-right, top-left, top-right
    fontSize = 24,
    fontFamily = 'Arial',
    color = 'white',
    opacity = 0.7,
    padding = 20,
    backgroundColor = 'rgba(0, 0, 0, 0.5)',  // Semi-transparent black background
    backgroundPadding = 10
  } = options;

  try {
    // Decode image using browser APIs (available in Workers)
    const blob = new Blob([imageBuffer]);
    const imageBitmap = await createImageBitmap(blob);

    const width = imageBitmap.width;
    const height = imageBitmap.height;

    // Create canvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw original image
    ctx.drawImage(imageBitmap, 0, 0);

    // Prepare watermark text
    ctx.font = `${fontSize}px ${fontFamily}`;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize * 1.2; // Approximate height

    // Calculate watermark position
    let x, y;
    switch (position) {
      case 'bottom-left':
        x = padding;
        y = height - padding;
        break;
      case 'bottom-right':
        x = width - textWidth - padding;
        y = height - padding;
        break;
      case 'top-left':
        x = padding;
        y = padding + fontSize;
        break;
      case 'top-right':
        x = width - textWidth - padding;
        y = padding + fontSize;
        break;
      default:
        x = padding;
        y = height - padding;
    }

    // Draw background box for better readability
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(
        x - backgroundPadding,
        y - fontSize - backgroundPadding,
        textWidth + (backgroundPadding * 2),
        textHeight + backgroundPadding
      );
    }

    // Draw watermark text
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillText(text, x, y);

    // Reset alpha
    ctx.globalAlpha = 1.0;

    // Convert canvas back to image
    const watermarkedBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.92  // High quality
    });

    // Convert blob to ArrayBuffer
    return await watermarkedBlob.arrayBuffer();

  } catch (error) {
    console.error('Watermarking error:', error);
    // If watermarking fails, return original image
    console.warn('Watermarking failed, returning original image');
    return imageBuffer;
  }
}

/**
 * Add watermark with custom styling (like your manual watermark)
 */
export async function addCheezychinitoBrand(imageBuffer) {
  return addWatermark(imageBuffer, 'cheezychinito', {
    position: 'bottom-left',
    fontSize: 28,
    fontFamily: 'Arial, sans-serif',
    color: 'white',
    opacity: 0.85,
    padding: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backgroundPadding: 12
  });
}
