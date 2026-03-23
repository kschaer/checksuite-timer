import { CortexClient, CortexDeploy } from './cortex-client';
import { CommitAnalysis, CortexConfig } from './core';
export interface DeployResult {
    success: boolean;
    uuid?: string;
    error?: string;
    action: 'created' | 'updated' | 'failed';
}
export interface DeploysResult {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    created: number;
    updated: number;
}
export declare class CortexService {
    private cortexClient;
    private config;
    private deploysCache;
    constructor(cortexClient: CortexClient, config: CortexConfig);
    fetchAllDeploys(entityId: string, since: Date): Promise<CortexDeploy[]>;
    findExistingDeploy(sha: string, environment: string, deploys: CortexDeploy[]): string | null;
    postDeploy(analysis: CommitAnalysis, branch: string, existingDeploys: CortexDeploy[]): Promise<DeployResult>;
    postDeploys(analyses: CommitAnalysis[], branch: string, since: Date): Promise<DeploysResult>;
}
