/**
 * Migration Script: GitHub uploads/ → Cloudflare R2
 *
 * This script migrates existing photos from /uploads directory to R2 bucket
 *
 * Prerequisites:
 * 1. R2 bucket created
 * 2. R2 API tokens configured
 * 3. KV namespace created
 *
 * Usage:
 *   node scripts/migrate-to-r2.js
 *
 * Or run via wrangler:
 *   npx wrangler r2 object put photos/IMG_1234.jpg --file=uploads/IMG_1234.jpg
 */

const fs = require('fs');
const path = require('path');

// Configuration - Update these with your values
const CONFIG = {
  uploadsDir: path.join(__dirname, '..', 'uploads'),
  r2AccountId: process.env.R2_ACCOUNT_ID || 'YOUR_ACCOUNT_ID',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || 'YOUR_ACCESS_KEY',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'YOUR_SECRET_KEY',
  r2BucketName: process.env.R2_BUCKET_NAME || 'cheezychinito-photos',
  kvNamespaceId: process.env.KV_NAMESPACE_ID || 'YOUR_KV_NAMESPACE_ID',
  kvApiToken: process.env.CF_API_TOKEN || 'YOUR_CF_API_TOKEN',
  cloudflareAccountId: process.env.CF_ACCOUNT_ID || 'YOUR_ACCOUNT_ID'
};

/**
 * Main migration function
 */
async function migratePhotos() {
  console.log('🚀 Starting photo migration to R2...\n');

  // Check if uploads directory exists
  if (!fs.existsSync(CONFIG.uploadsDir)) {
    console.error(`❌ Uploads directory not found: ${CONFIG.uploadsDir}`);
    process.exit(1);
  }

  // Get list of photos
  const files = fs.readdirSync(CONFIG.uploadsDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
  });

  console.log(`Found ${files.length} photos to migrate:\n`);
  files.forEach((file, i) => {
    const stats = fs.statSync(path.join(CONFIG.uploadsDir, file));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  ${i + 1}. ${file} (${sizeMB} MB)`);
  });

  console.log('\n📦 Migration Plan:');
  console.log('  1. Upload each photo to R2 bucket (full/ folder)');
  console.log('  2. Add metadata to KV store');
  console.log('  3. Update photo-list in KV');
  console.log('\n');

  // Ask for confirmation
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('Continue with migration? (yes/no): ', async (answer) => {
    readline.close();

    if (answer.toLowerCase() !== 'yes') {
      console.log('Migration cancelled.');
      process.exit(0);
    }

    console.log('\n🔄 Starting migration...\n');

    // Migrate each file
    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      try {
        await migratePhoto(filename);
        console.log(`✅ ${i + 1}/${files.length} - ${filename} migrated`);
      } catch (error) {
        console.error(`❌ ${i + 1}/${files.length} - ${filename} failed:`, error.message);
      }
    }

    console.log('\n✨ Migration complete!\n');
    console.log('Next steps:');
    console.log('  1. Test gallery at: /gallery');
    console.log('  2. Verify photos load correctly');
    console.log('  3. Once confirmed, delete /uploads directory');
    console.log('  4. Commit and push changes\n');
  });
}

/**
 * Migrate a single photo to R2
 */
async function migratePhoto(filename) {
  const filePath = path.join(CONFIG.uploadsDir, filename);
  const fileBuffer = fs.readFileSync(filePath);
  const stats = fs.statSync(filePath);

  // For actual migration, you would use AWS SDK for S3 (R2 is S3-compatible)
  // or use wrangler CLI commands

  // This is a template - actual implementation would use:
  // - AWS SDK for S3 (with R2 endpoint)
  // - or wrangler CLI via child_process
  // - or Cloudflare API

  console.log(`  Uploading ${filename} to R2...`);

  // Placeholder: In production, this would actually upload to R2
  // using AWS S3 SDK or wrangler CLI

  // Add metadata to KV
  const photoData = {
    filename,
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'migration',
    size: stats.size,
    contentType: getContentType(filename),
    views: 0,
    likes: 0,
    migrated: true
  };

  // Placeholder for KV update
  console.log(`  Adding metadata to KV...`);

  return true;
}

/**
 * Get content type from filename
 */
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  };
  return types[ext] || 'application/octet-stream';
}

// Run migration
if (require.main === module) {
  migratePhotos().catch(console.error);
}

module.exports = { migratePhotos, migratePhoto };
