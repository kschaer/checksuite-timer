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
    committer: {
      email: string
      date: string
    }
  }
}

interface CommitData {
  sha: string
  timestamp: string
  committer_email: string
  url: string
}

interface CheckSuiteStats {
  total: number
  successful: number
  failed: number
  cancelled: number
  other: number
}

interface CommitAnalysis {
  commit: CommitData
  checksuites: CheckSuite[]
  duration_seconds: number
  stats: CheckSuiteStats
  error?: string
}

interface AnalysisResult {
  commits: CommitAnalysis[]
  summary: {
    total_commits: number
    successful_commits: number
    failed_commits: number
  }
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

function calculateWallToWallDurationForCommit(checkSuites: CheckSuite[]): number {
  if (checkSuites.length === 0) {
    return 0
  }
  
  const createdTimes = checkSuites.map(suite => new Date(suite.created_at).getTime())
  const updatedTimes = checkSuites.map(suite => new Date(suite.updated_at).getTime())
  
  const earliestStart = Math.min(...createdTimes)
  const latestEnd = Math.max(...updatedTimes)
  
  return Math.round((latestEnd - earliestStart) / 1000)
}

function formatCommitData(
  commit: Commit,
  owner: string,
  repo: string
): CommitData {
  return {
    sha: commit.sha,
    timestamp: commit.commit.committer.date,
    committer_email: commit.commit.committer.email,
    url: `https://github.com/${owner}/${repo}/commit/${commit.sha}`
  }
}

async function analyzeCommit(
  octokit: ReturnType<typeof github.getOctokit>,
  commit: Commit,
  owner: string,
  repo: string
): Promise<CommitAnalysis> {
  try {
    const commitData = formatCommitData(commit, owner, repo)
    const checkSuites = await getCheckSuitesForCommit(octokit, owner, repo, commit.sha)
    
    const stats = calculateCheckSuiteStats(checkSuites)
    const duration = calculateWallToWallDurationForCommit(checkSuites)
    
    return {
      commit: commitData,
      checksuites: checkSuites,
      duration_seconds: duration,
      stats
    }
  } catch (error) {
    const commitData = formatCommitData(commit, owner, repo)
    return {
      commit: commitData,
      checksuites: [],
      duration_seconds: 0,
      stats: { total: 0, successful: 0, failed: 0, cancelled: 0, other: 0 },
      error: error instanceof Error ? error.message : String(error)
    }
  }
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
      const emptyResult: AnalysisResult = {
        commits: [],
        summary: { total_commits: 0, successful_commits: 0, failed_commits: 0 }
      }
      core.setOutput('commits_data', JSON.stringify(emptyResult))
      return
    }
    
    // Analyze each commit individually
    core.info('Analyzing checksuites for each commit...')
    const commitAnalyses: CommitAnalysis[] = []
    
    for (const commit of commits) {
      core.info(`Analyzing commit: ${commit.sha}`)
      const analysis = await analyzeCommit(octokit, commit, owner, repo)
      
      if (analysis.error) {
        core.warning(`Error analyzing commit ${commit.sha}: ${analysis.error}`)
      } else {
        core.info(`  Duration: ${analysis.duration_seconds}s, Checksuites: ${analysis.stats.total} (${analysis.stats.successful} successful, ${analysis.stats.failed} failed)`)
      }
      
      commitAnalyses.push(analysis)
    }
    
    // Calculate summary stats
    const summary = {
      total_commits: commitAnalyses.length,
      successful_commits: commitAnalyses.filter(a => !a.error && a.stats.failed === 0).length,
      failed_commits: commitAnalyses.filter(a => a.error || a.stats.failed > 0).length
    }
    
    const result: AnalysisResult = {
      commits: commitAnalyses,
      summary
    }
    
    core.info(`Analysis complete: ${summary.total_commits} commits, ${summary.successful_commits} successful, ${summary.failed_commits} with failures`)
    
    // Output the per-commit structured data
    core.setOutput('commits_data', JSON.stringify(result))
    
    // Legacy outputs for backwards compatibility
    const totalChecksuites = commitAnalyses.reduce((sum, a) => sum + a.stats.total, 0)
    const avgDuration = commitAnalyses.length > 0 
      ? Math.round(commitAnalyses.reduce((sum, a) => sum + a.duration_seconds, 0) / commitAnalyses.length)
      : 0
      
    core.setOutput('commit_count', commits.length.toString())
    core.setOutput('total_checksuites', totalChecksuites.toString())
    core.setOutput('avg_duration_seconds', avgDuration.toString())
    
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

run()