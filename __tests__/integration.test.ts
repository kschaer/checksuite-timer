import { run } from '../src/index'
import * as core from '@actions/core'
import * as github from '@actions/github'

// Mock all external dependencies
jest.mock('@actions/core')
jest.mock('@actions/github')

const mockCore = core as jest.Mocked<typeof core>
const mockGithub = github as jest.Mocked<typeof github>

describe('Integration Tests', () => {
  let mockOctokit: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup default mocks
    mockCore.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        branch: 'main',
        time_window: '24h',
        github_token: 'ghp_test_token'
      }
      return inputs[name] || ''
    })

    // Mock the context property
    Object.defineProperty(mockGithub, 'context', {
      value: {
        repo: {
          owner: 'test-owner',
          repo: 'test-repo'
        }
      },
      writable: true,
      configurable: true
    })

    // Mock octokit
    mockOctokit = {
      rest: {
        repos: {
          listCommits: jest.fn()
        },
        checks: {
          listSuitesForRef: jest.fn(),
          listForSuite: jest.fn()
        },
        actions: {
          listWorkflowRunsForRepo: jest.fn()
        }
      }
    }

    mockGithub.getOctokit = jest.fn().mockReturnValue(mockOctokit)
  })

  describe('run() full workflow', () => {
    test('successful analysis with commits and checksuites', async () => {
      // Mock commits response
      const mockCommits = [
        {
          sha: 'commit1',
          commit: {
            author: { date: '2024-01-01T10:00:00Z' },
            committer: {
              email: 'user@example.com',
              date: '2024-01-01T10:00:00Z'
            }
          }
        },
        {
          sha: 'commit2',
          commit: {
            author: { date: '2024-01-01T11:00:00Z' },
            committer: {
              email: 'user2@example.com',
              date: '2024-01-01T11:00:00Z'
            }
          }
        }
      ]

      // Mock checksuites responses
      const mockCheckSuites1 = [
        {
          id: 1,
          status: 'completed',
          conclusion: 'success',
          created_at: '2024-01-01T10:01:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          head_sha: 'commit1',
          head_branch: 'main',
          app: { name: 'GitHub Actions' }
        },
        {
          id: 2,
          status: 'completed',
          conclusion: 'failure',
          created_at: '2024-01-01T10:02:00Z',
          updated_at: '2024-01-01T10:08:00Z',
          head_sha: 'commit1',
          head_branch: 'main',
          app: { name: 'GitHub Actions' }
        }
      ]

      const mockCheckSuites2 = [
        {
          id: 3,
          status: 'completed',
          conclusion: 'success',
          created_at: '2024-01-01T11:01:00Z',
          updated_at: '2024-01-01T11:03:00Z',
          head_sha: 'commit2',
          head_branch: 'main',
          app: { name: 'GitHub Actions' }
        }
      ]

      // Mock workflow runs responses
      const mockWorkflowRuns1 = [
        {
          id: 201,
          name: 'CI',
          event: 'push',
          check_suite_id: 1,
          status: 'completed',
          conclusion: 'success',
          created_at: '2024-01-01T10:01:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          head_sha: 'commit1'
        },
        {
          id: 202,
          name: 'Tests',
          event: 'push',
          check_suite_id: 2,
          status: 'completed',
          conclusion: 'failure',
          created_at: '2024-01-01T10:02:00Z',
          updated_at: '2024-01-01T10:08:00Z',
          head_sha: 'commit1'
        }
      ]

      const mockWorkflowRuns2 = [
        {
          id: 203,
          name: 'CI',
          event: 'push',
          check_suite_id: 3,
          status: 'completed',
          conclusion: 'success',
          created_at: '2024-01-01T11:01:00Z',
          updated_at: '2024-01-01T11:03:00Z',
          head_sha: 'commit2'
        }
      ]

      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: mockCommits
      })
      mockOctokit.rest.checks.listSuitesForRef
        .mockResolvedValueOnce({ data: { check_suites: mockCheckSuites1 } })
        .mockResolvedValueOnce({ data: { check_suites: mockCheckSuites2 } })
      mockOctokit.rest.actions.listWorkflowRunsForRepo
        .mockResolvedValueOnce({ data: { workflow_runs: mockWorkflowRuns1 } })
        .mockResolvedValueOnce({ data: { workflow_runs: mockWorkflowRuns2 } })

      // Mock check runs for each suite
      mockOctokit.rest.checks.listForSuite
        .mockResolvedValueOnce({
          data: {
            check_runs: [
              {
                id: 101,
                name: 'CI Tests',
                status: 'completed',
                conclusion: 'success',
                started_at: '2024-01-01T10:01:00Z',
                completed_at: '2024-01-01T10:05:00Z',
                head_sha: 'commit1'
              }
            ]
          }
        })
        .mockResolvedValueOnce({
          data: {
            check_runs: [
              {
                id: 102,
                name: 'Build',
                status: 'completed',
                conclusion: 'failure',
                started_at: '2024-01-01T10:02:00Z',
                completed_at: '2024-01-01T10:08:00Z',
                head_sha: 'commit1'
              }
            ]
          }
        })
        .mockResolvedValueOnce({
          data: {
            check_runs: [
              {
                id: 103,
                name: 'Deploy',
                status: 'completed',
                conclusion: 'success',
                started_at: '2024-01-01T11:01:00Z',
                completed_at: '2024-01-01T11:03:00Z',
                head_sha: 'commit2'
              }
            ]
          }
        })

      await run()

      // Verify GitHub API calls
      expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        sha: 'main',
        since: expect.any(String),
        per_page: 100,
        page: 1
      })

      expect(mockOctokit.rest.checks.listSuitesForRef).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.checks.listSuitesForRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'commit1'
      })
      expect(mockOctokit.rest.checks.listSuitesForRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'commit2'
      })

      // Verify outputs were set
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'commits_data',
        expect.any(String)
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith('commit_count', '2')
      expect(mockCore.setOutput).toHaveBeenCalledWith('total_checksuites', '3')
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'avg_duration_ms',
        expect.any(String)
      )

      // Parse and verify the commits_data output
      const commitsDataCall = (mockCore.setOutput as jest.Mock).mock.calls.find(
        call => call[0] === 'commits_data'
      )
      expect(commitsDataCall).toBeDefined()

      const result = JSON.parse(commitsDataCall[1])
      expect(result).toHaveProperty('commits')
      expect(result).toHaveProperty('summary')
      expect(result.commits).toHaveLength(2)

      // Verify first commit analysis
      expect(result.commits[0].commit.sha).toBe('commit1')
      expect(result.commits[0].duration_ms).toBe(420000) // 7 minutes (10:01 to 10:08) in milliseconds
      expect(result.commits[0].stats).toEqual({
        total: 2,
        successful: 1,
        failed: 1,
        cancelled: 0,
        skipped: 0,
        other: 0,
        longest_checkrun: {
          duration_ms: 360000, // 6 minutes (10:02 to 10:08)
          name: 'Build',
          status: 'completed',
          conclusion: 'failure'
        }
      })

      // Verify second commit analysis
      expect(result.commits[1].commit.sha).toBe('commit2')
      expect(result.commits[1].duration_ms).toBe(120000) // 2 minutes (11:01 to 11:03) in milliseconds
      expect(result.commits[1].stats).toEqual({
        total: 1,
        successful: 1,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        other: 0,
        longest_checkrun: {
          duration_ms: 120000, // 2 minutes (11:01 to 11:03)
          name: 'Deploy',
          status: 'completed',
          conclusion: 'success'
        }
      })

      // Verify summary
      expect(result.summary).toEqual({
        total_commits: 2,
        successful_commits: 1, // Only commit2 has no failures
        failed_commits: 1 // commit1 has 1 failure
      })

      // Verify no errors were set
      expect(mockCore.setFailed).not.toHaveBeenCalled()
    })

    test('handles no commits gracefully', async () => {
      mockOctokit.rest.repos.listCommits.mockResolvedValue({ data: [] })

      await run()

      expect(mockCore.info).toHaveBeenCalledWith(
        'No commits found in the specified time window. Exiting gracefully.'
      )
      expect(mockOctokit.rest.checks.listSuitesForRef).not.toHaveBeenCalled()

      const commitsDataCall = (mockCore.setOutput as jest.Mock).mock.calls.find(
        call => call[0] === 'commits_data'
      )
      const result = JSON.parse(commitsDataCall[1])
      expect(result).toEqual({
        commits: [],
        summary: { total_commits: 0, successful_commits: 0, failed_commits: 0 }
      })
    })

    test('handles API errors gracefully', async () => {
      const apiError = new Error('GitHub API rate limit exceeded')
      mockOctokit.rest.repos.listCommits.mockRejectedValue(apiError)

      await run()

      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'GitHub API rate limit exceeded'
      )
    })

    test('handles invalid time window', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          branch: 'main',
          time_window: 'invalid-format',
          github_token: 'ghp_test_token'
        }
        return inputs[name] || ''
      })

      await run()

      expect(mockCore.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid time window format')
      )
    })

    test('handles missing GitHub token', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          branch: 'main',
          time_window: '24h',
          github_token: ''
        }
        return inputs[name] || ''
      })

      await run()

      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'GitHub token is required'
      )
    })

    test('handles partial failures in commit analysis', async () => {
      const mockCommits = [
        {
          sha: 'commit1',
          commit: {
            author: { date: '2024-01-01T10:00:00Z' },
            committer: {
              email: 'user@example.com',
              date: '2024-01-01T10:00:00Z'
            }
          }
        },
        {
          sha: 'commit2',
          commit: {
            author: { date: '2024-01-01T11:00:00Z' },
            committer: {
              email: 'user2@example.com',
              date: '2024-01-01T11:00:00Z'
            }
          }
        }
      ]

      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: mockCommits
      })

      // First commit succeeds, second fails
      mockOctokit.rest.checks.listSuitesForRef
        .mockResolvedValueOnce({
          data: {
            check_suites: [
              {
                id: 1,
                status: 'completed',
                conclusion: 'success',
                created_at: '2024-01-01T10:01:00Z',
                updated_at: '2024-01-01T10:05:00Z',
                head_sha: 'commit1',
                app: { name: 'Tests' }
              }
            ]
          }
        })
        .mockRejectedValueOnce(new Error('Checksuite API error'))

      mockOctokit.rest.actions.listWorkflowRunsForRepo
        .mockResolvedValueOnce({
          data: {
            workflow_runs: [
              {
                id: 201,
                name: 'Tests',
                event: 'push',
                check_suite_id: 1,
                status: 'completed',
                conclusion: 'success',
                created_at: '2024-01-01T10:01:00Z',
                updated_at: '2024-01-01T10:05:00Z',
                head_sha: 'commit1'
              }
            ]
          }
        })
        .mockResolvedValueOnce({ data: { workflow_runs: [] } })

      // Mock check runs for the successful commit
      mockOctokit.rest.checks.listForSuite.mockResolvedValue({
        data: {
          check_runs: [
            {
              id: 101,
              name: 'Tests',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:01:00Z',
              completed_at: '2024-01-01T10:05:00Z',
              head_sha: 'commit1'
            }
          ]
        }
      })

      await run()

      // Should not fail the entire action
      expect(mockCore.setFailed).not.toHaveBeenCalled()

      // Should log warning about the failed commit
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error analyzing commit commit2: Checksuite API error'
        )
      )

      // Should still output results for successful commits
      const commitsDataCall = (mockCore.setOutput as jest.Mock).mock.calls.find(
        call => call[0] === 'commits_data'
      )
      const result = JSON.parse(commitsDataCall[1])
      expect(result.commits).toHaveLength(2)
      expect(result.commits[0].error).toBeUndefined()
      expect(result.commits[1].error).toBe('Checksuite API error')
    })
  })
})
