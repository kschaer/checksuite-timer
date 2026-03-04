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
  contents: read    # Required to access repository commits
  actions: read     # Required to access GitHub Actions check suites
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
| `duration_seconds` | Total wall-to-wall duration in seconds |
| `commit_count` | Number of commits analyzed |
| `total_checksuites` | Total number of checksuites found |
| `successful_checksuites` | Number of successful checksuites |
| `failed_checksuites` | Number of failed checksuites |
| `cancelled_checksuites` | Number of cancelled checksuites |
| `other_checksuites` | Number of checksuites with other conclusions |

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
        uses: your-username/checksuite-timer@v1
        with:
          branch: 'main'
          time_window: '24h'
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Time Window Format

The `time_window` input accepts the following formats:
- `24h` - 24 hours
- `12h` - 12 hours
- `2h` - 2 hours
- `30m` - 30 minutes
- `15m` - 15 minutes
