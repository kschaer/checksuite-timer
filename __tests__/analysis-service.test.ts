import { AnalysisService } from '../src/analysis-service'
import { GitHubClient } from '../src/github-client'
import { Commit, CheckSuite } from '../src/core'

// Mock GitHub client for testing
const createMockGitHubClient = (): jest.Mocked<GitHubClient> => ({
  getCommits: jest.fn(),
  getCheckSuites: jest.fn()
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

    const testCases = [
      {
        name: 'successful commit with checksuites',
        checkSuites: [
          {
            id: 1,
            status: 'completed',
            conclusion: 'success',
            created_at: '2024-01-01T10:01:00Z',
            updated_at: '2024-01-01T10:05:00Z',
            head_sha: 'abc123'
          }
        ] as CheckSuite[],
        expectedDuration: 240, // 4 minutes
        expectedStats: {
          total: 1,
          successful: 1,
          failed: 0,
          cancelled: 0,
          other: 0
        },
        expectError: false
      },
      {
        name: 'commit with no checksuites',
        checkSuites: [] as CheckSuite[],
        expectedDuration: 0,
        expectedStats: {
          total: 0,
          successful: 0,
          failed: 0,
          cancelled: 0,
          other: 0
        },
        expectError: false
      },
      {
        name: 'commit with mixed checksuite results',
        checkSuites: [
          {
            id: 1,
            conclusion: 'success',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:03:00Z'
          },
          {
            id: 2,
            conclusion: 'failure',
            created_at: '2024-01-01T10:01:00Z',
            updated_at: '2024-01-01T10:08:00Z'
          }
        ] as CheckSuite[],
        expectedDuration: 480, // 8 minutes (10:00 to 10:08)
        expectedStats: {
          total: 2,
          successful: 1,
          failed: 1,
          cancelled: 0,
          other: 0
        },
        expectError: false
      }
    ]

    test.each(testCases)(
      '$name',
      async ({ checkSuites, expectedDuration, expectedStats, expectError }) => {
        mockClient.getCheckSuites.mockResolvedValue(checkSuites)

        const result = await service.analyzeCommit(mockCommit, 'owner', 'repo')

        expect(mockClient.getCheckSuites).toHaveBeenCalledWith(
          'owner',
          'repo',
          'abc123'
        )
        expect(result.commit.sha).toBe('abc123')
        expect(result.commit.committer_email).toBe('user@example.com')
        expect(result.commit.url).toBe(
          'https://github.com/owner/repo/commit/abc123'
        )
        expect(result.duration_seconds).toBe(expectedDuration)
        expect(result.stats).toEqual(expectedStats)
        expect(result.checksuites).toEqual(checkSuites)

        if (expectError) {
          expect(result.error).toBeDefined()
        } else {
          expect(result.error).toBeUndefined()
        }
      }
    )

    test('handles API errors gracefully', async () => {
      const apiError = new Error('GitHub API rate limit exceeded')
      mockClient.getCheckSuites.mockRejectedValue(apiError)

      const result = await service.analyzeCommit(mockCommit, 'owner', 'repo')

      expect(result.error).toBe('GitHub API rate limit exceeded')
      expect(result.duration_seconds).toBe(0)
      expect(result.checksuites).toEqual([])
      expect(result.stats).toEqual({
        total: 0,
        successful: 0,
        failed: 0,
        cancelled: 0,
        other: 0
      })

      // Should still have commit data even with error
      expect(result.commit.sha).toBe('abc123')
      expect(result.commit.committer_email).toBe('user@example.com')
    })

    test('handles non-Error exceptions', async () => {
      mockClient.getCheckSuites.mockRejectedValue('String error')

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
            updated_at: '2024-01-01T10:05:00Z'
          } as CheckSuite
        ])
        .mockRejectedValueOnce(new Error('API Error'))

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

      mockClient.getCommits.mockResolvedValue(mockCommits)
      mockClient.getCheckSuites.mockResolvedValue(mockCheckSuites)

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
      expect(result.commits[0].duration_seconds).toBe(240) // 4 minutes

      expect(result.summary).toEqual({
        total_commits: 1,
        successful_commits: 1,
        failed_commits: 0
      })
    })

    test('handles empty repository', async () => {
      mockClient.getCommits.mockResolvedValue([])

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
