import { FilepadAgentClient } from '@filepad/agent-access-sdk';
import type { GuardianConfig } from './config.js';
import type { GuardianEvidencePayload } from './evidence.js';

export type ActiveContractSummary = {
  contractId: string;
  name: string;
  lifecycleStatus: string;
  artifactId: string;
  specHash: string;
};

export type ActiveContractStatus = {
  contractId: string;
  lifecycleStatus: string;
  stale: boolean;
  staleReason?: string | undefined;
  checks: Array<{ checkId: string; status: string; title?: string | undefined }>;
};

export function createGuardianClient(config: GuardianConfig) {
  const sdk = new FilepadAgentClient({
    baseUrl: config.baseUrl,
    workspaceId: config.workspaceId,
    keyId: config.keyId,
    secret: config.secret,
  });

  return {
    async verifyCredentials() {
      return sdk.verifyCredentials();
    },

    async connect() {
      return sdk.connect();
    },

    async listActiveContracts(): Promise<ActiveContractSummary[]> {
      const result = await sdk.callTool({
        toolName: 'active_contract.list',
        input: {},
      });
      const data = result.output as unknown as { contracts?: Array<Record<string, unknown>> };
      return (data.contracts ?? []).map((c) => ({
        contractId: c['contractId'] as string,
        name: c['name'] as string,
        lifecycleStatus: c['lifecycleStatus'] as string,
        artifactId: c['artifactId'] as string,
        specHash: c['specHash'] as string,
      }));
    },

    async getContractStatus(contractId: string): Promise<ActiveContractStatus> {
      const result = await sdk.callTool({
        toolName: 'active_contract.status',
        input: { contractId },
      });
      return result.output as unknown as ActiveContractStatus;
    },

    async readContract(contractId: string): Promise<{
      contract: Record<string, unknown>;
      checks: Array<Record<string, unknown>>;
    }> {
      const result = await sdk.callTool({
        toolName: 'active_contract.read',
        input: { contractId },
      });
      return result.output as unknown as { contract: Record<string, unknown>; checks: Array<Record<string, unknown>> };
    },

    async markStale(params: {
      contractId: string;
      checkIds?: string[] | undefined;
      reason?: string | undefined;
      changedPaths?: string[] | undefined;
    }): Promise<{
      contractId: string;
      markedStale: string[];
      checkStatuses: Array<{ checkId: string; status: string }>;
      contractStatus: string;
    }> {
      const result = await sdk.callTool({
        toolName: 'active_contract.mark_stale',
        input: {
          contractId: params.contractId,
          ...(params.checkIds ? { checkIds: params.checkIds } : {}),
          ...(params.reason ? { reason: params.reason } : {}),
          ...(params.changedPaths ? { changedPaths: params.changedPaths } : {}),
        },
      });
      return result.output as unknown as {
        contractId: string;
        markedStale: string[];
        checkStatuses: Array<{ checkId: string; status: string }>;
        contractStatus: string;
      };
    },

    async recordEvidence(payload: GuardianEvidencePayload, data?: Record<string, unknown>) {
      const result = await sdk.callTool({
        toolName: 'active_contract.record_evidence',
        input: {
          contractId: payload.contractId,
          checkId: payload.checkId,
          source: payload.source,
          sourceName: 'filepad-guardian',
          sourceRuntime: 'cli',
          status: payload.status,
          summary: payload.summary,
          provenance: payload.provenance as unknown as Record<string, unknown>,
          observedAt: payload.provenance.finishedAt,
          ...(data ? { data } : {}),
        },
      });
      return result.output as unknown as {
        evidence?: Record<string, unknown>;
        checkStatuses?: Array<{ checkId: string; status: string }>;
        contractStatus?: string;
      };
    },
  };
}

export type GuardianClient = ReturnType<typeof createGuardianClient>;
