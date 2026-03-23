// Pure functions with no side effects - easily testable

export interface CheckSuite {
  id: number
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  head_sha: string
}

export interface Commit {
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

export interface CommitData {
  sha: string
  timestamp: string
  committer_email: string
  url: string
}

export interface CheckSuiteStats {
  total: number
  successful: number
  failed: number
  cancelled: number
  other: number
}

export interface CommitAnalysis {
  commit: CommitData
  checksuites: CheckSuite[]
  duration_seconds: number
  stats: CheckSuiteStats
  error?: string
}

export interface AnalysisResult {
  commits: CommitAnalysis[]
  summary: {
    total_commits: number
    successful_commits: number
    failed_commits: number
  }
}

// Pure function: Time window parsing
export function parseTimeWindow(timeWindow: string): Date {
  const now = new Date()
  const regex = /^(\d+)([dhm])$/
  const match = timeWindow.match(regex)

  if (!match) {
    throw new Error(
      `Invalid time window format: ${timeWindow}. Expected format like '7d', '24h', '12h', '30m'`
    )
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  if (unit === 'd') {
    return new Date(now.getTime() - value * 24 * 60 * 60 * 1000)
  } else if (unit === 'h') {
    return new Date(now.getTime() - value * 60 * 60 * 1000)
  } else if (unit === 'm') {
    return new Date(now.getTime() - value * 60 * 1000)
  }

  throw new Error(`Unsupported time unit: ${unit}`)
}

// Pure function: Checksuite statistics calculation
export function calculateCheckSuiteStats(
  checkSuites: CheckSuite[]
): CheckSuiteStats {
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

// Pure function: Wall-to-wall duration calculation
export function calculateWallToWallDuration(checkSuites: CheckSuite[]): number {
  if (checkSuites.length === 0) {
    return 0
  }

  const createdTimes = checkSuites.map(suite =>
    new Date(suite.created_at).getTime()
  )
  const updatedTimes = checkSuites.map(suite =>
    new Date(suite.updated_at).getTime()
  )

  const earliestStart = Math.min(...createdTimes)
  const latestEnd = Math.max(...updatedTimes)

  return Math.round((latestEnd - earliestStart) / 1000)
}

// Pure function: Commit data formatting
export function formatCommitData(
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

// Pure function: Create commit analysis from data
export function createCommitAnalysis(
  commit: Commit,
  checkSuites: CheckSuite[],
  owner: string,
  repo: string,
  error?: string
): CommitAnalysis {
  const commitData = formatCommitData(commit, owner, repo)
  const stats = calculateCheckSuiteStats(checkSuites)
  const duration = calculateWallToWallDuration(checkSuites)

  return {
    commit: commitData,
    checksuites: checkSuites,
    duration_seconds: duration,
    stats,
    error
  }
}

// Pure function: Calculate summary statistics
export function calculateSummary(
  analyses: CommitAnalysis[]
): AnalysisResult['summary'] {
  return {
    total_commits: analyses.length,
    successful_commits: analyses.filter(a => !a.error && a.stats.failed === 0)
      .length,
    failed_commits: analyses.filter(a => a.error || a.stats.failed > 0).length
  }
}

// Cortex.io integration types
export interface CortexDeployPayload {
  timestamp: string // ISO8601 UTC
  title: string
  type: 'DEPLOY' | 'SCALE' | 'ROLLBACK' | 'RESTART'
  deployer?: {
    name?: string
    email?: string
  }
  environment?: string
  sha?: string
  url?: string
  customData?: Record<string, unknown>
}

export interface CortexDeployResponse {
  id: string
}

export interface CortexConfig {
  apiKey: string
  entityId: string
  environment: string
  titleTemplate: string
  postPerCommit: boolean
}

// Pure function: Create Cortex deploy payload from commit analysis
export function createCortexDeployPayload(
  analysis: CommitAnalysis,
  config: CortexConfig,
  branch: string
): CortexDeployPayload {
  // Extract name from email (simple heuristic: part before @)
  const email = analysis.commit.committer_email
  const name = email.split('@')[0]

  // Replace template variables
  const title = config.titleTemplate
    .replace('{sha}', analysis.commit.sha.substring(0, 7))
    .replace('{branch}', branch)
    .replace('{email}', email)

  return {
    timestamp: analysis.commit.timestamp,
    title,
    type: 'DEPLOY',
    deployer: {
      name,
      email
    },
    environment: config.environment,
    sha: analysis.commit.sha,
    url: analysis.commit.url,
    customData: {
      duration_seconds: analysis.duration_seconds,
      checksuite_stats: analysis.stats,
      total_checksuites: analysis.stats.total,
      successful_checksuites: analysis.stats.successful,
      failed_checksuites: analysis.stats.failed
    }
  }
}

// Pure function: Determine if a commit should be posted to Cortex
export function shouldPostToCortex(
  analysis: CommitAnalysis,
  config: CortexConfig
): boolean {
  // If postPerCommit is true, post all commits
  if (config.postPerCommit) {
    return true
  }

  // Otherwise, only post commits without errors and no failures
  return !analysis.error && analysis.stats.failed === 0
}
