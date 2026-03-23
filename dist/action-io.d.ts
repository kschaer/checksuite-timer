import { AnalysisResult, CortexConfig } from './core';
import { DeploysResult } from './cortex-service';
export interface ActionInputs {
    branch: string;
    timeWindow: string;
    githubToken: string;
}
export interface RepositoryContext {
    owner: string;
    repo: string;
}
export declare function parseActionInputs(): ActionInputs;
export declare function getRepositoryContext(): RepositoryContext;
export declare function setActionOutputs(result: AnalysisResult): void;
export declare function logAnalysisResults(result: AnalysisResult): void;
export declare function parseCortexConfig(): CortexConfig | null;
export declare function logCortexResults(results: DeploysResult): void;
