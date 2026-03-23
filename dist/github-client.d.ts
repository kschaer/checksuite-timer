import { Commit, CheckSuite, CheckRun, WorkflowRun } from './core';
export interface GitHubClient {
    getCommits(owner: string, repo: string, branch: string, since: Date): Promise<Commit[]>;
    getCheckSuites(owner: string, repo: string, sha: string): Promise<CheckSuite[]>;
    getCheckRuns(owner: string, repo: string, checkSuiteId: number): Promise<CheckRun[]>;
    getWorkflowRuns(owner: string, repo: string, sha: string): Promise<WorkflowRun[]>;
}
export declare class GitHubApiClient implements GitHubClient {
    private octokit;
    constructor(token: string);
    getCommits(owner: string, repo: string, branch: string, since: Date): Promise<Commit[]>;
    getCheckSuites(owner: string, repo: string, sha: string): Promise<CheckSuite[]>;
    getCheckRuns(owner: string, repo: string, checkSuiteId: number): Promise<CheckRun[]>;
    getWorkflowRuns(owner: string, repo: string, sha: string): Promise<WorkflowRun[]>;
}
export declare function createGitHubClient(token: string): GitHubClient;
