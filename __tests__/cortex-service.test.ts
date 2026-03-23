import { CortexService } from '../src/cortex-service'
import { CortexClient, CortexDeploy } from '../src/cortex-client'
import { CommitAnalysis, CortexConfig } from '../src/core'
import * as core from '@actions/core'

// Mock @actions/core
jest.mock('@actions/core')

const createMockCortexClient = (): jest.Mocked<CortexClient> => ({
  getDeploys: jest.fn(),
  createDeploy: jest.fn(),
  updateDeploy: jest.fn()
})

describe('CortexService', () => {
  let mockClient: jest.Mocked<CortexClient>
  let service: CortexService
  let config: CortexConfig

  beforeEach(() => {
    mockClient = createMockCortexClient()
    config = {
      apiKey: 'test-key',
      entityId: 'my-service',
      environment: 'production',
      titleTemplate: 'Deploy {sha} to {branch}',
      postPerCommit: true
    }
    service = new CortexService(mockClient, config)
    jest.clearAllMocks()
  })

  describe('fetchAllDeploys', () => {
    test('fetches all pages of deploys', async () => {
      mockClient.getDeploys
        .mockResolvedValueOnce({
          deployments: [
            {
              uuid: 'deploy-1',
              sha: 'abc123',
              environment: 'production'
            } as CortexDeploy
          ],
          page: 0,
          totalPages: 2,
          total: 2
        })
        .mockResolvedValueOnce({
          deployments: [
            {
              uuid: 'deploy-2',
              sha: 'def456',
              environment: 'production'
            } as CortexDeploy
          ],
          page: 1,
          totalPages: 2,
          total: 2
        })

      const result = await service.fetchAllDeploys('my-service')

      expect(result).toHaveLength(2)
      expect(result[0].uuid).toBe('deploy-1')
      expect(result[1].uuid).toBe('deploy-2')
      expect(mockClient.getDeploys).toHaveBeenCalledTimes(2)
      expect(mockClient.getDeploys).toHaveBeenCalledWith('my-service', 0)
      expect(mockClient.getDeploys).toHaveBeenCalledWith('my-service', 1)
    })

    test('caches deploys for subsequent calls', async () => {
      mockClient.getDeploys.mockResolvedValue({
        deployments: [
          {
            uuid: 'deploy-1',
            sha: 'abc123',
            environment: 'production'
          } as CortexDeploy
        ],
        page: 0,
        totalPages: 1,
        total: 1
      })

      const result1 = await service.fetchAllDeploys('my-service')
      const result2 = await service.fetchAllDeploys('my-service')

      expect(result1).toBe(result2) // Same reference
      expect(mockClient.getDeploys).toHaveBeenCalledTimes(1) // Only called once
    })

    test('handles single page response', async () => {
      mockClient.getDeploys.mockResolvedValue({
        deployments: [
          {
            uuid: 'deploy-1',
            sha: 'abc123',
            environment: 'production'
          } as CortexDeploy
        ],
        page: 0,
        totalPages: 1,
        total: 1
      })

      const result = await service.fetchAllDeploys('my-service')

      expect(result).toHaveLength(1)
      expect(mockClient.getDeploys).toHaveBeenCalledTimes(1)
    })

    test('handles empty deploys', async () => {
      mockClient.getDeploys.mockResolvedValue({
        deployments: [],
        page: 0,
        totalPages: 0,
        total: 0
      })

      const result = await service.fetchAllDeploys('my-service')

      expect(result).toHaveLength(0)
    })

    test('handles fetch errors gracefully', async () => {
      mockClient.getDeploys.mockRejectedValue(new Error('API Error'))

      const result = await service.fetchAllDeploys('my-service')

      expect(result).toEqual([])
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch existing deploys')
      )
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('CREATE-only mode')
      )
    })
  })

  describe('findExistingDeploy', () => {
    test('finds deploy by sha and environment', () => {
      const deploys = [
        {
          uuid: 'deploy-1',
          sha: 'abc123',
          environment: 'production'
        } as CortexDeploy,
        {
          uuid: 'deploy-2',
          sha: 'def456',
          environment: 'staging'
        } as CortexDeploy,
        {
          uuid: 'deploy-3',
          sha: 'abc123',
          environment: 'staging'
        } as CortexDeploy
      ]

      const result = service.findExistingDeploy('abc123', 'production', deploys)

      expect(result).toBe('deploy-1')
    })

    test('returns null when no match found', () => {
      const deploys = [
        {
          uuid: 'deploy-1',
          sha: 'abc123',
          environment: 'production'
        } as CortexDeploy
      ]

      const result = service.findExistingDeploy('xyz789', 'production', deploys)

      expect(result).toBeNull()
    })

    test('distinguishes between environments', () => {
      const deploys = [
        {
          uuid: 'deploy-1',
          sha: 'abc123',
          environment: 'production'
        } as CortexDeploy,
        {
          uuid: 'deploy-2',
          sha: 'abc123',
          environment: 'staging'
        } as CortexDeploy
      ]

      const resultProd = service.findExistingDeploy(
        'abc123',
        'production',
        deploys
      )
      const resultStaging = service.findExistingDeploy(
        'abc123',
        'staging',
        deploys
      )

      expect(resultProd).toBe('deploy-1')
      expect(resultStaging).toBe('deploy-2')
    })
  })

  describe('postDeploy', () => {
    const analysis: CommitAnalysis = {
      commit: {
        sha: 'abc123',
        timestamp: '2024-03-04T12:00:00Z',
        committer_email: 'user@example.com',
        url: 'https://github.com/owner/repo/commit/abc123'
      },
      checksuites: [],
      duration_ms: 270,
      stats: {
        total: 1,
        successful: 1,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        other: 0
      }
    }

    test('creates new deploy when not exists', async () => {
      mockClient.createDeploy.mockResolvedValue({ id: 'deploy-123' })

      const result = await service.postDeploy(analysis, 'main', [])

      expect(result.success).toBe(true)
      expect(result.id).toBe('deploy-123')
      expect(result.action).toBe('created')
      expect(mockClient.createDeploy).toHaveBeenCalledWith(
        'my-service',
        expect.objectContaining({
          sha: 'abc123',
          environment: 'production'
        })
      )
      expect(mockClient.updateDeploy).not.toHaveBeenCalled()
    })

    test('updates existing deploy when found', async () => {
      const existingDeploys = [
        {
          uuid: 'existing-uuid',
          sha: 'abc123',
          environment: 'production'
        } as CortexDeploy
      ]
      mockClient.updateDeploy.mockResolvedValue({ id: 'deploy-123' })

      const result = await service.postDeploy(analysis, 'main', existingDeploys)

      expect(result.success).toBe(true)
      expect(result.id).toBe('deploy-123')
      expect(result.action).toBe('updated')
      expect(mockClient.updateDeploy).toHaveBeenCalledWith(
        'my-service',
        'existing-uuid',
        expect.objectContaining({
          sha: 'abc123',
          environment: 'production'
        })
      )
      expect(mockClient.createDeploy).not.toHaveBeenCalled()
    })

    test('handles create error gracefully', async () => {
      mockClient.createDeploy.mockRejectedValue(new Error('API Error'))

      const result = await service.postDeploy(analysis, 'main', [])

      expect(result.success).toBe(false)
      expect(result.error).toBe('API Error')
      expect(result.action).toBe('failed')
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to post deploy to Cortex')
      )
    })

    test('handles update error gracefully', async () => {
      const existingDeploys = [
        {
          uuid: 'existing-uuid',
          sha: 'abc123',
          environment: 'production'
        } as CortexDeploy
      ]
      mockClient.updateDeploy.mockRejectedValue(new Error('Network Error'))

      const result = await service.postDeploy(analysis, 'main', existingDeploys)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network Error')
      expect(result.action).toBe('failed')
    })
  })

  describe('postDeploys', () => {
    const analyses: CommitAnalysis[] = [
      {
        commit: {
          sha: 'abc123',
          timestamp: '2024-03-04T12:00:00Z',
          committer_email: 'user@example.com',
          url: 'https://github.com/owner/repo/commit/abc123'
        },
        checksuites: [],
        duration_ms: 270,
        stats: {
          total: 1,
          successful: 1,
          failed: 0,
          cancelled: 0,
          skipped: 0,
          other: 0
        }
      },
      {
        commit: {
          sha: 'def456',
          timestamp: '2024-03-04T13:00:00Z',
          committer_email: 'user@example.com',
          url: 'https://github.com/owner/repo/commit/def456'
        },
        checksuites: [],
        duration_ms: 150,
        stats: {
          total: 1,
          successful: 0,
          failed: 1,
          cancelled: 0,
          skipped: 0,
          other: 0
        }
      },
      {
        commit: {
          sha: 'ghi789',
          timestamp: '2024-03-04T14:00:00Z',
          committer_email: 'user@example.com',
          url: 'https://github.com/owner/repo/commit/ghi789'
        },
        checksuites: [],
        duration_ms: 200,
        error: 'API Error',
        stats: {
          total: 0,
          successful: 0,
          failed: 0,
          cancelled: 0,
          skipped: 0,
          other: 0
        }
      }
    ]

    test('posts all commits when postPerCommit is true', async () => {
      mockClient.getDeploys.mockResolvedValue({
        deployments: [],
        page: 0,
        totalPages: 0,
        total: 0
      })
      mockClient.createDeploy.mockResolvedValue({ id: 'deploy-123' })

      const results = await service.postDeploys(analyses, 'main')

      expect(results.total).toBe(3)
      expect(results.successful).toBe(3)
      expect(results.created).toBe(3)
      expect(results.updated).toBe(0)
      expect(results.failed).toBe(0)
      expect(results.skipped).toBe(0)
      expect(mockClient.createDeploy).toHaveBeenCalledTimes(3)
    })

    test('skips failed commits when postPerCommit is false', async () => {
      config.postPerCommit = false
      service = new CortexService(mockClient, config)

      mockClient.getDeploys.mockResolvedValue({
        deployments: [],
        page: 0,
        totalPages: 0,
        total: 0
      })
      mockClient.createDeploy.mockResolvedValue({ id: 'deploy-123' })

      const results = await service.postDeploys(analyses, 'main')

      expect(results.total).toBe(3)
      expect(results.successful).toBe(1)
      expect(results.created).toBe(1)
      expect(results.skipped).toBe(2) // Failed commit and error commit
      expect(mockClient.createDeploy).toHaveBeenCalledTimes(1)
    })

    test('updates existing deploys idempotently', async () => {
      mockClient.getDeploys.mockResolvedValue({
        deployments: [
          {
            uuid: 'existing-1',
            sha: 'abc123',
            environment: 'production'
          } as CortexDeploy
        ],
        page: 0,
        totalPages: 1,
        total: 1
      })
      mockClient.createDeploy.mockResolvedValue({ id: 'new-deploy' })
      mockClient.updateDeploy.mockResolvedValue({ id: 'updated-deploy' })

      const results = await service.postDeploys(analyses, 'main')

      expect(results.total).toBe(3)
      expect(results.successful).toBe(3)
      expect(results.created).toBe(2) // def456 and ghi789
      expect(results.updated).toBe(1) // abc123
      expect(mockClient.updateDeploy).toHaveBeenCalledTimes(1)
      expect(mockClient.createDeploy).toHaveBeenCalledTimes(2)
    })

    test('handles mixed success and failure', async () => {
      mockClient.getDeploys.mockResolvedValue({
        deployments: [],
        page: 0,
        totalPages: 0,
        total: 0
      })
      mockClient.createDeploy
        .mockResolvedValueOnce({ id: 'deploy-1' })
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({ id: 'deploy-3' })

      const results = await service.postDeploys(analyses, 'main')

      expect(results.total).toBe(3)
      expect(results.successful).toBe(2)
      expect(results.failed).toBe(1)
      expect(results.created).toBe(2)
    })

    test('handles empty analyses array', async () => {
      mockClient.getDeploys.mockResolvedValue({
        deployments: [],
        page: 0,
        totalPages: 0,
        total: 0
      })

      const results = await service.postDeploys([], 'main')

      expect(results.total).toBe(0)
      expect(results.successful).toBe(0)
      expect(results.failed).toBe(0)
      expect(results.skipped).toBe(0)
      expect(mockClient.createDeploy).not.toHaveBeenCalled()
    })
  })
})
