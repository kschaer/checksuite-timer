import { GitHubClient } from './github-client'
import {
  Commit,
  CommitAnalysis,
  AnalysisResult,
  createCommitAnalysis,
  calculateSummary
} from './core'

// Service class for commit analysis - testable with mocked GitHubClient
export class AnalysisService {
  constructor(private gitHubClient: GitHubClient) {}

  // Analyze a single commit - separated API calls from business logic
  async analyzeCommit(
    commit: Commit,
    owner: string,
    repo: string
  ): Promise<CommitAnalysis> {
    try {
      // Fetch check suites
      const checkSuites = await this.gitHubClient.getCheckSuites(
        owner,
        repo,
        commit.sha
      )

      // Fetch check runs for each check suite to get workflow names
      for (const suite of checkSuites) {
        try {
          const checkRuns = await this.gitHubClient.getCheckRuns(
            owner,
            repo,
            suite.id
          )
          suite.check_runs = checkRuns
        } catch (error) {
          // If we can't fetch check runs, continue without them
          // This shouldn't fail the entire commit analysis
          suite.check_runs = []
        }
      }

      // Pure business logic (easily testable)
      return createCommitAnalysis(commit, checkSuites, owner, repo)
    } catch (error) {
      // Enhanced error handling with better context
      let errorMessage = error instanceof Error ? error.message : String(error)

      // Provide helpful guidance for common permission errors
      if (errorMessage.includes('Resource not accessible by integration')) {
        errorMessage = `${errorMessage}. This usually means the GITHUB_TOKEN lacks 'checks: read' permission. See README for required permissions.`
      }

      return createCommitAnalysis(commit, [], owner, repo, errorMessage)
    }
  }

  // Analyze multiple commits with error isolation
  async analyzeCommits(
    commits: Commit[],
    owner: string,
    repo: string
  ): Promise<CommitAnalysis[]> {
    const analyses: CommitAnalysis[] = []

    // Process each commit individually to isolate errors
    for (const commit of commits) {
      const analysis = await this.analyzeCommit(commit, owner, repo)
      analyses.push(analysis)
    }

    return analyses
  }

  // Get commits and analyze them - full workflow
  async analyzeRepository(
    owner: string,
    repo: string,
    branch: string,
    since: Date
  ): Promise<AnalysisResult> {
    // Get commits from GitHub API
    const commits = await this.gitHubClient.getCommits(
      owner,
      repo,
      branch,
      since
    )

    // Analyze each commit
    const commitAnalyses = await this.analyzeCommits(commits, owner, repo)

    // Calculate summary statistics using pure function
    const summary = calculateSummary(commitAnalyses)

    return {
      commits: commitAnalyses,
      summary
    }
  }
}
