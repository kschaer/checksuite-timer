import { CortexDeployPayload, CortexDeployResponse } from './core';
export interface CortexDeploy {
    uuid: string;
    timestamp: string;
    title: string;
    type: 'DEPLOY' | 'SCALE' | 'ROLLBACK' | 'RESTART';
    environment?: string;
    sha?: string;
    url?: string;
    customData?: Record<string, unknown>;
    deployer?: {
        name?: string;
        email?: string;
    };
    deployerEmail?: string;
    deployerName?: string;
}
export interface CortexDeploysResponse {
    deployments: CortexDeploy[];
    page: number;
    totalPages: number;
    total: number;
}
export interface CortexClient {
    getDeploys(entityId: string, page?: number): Promise<CortexDeploysResponse>;
    createDeploy(entityId: string, payload: CortexDeployPayload): Promise<CortexDeployResponse>;
    updateDeploy(entityId: string, uuid: string, payload: CortexDeployPayload): Promise<CortexDeployResponse>;
}
export declare class CortexApiClient implements CortexClient {
    private readonly apiKey;
    private readonly baseUrl;
    constructor(apiKey: string);
    getDeploys(entityId: string, page?: number): Promise<CortexDeploysResponse>;
    createDeploy(entityId: string, payload: CortexDeployPayload): Promise<CortexDeployResponse>;
    updateDeploy(entityId: string, uuid: string, payload: CortexDeployPayload): Promise<CortexDeployResponse>;
    private handleErrorResponse;
}
export declare function createCortexClient(apiKey: string): CortexClient;
