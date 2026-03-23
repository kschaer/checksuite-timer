import * as core from '@actions/core'
import { CortexDeployPayload, CortexDeployResponse } from './core'

// Cortex API response types based on official API spec
// https://docs.cortex.io/api/readme/deploys
export interface CortexDeploy {
  // Required fields
  uuid: string
  timestamp: string // ISO 8601 date-time
  title: string
  type: 'DEPLOY' | 'SCALE' | 'ROLLBACK' | 'RESTART'

  // Optional fields
  environment?: string
  sha?: string
  url?: string
  customData?: Record<string, unknown>
  deployer?: {
    name?: string
    email?: string
  }
  // Deprecated fields (not used)
  deployerEmail?: string
  deployerName?: string
}

// Response from GET /api/v1/catalog/{tag}/deploys
// API type: CustomDeployListPaginatedResponse
export interface CortexDeploysResponse {
  deployments: CortexDeploy[] // Required
  page: number // Required, int32
  totalPages: number // Required, int32
  total: number // Required, int32
}

// Interface for Cortex API operations - easily mockable for testing
export interface CortexClient {
  getDeploys(entityId: string, page?: number): Promise<CortexDeploysResponse>
  createDeploy(
    entityId: string,
    payload: CortexDeployPayload
  ): Promise<CortexDeployResponse>
  updateDeploy(
    entityId: string,
    uuid: string,
    payload: CortexDeployPayload
  ): Promise<CortexDeployResponse>
}

// Real implementation using Cortex API
export class CortexApiClient implements CortexClient {
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.getcortexapp.com/api/v1'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async getDeploys(entityId: string, page = 0): Promise<CortexDeploysResponse> {
    const url = `${this.baseUrl}/catalog/${entityId}/deploys?page=${page}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      await this.handleErrorResponse(response, entityId)
    }

    // According to API spec, all fields are required
    // But we add defensive handling for robustness
    const data = (await response.json()) as CortexDeploysResponse

    // Defensive: handle null or malformed responses
    if (!data || typeof data !== 'object') {
      core.debug(
        `Cortex API returned invalid response (expected object, got ${typeof data}), using empty defaults`
      )
      return {
        deployments: [],
        page,
        totalPages: 0,
        total: 0
      }
    }

    // Defensive: ensure deployments is an array
    if (!Array.isArray(data.deployments)) {
      core.debug(
        `Cortex API returned invalid deployments field (expected array, got ${typeof data.deployments}), using empty array`
      )
      data.deployments = []
    }

    // Ensure numeric fields have defaults
    return {
      deployments: data.deployments,
      page: typeof data.page === 'number' ? data.page : page,
      totalPages: typeof data.totalPages === 'number' ? data.totalPages : 0,
      total: typeof data.total === 'number' ? data.total : 0
    }
  }

  async createDeploy(
    entityId: string,
    payload: CortexDeployPayload
  ): Promise<CortexDeployResponse> {
    const url = `${this.baseUrl}/catalog/${entityId}/deploys`

    core.debug(`Creating deploy in Cortex: ${JSON.stringify(payload)}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      await this.handleErrorResponse(response, entityId)
    }

    return (await response.json()) as CortexDeployResponse
  }

  async updateDeploy(
    entityId: string,
    uuid: string,
    payload: CortexDeployPayload
  ): Promise<CortexDeployResponse> {
    const url = `${this.baseUrl}/catalog/${entityId}/deploys/${uuid}`

    core.debug(
      `Updating deploy in Cortex (${uuid}): ${JSON.stringify(payload)}`
    )

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      await this.handleErrorResponse(response, entityId)
    }

    return (await response.json()) as CortexDeployResponse
  }

  private async handleErrorResponse(
    response: Response,
    entityId: string
  ): Promise<never> {
    const errorText = await response.text()

    // Handle specific error cases
    if (response.status === 404) {
      throw new Error(
        `Cortex entity '${entityId}' not found. Please verify the entity ID exists in Cortex.`
      )
    } else if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      throw new Error(
        `Cortex API rate limit exceeded${retryAfter ? `. Retry after ${retryAfter} seconds` : ''}`
      )
    } else if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Cortex API authentication failed. Please verify your API key is valid and has "Edit entities" permission.'
      )
    }

    throw new Error(
      `Cortex API request failed with status ${response.status}: ${errorText}`
    )
  }
}

// Factory function for creating Cortex client
export function createCortexClient(apiKey: string): CortexClient {
  return new CortexApiClient(apiKey)
}
