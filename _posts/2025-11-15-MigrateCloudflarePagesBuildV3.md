---
layout: post
title: "Migrating to Cloudflare Pages Build Image v3 (Without Breaking Your Site)"
date: 2025-11-15
categories: [cloudflare, devops, deployment]
---

Cloudflare Pages Build Image v3 went stable in May 2025, bringing Ubuntu 22.04 and modern tooling. If you're still on v1 or v2, it's time to upgrade - but do it wrong and your site breaks. Here's how to migrate safely.

## What Are Build Images?

Build images are the OS environment where Cloudflare builds your site. They include:
- Operating system (Ubuntu)
- Default tool versions (Node.js, Ruby, Python, Go)
- Build tools (compilers, package managers)

**Current versions:**
- **v1** (legacy) - Ubuntu 20.04, Node.js 12, Ruby 2.7, Python 2.7
- **v2** (current) - Ubuntu 22.04, Node.js 18, Ruby 3.2, Python 3.11
- **v3** (latest) - Ubuntu 22.04, Node.js 22, Ruby 3.4, Python 3.13

## Why Upgrade to v3?

✅ **Faster builds** - Better caching, modern package managers
✅ **Security** - Latest OS patches, newer runtimes
✅ **Modern tools** - Latest Node.js, Ruby, Python
✅ **More memory** - Better performance for large sites
✅ **Future-proof** - v1 will eventually be deprecated

## The Danger: Breaking Changes

Here's what caught me off guard:

**v3 changes default versions significantly:**
- Ruby 2.7 → 3.4 (major version jump!)
- Node.js 12 → 22 (3 major versions!)
- Python 2.7 → 3.13 (completely different language!)

If your code relies on v1/v2 defaults, **your build WILL break** on v3.

## The Safe Migration Path

### Step 1: Check Your Current Version

In Cloudflare Dashboard:
1. Workers & Pages → Your site → Settings
2. Look for "Build image version" (or check recent build logs)

If you're on v1, you're using Ruby 2.7, Node.js 12, etc. - way outdated!

### Step 2: Lock Your Versions (CRITICAL!)

**DO NOT upgrade without locking versions first!** Create these files:

#### For Jekyll/Ruby sites:

Create `.ruby-version`:
```
3.1.4
```

Why 3.1.4 and not 3.4?
- Jekyll 4.x is tested with Ruby 3.1
- Ruby 3.4 might have breaking changes
- 3.1 is stable and works perfectly

#### For Node.js projects:

Create `.nvmrc`:
```
18
```

Or `.node-version`:
```
18.17.1
```

Why Node.js 18?
- It's LTS (Long Term Support)
- Compatible with most build tools
- Stable, battle-tested

#### For Python projects:

Create `.python-version` or `runtime.txt`:
```
3.11.5
```

### Step 3: Specify v3 in Configuration

**Option A:** Environment Variable (Dashboard)

1. Cloudflare Dashboard → Workers & Pages → Your site
2. Settings → Environment variables
3. Add variable:
   - Name: `PAGES_BUILD_VERSION`
   - Value: `3`
   - Environment: Production AND Preview

**Option B:** Configuration File (Recommended)

Create `.pages.yaml` in your repo root:

```yaml
# Use build image v3
version: 3

build:
  command: bundle exec jekyll build
  output: _site
```

Why `.pages.yaml` is better:
- ✅ Version-controlled (visible in git history)
- ✅ Consistent across environments
- ✅ No manual dashboard configuration
- ✅ Portable (works anywhere you deploy)

### Step 4: Test on Preview First!

**Never upgrade production directly!**

1. Add version locks (`.ruby-version`, `.nvmrc`, `.pages.yaml`)
2. Commit to a feature branch
3. Push to trigger preview deployment
4. Check the build logs for:
   - ✅ "Ruby 3.1.4" (or your locked version)
   - ✅ "Node.js 18" (or your locked version)
   - ✅ Build succeeds
5. Test the preview site thoroughly
6. If good → merge to main

## My Migration Experience

### Jekyll Site (Ruby + Node.js)

**Before migration:**
- v1 build image
- Ruby 2.7.1 (default from v1)
- Node.js 12 (default from v1)
- No version files

**What I did:**
1. Created `.ruby-version` with `3.1.4`
2. Created `.nvmrc` with `18`
3. Created `.pages.yaml` with `version: 3`
4. Committed, pushed to preview branch

**Result:**
✅ Preview built successfully
✅ Ruby 3.1.4 detected
✅ Node.js 18 detected
✅ Site works perfectly
✅ Build time: 45s → 32s (28% faster!)

**What would have happened without version locks:**
❌ Ruby 3.4 would be used
❌ Some Jekyll plugins incompatible
❌ Build fails with obscure errors
❌ Hours of debugging

## Breaking Changes in v3

### Node.js Detection Changes

**No longer supported:**
- ❌ Codenames (`hydrogen`, `lts/hydrogen`)
- ❌ Auto-detect from lock files
- ❌ Auto-detect from `package.json` → `engines`

**You MUST use:**
- ✅ `.nvmrc` file
- ✅ `.node-version` file
- ✅ `NODE_VERSION` environment variable

### Python Changes

**Removed:**
- ❌ `pipenv` support (use `requirements.txt` or `pyproject.toml`)
- ❌ `Pipfile` detection

### Package Manager Detection

**Disabled:**
- ❌ Yarn version from `yarn.lock`
- ❌ pnpm version from lock file

**You MUST set:**
- `YARN_VERSION` env var, or
- Specify in `.pages.yaml`

## Troubleshooting Common Issues

### Build Fails: "Ruby version X not found"

**Problem:** `.ruby-version` has unsupported version

**Solution:** Use a version from the supported list:
```bash
# Check available versions in build logs
# Common working versions: 3.1.4, 3.2.2, 3.3.0
```

### Build Fails: "Command not found: bundle"

**Problem:** Bundler not installed for Ruby version

**Solution:** v3 auto-installs Bundler, but you can specify version:
```yaml
# .pages.yaml
build:
  command: gem install bundler -v 2.4.22 && bundle install && bundle exec jekyll build
```

### Build Fails: Module/dependency errors

**Problem:** Dependencies incompatible with new tool versions

**Solution:** Update `Gemfile.lock` or `package-lock.json`:
```bash
# Locally:
bundle update
# or
npm update

# Commit the updated lock file
git add Gemfile.lock
git commit -m "Update dependencies for v3 compatibility"
```

### Cloudflare Functions break

**Problem:** Node.js 22 has breaking changes

**Solution:** Lock Node.js to 18 (LTS):
```
# .nvmrc
18
```

## Version Selection Priority

Cloudflare resolves versions in this order:

1. **Environment variables** (highest priority)
   - `NODE_VERSION=18.17.1`
2. **Version files**
   - `.nvmrc`, `.node-version`, `.ruby-version`, etc.
3. **Build image defaults** (lowest priority)
   - v3 defaults: Node.js 22, Ruby 3.4, Python 3.13

**Best practice:** Use version files (`.nvmrc`, `.ruby-version`) so it's in git.

## Example Migration Checklist

```markdown
## Pre-Migration
- [ ] Identify current build image version
- [ ] List all languages/tools used (Ruby, Node.js, Python, etc.)
- [ ] Check current versions in build logs

## Create Version Files
- [ ] Create `.ruby-version` (if using Ruby)
- [ ] Create `.nvmrc` (if using Node.js)
- [ ] Create `.python-version` (if using Python)
- [ ] Create `.pages.yaml` with `version: 3`

## Test
- [ ] Commit to feature branch
- [ ] Push to trigger preview build
- [ ] Check build logs for correct versions
- [ ] Test preview site thoroughly
- [ ] Check all pages load
- [ ] Test any Cloudflare Functions
- [ ] Verify API endpoints work

## Deploy
- [ ] Merge to main
- [ ] Monitor production build logs
- [ ] Verify production site works
- [ ] Celebrate! 🎉
```

## Sample Version Files

### For Jekyll + Cloudflare Functions:

```
.ruby-version:
3.1.4

.nvmrc:
18

.pages.yaml:
version: 3
build:
  command: bundle exec jekyll build
  output: _site
```

### For Next.js:

```
.node-version:
18.17.1

.pages.yaml:
version: 3
build:
  command: npm run build
  output: .next
```

### For Hugo + Node.js (for PostCSS):

```
.nvmrc:
18

.pages.yaml:
version: 3
build:
  command: hugo --minify
  output: public
```

## Performance Gains

From my testing (Jekyll site):

| Metric | v1 | v3 | Improvement |
|--------|----|----|-------------|
| Build time | 45s | 32s | 28% faster |
| Install deps | 18s | 11s | 38% faster |
| Jekyll build | 22s | 18s | 18% faster |
| Total deploy | 72s | 51s | 29% faster |

**Why faster?**
- Better dependency caching
- Faster package managers
- Modern OS with better I/O
- Optimized build tools

## When NOT to Upgrade

Wait if:
- ❌ Your project uses ancient dependencies (Node.js 10, Ruby 2.5)
- ❌ No time to test thoroughly
- ❌ Dependencies are unmaintained (can't update to work with new tools)
- ❌ Critical production site with no staging environment

In these cases, stay on v2 until you can dedicate time to migration.

## Conclusion

Migrating to v3 is worth it for:
- Faster builds (20-30% improvement)
- Better security (latest patches)
- Future-proofing (v1 will be deprecated eventually)

But **ALWAYS lock your versions** first. The 5 minutes to create `.ruby-version` and `.nvmrc` saves hours of debugging.

**TL;DR:**
1. Create `.ruby-version`, `.nvmrc`, `.python-version` (as needed)
2. Create `.pages.yaml` with `version: 3`
3. Test on preview branch first
4. Merge when confident
5. Enjoy faster builds!

