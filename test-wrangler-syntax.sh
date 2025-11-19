#!/bin/bash

# Test different wrangler r2 command syntaxes to find the correct one

echo "Testing wrangler R2 download syntax..."
echo ""

# Test 1: With bucket in path
echo "Test 1: npx wrangler r2 object get 'cheezychinito-photos/full/IMG_0162.jpg'"
npx wrangler r2 object get 'cheezychinito-photos/full/IMG_0162.jpg' --file='/tmp/test1.jpg' --remote 2>&1 | grep -E "(Downloading|ERROR|does not exist)" | head -3

echo ""
echo "Test 2: npx wrangler r2 object get 'full/IMG_0162.jpg' (with --bucket flag)"
npx wrangler r2 object get 'full/IMG_0162.jpg' --file='/tmp/test2.jpg' --remote --bucket='cheezychinito-photos' 2>&1 | grep -E "(Downloading|ERROR|does not exist)" | head -3

echo ""
echo "Test 3: Check wrangler help for correct syntax"
npx wrangler r2 object get --help 2>&1 | head -20
