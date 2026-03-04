import * as core from '@actions/core'
import { parseTimeWindow } from './core'
import { createGitHubClient } from './github-client'
import { AnalysisService } from './analysis-service'
import { 
  parseActionInputs, 
  getRepositoryContext, 
  setActionOutputs, 
  logAnalysisResults 
} from './action-io'

// Clean, testable main function with clear separation of concerns
export async function run(): Promise<void> {
  try {
    // 1. Parse inputs (testable by mocking core.getInput)
    const inputs = parseActionInputs()
    const { owner, repo } = getRepositoryContext()
    
    core.info(`Analyzing commits on branch '${inputs.branch}' for the last ${inputs.timeWindow}`)
    
    // 2. Parse time window (pure function - easily testable)
    const since = parseTimeWindow(inputs.timeWindow)
    core.info(`Looking for commits since: ${since.toISOString()}`)
    
    // 3. Create GitHub client (injectable dependency)
    const gitHubClient = createGitHubClient(inputs.githubToken)
    
    // 4. Create analysis service (testable with mocked client)
    const analysisService = new AnalysisService(gitHubClient)
    
    // 5. Perform analysis (business logic isolated in service)
    const result = await analysisService.analyzeRepository(owner, repo, inputs.branch, since)
    
    // 6. Handle empty results gracefully
    if (result.commits.length === 0) {
      core.info('No commits found in the specified time window. Exiting gracefully.')
      setActionOutputs({ commits: [], summary: { total_commits: 0, successful_commits: 0, failed_commits: 0 } })
      return
    }
    
    // 7. Log results (testable by mocking core.info/warning)
    logAnalysisResults(result)
    
    // 8. Set outputs (testable by mocking core.setOutput)
    setActionOutputs(result)
    
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

// Only run if this file is executed directly (not during testing)
if (require.main === module) {
  run()
}

// Export for testing
export * from './core'
export * from './github-client'
export * from './analysis-service'
export * from './action-io'