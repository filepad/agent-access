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

function fileNameForProfileField(field: AgentProfileField): string {
  return `${field}.md`;
}

function appendAgentProfileEntry(existingText: string, content: string): string {
  const trimmedContent = content.trim();
  if (!trimmedContent) return existingText;
  const entry = [`## ${new Date().toISOString()}`, '', trimmedContent, ''].join('\n');
  const headingMatch = existingText.match(/^(# .+\n)/);
  if (!headingMatch || headingMatch.index !== 0) {
    return `${entry}\n${existingText}`.trimEnd() + '\n';
  }
  const heading = headingMatch[1] ?? '';
  const rest = existingText.slice(heading.length).trimStart();
  return `${heading}\n${entry}${rest}`.trimEnd() + '\n';
}

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
   * available RuntimeTools, agent home state, mailbox, and recent outcomes.
   */
  async connect(): Promise<AgentConnectDiagnosticsResponse> {
    return this.http.get<AgentConnectDiagnosticsResponse>(
      `/agent-api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/connect`,
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
    const capabilities = await this.getCapabilities();
    const requestedFields = options?.fields ?? [...AGENT_PROFILE_FIELDS];
    const tree = await this.getFileTree();
    const pathById = new Map<string, string>();
    for (const node of tree.nodes) {
      if (node.parentId === null) {
        pathById.set(node.id, node.name);
        continue;
      }
      const parentPath = pathById.get(node.parentId);
      if (parentPath) pathById.set(node.id, `${parentPath}/${node.name}`);
    }

    const files: Partial<Record<AgentProfileField, AgentProfileFile>> = {};
    for (const field of requestedFields) {
      const expectedPath = `agents/integrations/${capabilities.agent.keyId}/${fileNameForProfileField(field)}`;
      const node = tree.nodes.find((candidate) => pathById.get(candidate.id) === expectedPath);
      if (!node) continue;
      const file = await this.getFile(node.id);
      files[field] = {
        field,
        path: expectedPath,
        fileNodeId: node.id,
        artifactId: file.artifact?.id ?? null,
        baseVersionId: file.latestVersion?.id ?? null,
        text: file.content.kind === 'inlineText'
          ? (file.content.text ?? '')
          : '',
      };
    }

    return {
      keyId: capabilities.agent.keyId,
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
    params: UpdateAgentProfileRequest,
  ): Promise<UpdateAgentProfileResponse> {
    const mode = params.mode ?? 'append';
    const profile = await this.getAgentProfile({ fields: [params.field] });
    const profileFile = profile.files[params.field];
    if (!profileFile) {
      throw new Error(
        `Agent profile file is missing for field: ${params.field}`,
      );
    }
    if (!profileFile.baseVersionId || !profileFile.artifactId) {
      throw new Error(
        `Agent profile file is not editable for field: ${params.field}`,
      );
    }

    const newText =
      mode === 'replace'
        ? params.content
        : appendAgentProfileEntry(profileFile.text, params.content);

    const proposal = await this.proposeEdit({
      fileNodeId: profileFile.fileNodeId,
      baseVersionId: profileFile.baseVersionId,
      summary: `Update agent ${params.field} profile`,
      newText,
      instruction:
        'Agent profile update requested through filepad_update_profile.',
      toolName: 'filepad_update_profile',
    });

    return {
      ...proposal,
      field: params.field,
      mode,
      status: 'pending_review',
    };
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
