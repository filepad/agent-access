// FILE MEMO: HTTP client for Filepad agent-hooks endpoints.
// Uses FilepadAgentHttpClient from agent-access-sdk for HMAC-signed requests.

import { FilepadAgentHttpClient } from '@filepad/agent-access-sdk';
import type { HookCredentials } from './config.js';
import type {
  HookPreToolUseRequest,
  HookPreToolUseResponse,
  HookStopRequest,
  HookStopResponse,
  HookUserPromptSubmitRequest,
  HookUserPromptSubmitResponse,
  HookEventRequest,
  HookEventResponse,
} from './types.js';

export function createHookClient(credentials: HookCredentials) {
  const http = new FilepadAgentHttpClient({
    baseUrl: credentials.baseUrl,
    workspaceId: credentials.workspaceId,
    keyId: credentials.keyId,
    secret: credentials.secret,
    timeoutMs: 8_000,
    maxRetries: 1,
  });

  const base = `/agent-api/v1/workspaces/${credentials.workspaceId}/agent-hooks`;

  return {
    async preToolUse(req: HookPreToolUseRequest): Promise<HookPreToolUseResponse> {
      return http.request<HookPreToolUseResponse>('POST', `${base}/pre-tool-use`, req);
    },

    async stop(req: HookStopRequest): Promise<HookStopResponse> {
      return http.request<HookStopResponse>('POST', `${base}/stop`, req);
    },

    async userPromptSubmit(req: HookUserPromptSubmitRequest): Promise<HookUserPromptSubmitResponse> {
      return http.request<HookUserPromptSubmitResponse>('POST', `${base}/events/user-prompt-submit`, req);
    },

    async event(req: HookEventRequest): Promise<HookEventResponse> {
      return http.request<HookEventResponse>(
        'POST',
        `${base}/events/${req.eventName}`,
        req,
      );
    },

    async recordInvocation(invocation: Record<string, unknown>): Promise<{ ok: boolean }> {
      return http.request<{ ok: boolean }>(
        'POST',
        `${base}/invocations`,
        invocation,
      );
    },
  };
}

export type HookClient = ReturnType<typeof createHookClient>;
