---
layout: post
description: day to day usage of GIT
tags: git
---

# Git Command Reference Guide

## Basic Operations

### Checking Status
```bash
# See current branch status
git status

# Short status with branch tracking info
git status -sb
```

### Branch Management

```bash
# List all branches (local and remote)
git branch -a

# Search for specific branches
git branch -a | grep SEARCH-TERM

# Create and checkout a new branch
git checkout -b branch-name

# Starting a new feature branch
git checkout develop
git pull
git checkout -b feature/your-feature-name
```

### Viewing History

```bash
# View commit history
git log

# View commit history in a compact form
git log --oneline

# See commits that exist in develop but not your feature branch
git log feature-branch..develop --oneline
```

## Branch Comparison and Tracking

```bash
# See how many commits your branch is ahead/behind another branch
# Format: <behind> <ahead>
git rev-list --left-right --count branch1...branch2

# Count commits in branch2 that aren't in branch1
git rev-list --count branch1..branch2

# Check how far behind develop your branch is
git rev-list --count feature-branch..develop
```

## Keeping Branches Updated

```bash
# Fetch all branches from remote
git fetch --all

# Prune stale remote-tracking branches
git remote prune origin

# Update your branch with changes from develop
git checkout your-branch
git merge develop

# Keeping your feature branch up to date
git checkout develop
git pull
git checkout feature/your-feature-name
git merge develop
```

## Managing Changes

### Discarding Changes

```bash
# Reset to last commit, discarding all uncommitted changes
git reset --hard HEAD
# ⚠️ WARNING: This permanently discards all uncommitted changes

# Safer alternative to reset
git stash           # Save changes temporarily
git reset --hard HEAD
git stash pop       # Recover changes later if needed
```

### Stashing

```bash
# Stash all changes
git stash

# Stash specific files
git stash push <file1> <file2>
# Example: git stash push bin/setup_docker_locally.sh pipeline/helm/templates/configmap-env-file.yaml

# List all stashes
git stash list

# Apply most recent stash
git stash pop

# Apply a specific stash
git stash apply stash@{n}
# Example: git stash apply stash@{0}
```

## Advanced Operations

### Reverting Changes

```bash
# Reset to a specific commit
git reset --hard <commit-hash>
# Example: git reset --hard 9d9e2e09d49ac725435a1782a0725f8b0ad0736b

# Force push changes after resetting
git push --force origin <branch-name>
# Example: git push --force origin feature/EMMA-22782_dev_test_branch
# ⚠️ WARNING: Use --force with caution as it overwrites remote history

# Revert a merged PR
git checkout main
git pull
git revert -m 1 <merge-commit-hash>
# Note: This creates a new commit that undoes the changes but preserves history
```

### Tags Management

```bash
# Delete a tag locally
git tag -d <tag-name>

# Delete a tag from remote
git push origin --delete <tag-name>
```

## Managing .gitignore

```bash
# Add pattern to .gitignore
echo "*-e" >> .gitignore

# Ignore a specific file
# Add to .gitignore: /.env.prod

# Force Git to track an ignored file
git add -f <filename>

# Stop tracking a file but keep it locally
git rm --cached <filename>
# Example: git rm --cached .env.prod
```

## Troubleshooting

### Fixing "cannot lock ref" Errors

When you see errors like:
```
error: cannot lock ref 'refs/remotes/origin/hotfix/BRANCH-NAME': is at COMMIT_HASH but expected DIFFERENT_HASH
```

Try these solutions in order:

1. **Prune stale remote-tracking branches**:
   ```bash
   git remote prune origin
   ```

2. **Delete problematic remote-tracking branches locally**:
   ```bash
   git branch -rd origin/branch-name
   ```

3. **Re-fetch the branches**:
   ```bash
   git fetch origin branch-name:refs/remotes/origin/branch-name
   ```

4. **Nuclear option** - If all else fails and you have no local changes to preserve:
   ```bash
   cd ..
   rm -rf repository-name
   git clone repository-url
   ```

### Config Information

```bash
# Show Git config settings
git config --list

# Show global Git config
git config --global --list
```

## Best Practices

- Use `--force` with caution as it overwrites remote history
- Before reverting a merge, ensure you understand which changes will be undone
- Always check your `.gitignore` file when dealing with sensitive configuration files
- Create regular stashes with descriptive messages for better organization
- When possible, use `git stash` instead of `git reset --hard` to avoid losing work
- Keep feature branches up to date with the main development branch to avoid difficult merges later
- Use meaningful commit messages that explain why changes were made, not just what changes were made
