import {
  parseTimeWindow,
  calculateCheckSuiteStats,
  calculateWallToWallDuration,
  formatCommitData,
  createCommitAnalysis,
  calculateSummary
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

  test.each(testCases)('parseTimeWindow("$input") should return date $expectedHoursAgo hours/$expectedMinutesAgo minutes ago', 
    ({ input, expectedHoursAgo, expectedMinutesAgo }) => {
      const result = parseTimeWindow(input)
      const now = new Date()
      const expected = new Date(now.getTime() - 
        ((expectedHoursAgo || 0) * 60 * 60 * 1000) - 
        ((expectedMinutesAgo || 0) * 60 * 1000)
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

  test.each(errorCases)('parseTimeWindow("$input") should throw error for $description', ({ input }) => {
    expect(() => parseTimeWindow(input)).toThrow()
  })
})

describe('calculateCheckSuiteStats', () => {
  const testCases = [
    {
      name: 'empty array',
      checkSuites: [],
      expected: { total: 0, successful: 0, failed: 0, cancelled: 0, other: 0 }
    },
    {
      name: 'all successful',
      checkSuites: [
        { conclusion: 'success' },
        { conclusion: 'success' }
      ],
      expected: { total: 2, successful: 2, failed: 0, cancelled: 0, other: 0 }
    },
    {
      name: 'mixed results',
      checkSuites: [
        { conclusion: 'success' },
        { conclusion: 'failure' },
        { conclusion: 'cancelled' },
        { conclusion: 'neutral' }
      ],
      expected: { total: 4, successful: 1, failed: 1, cancelled: 1, other: 1 }
    },
    {
      name: 'different failure types',
      checkSuites: [
        { conclusion: 'failure' },
        { conclusion: 'startup_failure' },
        { conclusion: 'timed_out' }
      ],
      expected: { total: 3, successful: 0, failed: 3, cancelled: 0, other: 0 }
    },
    {
      name: 'null conclusions',
      checkSuites: [
        { conclusion: null },
        { conclusion: undefined },
        { conclusion: 'skipped' }
      ],
      expected: { total: 3, successful: 0, failed: 0, cancelled: 0, other: 3 }
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
      name: 'single checksuite',
      checkSuites: [
        { 
          created_at: '2024-01-01T10:00:00Z', 
          updated_at: '2024-01-01T10:05:00Z' 
        }
      ],
      expected: 300 // 5 minutes
    },
    {
      name: 'multiple overlapping checksuites',
      checkSuites: [
        { created_at: '2024-01-01T10:00:00Z', updated_at: '2024-01-01T10:03:00Z' },
        { created_at: '2024-01-01T10:01:00Z', updated_at: '2024-01-01T10:08:00Z' }
      ],
      expected: 480 // 8 minutes (10:00 to 10:08)
    },
    {
      name: 'checksuites with gaps',
      checkSuites: [
        { created_at: '2024-01-01T10:00:00Z', updated_at: '2024-01-01T10:02:00Z' },
        { created_at: '2024-01-01T10:05:00Z', updated_at: '2024-01-01T10:07:00Z' }
      ],
      expected: 420 // 7 minutes (10:00 to 10:07, including gap)
    },
    {
      name: 'same start and end times',
      checkSuites: [
        { created_at: '2024-01-01T10:00:00Z', updated_at: '2024-01-01T10:00:00Z' }
      ],
      expected: 0
    },
    {
      name: 'very long duration',
      checkSuites: [
        { created_at: '2024-01-01T09:00:00Z', updated_at: '2024-01-01T11:30:00Z' }
      ],
      expected: 9000 // 2.5 hours
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
        { error: undefined, stats: { failed: 0 } }  // successful
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