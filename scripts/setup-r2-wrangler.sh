#!/bin/bash

##
# R2 Setup via Wrangler - Easy Copy/Paste Edition
# This script helps you set up R2, KV, and Worker using Wrangler CLI
#
# Just copy/paste each section into your terminal!
##

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  R2 Migration Setup (Wrangler Edition)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

# Step 1: Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
  echo -e "${YELLOW}⚠️  Wrangler not found. Installing...${NC}"
  npm install -g wrangler
  echo -e "${GREEN}✓ Wrangler installed${NC}\n"
else
  echo -e "${GREEN}✓ Wrangler already installed${NC}\n"
fi

# Step 2: Login
echo -e "${BLUE}Step 1: Login to Cloudflare${NC}"
echo -e "This will open a browser window for authentication.\n"
read -p "Press Enter to continue..."
wrangler login
echo -e "${GREEN}✓ Logged in${NC}\n"

# Step 3: Get Account ID
echo -e "${BLUE}Step 2: Getting your Account ID${NC}"
ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}')
echo -e "${GREEN}✓ Account ID: $ACCOUNT_ID${NC}\n"

# Step 4: Create R2 bucket
echo -e "${BLUE}Step 3: Creating R2 bucket${NC}"
read -p "Create R2 bucket 'cheezychinito-photos'? (yes/no): " -r
if [[ $REPLY =~ ^[Yy]es$ ]]; then
  wrangler r2 bucket create cheezychinito-photos
  echo -e "${GREEN}✓ R2 bucket created${NC}\n"
else
  echo -e "${YELLOW}⊘ Skipped (assuming bucket exists)${NC}\n"
fi

# Step 5: Create KV namespace
echo -e "${BLUE}Step 4: Creating KV namespace${NC}"
read -p "Create KV namespace 'PHOTOS_KV'? (yes/no): " -r
if [[ $REPLY =~ ^[Yy]es$ ]]; then
  echo -e "\n${YELLOW}Running: wrangler kv:namespace create PHOTOS_KV${NC}"
  KV_OUTPUT=$(wrangler kv:namespace create "PHOTOS_KV")
  echo "$KV_OUTPUT"

  # Extract KV ID
  KV_ID=$(echo "$KV_OUTPUT" | grep "id =" | awk -F'"' '{print $2}')

  echo -e "\n${GREEN}✓ KV namespace created${NC}"
  echo -e "${GREEN}✓ KV Namespace ID: $KV_ID${NC}\n"

  # Update wrangler.toml
  echo -e "${BLUE}Updating wrangler.toml with your IDs...${NC}"
  sed -i.bak "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" workers/wrangler.toml
  sed -i.bak "s/YOUR_KV_NAMESPACE_ID/$KV_ID/g" workers/wrangler.toml
  rm workers/wrangler.toml.bak 2>/dev/null || true
  echo -e "${GREEN}✓ wrangler.toml updated${NC}\n"
else
  echo -e "${YELLOW}⊘ Skipped${NC}\n"
  echo -e "${RED}⚠️  You'll need to manually update workers/wrangler.toml${NC}\n"
fi

# Step 6: Deploy Worker
echo -e "${BLUE}Step 5: Deploying Worker${NC}"
read -p "Deploy photo-server Worker? (yes/no): " -r
if [[ $REPLY =~ ^[Yy]es$ ]]; then
  cd workers
  wrangler deploy
  cd ..
  echo -e "${GREEN}✓ Worker deployed${NC}\n"
else
  echo -e "${YELLOW}⊘ Skipped${NC}\n"
fi

# Step 7: Setup custom domain
echo -e "${BLUE}Step 6: Custom Domain Setup${NC}"
echo -e "You need to add custom domain: ${YELLOW}photos.cheezychinito.com${NC}"
echo -e "\nOptions:"
echo -e "  1. Via Wrangler (after Worker is deployed):"
echo -e "     ${YELLOW}wrangler custom-domains add photos.cheezychinito.com --worker photo-server${NC}"
echo -e "\n  2. Via Dashboard (easier first time):"
echo -e "     Dashboard → Workers → photo-server → Triggers → Custom Domains\n"

read -p "Add custom domain via Wrangler now? (yes/no): " -r
if [[ $REPLY =~ ^[Yy]es$ ]]; then
  wrangler custom-domains add photos.cheezychinito.com --worker photo-server
  echo -e "${GREEN}✓ Custom domain added${NC}\n"
else
  echo -e "${YELLOW}⊘ Skipped - Add it manually later${NC}\n"
fi

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Setup Complete!${NC}\n"
echo -e "Created:"
echo -e "  ✓ R2 bucket: cheezychinito-photos"
echo -e "  ✓ KV namespace: PHOTOS_KV"
if [ ! -z "$KV_ID" ]; then
  echo -e "  ✓ KV ID: $KV_ID"
fi
echo -e "  ✓ Worker: photo-server"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Migrate photos: ${YELLOW}./scripts/migrate-photos.sh${NC}"
echo -e "  2. Configure Pages environment variables (see R2_WRANGLER_SETUP.md)"
echo -e "  3. Update gallery.html to use new template"
echo -e "  4. Deploy to GitHub\n"

echo -e "${GREEN}For detailed instructions, see: R2_WRANGLER_SETUP.md${NC}\n"
