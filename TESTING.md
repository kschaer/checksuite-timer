# Testing Guide for Checksuite Timer Action

This guide explains how to test the functionality of the checksuite-timer action in this repository.

## 🏗️ Setup for Testing

### 1. Prerequisites
The repository now has several workflows that will create check suites automatically:
- **CI workflow** (`ci.yml`) - Runs on push/PR with multiple jobs (test, lint, build)
- **Manual test workflow** (`manual-test.yml`) - Comprehensive testing scenarios
- **Test timer workflow** (`check-suite-timer.yml`) - Tests the action itself

### 2. Generate Test Data

To create commits and check suites for testing:

1. **Make some commits to main branch** - Each commit will trigger CI workflows
2. **Wait for workflows to complete** - This creates check suites with different durations
3. **Run the manual test** - Use the action to analyze the data

## 🧪 Testing Scenarios

### Scenario 1: Basic Testing (Recommended First Test)

1. **Navigate to Actions tab** in GitHub
2. **Find "Manual Test - Checksuite Timer"** workflow  
3. **Click "Run workflow"** with these settings:
   - Branch: `main`
   - Time window: `24h` (or `7d` for more data)
   - Debug mode: `true`
   - Test scenario: `basic-analysis`

**Expected Results:**
```
📊 Checksuite Analysis Results
- Commits Analyzed: [number of recent commits]
- Total Checksuites: [total across all commits]  
- Average Duration: [seconds]

🔍 Per-Commit Details
- Each commit with its timing breakdown
- Checksuite status counts
- Links to commits
```

### Scenario 2: Compare Time Windows

Run with test scenario: `compare-time-windows`

**Expected Results:**
```
📈 Time Window Comparison
| Time Window | Commits | Avg Duration | Total Checksuites |
|-------------|---------|--------------|-------------------|
| 1 hour      | X       | Y seconds    | Z                 |
| 24 hours    | X       | Y seconds    | Z                 |  
| 7 days      | X       | Y seconds    | Z                 |
```

### Scenario 3: Real-Time Testing

1. **Make a commit** to trigger workflows
2. **Immediately run** the action with `time_window: '1h'`
3. **Wait 5-10 minutes** for workflows to complete
4. **Run the action again** to see the completed timing

## 🔍 What to Look For

### ✅ Success Indicators

1. **No errors** in action execution
2. **Commit count > 0** (if you have recent commits)
3. **Realistic durations** (typically 30-300 seconds for CI)
4. **Proper JSON structure** in debug output
5. **Checksuite counts match** what you see in Actions tab

### 🚨 Potential Issues

1. **Commit count = 0**: Normal if no recent activity
2. **Duration = 0**: May indicate checksuites still running
3. **"Resource not accessible by integration"**: Missing `checks: read` permission
4. **API errors**: Check if token has proper permissions
5. **Very high durations**: May indicate long-running or stuck workflows

### 🔧 Common Permission Error

If you see:
```
Error analyzing commit: Resource not accessible by integration
```

**Solution**: Add the missing permission to your workflow:

```yaml
permissions:
  contents: read
  actions: read
  checks: read          # ← Add this
  pull-requests: read   # ← And this
```

## 📊 Sample Expected Output

For a repository with recent activity:

```json
{
  "commits": [
    {
      "commit": {
        "sha": "abc1234",
        "timestamp": "2024-03-04T10:00:00Z",
        "committer_email": "user@example.com",
        "url": "https://github.com/owner/repo/commit/abc1234"
      },
      "duration_seconds": 245,
      "stats": {
        "total": 4,
        "successful": 3, 
        "failed": 1,
        "cancelled": 0,
        "other": 0
      }
    }
  ],
  "summary": {
    "total_commits": 1,
    "successful_commits": 0,
    "failed_commits": 1
  }
}
```

## 🐛 Debugging

### Enable Debug Output
Set `debug_mode: true` in manual workflow to see:
- Full JSON structure
- Individual commit analysis
- API call results

### Local Testing
```bash
# Run tests
yarn test

# Test with coverage
yarn test:coverage

# Build and check
yarn build
```

### Check Workflow Logs
1. Go to **Actions** tab
2. Click on a **workflow run**
3. Expand **job steps** to see detailed logs
4. Look for **error messages** or **unexpected output**

## 🎯 Success Criteria

A successful test should show:

1. ✅ **Action completes without errors**
2. ✅ **Finds commits in specified time window** 
3. ✅ **Calculates realistic durations** (30s - 10min typical)
4. ✅ **Correctly counts checksuite statuses**
5. ✅ **Provides structured JSON output**
6. ✅ **Handles edge cases** (no commits, failed checksuites)

## 📝 Additional Testing

### Test Different Time Windows
- `30m` - Very recent activity only
- `6h` - Half day of activity  
- `1d` - Full day
- `7d` - Week of activity

### Test Error Handling
- Invalid time window: `25x` 
- Very old time window: `365d`
- Empty repository scenario

### Performance Testing
- Large time windows (`30d`)
- Repositories with many commits
- Check API rate limiting behavior