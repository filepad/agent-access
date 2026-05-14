// FILE MEMO: High-level FilepadAgentClient with validation, guardrails, and typed helpers.

import { FilepadAgentHttpClient } from './endpoints.js';
import type {
  FilepadAgentClientConfig,
  AgentAccessScope,
  AgentConnectDiagnosticsResponse,
  GetAgentApiCapabilitiesResponse,
  GetAgentApiEnvironmentResponse,
  GetAgentApiFileTreeResponse,
  GetAgentApiPromptsResponse,
  GetMcpPromptsResponse,
  GetMcpResourcesResponse,
  SearchAgentApiWorkspaceRequest,
  SearchAgentApiWorkspaceResponse,
  GetAgentApiFileResponse,
  CreateAgentApiArtifactRequest,
  CreateAgentApiArtifactResponse,
  CreateAgentApiEventRequest,
  CreateAgentApiEventResponse,
  CreateAgentApiSignalRequest,
  CreateAgentApiSignalResponse,
  AgentSignal,
  AgentSignalSeverity,
  AgentSignalStatus,
  ListAgentSignalsResponse,
  ListAgentMailboxResponse,
  AckAgentMailboxResponse,
  AgentProfile,
  AgentProfileField,
  AgentProfileFile,
  UpdateAgentProfileRequest,
  UpdateAgentProfileResponse,
  GetConstitutionResponse,
  GetConstitutionHistoryResponse,
  ExportConstitutionMarkdownResponse,
  ListAgentToolsResponse,
  CallAgentToolRequest,
  CallAgentToolResponse,
  CreateContractRequest,
  CreateContractResponse,
  GetContractStatusRequest,
  GetContractStatusResponse,
  GmailDraftToolInput,
  GmailGetMessageToolInput,
  GmailImportMessageToolInput,
  GmailSearchToolInput,
} from './types.js';
import { McpAdapter } from './mcp.js';

const AGENT_PROFILE_FIELDS = [
  'identity',
  'learnings',
  'goals',
  'timeline',
] as const satisfies readonly AgentProfileField[];

export class FilepadAgentClient {
  private readonly http: FilepadAgentHttpClient;
  private readonly workspaceId: string;
  public readonly mcp: McpAdapter;

  constructor(config: FilepadAgentClientConfig) {
    this.http = new FilepadAgentHttpClient(config);
    this.workspaceId = config.workspaceId;
    this.mcp = new McpAdapter(this);
  }

  // ── Validation ──

  /** Verify credentials by calling capabilities. Returns agent identity and granted scopes. */
  async verifyCredentials(): Promise<GetAgentApiCapabilitiesResponse> {
    return this.http.get<GetAgentApiCapabilitiesResponse>('/agent-api/v1/capabilities');
  }

  /**
   * One-call agent onboarding/resume probe. Returns identity, workspace, scopes,
   * available RuntimeTools, workspace profile state, mailbox, and recent outcomes.
   */
  async connect(): Promise<AgentConnectDiagnosticsResponse> {
    return this.http.get<AgentConnectDiagnosticsResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/connect`,
    );
  }

  async bootstrap(): Promise<AgentConnectDiagnosticsResponse> {
    return this.http.get<AgentConnectDiagnosticsResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/bootstrap`,
    );
  }

  // ── Read ──

  async getCapabilities(): Promise<GetAgentApiCapabilitiesResponse> {
    return this.http.get<GetAgentApiCapabilitiesResponse>('/agent-api/v1/capabilities');
  }

  async getEnvironment(): Promise<GetAgentApiEnvironmentResponse> {
    return this.http.get<GetAgentApiEnvironmentResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/environment`,
    );
  }

  async getConstitution(): Promise<GetConstitutionResponse> {
    return this.http.get<GetConstitutionResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/constitution`,
    );
  }

  async getConstitutionHistory(): Promise<GetConstitutionHistoryResponse> {
    return this.http.get<GetConstitutionHistoryResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/constitution/history`,
    );
  }

  async exportConstitutionMarkdown(): Promise<ExportConstitutionMarkdownResponse> {
    return this.http.get<ExportConstitutionMarkdownResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/constitution/export/markdown`,
    );
  }

  async exportConstitutionPdf(): Promise<Blob> {
    return this.http.getBlob(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/constitution/export/pdf`,
    );
  }

  async getFileTree(): Promise<GetAgentApiFileTreeResponse> {
    return this.http.get<GetAgentApiFileTreeResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/file-tree`,
    );
  }

  async getPrompts(): Promise<GetAgentApiPromptsResponse> {
    return this.http.get<GetAgentApiPromptsResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/prompts`,
    );
  }

  async getMcpPrompts(): Promise<GetMcpPromptsResponse> {
    return this.http.get<GetMcpPromptsResponse>(
      `/mcp/v1/workspaces/${encodeURIComponent(this.workspaceId)}/prompts`,
    );
  }

  async getMcpResources(): Promise<GetMcpResourcesResponse> {
    return this.http.get<GetMcpResourcesResponse>(
      `/mcp/v1/workspaces/${encodeURIComponent(this.workspaceId)}/resources`,
    );
  }

  async listTools(): Promise<ListAgentToolsResponse> {
    return this.http.get<ListAgentToolsResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/tools`,
    );
  }

  async callTool(params: CallAgentToolRequest): Promise<CallAgentToolResponse> {
    return this.http.post<CallAgentToolResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/tools/call`,
      params,
    );
  }

  async createContract(input: CreateContractRequest): Promise<CreateContractResponse> {
    const result = await this.callTool({
      toolName: 'active_contract.compile',
      input: { sourceText: input.sourceText },
    });
    return result.output as CreateContractResponse;
  }

  async getContractStatus(input: GetContractStatusRequest): Promise<GetContractStatusResponse> {
    const result = await this.callTool({
      toolName: 'active_contract.status',
      input: { contractId: input.contractId },
    });
    return result.output as GetContractStatusResponse;
  }

  async searchGmail(
    params: GmailSearchToolInput = {},
  ): Promise<CallAgentToolResponse> {
    return this.callTool({ toolName: 'gmail_search', input: params });
  }

  async getGmailMessage(
    params: GmailGetMessageToolInput,
  ): Promise<CallAgentToolResponse> {
    return this.callTool({ toolName: 'gmail_get_message', input: params });
  }

  async importGmailMessage(
    params: GmailImportMessageToolInput,
  ): Promise<CallAgentToolResponse> {
    return this.callTool({ toolName: 'gmail_import_message', input: params });
  }

  async createGmailDraft(
    params: GmailDraftToolInput,
  ): Promise<CallAgentToolResponse> {
    return this.callTool({ toolName: 'gmail_create_draft', input: params });
  }

  async sendGmailWithApproval(
    params: GmailDraftToolInput,
  ): Promise<CallAgentToolResponse> {
    return this.callTool({ toolName: 'gmail_send_with_approval', input: params });
  }

  async getFile(fileNodeId: string): Promise<GetAgentApiFileResponse> {
    return this.http.get<GetAgentApiFileResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/files/${encodeURIComponent(fileNodeId)}`,
    );
  }

  async getMailbox(options?: {
    limit?: number;
    unreadOnly?: boolean;
    cursor?: string;
  }): Promise<ListAgentMailboxResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.unreadOnly !== undefined) {
      params.set('unreadOnly', String(options.unreadOnly));
    }
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.http.get<ListAgentMailboxResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/mailbox${query ? `?${query}` : ''}`,
    );
  }

  async waitForMailbox(options?: {
    limit?: number;
    unreadOnly?: boolean;
    cursor?: string;
    timeoutMs?: number;
  }): Promise<ListAgentMailboxResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.unreadOnly !== undefined) {
      params.set('unreadOnly', String(options.unreadOnly));
    }
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.timeoutMs) params.set('timeoutMs', String(options.timeoutMs));
    const query = params.toString();
    return this.http.get<ListAgentMailboxResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/mailbox/wait${query ? `?${query}` : ''}`,
    );
  }

  async getSignals(filters?: {
    findingTypeKey?: string | undefined;
    severity?: AgentSignalSeverity | undefined;
    status?: AgentSignalStatus | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
  }): Promise<ListAgentSignalsResponse> {
    const params = new URLSearchParams();
    if (filters?.findingTypeKey) {
      params.set('findingTypeKey', filters.findingTypeKey);
    }
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.cursor) params.set('cursor', filters.cursor);
    const query = params.toString();
    return this.http.get<ListAgentSignalsResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/signals${query ? `?${query}` : ''}`,
    );
  }

  async getSignal(signalId: string): Promise<AgentSignal> {
    return this.http.get<AgentSignal>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/signals/${encodeURIComponent(signalId)}`,
    );
  }

  async getAgentProfile(options?: {
    fields?: AgentProfileField[] | undefined;
  }): Promise<AgentProfile> {
    const [capabilities, connection] = await Promise.all([
      this.getCapabilities(),
      this.connect(),
    ]);
    const requestedFields = options?.fields ?? [...AGENT_PROFILE_FIELDS];
    const files: Partial<Record<AgentProfileField, AgentProfileFile>> = {};
    for (const field of requestedFields) {
      if (field === 'identity') {
        files[field] = {
          field,
          available: true,
          source: 'workspace_metadata',
          content: {
            workspace: connection.workspace,
            agent: {
              keyId: capabilities.agent.keyId,
              integrationId: capabilities.agent.integrationId,
              workspaceId: capabilities.agent.workspaceId,
              displayName: connection.agent.displayName,
              scopes: connection.scopes,
            },
          },
          unavailableReason: null,
        };
        continue;
      }
      files[field] = {
        field,
        available: false,
        source: 'workspace_metadata',
        content: null,
        unavailableReason:
          'No generated profile file exists for this field. Filepad now returns metadata-backed profile data only.',
      };
    }

    return {
      keyId: capabilities.agent.keyId,
      source: 'workspace_metadata',
      files,
    };
  }

  async search(
    query: string,
    options?: { type?: 'semantic' | 'keyword' | 'hybrid'; limit?: number },
  ): Promise<SearchAgentApiWorkspaceResponse> {
    const body: SearchAgentApiWorkspaceRequest = {
      query,
      ...(options?.type ? { type: options.type } : {}),
      ...(options?.limit ? { limit: options.limit } : {}),
    };
    return this.http.post<SearchAgentApiWorkspaceResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/search`,
      body,
    );
  }

  // ── Write ──

  async createArtifact(
    params: CreateAgentApiArtifactRequest,
  ): Promise<CreateAgentApiArtifactResponse> {
    return this.http.post<CreateAgentApiArtifactResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/artifacts`,
      params,
    );
  }

  async createMarkdownArtifact(params: {
    title: string;
    markdown: string;
    kind?: 'auto' | 'richDoc' | 'note' | undefined;
  }): Promise<CreateAgentApiArtifactResponse> {
    return this.createArtifact({
      title: params.title,
      text: params.markdown,
      kind: params.kind ?? 'auto',
      format: 'markdown',
    });
  }

  async createEvent(
    params: Omit<CreateAgentApiEventRequest, 'occurredAt' | 'idempotencyKey'> &
      Partial<Pick<CreateAgentApiEventRequest, 'occurredAt' | 'idempotencyKey'>>,
  ): Promise<CreateAgentApiEventResponse> {
    const body: CreateAgentApiEventRequest = {
      eventType: params.eventType,
      payload: params.payload,
      occurredAt: params.occurredAt ?? new Date().toISOString(),
      idempotencyKey: params.idempotencyKey ?? crypto.randomUUID(),
    };
    return this.http.post<CreateAgentApiEventResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/events`,
      body,
    );
  }

  async createSignal(
    params: Omit<CreateAgentApiSignalRequest, 'idempotencyKey'> &
      Partial<Pick<CreateAgentApiSignalRequest, 'idempotencyKey'>>,
  ): Promise<CreateAgentApiSignalResponse> {
    const body: CreateAgentApiSignalRequest = {
      findingTypeKey: params.findingTypeKey,
      summary: params.summary,
      severity: params.severity,
      value: params.value,
      idempotencyKey: params.idempotencyKey ?? crypto.randomUUID(),
    };
    return this.http.post<CreateAgentApiSignalResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/signals`,
      body,
    );
  }

  async ackMailbox(ids: string[]): Promise<AckAgentMailboxResponse> {
    return this.http.post<AckAgentMailboxResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/mailbox/ack`,
      { ids },
    );
  }

  async updateAgentProfile(
    _params: UpdateAgentProfileRequest,
  ): Promise<UpdateAgentProfileResponse> {
    throw new Error(
      'filepad_update_profile is unavailable because agent profile seed files are no longer provisioned.',
    );
  }

  // ── Proposals ──

  async proposeEdit(params: {
    fileNodeId: string;
    baseVersionId: string;
    summary: string;
    newText: string;
    baseTextSha256?: string;
    instruction?: string;
    toolName?: string;
  }): Promise<{ proposalId: string; artifactId: string; baseVersionId: string }> {
    return this.http.post<{ proposalId: string; artifactId: string; baseVersionId: string }>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/files/${encodeURIComponent(params.fileNodeId)}/proposals`,
      {
        baseVersionId: params.baseVersionId,
        editorKind: 'plainText',
        summary: params.summary,
        ops: {
          type: 'plain_text_replace',
          text: params.newText,
          ...(params.baseTextSha256 ? { baseTextSha256: params.baseTextSha256 } : {}),
          ...(params.instruction ? { instruction: params.instruction } : {}),
          ...(params.toolName ? { toolName: params.toolName } : {}),
        },
      },
    );
  }
}
