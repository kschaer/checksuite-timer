import * as core from '@actions/core'
import { CortexClient, CortexDeploy } from './cortex-client'
import {
  CommitAnalysis,
  CortexConfig,
  createCortexDeployPayload,
  shouldPostToCortex
} from './core'

export interface DeployResult {
  success: boolean
  id?: string
  error?: string
  action: 'created' | 'updated' | 'failed'
}

export interface DeploysResult {
  total: number
  successful: number
  failed: number
  skipped: number
  created: number
  updated: number
}

// Service class for Cortex integration - testable with mocked CortexClient
export class CortexService {
  private deploysCache: CortexDeploy[] | null = null

  constructor(
    private cortexClient: CortexClient,
    private config: CortexConfig
  ) {}

  // Fetch all deploys with pagination and cache them
  async fetchAllDeploys(entityId: string): Promise<CortexDeploy[]> {
    if (this.deploysCache !== null) {
      return this.deploysCache
    }

    const allDeploys: CortexDeploy[] = []
    let page = 0
    let hasMorePages = true

    while (hasMorePages) {
      try {
        const response = await this.cortexClient.getDeploys(entityId, page)
        allDeploys.push(...response.deployments)

        core.debug(
          `Fetched page ${page} of deploys: ${response.deployments.length} deploys (total so far: ${allDeploys.length})`
        )

        // Check if there are more pages
        if (page + 1 >= response.totalPages) {
          hasMorePages = false
        } else {
          page++
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        core.warning(
          `Failed to fetch existing deploys from Cortex (page ${page}): ${errorMessage}. Will proceed with CREATE-only mode.`
        )
        // Return empty array to proceed without updates
        this.deploysCache = []
        return []
      }
    }

    core.info(
      `Fetched ${allDeploys.length} existing deploys from Cortex for deduplication`
    )
    this.deploysCache = allDeploys
    return allDeploys
  }

  // Find existing deploy by SHA + environment
  findExistingDeploy(
    sha: string,
    environment: string,
    deploys: CortexDeploy[]
  ): string | null {
    const existing = deploys.find(
      deploy => deploy.sha === sha && deploy.environment === environment
    )
    return existing ? existing.uuid : null
  }

  // Post or update a single deploy (idempotent)
  async postDeploy(
    analysis: CommitAnalysis,
    branch: string,
    existingDeploys: CortexDeploy[]
  ): Promise<DeployResult> {
    try {
      const payload = createCortexDeployPayload(analysis, this.config, branch)

      // Check if deploy already exists
      const existingUuid = this.findExistingDeploy(
        analysis.commit.sha,
        this.config.environment,
        existingDeploys
      )

      if (existingUuid) {
        // Update existing deploy
        core.debug(
          `Deploy already exists for commit ${analysis.commit.sha}, updating (UUID: ${existingUuid})`
        )

        const response = await this.cortexClient.updateDeploy(
          this.config.entityId,
          existingUuid,
          payload
        )

        core.info(
          `Updated deploy in Cortex for commit ${analysis.commit.sha} (Cortex ID: ${response.id})`
        )

        return {
          success: true,
          id: response.id,
          action: 'updated'
        }
      } else {
        // Create new deploy
        core.debug(
          `No existing deploy found for commit ${analysis.commit.sha}, creating new`
        )

        const response = await this.cortexClient.createDeploy(
          this.config.entityId,
          payload
        )

        core.info(
          `Created deploy in Cortex for commit ${analysis.commit.sha} (Cortex ID: ${response.id})`
        )

        return {
          success: true,
          id: response.id,
          action: 'created'
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      core.warning(
        `Failed to post deploy to Cortex for commit ${analysis.commit.sha}: ${errorMessage}`
      )

      return {
        success: false,
        error: errorMessage,
        action: 'failed'
      }
    }
  }

  // Post deploys for multiple commits (idempotent)
  async postDeploys(
    analyses: CommitAnalysis[],
    branch: string
  ): Promise<DeploysResult> {
    let successful = 0
    let failed = 0
    let skipped = 0
    let created = 0
    let updated = 0

    // Fetch all existing deploys once
    const existingDeploys = await this.fetchAllDeploys(this.config.entityId)

    for (const analysis of analyses) {
      // Check if we should post this commit
      if (!shouldPostToCortex(analysis, this.config)) {
        core.info(
          `Skipping Cortex post for commit ${analysis.commit.sha} (has errors or failures)`
        )
        skipped++
        continue
      }

      const result = await this.postDeploy(analysis, branch, existingDeploys)

      if (result.success) {
        successful++
        if (result.action === 'created') {
          created++
        } else if (result.action === 'updated') {
          updated++
        }
      } else {
        failed++
      }
    }

    return {
      total: analyses.length,
      successful,
      failed,
      skipped,
      created,
      updated
    }
  }
}
