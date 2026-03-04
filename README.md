# checksuite-timer

A simple github action for tracking deploy/checksuite duration for github actions pipelines.

Approach:

This github action should be run in a scheduled workflow in a Github repository. It should be scheduled to run on a daily basis.

When it runs, the action inspects all commits made to the main branch of the repository during the prior 24 hours. For those commits, the action queries for all Github Actions checksuites that ran for the given commit SHA.

The action inspects each checksuite's start and stop timestamps, with the goal of finding the overall duration of checksuites that ran on that commit.

From those timestamps we seek the absolute minimum and maximum timestamps, across all applicable checksuites, with the goal of computing the "wall-to-wall" time that was required for all checksuites to complete.

This time represents the total duration that an engineer spent waiting after their PR was merged for a full deploy to complete.

For now, the action will simply log this total duration (in seconds).

## Usage

### Required Permissions

This action requires the following permissions to function properly:

```yaml
permissions:
  contents: read        # Required to access repository commits
  actions: read         # Required to access GitHub Actions workflow runs
  checks: read          # Required to access check suites and check runs
  pull-requests: read   # Required for check suites associated with PRs
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `branch` | The branch to analyze for commits | No | `main` |
| `time_window` | Time window to look back for commits (e.g., `24h`, `12h`, `30m`) | No | `24h` |
| `github_token` | GitHub token with appropriate permissions | Yes | `${{ github.token }}` |

### Outputs

| Output | Description |
|--------|-------------|
| `commits_data` | JSON object with per-commit analysis including duration, checksuites, and summary stats |
| `commit_count` | Number of commits analyzed |
| `total_checksuites` | Total number of checksuites across all commits |
| `avg_duration_seconds` | Average duration across all commits in seconds |

#### Commits Data Structure

The `commits_data` output contains detailed **per-commit** analysis showing how long each individual commit took for all checksuites to complete:

```json
{
  "commits": [
    {
      "commit": {
        "sha": "abc123def456",
        "timestamp": "2024-03-04T12:00:00Z",
        "committer_email": "user@example.com",
        "url": "https://github.com/owner/repo/commit/abc123def456"
      },
      "checksuites": [
        {
          "id": 12345,
          "status": "completed",
          "conclusion": "success",
          "created_at": "2024-03-04T12:01:00Z",
          "updated_at": "2024-03-04T12:05:30Z"
        }
      ],
      "duration_seconds": 270,
      "stats": {
        "total": 3,
        "successful": 2,
        "failed": 1,
        "cancelled": 0,
        "other": 0
      }
    }
  ],
  "summary": {
    "total_commits": 2,
    "successful_commits": 1,
    "failed_commits": 1
  }
}
```

**Key Insight**: Each commit gets its own `duration_seconds` representing the **wall-to-wall time** from when the first checksuite started to when the last checksuite finished for that specific commit. This answers: *"How long did the engineer wait after this commit was merged for all checks to complete?"*

### Example Workflow

Create a workflow file (e.g., `.github/workflows/track-deploy-time.yml`) in the repository where you want to track deploy times:

```yaml
name: Track Deploy Time

on:
  schedule:
    # Run daily at 9 AM UTC
    - cron: '0 9 * * *'
  workflow_dispatch: # Allow manual triggering

permissions:
  contents: read
  actions: read

jobs:
  track-deploy-time:
    runs-on: ubuntu-latest
    steps:
      - name: Track Checksuite Duration
        id: timer
        uses: your-username/checksuite-timer@v1
        with:
          branch: 'main'
          time_window: '24h'
          github_token: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Process commit data
        run: |
          echo "Commits analyzed: ${{ steps.timer.outputs.commit_count }}"
          echo "Average duration: ${{ steps.timer.outputs.avg_duration_seconds }} seconds"
          
          # Display per-commit analysis
          echo '${{ steps.timer.outputs.commits_data }}' | jq -r '.commits[] | "Commit \(.commit.sha): \(.duration_seconds)s wait time, \(.stats.total) checksuites (\(.stats.successful) successful, \(.stats.failed) failed)"'
          
          # Display summary
          echo '${{ steps.timer.outputs.commits_data }}' | jq -r '"Summary: \(.summary.successful_commits)/\(.summary.total_commits) commits had no failures"'
```

### Time Window Format

The `time_window` input accepts the following formats:
- `24h` - 24 hours
- `12h` - 12 hours
- `2h` - 2 hours
- `30m` - 30 minutes
- `15m` - 15 minutes
