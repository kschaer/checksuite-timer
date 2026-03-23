import * as core from '@actions/core'
import { CortexDeployPayload, CortexDeployResponse } from './core'

// Cortex API response types
export interface CortexDeploy {
  uuid: string
  timestamp: string
  title: string
  type: string
  environment?: string
  sha?: string
  url?: string
  customData?: Record<string, unknown>
  deployer?: {
    name?: string
    email?: string
  }
}

export interface CortexDeploysResponse {
  deployments: CortexDeploy[]
  page: number
  totalPages: number
  total: number
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

    const data = (await response.json()) as any

    // Defensive handling: ensure the response has the expected structure
    if (!data || typeof data !== 'object') {
      core.debug(
        `Unexpected Cortex API response format: ${JSON.stringify(data)}`
      )
      return {
        deployments: [],
        page: 0,
        totalPages: 0,
        total: 0
      }
    }

    // Return with defaults for missing fields
    return {
      deployments: Array.isArray(data.deployments) ? data.deployments : [],
      page: typeof data.page === 'number' ? data.page : page,
      totalPages: typeof data.totalPages === 'number' ? data.totalPages : 1,
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
