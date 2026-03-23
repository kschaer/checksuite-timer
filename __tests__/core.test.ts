import {
  parseTimeWindow,
  calculateCheckSuiteStats,
  calculateWallToWallDuration,
  formatCommitData,
  createCommitAnalysis,
  calculateSummary,
  createCortexDeployPayload,
  shouldPostToCortex
} from '../src/core'

describe('parseTimeWindow', () => {
  beforeAll(() => {
    // Mock Date.now() to ensure consistent test results
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  const testCases = [
    {
      input: '7d',
      description: '7 days',
      expectedDaysAgo: 7
    },
    {
      input: '1d',
      description: '1 day',
      expectedDaysAgo: 1
    },
    {
      input: '24h',
      description: '24 hours',
      expectedHoursAgo: 24
    },
    {
      input: '12h',
      description: '12 hours',
      expectedHoursAgo: 12
    },
    {
      input: '1h',
      description: '1 hour',
      expectedHoursAgo: 1
    },
    {
      input: '30m',
      description: '30 minutes',
      expectedMinutesAgo: 30
    },
    {
      input: '15m',
      description: '15 minutes',
      expectedMinutesAgo: 15
    },
    {
      input: '0h',
      description: '0 hours',
      expectedHoursAgo: 0
    }
  ]

  test.each(testCases)(
    'parseTimeWindow("$input") should return date $expectedDaysAgo days/$expectedHoursAgo hours/$expectedMinutesAgo minutes ago',
    ({ input, expectedDaysAgo, expectedHoursAgo, expectedMinutesAgo }) => {
      const result = parseTimeWindow(input)
      const now = new Date()
      const expected = new Date(
        now.getTime() -
          (expectedDaysAgo || 0) * 24 * 60 * 60 * 1000 -
          (expectedHoursAgo || 0) * 60 * 60 * 1000 -
          (expectedMinutesAgo || 0) * 60 * 1000
      )

      expect(result.getTime()).toBe(expected.getTime())
    }
  )

  const errorCases = [
    { input: 'invalid', description: 'invalid format' },
    { input: '24x', description: 'invalid unit' },
    { input: '24', description: 'missing unit' },
    { input: 'h24', description: 'reversed format' },
    { input: '', description: 'empty string' },
    { input: '24s', description: 'unsupported unit (seconds)' }
  ]

  test.each(errorCases)(
    'parseTimeWindow("$input") should throw error for $description',
    ({ input }) => {
      expect(() => parseTimeWindow(input)).toThrow()
    }
  )
})

describe('calculateCheckSuiteStats', () => {
  const testCases = [
    {
      name: 'empty array',
      checkSuites: [],
      expected: {
        total: 0,
        successful: 0,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        other: 0
      }
    },
    {
      name: 'all successful',
      checkSuites: [
        {
          id: 100,
          conclusion: 'success',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:02:00Z',
          status: 'completed',
          head_sha: 'abc123',
          head_branch: 'main',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 1001,
              name: 'CI Tests',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:02:00Z',
              head_sha: 'abc123'
            }
          ]
        },
        {
          id: 101,
          conclusion: 'success',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          status: 'completed',
          head_sha: 'abc123',
          head_branch: 'main',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 1002,
              name: 'Build',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:05:00Z',
              head_sha: 'abc123'
            }
          ]
        }
      ],
      expected: {
        total: 2,
        successful: 2,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        other: 0,
        longest_checkrun: {
          duration_ms: 300000, // 5 minutes
          name: 'Build',
          status: 'completed',
          conclusion: 'success'
        }
      }
    },
    {
      name: 'mixed results',
      checkSuites: [
        {
          id: 200,
          conclusion: 'success',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:03:00Z',
          status: 'completed',
          head_sha: 'def456',
          head_branch: 'feature-a',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 2001,
              name: 'Tests',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:03:00Z',
              head_sha: 'def456'
            }
          ]
        },
        {
          id: 201,
          conclusion: 'failure',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:10:00Z',
          status: 'completed',
          head_sha: 'def456',
          head_branch: 'feature-a',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 2002,
              name: 'Lint',
              status: 'completed',
              conclusion: 'failure',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:10:00Z',
              head_sha: 'def456'
            }
          ]
        },
        {
          id: 202,
          conclusion: 'cancelled',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:01:00Z',
          status: 'completed',
          head_sha: 'def456',
          head_branch: 'feature-a',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 2003,
              name: 'Deploy',
              status: 'completed',
              conclusion: 'cancelled',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:01:00Z',
              head_sha: 'def456'
            }
          ]
        },
        {
          id: 203,
          conclusion: 'neutral',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:02:00Z',
          status: 'completed',
          head_sha: 'def456',
          head_branch: 'feature-a',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 2004,
              name: 'Security',
              status: 'completed',
              conclusion: 'neutral',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:02:00Z',
              head_sha: 'def456'
            }
          ]
        }
      ],
      expected: {
        total: 4,
        successful: 1,
        failed: 1,
        cancelled: 1,
        skipped: 0,
        other: 1,
        longest_checkrun: {
          duration_ms: 600000, // 10 minutes
          name: 'Lint',
          status: 'completed',
          conclusion: 'failure'
        }
      }
    },
    {
      name: 'different failure types',
      checkSuites: [
        {
          id: 300,
          conclusion: 'failure',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:04:00Z',
          status: 'completed',
          head_sha: 'ghi789',
          head_branch: 'develop',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 3001,
              name: 'Test Suite 1',
              status: 'completed',
              conclusion: 'failure',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:04:00Z',
              head_sha: 'ghi789'
            }
          ]
        },
        {
          id: 301,
          conclusion: 'startup_failure',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:01:00Z',
          status: 'completed',
          head_sha: 'ghi789',
          head_branch: 'develop',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 3002,
              name: 'Test Suite 2',
              status: 'completed',
              conclusion: 'startup_failure',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:01:00Z',
              head_sha: 'ghi789'
            }
          ]
        },
        {
          id: 302,
          conclusion: 'timed_out',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:30:00Z',
          status: 'completed',
          head_sha: 'ghi789',
          head_branch: 'develop',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 3003,
              name: 'E2E Tests',
              status: 'completed',
              conclusion: 'timed_out',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:30:00Z',
              head_sha: 'ghi789'
            }
          ]
        }
      ],
      expected: {
        total: 3,
        successful: 0,
        failed: 3,
        cancelled: 0,
        skipped: 0,
        other: 0,
        longest_checkrun: {
          duration_ms: 1800000, // 30 minutes
          name: 'E2E Tests',
          status: 'completed',
          conclusion: 'timed_out'
        }
      }
    },
    {
      name: 'null conclusions',
      checkSuites: [
        {
          id: 400,
          conclusion: null,
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:01:00Z',
          status: 'queued',
          head_sha: 'jkl012',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 4001,
              name: 'Queued Job',
              status: 'queued',
              conclusion: null,
              started_at: null,
              completed_at: null,
              head_sha: 'jkl012'
            }
          ]
        },
        {
          id: 401,
          conclusion: undefined,
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:02:00Z',
          status: 'in_progress',
          head_sha: 'jkl012',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 4002,
              name: 'In Progress Job',
              status: 'in_progress',
              conclusion: null,
              started_at: '2024-01-01T10:00:00Z',
              completed_at: null,
              head_sha: 'jkl012'
            }
          ]
        },
        {
          id: 402,
          conclusion: 'skipped',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          status: 'completed',
          head_sha: 'jkl012',
          head_branch: 'hotfix',
          app: { name: 'GitHub Actions' },
          check_runs: [
            {
              id: 4003,
              name: 'Skipped Job',
              status: 'completed',
              conclusion: 'skipped',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:05:00Z',
              head_sha: 'jkl012'
            }
          ]
        }
      ],
      expected: {
        total: 3,
        successful: 0,
        failed: 0,
        cancelled: 0,
        skipped: 1,
        other: 2,
        longest_checkrun: {
          duration_ms: 300000, // 5 minutes
          name: 'Skipped Job',
          status: 'completed',
          conclusion: 'skipped'
        }
      }
    },
    {
      name: 'checksuite without app name',
      checkSuites: [
        {
          id: 999,
          conclusion: 'success',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:03:00Z',
          status: 'completed',
          head_sha: 'abc123'
        }
      ],
      expected: {
        total: 1,
        successful: 1,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        other: 0,
        longest_checkrun: {
          duration_ms: 180000, // 3 minutes
          name: 'Check Suite #999',
          status: 'completed',
          conclusion: 'success'
        }
      }
    }
  ]

  test.each(testCases)('$name', ({ checkSuites, expected }) => {
    const result = calculateCheckSuiteStats(checkSuites as any)
    expect(result).toEqual(expected)
  })
})

describe('calculateWallToWallDuration', () => {
  const testCases = [
    {
      name: 'empty checksuites',
      checkSuites: [],
      expected: 0
    },
    {
      name: 'single checksuite with check runs',
      checkSuites: [
        {
          id: 1,
          created_at: '2024-01-01T09:55:00Z', // created earlier (queuing)
          updated_at: '2024-01-01T10:05:00Z',
          status: 'completed',
          conclusion: 'success',
          head_sha: 'abc123',
          check_runs: [
            {
              id: 101,
              name: 'CI',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:00:00Z', // actual start
              completed_at: '2024-01-01T10:03:00Z', // actual end
              head_sha: 'abc123'
            }
          ]
        }
      ],
      expected: 180000 // 3 minutes actual run time (not 10 minutes from created_at)
    },
    {
      name: 'multiple overlapping check runs',
      checkSuites: [
        {
          id: 2,
          created_at: '2024-01-01T09:50:00Z',
          updated_at: '2024-01-01T10:08:00Z',
          status: 'completed',
          conclusion: 'success',
          head_sha: 'def456',
          check_runs: [
            {
              id: 201,
              name: 'Build',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:05:00Z',
              head_sha: 'def456'
            },
            {
              id: 202,
              name: 'Test',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:02:00Z',
              completed_at: '2024-01-01T10:08:00Z',
              head_sha: 'def456'
            }
          ]
        }
      ],
      expected: 480000 // 8 minutes (10:00 to 10:08) based on check runs
    },
    {
      name: 'check runs across multiple checksuites',
      checkSuites: [
        {
          id: 3,
          created_at: '2024-01-01T09:55:00Z',
          updated_at: '2024-01-01T10:03:00Z',
          status: 'completed',
          conclusion: 'success',
          head_sha: 'ghi789',
          check_runs: [
            {
              id: 301,
              name: 'Lint',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:00:00Z',
              completed_at: '2024-01-01T10:02:00Z',
              head_sha: 'ghi789'
            }
          ]
        },
        {
          id: 4,
          created_at: '2024-01-01T09:58:00Z',
          updated_at: '2024-01-01T10:07:00Z',
          status: 'completed',
          conclusion: 'success',
          head_sha: 'ghi789',
          check_runs: [
            {
              id: 401,
              name: 'E2E',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:01:00Z',
              completed_at: '2024-01-01T10:07:00Z',
              head_sha: 'ghi789'
            }
          ]
        }
      ],
      expected: 420000 // 7 minutes (10:00 to 10:07) across both suites
    },
    {
      name: 'fallback to checksuite times when no check runs',
      checkSuites: [
        {
          id: 5,
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:05:00Z',
          status: 'completed',
          conclusion: 'success',
          head_sha: 'jkl012'
          // No check_runs field
        }
      ],
      expected: 300000 // 5 minutes fallback to created/updated times
    },
    {
      name: 'ignores check runs with null timestamps',
      checkSuites: [
        {
          id: 6,
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:10:00Z',
          status: 'completed',
          conclusion: 'success',
          head_sha: 'mno345',
          check_runs: [
            {
              id: 601,
              name: 'Queued',
              status: 'queued',
              conclusion: null,
              started_at: null,
              completed_at: null,
              head_sha: 'mno345'
            },
            {
              id: 602,
              name: 'Completed',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T10:02:00Z',
              completed_at: '2024-01-01T10:06:00Z',
              head_sha: 'mno345'
            }
          ]
        }
      ],
      expected: 240000 // 4 minutes from valid check run (ignores null timestamps)
    },
    {
      name: 'very long duration with check runs',
      checkSuites: [
        {
          id: 7,
          created_at: '2024-01-01T08:50:00Z',
          updated_at: '2024-01-01T11:30:00Z',
          status: 'completed',
          conclusion: 'success',
          head_sha: 'pqr678',
          check_runs: [
            {
              id: 701,
              name: 'Long Test',
              status: 'completed',
              conclusion: 'success',
              started_at: '2024-01-01T09:00:00Z',
              completed_at: '2024-01-01T11:30:00Z',
              head_sha: 'pqr678'
            }
          ]
        }
      ],
      expected: 9000000 // 2.5 hours actual run time
    }
  ]

  test.each(testCases)('$name', ({ checkSuites, expected }) => {
    const result = calculateWallToWallDuration(checkSuites as any)
    expect(result).toBe(expected)
  })
})

describe('formatCommitData', () => {
  const testCases = [
    {
      name: 'basic commit formatting',
      commit: {
        sha: 'abc123def456',
        commit: {
          committer: {
            email: 'user@example.com',
            date: '2024-01-01T10:00:00Z'
          }
        }
      },
      owner: 'testowner',
      repo: 'testrepo',
      expected: {
        sha: 'abc123def456',
        timestamp: '2024-01-01T10:00:00Z',
        committer_email: 'user@example.com',
        url: 'https://github.com/testowner/testrepo/commit/abc123def456'
      }
    },
    {
      name: 'commit with special characters in email',
      commit: {
        sha: '789xyz',
        commit: {
          committer: {
            email: 'user+test@example.co.uk',
            date: '2024-02-01T15:30:45Z'
          }
        }
      },
      owner: 'org',
      repo: 'my-repo',
      expected: {
        sha: '789xyz',
        timestamp: '2024-02-01T15:30:45Z',
        committer_email: 'user+test@example.co.uk',
        url: 'https://github.com/org/my-repo/commit/789xyz'
      }
    }
  ]

  test.each(testCases)('$name', ({ commit, owner, repo, expected }) => {
    const result = formatCommitData(commit as any, owner, repo)
    expect(result).toEqual(expected)
  })
})

describe('calculateSummary', () => {
  const testCases = [
    {
      name: 'empty analyses',
      analyses: [],
      expected: { total_commits: 0, successful_commits: 0, failed_commits: 0 }
    },
    {
      name: 'all successful commits',
      analyses: [
        { error: undefined, stats: { failed: 0 } },
        { error: undefined, stats: { failed: 0 } }
      ],
      expected: { total_commits: 2, successful_commits: 2, failed_commits: 0 }
    },
    {
      name: 'mixed success and failure',
      analyses: [
        { error: undefined, stats: { failed: 0 } }, // successful
        { error: 'API Error', stats: { failed: 0 } }, // error
        { error: undefined, stats: { failed: 2 } }, // has failures
        { error: undefined, stats: { failed: 0 } } // successful
      ],
      expected: { total_commits: 4, successful_commits: 2, failed_commits: 2 }
    },
    {
      name: 'all failed commits',
      analyses: [
        { error: 'Network error', stats: { failed: 0 } },
        { error: undefined, stats: { failed: 1 } }
      ],
      expected: { total_commits: 2, successful_commits: 0, failed_commits: 2 }
    }
  ]

  test.each(testCases)('$name', ({ analyses, expected }) => {
    const result = calculateSummary(analyses as any)
    expect(result).toEqual(expected)
  })
})

describe('createCortexDeployPayload', () => {
  test('creates payload with all fields populated', () => {
    const analysis = {
      commit: {
        sha: 'abc123def456789012345678901234567890abcd',
        timestamp: '2024-03-04T12:00:00Z',
        committer_email: 'john.doe@example.com',
        url: 'https://github.com/owner/repo/commit/abc123def456'
      },
      checksuites: [],
      duration_ms: 270,
      stats: {
        total: 3,
        successful: 2,
        failed: 1,
        cancelled: 0,
        skipped: 0,
        other: 0
      }
    }

    const config = {
      apiKey: 'test-key',
      entityId: 'my-service',
      environment: 'production',
      titleTemplate: 'Deploy {sha} to {branch}',
      postPerCommit: true
    }

    const payload = createCortexDeployPayload(analysis as any, config, 'main')

    expect(payload.timestamp).toBe('2024-03-04T12:00:00Z')
    expect(payload.title).toBe('Deploy abc123d to main')
    expect(payload.type).toBe('DEPLOY')
    expect(payload.deployer?.email).toBe('john.doe@example.com')
    expect(payload.deployer?.name).toBe('john.doe')
    expect(payload.environment).toBe('production')
    expect(payload.sha).toBe('abc123def456789012345678901234567890abcd')
    expect(payload.url).toBe(
      'https://github.com/owner/repo/commit/abc123def456'
    )
    expect(payload.customData?.duration_ms).toBe(270)
    expect(payload.customData?.checksuite_stats).toEqual(analysis.stats)
  })

  test('handles custom title template with email', () => {
    const analysis = {
      commit: {
        sha: 'xyz789',
        timestamp: '2024-03-04T12:00:00Z',
        committer_email: 'user@company.com',
        url: 'https://github.com/owner/repo/commit/xyz789'
      },
      checksuites: [],
      duration_ms: 100,
      stats: { total: 1, successful: 1, failed: 0, cancelled: 0, other: 0 }
    }

    const config = {
      apiKey: 'test-key',
      entityId: 'my-service',
      environment: 'staging',
      titleTemplate: '{email} deployed {sha}',
      postPerCommit: true
    }

    const payload = createCortexDeployPayload(
      analysis as any,
      config,
      'develop'
    )

    expect(payload.title).toBe('user@company.com deployed xyz789')
  })

  test('extracts deployer name from email', () => {
    const analysis = {
      commit: {
        sha: 'abc123',
        timestamp: '2024-03-04T12:00:00Z',
        committer_email: 'first.last+tag@domain.co.uk',
        url: 'https://github.com/owner/repo/commit/abc123'
      },
      checksuites: [],
      duration_ms: 50,
      stats: { total: 0, successful: 0, failed: 0, cancelled: 0, other: 0 }
    }

    const config = {
      apiKey: 'test-key',
      entityId: 'my-service',
      environment: 'production',
      titleTemplate: 'Deploy {sha} to {branch}',
      postPerCommit: true
    }

    const payload = createCortexDeployPayload(analysis as any, config, 'main')

    expect(payload.deployer?.name).toBe('first.last+tag')
    expect(payload.deployer?.email).toBe('first.last+tag@domain.co.uk')
  })
})

describe('shouldPostToCortex', () => {
  const config = {
    apiKey: 'test-key',
    entityId: 'my-service',
    environment: 'production',
    titleTemplate: 'Deploy {sha} to {branch}',
    postPerCommit: true
  }

  test('posts all commits when postPerCommit is true', () => {
    const successfulCommit = {
      commit: { sha: 'abc123' },
      stats: { failed: 0 }
    }
    const failedCommit = {
      commit: { sha: 'def456' },
      stats: { failed: 2 }
    }
    const errorCommit = {
      commit: { sha: 'ghi789' },
      error: 'API Error',
      stats: { failed: 0 }
    }

    expect(shouldPostToCortex(successfulCommit as any, config)).toBe(true)
    expect(shouldPostToCortex(failedCommit as any, config)).toBe(true)
    expect(shouldPostToCortex(errorCommit as any, config)).toBe(true)
  })

  test('skips failed commits when postPerCommit is false', () => {
    const configNoFailed = { ...config, postPerCommit: false }

    const successfulCommit = {
      commit: { sha: 'abc123' },
      stats: { failed: 0 }
    }
    const failedCommit = {
      commit: { sha: 'def456' },
      stats: { failed: 2 }
    }
    const errorCommit = {
      commit: { sha: 'ghi789' },
      error: 'API Error',
      stats: { failed: 0 }
    }

    expect(shouldPostToCortex(successfulCommit as any, configNoFailed)).toBe(
      true
    )
    expect(shouldPostToCortex(failedCommit as any, configNoFailed)).toBe(false)
    expect(shouldPostToCortex(errorCommit as any, configNoFailed)).toBe(false)
  })

  test('posts commits with cancelled or other statuses when postPerCommit is false', () => {
    const configNoFailed = { ...config, postPerCommit: false }

    const cancelledCommit = {
      commit: { sha: 'abc123' },
      stats: { failed: 0, cancelled: 1 }
    }

    expect(shouldPostToCortex(cancelledCommit as any, configNoFailed)).toBe(
      true
    )
  })
})
