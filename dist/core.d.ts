export interface CheckRun {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    started_at: string | null;
    completed_at: string | null;
    head_sha: string;
}
export interface WorkflowRun {
    id: number;
    name: string;
    event: string;
    check_suite_id: number;
    status: string;
    conclusion: string | null;
    created_at: string;
    updated_at: string;
    head_sha: string;
}
export interface CheckSuite {
    id: number;
    status: string;
    conclusion: string | null;
    created_at: string;
    updated_at: string;
    head_sha: string;
    app?: {
        name: string;
        slug?: string;
    };
    head_branch?: string;
    url?: string;
    check_runs?: CheckRun[];
}
export interface Commit {
    sha: string;
    commit: {
        author: {
            date: string;
        };
        committer: {
            email: string;
            date: string;
        };
    };
}
export interface CommitData {
    sha: string;
    timestamp: string;
    committer_email: string;
    url: string;
}
export interface CheckSuiteStats {
    total: number;
    successful: number;
    failed: number;
    cancelled: number;
    skipped: number;
    other: number;
    longest_checkrun?: {
        duration_ms: number;
        name: string;
        status: string;
        conclusion: string | null;
    };
}
export interface CommitAnalysis {
    commit: CommitData;
    checksuites: CheckSuite[];
    duration_ms: number;
    stats: CheckSuiteStats;
    error?: string;
}
export interface AnalysisResult {
    commits: CommitAnalysis[];
    summary: {
        total_commits: number;
        successful_commits: number;
        failed_commits: number;
    };
}
export declare function parseTimeWindow(timeWindow: string): Date;
export declare function filterPushCheckSuites(checkSuites: CheckSuite[], workflowRuns: WorkflowRun[]): CheckSuite[];
export declare function calculateCheckSuiteStats(checkSuites: CheckSuite[]): CheckSuiteStats;
export declare function calculateWallToWallDuration(checkSuites: CheckSuite[]): number;
export declare function formatCommitData(commit: Commit, owner: string, repo: string): CommitData;
export declare function createCommitAnalysis(commit: Commit, checkSuites: CheckSuite[], owner: string, repo: string, error?: string): CommitAnalysis;
export declare function calculateSummary(analyses: CommitAnalysis[]): AnalysisResult['summary'];
export interface CortexDeployPayload {
    timestamp: string;
    title: string;
    type: 'DEPLOY' | 'SCALE' | 'ROLLBACK' | 'RESTART';
    deployer?: {
        name?: string;
        email?: string;
    };
    environment?: string;
    sha?: string;
    url?: string;
    customData?: Record<string, unknown>;
}
export interface CortexDeployResponse {
    uuid: string;
    id: number;
    serviceId?: number;
    timestamp?: string;
    title?: string;
    type?: string;
}
export interface CortexConfig {
    apiKey: string;
    entityId: string;
    environment: string;
    titleTemplate: string;
    postPerCommit: boolean;
}
export declare function createCortexDeployPayload(analysis: CommitAnalysis, config: CortexConfig, branch: string): CortexDeployPayload;
export declare function shouldPostToCortex(analysis: CommitAnalysis, config: CortexConfig): boolean;
