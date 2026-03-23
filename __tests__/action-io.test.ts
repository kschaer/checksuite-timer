import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  parseActionInputs,
  getRepositoryContext,
  setActionOutputs,
  logAnalysisResults
} from '../src/action-io'
import { AnalysisResult, CommitAnalysis } from '../src/core'

// Mock the external dependencies
jest.mock('@actions/core')
jest.mock('@actions/github')

const mockCore = core as jest.Mocked<typeof core>
const mockGithub = github as jest.Mocked<typeof github>

describe('action-io', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('parseActionInputs', () => {
    const testCases = [
      {
        name: 'with all inputs provided',
        inputs: {
          branch: 'develop',
          time_window: '12h',
          github_token: 'ghp_test_token'
        },
        expected: {
          branch: 'develop',
          timeWindow: '12h',
          githubToken: 'ghp_test_token'
        }
      },
      {
        name: 'with default values',
        inputs: {
          branch: '',
          time_window: '',
          github_token: 'ghp_test_token'
        },
        expected: {
          branch: 'main',
          timeWindow: '24h',
          githubToken: 'ghp_test_token'
        }
      },
      {
        name: 'with partial inputs',
        inputs: {
          branch: 'feature-branch',
          time_window: '',
          github_token: 'ghp_test_token'
        },
        expected: {
          branch: 'feature-branch',
          timeWindow: '24h',
          githubToken: 'ghp_test_token'
        }
      }
    ]

    test.each(testCases)('$name', ({ inputs, expected }) => {
      mockCore.getInput.mockImplementation(
        (name: string) => inputs[name as keyof typeof inputs] || ''
      )

      const result = parseActionInputs()

      expect(result).toEqual(expected)
      expect(mockCore.getInput).toHaveBeenCalledWith('branch')
      expect(mockCore.getInput).toHaveBeenCalledWith('time_window')
      expect(mockCore.getInput).toHaveBeenCalledWith('github_token')
    })

    test('throws error when github_token is missing', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        return name === 'github_token' ? '' : 'default-value'
      })

      expect(() => parseActionInputs()).toThrow('GitHub token is required')
    })
  })

  describe('getRepositoryContext', () => {
    test('returns correct repository context', () => {
      const mockContext = {
        repo: {
          owner: 'test-owner',
          repo: 'test-repo'
        }
      }

      // Mock the context property
      Object.defineProperty(mockGithub, 'context', {
        value: mockContext,
        writable: true,
        configurable: true
      })

      const result = getRepositoryContext()

      expect(result).toEqual({
        owner: 'test-owner',
        repo: 'test-repo'
      })
    })
  })

  describe('setActionOutputs', () => {
    test('sets all outputs correctly', () => {
      const mockResult: AnalysisResult = {
        commits: [
          {
            commit: {
              sha: 'abc123',
              timestamp: '2024-01-01T10:00:00Z',
              committer_email: 'user@example.com',
              url: 'https://github.com/owner/repo/commit/abc123'
            },
            checksuites: [],
            duration_ms: 300,
            stats: {
              total: 2,
              successful: 1,
              failed: 1,
              cancelled: 0,
              other: 0
            }
          },
          {
            commit: {
              sha: 'def456',
              timestamp: '2024-01-01T11:00:00Z',
              committer_email: 'user2@example.com',
              url: 'https://github.com/owner/repo/commit/def456'
            },
            checksuites: [],
            duration_ms: 150,
            stats: {
              total: 1,
              successful: 1,
              failed: 0,
              cancelled: 0,
              other: 0
            }
          }
        ],
        summary: {
          total_commits: 2,
          successful_commits: 1,
          failed_commits: 1
        }
      }

      setActionOutputs(mockResult)

      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'commits_data',
        JSON.stringify(mockResult)
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith('commit_count', '2')
      expect(mockCore.setOutput).toHaveBeenCalledWith('total_checksuites', '3') // 2 + 1
      expect(mockCore.setOutput).toHaveBeenCalledWith('avg_duration_ms', '225') // (300 + 150) / 2
    })

    test('handles empty results', () => {
      const emptyResult: AnalysisResult = {
        commits: [],
        summary: {
          total_commits: 0,
          successful_commits: 0,
          failed_commits: 0
        }
      }

      setActionOutputs(emptyResult)

      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'commits_data',
        JSON.stringify(emptyResult)
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith('commit_count', '0')
      expect(mockCore.setOutput).toHaveBeenCalledWith('total_checksuites', '0')
      expect(mockCore.setOutput).toHaveBeenCalledWith('avg_duration_ms', '0')
    })
  })

  describe('logAnalysisResults', () => {
    test('logs successful analysis results', () => {
      const mockCommitAnalysis: CommitAnalysis = {
        commit: {
          sha: 'abc123',
          timestamp: '2024-01-01T10:00:00Z',
          committer_email: 'user@example.com',
          url: 'https://github.com/owner/repo/commit/abc123'
        },
        checksuites: [],
        duration_ms: 300,
        stats: { total: 2, successful: 1, failed: 1, cancelled: 0, other: 0 }
      }

      const mockResult: AnalysisResult = {
        commits: [mockCommitAnalysis],
        summary: { total_commits: 1, successful_commits: 0, failed_commits: 1 }
      }

      logAnalysisResults(mockResult)

      expect(mockCore.info).toHaveBeenCalledWith(
        'Analysis complete: 1 commits, 0 successful, 1 with failures'
      )
      expect(mockCore.info).toHaveBeenCalledWith(
        'Commit abc123: 300ms duration, 2 checksuites (1 successful, 1 failed)'
      )
      expect(mockCore.warning).not.toHaveBeenCalled()
    })

    test('logs commit with errors', () => {
      const mockCommitAnalysis: CommitAnalysis = {
        commit: {
          sha: 'abc123',
          timestamp: '2024-01-01T10:00:00Z',
          committer_email: 'user@example.com',
          url: 'https://github.com/owner/repo/commit/abc123'
        },
        checksuites: [],
        duration_ms: 0,
        stats: { total: 0, successful: 0, failed: 0, cancelled: 0, other: 0 },
        error: 'API rate limit exceeded'
      }

      const mockResult: AnalysisResult = {
        commits: [mockCommitAnalysis],
        summary: { total_commits: 1, successful_commits: 0, failed_commits: 1 }
      }

      logAnalysisResults(mockResult)

      expect(mockCore.info).toHaveBeenCalledWith(
        'Analysis complete: 1 commits, 0 successful, 1 with failures'
      )
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Error analyzing commit abc123: API rate limit exceeded'
      )
    })

    test('logs mixed results', () => {
      const successfulCommit: CommitAnalysis = {
        commit: {
          sha: 'abc123',
          timestamp: '2024-01-01T10:00:00Z',
          committer_email: 'user@example.com',
          url: 'https://github.com/owner/repo/commit/abc123'
        },
        checksuites: [],
        duration_ms: 300,
        stats: { total: 1, successful: 1, failed: 0, cancelled: 0, other: 0 }
      }

      const failedCommit: CommitAnalysis = {
        commit: {
          sha: 'def456',
          timestamp: '2024-01-01T11:00:00Z',
          committer_email: 'user2@example.com',
          url: 'https://github.com/owner/repo/commit/def456'
        },
        checksuites: [],
        duration_ms: 0,
        stats: { total: 0, successful: 0, failed: 0, cancelled: 0, other: 0 },
        error: 'Network timeout'
      }

      const mockResult: AnalysisResult = {
        commits: [successfulCommit, failedCommit],
        summary: { total_commits: 2, successful_commits: 1, failed_commits: 1 }
      }

      logAnalysisResults(mockResult)

      expect(mockCore.info).toHaveBeenCalledTimes(2) // Summary + successful commit
      expect(mockCore.warning).toHaveBeenCalledTimes(1) // Failed commit
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Error analyzing commit def456: Network timeout'
      )
    })
  })
})
