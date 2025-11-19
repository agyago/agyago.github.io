#!/bin/bash

# Test downloading a single photo to see the exact error
echo "Testing download from R2..."
echo ""

# Try different variations
echo "Trying: cheezychinito-photos/full/IMG_0162.jpeg"
npx wrangler r2 object get "cheezychinito-photos/full/IMG_0162.jpeg" --file="/tmp/test.jpg" --remote 2>&1 | head -10

echo ""
echo "Trying: full/IMG_0162.jpeg"
npx wrangler r2 object get "full/IMG_0162.jpeg" --file="/tmp/test.jpg" --remote --bucket=cheezychinito-photos 2>&1 | head -10
