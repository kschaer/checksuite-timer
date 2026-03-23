import { Commit, CheckSuite, CheckRun } from './core';
export interface GitHubClient {
    getCommits(owner: string, repo: string, branch: string, since: Date): Promise<Commit[]>;
    getCheckSuites(owner: string, repo: string, sha: string): Promise<CheckSuite[]>;
    getCheckRuns(owner: string, repo: string, checkSuiteId: number): Promise<CheckRun[]>;
}
export declare class GitHubApiClient implements GitHubClient {
    private octokit;
    constructor(token: string);
    getCommits(owner: string, repo: string, branch: string, since: Date): Promise<Commit[]>;
    getCheckSuites(owner: string, repo: string, sha: string): Promise<CheckSuite[]>;
    getCheckRuns(owner: string, repo: string, checkSuiteId: number): Promise<CheckRun[]>;
}
export declare function createGitHubClient(token: string): GitHubClient;
