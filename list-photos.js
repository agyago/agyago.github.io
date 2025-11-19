#!/usr/bin/env node

/**
 * List all photos in R2 bucket
 * This helps find the exact filenames for batch watermarking
 */

const { execSync } = require('child_process');

const R2_BUCKET = 'cheezychinito-photos';

console.log('==========================================');
console.log('Listing photos in R2 bucket');
console.log('==========================================');
console.log(`Bucket: ${R2_BUCKET}`);
console.log('');

try {
    // List all objects in the full/ directory
    const output = execSync(`npx wrangler r2 object list ${R2_BUCKET} --remote`, {
        encoding: 'utf8'
    });

    console.log(output);

    // Try to extract just filenames
    const lines = output.split('\n');
    const filenames = [];

    lines.forEach(line => {
        // Look for lines that look like filenames
        const match = line.match(/full\/([^\s]+)/);
        if (match) {
            filenames.push(match[1]);
        }
    });

    if (filenames.length > 0) {
        console.log('\n==========================================');
        console.log('Found photos:');
        console.log('==========================================');
        filenames.forEach(f => console.log(f));
        console.log('');
        console.log(`Total: ${filenames.length} photos`);
    }

} catch (error) {
    console.error('Error listing R2 bucket:', error.message);
    process.exit(1);
}
