#!/bin/bash

##
# Manual Tag Page Generator
# Run this if you want to manually generate tag pages
# Usage: ./scripts/generate-tags.sh
##

set -e

echo "🔍 Scanning posts for tags..."

# Extract all unique tags from posts
tags=$(grep -rh "^tags:" _posts/ | sed 's/tags: //' | tr ' ' '\n' | sort -u | grep -v "^$")

tag_count=0
new_tags=0

# Create tag directory if it doesn't exist
mkdir -p tag

# Create tag page for each tag
for tag in $tags; do
  tag_count=$((tag_count + 1))
  tagfile="tag/${tag}.md"

  # Skip if already exists
  if [ -f "$tagfile" ]; then
    echo "  ✓ $tag (already exists)"
    continue
  fi

  # Create new tag page
  cat > "$tagfile" << EOF
---
layout: tagpage
title: "Tag: $tag"
tag: $tag
robots: noindex
---
EOF

  echo "  ✨ $tag (created)"
  new_tags=$((new_tags + 1))
done

echo ""
echo "📊 Summary:"
echo "  Total tags: $tag_count"
echo "  New tags created: $new_tags"

if [ $new_tags -gt 0 ]; then
  echo ""
  echo "✅ New tag pages created!"
  echo "📝 Don't forget to commit them:"
  echo "   git add tag/"
  echo "   git commit -m 'Add new tag pages'"
  echo "   git push"
else
  echo ""
  echo "✅ All tag pages are up to date!"
fi
