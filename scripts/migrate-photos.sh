#!/bin/bash

##
# Simple Migration Script for Photos
# Uploads existing photos from /uploads to R2 using wrangler
#
# Prerequisites:
# 1. Install wrangler: npm install -g wrangler
# 2. Login: wrangler login
# 3. Configure R2 bucket and KV namespace
#
# Usage:
#   chmod +x scripts/migrate-photos.sh
#   ./scripts/migrate-photos.sh
##

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
UPLOADS_DIR="./uploads"
R2_BUCKET="cheezychinito-photos"  # Update with your bucket name
KV_NAMESPACE="PHOTOS"  # Update with your KV namespace name

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Photo Migration: GitHub → Cloudflare R2${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

# Check if uploads directory exists
if [ ! -d "$UPLOADS_DIR" ]; then
  echo -e "${RED}❌ Error: $UPLOADS_DIR directory not found${NC}"
  exit 1
fi

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
  echo -e "${RED}❌ Error: wrangler not found${NC}"
  echo -e "${YELLOW}Install with: npm install -g wrangler${NC}"
  exit 1
fi

# Count photos
PHOTO_COUNT=$(find "$UPLOADS_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | wc -l)

echo -e "${GREEN}Found $PHOTO_COUNT photos to migrate${NC}\n"

# List photos
echo "Photos to migrate:"
find "$UPLOADS_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) -exec basename {} \; | nl

echo ""
read -p "Continue with migration? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
  echo "Migration cancelled."
  exit 0
fi

echo -e "\n${BLUE}Starting migration...${NC}\n"

# Counter
UPLOADED=0
FAILED=0

# Upload each photo
for photo in "$UPLOADS_DIR"/*.{jpg,jpeg,png,JPG,JPEG,PNG}; do
  # Check if file exists (glob might not match)
  [ -f "$photo" ] || continue

  filename=$(basename "$photo")

  echo -ne "${YELLOW}Uploading $filename...${NC}"

  # Upload to R2 (full/ folder)
  if wrangler r2 object put "$R2_BUCKET/full/$filename" --file="$photo" > /dev/null 2>&1; then
    echo -e " ${GREEN}✓${NC}"
    ((UPLOADED++))
  else
    echo -e " ${RED}✗${NC}"
    ((FAILED++))
  fi
done

echo -e "\n${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Migration complete!${NC}"
echo -e "  Uploaded: ${GREEN}$UPLOADED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "  Failed: ${RED}$FAILED${NC}"
fi
echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

echo "Next steps:"
echo "  1. Visit https://cheezychinito.com/gallery to verify photos load"
echo "  2. Test that photos display correctly"
echo "  3. Test lightbox and likes functionality"
echo "  4. Once confirmed, you can delete /uploads directory:"
echo "     ${YELLOW}rm -rf uploads/${NC}"
echo "  5. Commit and push changes"
echo ""
