import { CortexApiClient } from '../src/cortex-client'
import { CortexDeployPayload } from '../src/core'

// Mock fetch globally
global.fetch = jest.fn()

describe('CortexApiClient', () => {
  let client: CortexApiClient
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    client = new CortexApiClient('test-api-key')
    mockFetch.mockReset()
  })

  describe('getDeploys', () => {
    test('successfully fetches deploys', async () => {
      const mockResponse = {
        deployments: [
          {
            uuid: 'deploy-1',
            sha: 'abc123',
            environment: 'production'
          }
        ],
        page: 0,
        totalPages: 1,
        total: 1
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const result = await client.getDeploys('my-service', 0)

      expect(result).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.getcortexapp.com/api/v1/catalog/my-service/deploys?page=0',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json'
          }
        })
      )
    })

    test('defaults to page 0', async () => {
      const mockResponse = {
        deployments: [],
        page: 0,
        totalPages: 0,
        total: 0
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response)

      await client.getDeploys('my-service')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=0'),
        expect.anything()
      )
    })

    test('handles 404 entity not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found'
      } as Response)

      await expect(client.getDeploys('nonexistent')).rejects.toThrow(
        "Cortex entity 'nonexistent' not found"
      )
    })

    test('handles malformed response with missing deploys field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ page: 0, totalPages: 0 }) // Missing deploys field
      } as Response)

      const result = await client.getDeploys('my-service')

      expect(result.deployments).toEqual([])
      expect(result.page).toBe(0)
      expect(result.totalPages).toBe(0)
      expect(result.total).toBe(0)
    })

    test('handles completely malformed response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => null // Null response
      } as Response)

      const result = await client.getDeploys('my-service')

      expect(result.deployments).toEqual([])
      expect(result.page).toBe(0)
      expect(result.totalPages).toBe(0)
      expect(result.total).toBe(0)
    })

    test('handles response with non-array deploys', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ deploys: 'not-an-array', page: 0 }) // Wrong type
      } as Response)

      const result = await client.getDeploys('my-service')

      expect(result.deployments).toEqual([])
    })
  })

  describe('createDeploy', () => {
    test('successfully creates deploy', async () => {
      const mockResponse = { uuid: 'deploy-uuid-123', id: 123 }
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const payload: CortexDeployPayload = {
        timestamp: '2024-03-04T12:00:00Z',
        title: 'Deploy abc123 to main',
        type: 'DEPLOY',
        sha: 'abc123'
      }

      const result = await client.createDeploy('my-service', payload)

      expect(result.uuid).toBe('deploy-uuid-123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.getcortexapp.com/api/v1/catalog/my-service/deploys',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })
      )
    })

    test('includes all optional fields in payload', async () => {
      const mockResponse = { uuid: 'deploy-123', id: 456 }
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const payload: CortexDeployPayload = {
        timestamp: '2024-03-04T12:00:00Z',
        title: 'Deploy abc123 to main',
        type: 'DEPLOY',
        deployer: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        environment: 'production',
        sha: 'abc123',
        url: 'https://github.com/owner/repo/commit/abc123',
        customData: {
          duration_ms: 270,
          checksuite_stats: { total: 3, successful: 2, failed: 1 }
        }
      }

      await client.createDeploy('my-service', payload)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: JSON.stringify(payload)
        })
      )
    })
  })

  describe('updateDeploy', () => {
    test('successfully updates deploy', async () => {
      const mockResponse = { uuid: 'deploy-uuid-123', id: 123 }
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const payload: CortexDeployPayload = {
        timestamp: '2024-03-04T12:00:00Z',
        title: 'Deploy abc123 to main',
        type: 'DEPLOY',
        sha: 'abc123'
      }

      const result = await client.updateDeploy(
        'my-service',
        'existing-uuid',
        payload
      )

      expect(result.uuid).toBe('deploy-uuid-123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.getcortexapp.com/api/v1/catalog/my-service/deploys/existing-uuid',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })
      )
    })
  })

  describe('error handling', () => {
    test('handles 404 entity not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found'
      } as Response)

      await expect(
        client.createDeploy('nonexistent', {} as CortexDeployPayload)
      ).rejects.toThrow("entity 'nonexistent' not found")
    })

    test('handles 429 rate limit with Retry-After header', async () => {
      const headers = new Headers()
      headers.set('Retry-After', '60')

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers,
        text: async () => 'Rate Limited'
      } as Response)

      await expect(
        client.createDeploy('my-service', {} as CortexDeployPayload)
      ).rejects.toThrow('rate limit exceeded')
      await expect(
        client.createDeploy('my-service', {} as CortexDeployPayload)
      ).rejects.toThrow('Retry after 60 seconds')
    })

    test('handles 429 rate limit without Retry-After header', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers(),
        text: async () => 'Rate Limited'
      } as Response)

      await expect(
        client.createDeploy('my-service', {} as CortexDeployPayload)
      ).rejects.toThrow('rate limit exceeded')
    })

    test('handles 401 authentication error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      } as Response)

      await expect(
        client.createDeploy('my-service', {} as CortexDeployPayload)
      ).rejects.toThrow('authentication failed')
      await expect(
        client.createDeploy('my-service', {} as CortexDeployPayload)
      ).rejects.toThrow('verify your API key')
    })

    test('handles 403 forbidden error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden'
      } as Response)

      await expect(
        client.createDeploy('my-service', {} as CortexDeployPayload)
      ).rejects.toThrow('authentication failed')
    })

    test('handles generic API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      } as Response)

      await expect(
        client.createDeploy('my-service', {} as CortexDeployPayload)
      ).rejects.toThrow('failed with status 500')
      await expect(
        client.createDeploy('my-service', {} as CortexDeployPayload)
      ).rejects.toThrow('Internal Server Error')
    })

    test('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'))

      await expect(
        client.createDeploy('my-service', {} as CortexDeployPayload)
      ).rejects.toThrow('Network failure')
    })
  })
})
