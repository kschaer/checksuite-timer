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
      // API call (mockable)
      const checkSuites = await this.gitHubClient.getCheckSuites(owner, repo, commit.sha)
      
      // Pure business logic (easily testable)
      return createCommitAnalysis(commit, checkSuites, owner, repo)
    } catch (error) {
      // Error handling - return analysis with error
      return createCommitAnalysis(
        commit,
        [],
        owner,
        repo,
        error instanceof Error ? error.message : String(error)
      )
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
    const commits = await this.gitHubClient.getCommits(owner, repo, branch, since)
    
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