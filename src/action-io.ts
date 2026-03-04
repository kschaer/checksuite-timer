import * as core from '@actions/core'
import * as github from '@actions/github'
import { AnalysisResult } from './core'

// Input configuration interface
export interface ActionInputs {
  branch: string
  timeWindow: string
  githubToken: string
}

// Repository context interface  
export interface RepositoryContext {
  owner: string
  repo: string
}

// Parse action inputs - testable by mocking core.getInput
export function parseActionInputs(): ActionInputs {
  const branch = core.getInput('branch') || 'main'
  const timeWindow = core.getInput('time_window') || '24h'
  const githubToken = core.getInput('github_token')
  
  if (!githubToken) {
    throw new Error('GitHub token is required')
  }
  
  return {
    branch,
    timeWindow,
    githubToken
  }
}

// Get repository context - testable by mocking github.context
export function getRepositoryContext(): RepositoryContext {
  const context = github.context
  return {
    owner: context.repo.owner,
    repo: context.repo.repo
  }
}

// Set action outputs - testable by mocking core.setOutput
export function setActionOutputs(result: AnalysisResult): void {
  // Primary output: structured per-commit data
  core.setOutput('commits_data', JSON.stringify(result))
  
  // Legacy outputs for backwards compatibility
  const totalChecksuites = result.commits.reduce((sum, analysis) => sum + analysis.stats.total, 0)
  const avgDuration = result.commits.length > 0 
    ? Math.round(result.commits.reduce((sum, analysis) => sum + analysis.duration_seconds, 0) / result.commits.length)
    : 0
    
  core.setOutput('commit_count', result.commits.length.toString())
  core.setOutput('total_checksuites', totalChecksuites.toString())
  core.setOutput('avg_duration_seconds', avgDuration.toString())
}

// Log analysis results - testable by mocking core.info/warning
export function logAnalysisResults(result: AnalysisResult): void {
  core.info(`Analysis complete: ${result.summary.total_commits} commits, ${result.summary.successful_commits} successful, ${result.summary.failed_commits} with failures`)
  
  // Log details for each commit
  for (const analysis of result.commits) {
    if (analysis.error) {
      core.warning(`Error analyzing commit ${analysis.commit.sha}: ${analysis.error}`)
    } else {
      core.info(`Commit ${analysis.commit.sha}: ${analysis.duration_seconds}s duration, ${analysis.stats.total} checksuites (${analysis.stats.successful} successful, ${analysis.stats.failed} failed)`)
    }
  }
}