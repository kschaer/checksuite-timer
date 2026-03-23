import { GitHubClient } from './github-client';
import { Commit, CommitAnalysis, AnalysisResult } from './core';
export declare class AnalysisService {
    private gitHubClient;
    constructor(gitHubClient: GitHubClient);
    analyzeCommit(commit: Commit, owner: string, repo: string): Promise<CommitAnalysis>;
    analyzeCommits(commits: Commit[], owner: string, repo: string): Promise<CommitAnalysis[]>;
    analyzeRepository(owner: string, repo: string, branch: string, since: Date): Promise<AnalysisResult>;
}
