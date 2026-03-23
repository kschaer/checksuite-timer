// Pure functions with no side effects - easily testable

export interface CheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
  head_sha: string
}

export interface WorkflowRun {
  id: number
  name: string
  event: string // "push", "workflow_dispatch", "schedule", "pull_request", etc.
  check_suite_id: number
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  head_sha: string
}

export interface CheckSuite {
  id: number
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  head_sha: string
  app?: {
    name: string
    slug?: string
  }
  head_branch?: string
  url?: string
  check_runs?: CheckRun[]
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
  skipped: number
  other: number
  longest_checkrun?: {
    duration_ms: number
    name: string
    status: string
    conclusion: string | null
  }
}

export interface CommitAnalysis {
  commit: CommitData
  checksuites: CheckSuite[]
  duration_ms: number
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

// Pure function: Filter check suites to only include push events
// Uses workflow run data to determine which check suites were triggered by push
// This matches what GitHub shows on the commit page
export function filterPushCheckSuites(
  checkSuites: CheckSuite[],
  workflowRuns: WorkflowRun[]
): CheckSuite[] {
  // Build map of check_suite_id -> event
  const suiteEventMap = new Map<number, string>()
  for (const run of workflowRuns) {
    suiteEventMap.set(run.check_suite_id, run.event)
  }

  // Filter check suites to only include push events
  return checkSuites.filter(suite => {
    const event = suiteEventMap.get(suite.id)
    // Include if event is 'push', or if we don't have workflow run data (defensive)
    // Missing workflow run data might mean non-Actions check suites
    return !event || event === 'push'
  })
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
    skipped: 0,
    other: 0
  }

  let longestDuration = 0
  let longestName = ''
  let longestStatus = ''
  let longestConclusion: string | null = null

  for (const suite of checkSuites) {
    // Track conclusion counts
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
      case 'skipped':
        stats.skipped++
        break
      default:
        stats.other++
        break
    }

    // Check for longest running check run within this suite
    if (suite.check_runs && suite.check_runs.length > 0) {
      for (const run of suite.check_runs) {
        if (run.started_at && run.completed_at) {
          const startedAt = new Date(run.started_at).getTime()
          const completedAt = new Date(run.completed_at).getTime()
          const duration = completedAt - startedAt

          if (duration > longestDuration) {
            longestDuration = duration
            longestName = run.name
            longestStatus = run.status
            longestConclusion = run.conclusion
          }
        }
      }
    }

    // Fallback: track longest running checksuite if no check runs
    if (longestDuration === 0) {
      const createdAt = new Date(suite.created_at).getTime()
      const updatedAt = new Date(suite.updated_at).getTime()
      const duration = updatedAt - createdAt

      if (duration > longestDuration) {
        longestDuration = duration
        longestName = suite.head_branch
          ? `${suite.head_branch} #${suite.id}`
          : `Check Suite #${suite.id}`
        longestStatus = suite.status
        longestConclusion = suite.conclusion
      }
    }
  }

  // Add longest checkrun info if we found one
  if (longestDuration > 0) {
    stats.longest_checkrun = {
      duration_ms: longestDuration,
      name: longestName,
      status: longestStatus,
      conclusion: longestConclusion
    }
  }

  return stats
}

// Pure function: Wall-to-wall duration calculation (in milliseconds)
// Uses actual check run start/completion times for accuracy
export function calculateWallToWallDuration(checkSuites: CheckSuite[]): number {
  if (checkSuites.length === 0) {
    return 0
  }

  // Collect all check runs with valid timestamps
  const validCheckRuns: { started_at: number; completed_at: number }[] = []

  for (const suite of checkSuites) {
    if (suite.check_runs && suite.check_runs.length > 0) {
      for (const run of suite.check_runs) {
        if (run.started_at && run.completed_at) {
          validCheckRuns.push({
            started_at: new Date(run.started_at).getTime(),
            completed_at: new Date(run.completed_at).getTime()
          })
        }
      }
    }
  }

  // If we have check runs with valid timestamps, use those for accurate timing
  if (validCheckRuns.length > 0) {
    const earliestStart = Math.min(...validCheckRuns.map(run => run.started_at))
    const latestEnd = Math.max(...validCheckRuns.map(run => run.completed_at))
    return latestEnd - earliestStart
  }

  // Fallback: use check suite created/updated times if no check runs available
  // (less accurate due to queuing time, but better than nothing)
  const createdTimes = checkSuites.map(suite =>
    new Date(suite.created_at).getTime()
  )
  const updatedTimes = checkSuites.map(suite =>
    new Date(suite.updated_at).getTime()
  )

  const earliestStart = Math.min(...createdTimes)
  const latestEnd = Math.max(...updatedTimes)

  return latestEnd - earliestStart
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
    duration_ms: duration,
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
  uuid: string // Primary deploy identifier (UUID format)
  id: number // Internal database ID
  serviceId?: number
  timestamp?: string
  title?: string
  type?: string
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
      duration_ms: analysis.duration_ms,
      checksuite_stats: analysis.stats
    }
  }
}

// Pure function: Determine if a commit should be posted to Cortex
export function shouldPostToCortex(
  analysis: CommitAnalysis,
  config: CortexConfig
): boolean {
  // Skip commits with no checksuites AND no error (no data to report)
  if (analysis.stats.total === 0 && !analysis.error) {
    return false
  }

  // If postPerCommit is true, post all commits with checksuites
  if (config.postPerCommit) {
    return true
  }

  // Otherwise, only post commits without errors and no failures
  return !analysis.error && analysis.stats.failed === 0
}
