import * as core from '@actions/core'
import * as github from '@actions/github'

interface CheckSuite {
  id: number
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  head_sha: string
}

interface Commit {
  sha: string
  commit: {
    author: {
      date: string
    }
  }
}

interface CheckSuiteStats {
  total: number
  successful: number
  failed: number
  cancelled: number
  other: number
}

async function parseTimeWindow(timeWindow: string): Promise<Date> {
  const now = new Date()
  const regex = /^(\d+)([hm])$/
  const match = timeWindow.match(regex)
  
  if (!match) {
    throw new Error(`Invalid time window format: ${timeWindow}. Expected format like '24h', '12h', '30m'`)
  }
  
  const value = parseInt(match[1], 10)
  const unit = match[2]
  
  if (unit === 'h') {
    return new Date(now.getTime() - value * 60 * 60 * 1000)
  } else if (unit === 'm') {
    return new Date(now.getTime() - value * 60 * 1000)
  }
  
  throw new Error(`Unsupported time unit: ${unit}`)
}

async function getCommitsInTimeWindow(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  branch: string,
  since: Date
): Promise<Commit[]> {
  const commits: Commit[] = []
  let page = 1
  const perPage = 100
  
  while (true) {
    const response = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: branch,
      since: since.toISOString(),
      per_page: perPage,
      page
    })
    
    if (response.data.length === 0) {
      break
    }
    
    commits.push(...response.data as Commit[])
    
    if (response.data.length < perPage) {
      break
    }
    
    page++
  }
  
  return commits
}

async function getCheckSuitesForCommit(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  sha: string
): Promise<CheckSuite[]> {
  const response = await octokit.rest.checks.listSuitesForRef({
    owner,
    repo,
    ref: sha
  })
  
  return response.data.check_suites as CheckSuite[]
}

function calculateCheckSuiteStats(checkSuites: CheckSuite[]): CheckSuiteStats {
  const stats: CheckSuiteStats = {
    total: checkSuites.length,
    successful: 0,
    failed: 0,
    cancelled: 0,
    other: 0
  }
  
  for (const suite of checkSuites) {
    switch (suite.conclusion) {
      case 'success':
        stats.successful++
        break
      case 'failure':
      case 'startup_failure':
      case 'timed_out':
        stats.failed++
        break
      case 'cancelled':
        stats.cancelled++
        break
      default:
        stats.other++
        break
    }
  }
  
  return stats
}

function calculateWallToWallDuration(checkSuites: CheckSuite[]): number {
  if (checkSuites.length === 0) {
    return 0
  }
  
  const createdTimes = checkSuites.map(suite => new Date(suite.created_at).getTime())
  const updatedTimes = checkSuites.map(suite => new Date(suite.updated_at).getTime())
  
  const earliestStart = Math.min(...createdTimes)
  const latestEnd = Math.max(...updatedTimes)
  
  return Math.round((latestEnd - earliestStart) / 1000)
}

async function run(): Promise<void> {
  try {
    const branch = core.getInput('branch') || 'main'
    const timeWindow = core.getInput('time_window') || '24h'
    const githubToken = core.getInput('github_token')
    
    if (!githubToken) {
      throw new Error('GitHub token is required')
    }
    
    const octokit = github.getOctokit(githubToken)
    const context = github.context
    const { owner, repo } = context.repo
    
    core.info(`Analyzing commits on branch '${branch}' for the last ${timeWindow}`)
    
    const since = await parseTimeWindow(timeWindow)
    core.info(`Looking for commits since: ${since.toISOString()}`)
    
    const commits = await getCommitsInTimeWindow(octokit, owner, repo, branch, since)
    core.info(`Found ${commits.length} commits in the specified time window`)
    
    if (commits.length === 0) {
      core.info('No commits found in the specified time window. Exiting gracefully.')
      core.setOutput('duration_seconds', '0')
      core.setOutput('commit_count', '0')
      core.setOutput('total_checksuites', '0')
      core.setOutput('successful_checksuites', '0')
      core.setOutput('failed_checksuites', '0')
      core.setOutput('cancelled_checksuites', '0')
      core.setOutput('other_checksuites', '0')
      return
    }
    
    let allCheckSuites: CheckSuite[] = []
    
    for (const commit of commits) {
      core.info(`Fetching check suites for commit: ${commit.sha}`)
      const checkSuites = await getCheckSuitesForCommit(octokit, owner, repo, commit.sha)
      allCheckSuites = allCheckSuites.concat(checkSuites)
    }
    
    core.info(`Found ${allCheckSuites.length} total check suites across all commits`)
    
    const stats = calculateCheckSuiteStats(allCheckSuites)
    const durationSeconds = calculateWallToWallDuration(allCheckSuites)
    
    core.info(`Check suite statistics:`)
    core.info(`  Total: ${stats.total}`)
    core.info(`  Successful: ${stats.successful}`)
    core.info(`  Failed: ${stats.failed}`)
    core.info(`  Cancelled: ${stats.cancelled}`)
    core.info(`  Other: ${stats.other}`)
    core.info(`Wall-to-wall duration: ${durationSeconds} seconds (${Math.round(durationSeconds / 60)} minutes)`)
    
    core.setOutput('duration_seconds', durationSeconds.toString())
    core.setOutput('commit_count', commits.length.toString())
    core.setOutput('total_checksuites', stats.total.toString())
    core.setOutput('successful_checksuites', stats.successful.toString())
    core.setOutput('failed_checksuites', stats.failed.toString())
    core.setOutput('cancelled_checksuites', stats.cancelled.toString())
    core.setOutput('other_checksuites', stats.other.toString())
    
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

run()