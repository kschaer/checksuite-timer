import * as github from '@actions/github'
import { Commit, CheckSuite } from './core'

// Interface for GitHub API operations - easily mockable for testing
export interface GitHubClient {
  getCommits(
    owner: string,
    repo: string,
    branch: string,
    since: Date
  ): Promise<Commit[]>
  getCheckSuites(
    owner: string,
    repo: string,
    sha: string
  ): Promise<CheckSuite[]>
}

// Real implementation using GitHub API
export class GitHubApiClient implements GitHubClient {
  private octokit: ReturnType<typeof github.getOctokit>

  constructor(token: string) {
    this.octokit = github.getOctokit(token)
  }

  async getCommits(
    owner: string,
    repo: string,
    branch: string,
    since: Date
  ): Promise<Commit[]> {
    const commits: Commit[] = []
    let page = 1
    const perPage = 100
    let hasMorePages = true

    while (hasMorePages) {
      const response = await this.octokit.rest.repos.listCommits({
        owner,
        repo,
        sha: branch,
        since: since.toISOString(),
        per_page: perPage,
        page
      })

      if (response.data.length === 0) {
        hasMorePages = false
      } else {
        commits.push(...(response.data as Commit[]))

        if (response.data.length < perPage) {
          hasMorePages = false
        } else {
          page++
        }
      }
    }

    return commits
  }

  async getCheckSuites(
    owner: string,
    repo: string,
    sha: string
  ): Promise<CheckSuite[]> {
    const response = await this.octokit.rest.checks.listSuitesForRef({
      owner,
      repo,
      ref: sha
    })

    return response.data.check_suites as CheckSuite[]
  }
}

// Factory function for creating GitHub client
export function createGitHubClient(token: string): GitHubClient {
  return new GitHubApiClient(token)
}
