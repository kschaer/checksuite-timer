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
  uuid?: string
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

  // Fetch deploys with pagination, stopping when we go beyond the time window
  async fetchAllDeploys(
    entityId: string,
    since: Date
  ): Promise<CortexDeploy[]> {
    if (this.deploysCache !== null) {
      return this.deploysCache
    }

    const allDeploys: CortexDeploy[] = []
    let page = 0
    let hasMorePages = true
    const sinceTime = since.getTime()

    core.debug(
      `Fetching deploys since ${since.toISOString()} for deduplication`
    )

    while (hasMorePages) {
      try {
        const response = await this.cortexClient.getDeploys(entityId, page)

        // Check each deploy's timestamp and stop if we've gone too far back
        let hitOldDeploys = false
        for (const deploy of response.deployments) {
          const deployTime = new Date(deploy.timestamp).getTime()

          if (deployTime >= sinceTime) {
            allDeploys.push(deploy)
          } else {
            // We've hit deploys older than our time window, stop fetching
            hitOldDeploys = true
            core.debug(
              `Stopped fetching at page ${page}: found deploy from ${deploy.timestamp} (before ${since.toISOString()})`
            )
            break
          }
        }

        core.debug(
          `Fetched page ${page}: ${response.deployments.length} deploys returned, ${allDeploys.length} within time window`
        )

        // Stop if we hit old deploys or reached the last page
        if (hitOldDeploys || page + 1 >= response.totalPages) {
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
      `Fetched ${allDeploys.length} existing deploys from Cortex within time window for deduplication`
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
          `Updated deploy in Cortex for commit ${analysis.commit.sha} (Cortex UUID: ${response.uuid})`
        )

        return {
          success: true,
          uuid: response.uuid,
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
          `Created deploy in Cortex for commit ${analysis.commit.sha} (Cortex UUID: ${response.uuid})`
        )

        return {
          success: true,
          uuid: response.uuid,
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
    branch: string,
    since: Date
  ): Promise<DeploysResult> {
    let successful = 0
    let failed = 0
    let skipped = 0
    let created = 0
    let updated = 0

    // Fetch existing deploys within the time window
    const existingDeploys = await this.fetchAllDeploys(
      this.config.entityId,
      since
    )

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
