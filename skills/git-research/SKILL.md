---
name: git-research
description: Helper skill for cloning git repositories temporarily for research, with automatic cleanup.
---

# Skill: Git Research Helper

## Goal
Give the agent the ability to temporarily clone repositories for research, with automatic cleanup.

## How to Use

### 1. At the start of each research task:
```bash
# Load the helper
source ~/.pi/agent/helpers/git-temp-clone.sh

# Or, for multiple reads from the same repo (more efficient):
source ~/.pi/agent/helpers/git-temp-worktree.sh
```

### 2. Usage Pattern — Single Clone:

```bash
source ~/.pi/agent/helpers/git-temp-clone.sh

# Clone the repo
git_temp_clone "https://github.com/user/repo" "main"

# $GIT_TEMP_DIR now contains the repo
ls -la "$GIT_TEMP_DIR"
grep -r "pattern" "$GIT_TEMP_DIR"

# Automatic cleanup when the script ends, or manually:
git_temp_cleanup
```

### 3. Usage Pattern — Multiple Repos (Worktree):

```bash
source ~/.pi/agent/helpers/git-temp-worktree.sh

# Create a worktree (shares Git objects!)
worktree_temp_clone "https://github.com/user/repo" "main" "minha-tarefa"

# Work in the directory
cd /tmp/pi-worktrees/wt-minha-tarefa-$$

# Perform multiple reads...
grep -r "pattern" .

# Cleanup
worktree_cleanup "/tmp/pi-worktree/..."
```

### 4. Wrapper for quick commands:

```bash
# Clone → Run → Cleanup (automatic)
git_with_temp_clone "https://github.com/user/repo" "main" \
    grep -r "search-term" .
```

## Recommended Agent Configuration

### Research Agent (read-only):
```yaml
---
description: Research code in temporary Git repositories
tools: read, grep, find, ls, bash
# Add to the prompt:
---

## Git Research Protocol

1. Before cloning any repo:
   - Check whether it has already been cloned in this session
   - Use `git_temp_clone` with `--depth 1 --single-branch`

2. After research:
   - Always run `git_temp_cleanup`
   - OR use `git_with_temp_clone` which cleans up automatically

3. Space limits:
   - Keep at most 3 simultaneous clones in /tmp
   - If you need more, use a worktree (shares objects)

4. Size checks:
   - `git_temp_size` to see disk space used
   - `git_temp_list` to list active clones
```

## Useful Commands

```bash
# List active clones
git_temp_list

# Show total size
du -sh /tmp/pi-git-clones-*

# Force cleanup of everything
git_temp_cleanup_all

# Practical /tmp limit
df -h /tmp
```

## Best Practices

1. **Always use a shallow clone** (`--depth 1`) unless history is needed
2. **Use `--single-branch`** to clone only the required branch
3. **Trap EXIT** is already configured for automatic cleanup
4. **Prefer a worktree** if the same repo will be read multiple times
5. **Name clones** to make them easier to identify during cleanup

## Troubleshooting

### "No space left on device"
```bash
# Clean up all clones
git_temp_cleanup_all

# See what is using disk space
du -sh /tmp/*
```

### "Repository is corrupted"
```bash
# Remove and start over
rm -rf /tmp/pi-git-clones-*
rm -rf /tmp/pi-worktrees
```

### Agent crashed and left artifacts
```bash
# Manual cleanup
find /tmp -maxdepth 1 -name "pi-*" -type d -mtime +1 -exec rm -rf {} \;
```
