import { AnalysisService } from '../src/analysis-service'
import { GitHubClient } from '../src/github-client'
import { Commit, CheckSuite } from '../src/core'

// Mock GitHub client for testing
const createMockGitHubClient = (): jest.Mocked<GitHubClient> => ({
  getCommits: jest.fn(),
  getCheckSuites: jest.fn(),
  getCheckRuns: jest.fn(),
  getWorkflowRuns: jest.fn()
})

describe('AnalysisService', () => {
  let mockClient: jest.Mocked<GitHubClient>
  let service: AnalysisService

  beforeEach(() => {
    mockClient = createMockGitHubClient()
    service = new AnalysisService(mockClient)
  })

  describe('analyzeCommit', () => {
    const mockCommit: Commit = {
      sha: 'abc123',
      commit: {
        author: { date: '2024-01-01T10:00:00Z' },
        committer: {
          email: 'user@example.com',
          date: '2024-01-01T10:00:00Z'
        }
      }
    }

    test('successful commit with checksuites and check runs', async () => {
      const checkSuites = [
        {
          id: 1,
          status: 'completed',
          conclusion: 'success',
          created_at: '2024-01-01T10:01:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          head_sha: 'abc123'
        }
      ] as CheckSuite[]

      const workflowRuns = [
        {
          id: 201,
          name: 'CI',
          event: 'push',
          check_suite_id: 1,
          status: 'completed',
          conclusion: 'success',
          created_at: '2024-01-01T10:01:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          head_sha: 'abc123'
        }
      ]

      const checkRuns = [
        {
          id: 101,
          name: 'CI Tests',
          status: 'completed',
          conclusion: 'success',
          started_at: '2024-01-01T10:01:00Z',
          completed_at: '2024-01-01T10:05:00Z',
          head_sha: 'abc123'
        }
      ]

      mockClient.getCheckSuites.mockResolvedValue(checkSuites)
      mockClient.getWorkflowRuns.mockResolvedValue(workflowRuns)
      mockClient.getCheckRuns.mockResolvedValue(checkRuns)

      const result = await service.analyzeCommit(mockCommit, 'owner', 'repo')

      expect(mockClient.getCheckSuites).toHaveBeenCalledWith(
        'owner',
        'repo',
        'abc123'
      )
      expect(mockClient.getCheckRuns).toHaveBeenCalledWith('owner', 'repo', 1)
      expect(result.duration_ms).toBe(240000) // 4 minutes
      expect(result.stats).toEqual({
        total: 1,
        successful: 1,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        other: 0,
        longest_checkrun: {
          duration_ms: 240000,
          name: 'CI Tests',
          status: 'completed',
          conclusion: 'success'
        }
      })
      expect(result.error).toBeUndefined()
    })

    test('commit with no checksuites', async () => {
      mockClient.getCheckSuites.mockResolvedValue([])
      mockClient.getWorkflowRuns.mockResolvedValue([])

      const result = await service.analyzeCommit(mockCommit, 'owner', 'repo')

      expect(result.duration_ms).toBe(0)
      expect(result.stats).toEqual({
        total: 0,
        successful: 0,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        other: 0
      })
      expect(result.error).toBeUndefined()
    })

    test('commit with mixed checksuite results and check runs', async () => {
      const checkSuites = [
        {
          id: 1,
          status: 'completed',
          conclusion: 'success',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:03:00Z',
          head_sha: 'abc123',
          head_branch: 'main',
          app: { name: 'GitHub Actions' }
        },
        {
          id: 2,
          status: 'completed',
          conclusion: 'failure',
          created_at: '2024-01-01T10:01:00Z',
          updated_at: '2024-01-01T10:08:00Z',
          head_sha: 'abc123',
          head_branch: 'main',
          app: { name: 'GitHub Actions' }
        }
      ] as CheckSuite[]

      const workflowRuns = [
        {
          id: 201,
          name: 'CI',
          event: 'push',
          check_suite_id: 1,
          status: 'completed',
          conclusion: 'success',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:03:00Z',
          head_sha: 'abc123'
        },
        {
          id: 202,
          name: 'Tests',
          event: 'push',
          check_suite_id: 2,
          status: 'completed',
          conclusion: 'failure',
          created_at: '2024-01-01T10:01:00Z',
          updated_at: '2024-01-01T10:08:00Z',
          head_sha: 'abc123'
        }
      ]

      const checkRuns1 = [
        {
          id: 101,
          name: 'Tests',
          status: 'completed',
          conclusion: 'success',
          started_at: '2024-01-01T10:00:00Z',
          completed_at: '2024-01-01T10:03:00Z',
          head_sha: 'abc123'
        }
      ]

      const checkRuns2 = [
        {
          id: 102,
          name: 'Build',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2024-01-01T10:01:00Z',
          completed_at: '2024-01-01T10:08:00Z',
          head_sha: 'abc123'
        }
      ]

      mockClient.getCheckSuites.mockResolvedValue(checkSuites)
      mockClient.getWorkflowRuns.mockResolvedValue(workflowRuns)
      mockClient.getCheckRuns
        .mockResolvedValueOnce(checkRuns1)
        .mockResolvedValueOnce(checkRuns2)

      const result = await service.analyzeCommit(mockCommit, 'owner', 'repo')

      expect(mockClient.getCheckRuns).toHaveBeenCalledTimes(2)
      expect(result.duration_ms).toBe(480000) // 8 minutes (10:00 to 10:08)
      expect(result.stats).toEqual({
        total: 2,
        successful: 1,
        failed: 1,
        cancelled: 0,
        skipped: 0,
        other: 0,
        longest_checkrun: {
          duration_ms: 420000, // 7 minutes (10:01 to 10:08)
          name: 'Build',
          status: 'completed',
          conclusion: 'failure'
        }
      })
      expect(result.error).toBeUndefined()
    })

    test('handles API errors gracefully', async () => {
      const apiError = new Error('GitHub API rate limit exceeded')
      mockClient.getCheckSuites.mockRejectedValue(apiError)
      mockClient.getWorkflowRuns.mockResolvedValue([])

      const result = await service.analyzeCommit(mockCommit, 'owner', 'repo')

      expect(result.error).toBe('GitHub API rate limit exceeded')
      expect(result.duration_ms).toBe(0)
      expect(result.checksuites).toEqual([])
      expect(result.stats).toEqual({
        total: 0,
        successful: 0,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        other: 0
      })

      // Should still have commit data even with error
      expect(result.commit.sha).toBe('abc123')
      expect(result.commit.committer_email).toBe('user@example.com')
    })

    test('handles non-Error exceptions', async () => {
      mockClient.getCheckSuites.mockRejectedValue('String error')
      mockClient.getWorkflowRuns.mockResolvedValue([])

      const result = await service.analyzeCommit(mockCommit, 'owner', 'repo')

      expect(result.error).toBe('String error')
    })
  })

  describe('analyzeCommits', () => {
    test('processes multiple commits with error isolation', async () => {
      const commits: Commit[] = [
        {
          sha: 'commit1',
          commit: {
            author: { date: '2024-01-01T10:00:00Z' },
            committer: {
              email: 'user1@example.com',
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

      // First commit succeeds, second fails
      mockClient.getCheckSuites
        .mockResolvedValueOnce([
          {
            id: 1,
            conclusion: 'success',
            created_at: '2024-01-01T10:01:00Z',
            updated_at: '2024-01-01T10:05:00Z',
            status: 'completed',
            head_sha: 'commit1'
          } as CheckSuite
        ])
        .mockRejectedValueOnce(new Error('API Error'))
      mockClient.getWorkflowRuns
        .mockResolvedValueOnce([
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
          }
        ])
        .mockResolvedValueOnce([])
      mockClient.getCheckRuns.mockResolvedValue([])

      const results = await service.analyzeCommits(commits, 'owner', 'repo')

      expect(results).toHaveLength(2)
      expect(results[0].commit.sha).toBe('commit1')
      expect(results[0].error).toBeUndefined()
      expect(results[0].stats.successful).toBe(1)

      expect(results[1].commit.sha).toBe('commit2')
      expect(results[1].error).toBe('API Error')
      expect(results[1].stats.total).toBe(0)
    })

    test('handles empty commits array', async () => {
      const results = await service.analyzeCommits([], 'owner', 'repo')

      expect(results).toEqual([])
      expect(mockClient.getCheckSuites).not.toHaveBeenCalled()
    })
  })

  describe('analyzeRepository', () => {
    test('full workflow with successful analysis', async () => {
      const mockCommits: Commit[] = [
        {
          sha: 'commit1',
          commit: {
            author: { date: '2024-01-01T10:00:00Z' },
            committer: {
              email: 'user@example.com',
              date: '2024-01-01T10:00:00Z'
            }
          }
        }
      ]

      const mockCheckSuites: CheckSuite[] = [
        {
          id: 1,
          status: 'completed',
          conclusion: 'success',
          created_at: '2024-01-01T10:01:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          head_sha: 'commit1'
        }
      ]

      const mockWorkflowRuns = [
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
        }
      ]

      mockClient.getCommits.mockResolvedValue(mockCommits)
      mockClient.getCheckSuites.mockResolvedValue(mockCheckSuites)
      mockClient.getWorkflowRuns.mockResolvedValue(mockWorkflowRuns)
      mockClient.getCheckRuns.mockResolvedValue([])

      const since = new Date('2024-01-01T00:00:00Z')
      const result = await service.analyzeRepository(
        'owner',
        'repo',
        'main',
        since
      )

      expect(mockClient.getCommits).toHaveBeenCalledWith(
        'owner',
        'repo',
        'main',
        since
      )
      expect(mockClient.getCheckSuites).toHaveBeenCalledWith(
        'owner',
        'repo',
        'commit1'
      )

      expect(result.commits).toHaveLength(1)
      expect(result.commits[0].commit.sha).toBe('commit1')
      expect(result.commits[0].duration_ms).toBe(240000) // 4 minutes in milliseconds

      expect(result.summary).toEqual({
        total_commits: 1,
        successful_commits: 1,
        failed_commits: 0
      })
    })

    test('handles empty repository', async () => {
      mockClient.getCommits.mockResolvedValue([])
      mockClient.getWorkflowRuns.mockResolvedValue([])

      const since = new Date('2024-01-01T00:00:00Z')
      const result = await service.analyzeRepository(
        'owner',
        'repo',
        'main',
        since
      )

      expect(result.commits).toEqual([])
      expect(result.summary).toEqual({
        total_commits: 0,
        successful_commits: 0,
        failed_commits: 0
      })
      expect(mockClient.getCheckSuites).not.toHaveBeenCalled()
    })
  })
})
