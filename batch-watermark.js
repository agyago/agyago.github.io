#!/usr/bin/env node

/**
 * One-Time Batch Watermarking Script
 * Adds "cheezychinito" watermark to existing photos in R2
 *
 * Usage:
 *   node batch-watermark.js IMG_1234.jpg IMG_5678.jpg IMG_9999.jpg
 */

const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { execSync } = require('child_process');

// Watermark configuration (matching your upload page)
const WATERMARK_CONFIG = {
    text: 'cheezychinito',
    position: 'bottom-left',
    fontSize: 28,
    fontFamily: 'Arial',
    color: 'white',
    opacity: 0.85,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 25,
    backgroundPadding: 12
};

const R2_BUCKET = 'cheezychinito-photos';

/**
 * Add watermark to image file
 */
async function addWatermarkToFile(inputPath, outputPath) {
    console.log(`  Loading ${inputPath}...`);
    const img = await loadImage(inputPath);

    // Create canvas with same dimensions
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    // Draw original image
    ctx.drawImage(img, 0, 0);

    // Prepare watermark text
    ctx.font = `${WATERMARK_CONFIG.fontSize}px ${WATERMARK_CONFIG.fontFamily}`;
    const textMetrics = ctx.measureText(WATERMARK_CONFIG.text);
    const textWidth = textMetrics.width;
    const textHeight = WATERMARK_CONFIG.fontSize * 1.2;

    // Calculate position
    let x, y;
    switch (WATERMARK_CONFIG.position) {
        case 'bottom-left':
            x = WATERMARK_CONFIG.padding;
            y = canvas.height - WATERMARK_CONFIG.padding;
            break;
        case 'bottom-right':
            x = canvas.width - textWidth - WATERMARK_CONFIG.padding;
            y = canvas.height - WATERMARK_CONFIG.padding;
            break;
        case 'top-left':
            x = WATERMARK_CONFIG.padding;
            y = WATERMARK_CONFIG.padding + WATERMARK_CONFIG.fontSize;
            break;
        case 'top-right':
            x = canvas.width - textWidth - WATERMARK_CONFIG.padding;
            y = WATERMARK_CONFIG.padding + WATERMARK_CONFIG.fontSize;
            break;
        default:
            x = WATERMARK_CONFIG.padding;
            y = canvas.height - WATERMARK_CONFIG.padding;
    }

    // Draw background box
    ctx.fillStyle = WATERMARK_CONFIG.backgroundColor;
    ctx.fillRect(
        x - WATERMARK_CONFIG.backgroundPadding,
        y - WATERMARK_CONFIG.fontSize - WATERMARK_CONFIG.backgroundPadding,
        textWidth + (WATERMARK_CONFIG.backgroundPadding * 2),
        textHeight + WATERMARK_CONFIG.backgroundPadding
    );

    // Draw watermark text
    ctx.globalAlpha = WATERMARK_CONFIG.opacity;
    ctx.fillStyle = WATERMARK_CONFIG.color;
    ctx.font = `${WATERMARK_CONFIG.fontSize}px ${WATERMARK_CONFIG.fontFamily}`;
    ctx.fillText(WATERMARK_CONFIG.text, x, y);

    // Save watermarked image
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
    fs.writeFileSync(outputPath, buffer);

    console.log(`  ✓ Watermarked saved to ${outputPath}`);
    return outputPath;
}

/**
 * Download photo from R2
 */
function downloadFromR2(filename, outputPath) {
    console.log(`  Downloading ${filename} from R2...`);
    try {
        execSync(`npx wrangler r2 object get "${R2_BUCKET}/full/${filename}" --file="${outputPath}" --remote`, {
            stdio: 'inherit'  // Show wrangler output so we can see errors
        });
        return true;
    } catch (error) {
        console.error(`  ✗ Failed to download ${filename}`);
        return false;
    }
}

/**
 * Upload photo to R2
 */
function uploadToR2(filepath, filename) {
    console.log(`  Uploading watermarked ${filename} to R2...`);
    try {
        execSync(`npx wrangler r2 object put "${R2_BUCKET}/full/${filename}" --file="${filepath}" --remote`, {
            stdio: 'inherit'  // Show wrangler output
        });
        console.log(`  ✓ Uploaded to R2`);
        return true;
    } catch (error) {
        console.error(`  ✗ Failed to upload ${filename}`);
        return false;
    }
}

/**
 * Process a single photo
 */
async function processPhoto(filename) {
    const tempDir = '/tmp/watermark';
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true, mode: 0o755 });
    }

    const originalPath = `${tempDir}/${filename}`;
    const watermarkedPath = `${tempDir}/watermarked_${filename}`;

    try {
        console.log(`\n[${filename}]`);

        // Download from R2
        const downloaded = downloadFromR2(filename, originalPath);
        if (!downloaded) {
            throw new Error('Download failed');
        }

        // Add watermark
        await addWatermarkToFile(originalPath, watermarkedPath);

        // Upload back to R2
        const uploaded = uploadToR2(watermarkedPath, filename);
        if (!uploaded) {
            throw new Error('Upload failed');
        }

        // Cleanup temp files
        fs.unlinkSync(originalPath);
        fs.unlinkSync(watermarkedPath);

        console.log(`  ✓ Complete!`);
        return { filename, status: 'success' };

    } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);

        // Cleanup on error
        if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
        if (fs.existsSync(watermarkedPath)) fs.unlinkSync(watermarkedPath);

        return { filename, status: 'failed', error: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    const filenames = process.argv.slice(2);

    if (filenames.length === 0) {
        console.log('Usage: node batch-watermark.js IMG_1234.jpg IMG_5678.jpg ...');
        console.log('\nThis script will:');
        console.log('1. Download each photo from R2');
        console.log('2. Add "cheezychinito" watermark (bottom-left)');
        console.log('3. Re-upload to R2 (overwrites original)');
        process.exit(1);
    }

    console.log('===========================================');
    console.log('Batch Watermarking Script');
    console.log('===========================================');
    console.log(`Photos to process: ${filenames.length}`);
    console.log(`R2 Bucket: ${R2_BUCKET}`);
    console.log(`Watermark: "${WATERMARK_CONFIG.text}" (${WATERMARK_CONFIG.position})`);
    console.log('===========================================\n');

    const results = [];

    for (const filename of filenames) {
        const result = await processPhoto(filename);
        results.push(result);
    }

    // Summary
    console.log('\n===========================================');
    console.log('Summary');
    console.log('===========================================');

    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');

    console.log(`✓ Successful: ${successful.length}`);
    if (successful.length > 0) {
        successful.forEach(r => console.log(`  - ${r.filename}`));
    }

    if (failed.length > 0) {
        console.log(`\n✗ Failed: ${failed.length}`);
        failed.forEach(r => console.log(`  - ${r.filename}: ${r.error}`));
    }

    console.log('===========================================\n');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
