#!/bin/bash
#
# Generate Tag Pages
# Automatically creates tag pages for all tags used in blog posts
#
# Usage: ./scripts/generate-tag-pages.sh

set -e

echo "Generating tag pages..."

# Extract all unique tags from posts
TAGS=$(grep -h "^tags:" _posts/*.md | \
       sed 's/tags: //' | \
       sed 's/\[//g' | \
       sed 's/\]//g' | \
       tr ',' '\n' | \
       tr ' ' '\n' | \
       grep -v '^$' | \
       sort -u)

# Create tag directory if it doesn't exist
mkdir -p tag

# Generate tag pages
count=0
for tag in $TAGS; do
  TAG_FILE="tag/${tag}.md"

  if [ ! -f "$TAG_FILE" ]; then
    cat > "$TAG_FILE" << EOF
---
layout: tagpage
title: "Tag: ${tag}"
tag: ${tag}
robots: noindex
---
EOF
    echo "✓ Created $TAG_FILE"
    ((count++))
  fi
done

# Summary
TOTAL=$(echo "$TAGS" | wc -l)
echo ""
echo "Summary:"
echo "  Total tags: $TOTAL"
echo "  Created: $count"
echo "  Existing: $((TOTAL - count))"
echo ""
echo "Done!"
