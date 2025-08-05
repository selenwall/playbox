# Cursor Auto-Merge Setup Guide

This repository is configured to automatically merge Cursor-generated branches to the main branch. Here's how it works and how to configure it.

## How It Works

When you work with Cursor and it creates branches with the pattern `cursor/*`, the GitHub Actions workflows will automatically handle merging these changes to your main branch.

## Available Workflows

### 1. Auto-merge with Pull Requests (`auto-merge-cursor.yml`)
- **Recommended for teams and production repositories**
- Creates a pull request for each Cursor branch
- Automatically approves and merges the PR
- Provides visibility and audit trail
- Allows for code review if needed

### 2. Direct Merge (`direct-merge-cursor.yml`)
- **Recommended for personal projects**
- Directly merges Cursor branches to main
- Faster and simpler process
- Automatically cleans up branches after merge

## Setup Instructions

### Step 1: Choose Your Workflow
Decide which approach you prefer:
- Keep both workflows if you want flexibility
- Delete one of the workflow files if you only want one approach

### Step 2: Configure Repository Settings

#### For Auto-merge with Pull Requests:
1. Go to your repository settings on GitHub
2. Navigate to "General" → "Pull Requests"
3. Enable "Allow auto-merge"
4. Enable "Automatically delete head branches"

#### For Direct Merge:
1. Go to your repository settings on GitHub
2. Navigate to "Actions" → "General"
3. Under "Workflow permissions", select "Read and write permissions"
4. Enable "Allow GitHub Actions to create and approve pull requests"

### Step 3: Branch Protection (Optional but Recommended)
1. Go to "Settings" → "Branches"
2. Add a branch protection rule for `main`:
   - Require status checks to pass
   - Require branches to be up to date before merging
   - Include administrators (optional)

### Step 4: Test the Setup
1. Create a test branch with the pattern `cursor/test-auto-merge`
2. Make a commit and push it
3. Watch the Actions tab to see the workflow in action

## Customization Options

### Modify Branch Pattern
To change which branches trigger auto-merge, edit the workflow files:
```yaml
on:
  push:
    branches:
      - 'cursor/**'  # Change this pattern as needed
```

### Change Merge Strategy
In the workflows, you can modify the merge strategy:
- `--squash`: Squash all commits into one
- `--merge`: Create a merge commit
- `--rebase`: Rebase and merge

### Add Conditions
You can add conditions to prevent auto-merge in certain cases:
```yaml
if: |
  startsWith(github.ref, 'refs/heads/cursor/') && 
  !contains(github.event.head_commit.message, '[skip-auto-merge]')
```

## Troubleshooting

### Common Issues:
1. **Workflow not triggering**: Check that the branch name starts with `cursor/`
2. **Permission errors**: Ensure GitHub Actions has write permissions
3. **Merge conflicts**: The workflow will fail if there are conflicts - resolve manually

### Monitoring:
- Check the "Actions" tab in your GitHub repository
- Look for failed workflows and their error messages
- Use GitHub notifications to stay informed

## Security Considerations

- The workflows use `GITHUB_TOKEN` which has limited permissions
- Consider adding approval requirements for sensitive repositories
- Review the auto-merged code regularly
- Set up notifications for all merges

## Disabling Auto-Merge

To disable auto-merge:
1. Delete or rename the workflow files
2. Or add a condition to skip execution:
   ```yaml
   if: false  # Temporarily disable
   ```

---

**Note**: Always test these workflows in a non-production repository first to ensure they work as expected for your specific use case.