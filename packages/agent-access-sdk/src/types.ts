// FILE MEMO: Self-contained Agent Access types. No external workspace dependencies.
// These are TypeScript compile-time interfaces mirroring the backend contract.
// Keep in sync with packages/contracts/src/endpoints/agent-access/agent-access.ts

export type AgentAccessScope =
  | 'env:read'
  | 'artifacts:write'
  | 'artifacts:direct_write'
  | 'files:propose'
  | 'memory:read'
  | 'events.write'
  | 'signals:write'
  | 'notifications:read'
  | 'tools:read'
  | 'tools:call'
  | 'gmail:read'
  | 'gmail:write'
  | 'github:read'
  | 'github:write'
  | 'compute:run';

export type AgentApiSearchMode = 'semantic' | 'keyword' | 'hybrid';

export type AgentArtifactKind =
  | 'note'
  | 'richText'
  | 'richDoc'
  | 'diagram'
  | 'sheet';

export type AgentCreateArtifactKind = AgentArtifactKind | 'auto';

export interface AgentApiFileTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'folder' | 'file';
  artifactId: string | null;
  artifactKind: string | null;
}

export interface AgentApiEnvironmentFolder {
  name: string;
  purpose: string;
  fileNodeId: string | null;
  status: 'ready' | 'missing';
}

export interface GetAgentApiCapabilitiesResponse {
  agent: {
    keyId: string;
    integrationId: string;
    workspaceId: string;
  };
  scopes: AgentAccessScope[];
}

export interface AgentConnectScopeStatus {
  scope: AgentAccessScope;
  status: 'granted' | 'missing';
  reason: string;
}

export interface AgentConnectDiagnosticsResponse {
  status: 'ok';
  checkedAt: string;
  agent: {
    keyId: string;
    integrationId: string;
    workspaceId: string;
    displayName: string | null;
  };
  workspace: {
    id: string;
    displayName: string;
    kind: 'personal' | 'shared';
    ownerName: string;
    ownerTimezone: string;
    installedKits: string[];
  };
  scopes: AgentAccessScope[];
  recommendedScopes: AgentConnectScopeStatus[];
  tools: AgentRuntimeTool[];
  bootstrap: {
    summary: string;
    startupPrompt: string;
    suggestedFirstActions: string[];
    availableToolGroups: Array<{
      group: string;
      purpose: string;
      tools: string[];
    }>;
  };
  agentHome: {
    status: 'ready' | 'missing';
    folderPath: string;
    files: Array<{
      path: string;
      fileNodeId: string | null;
      artifactId: string | null;
      status: 'ready' | 'missing';
    }>;
  };
  mailbox: {
    unreadCount: number;
    recent: AgentMailboxItem[];
  };
  recentOutcomes: AgentMailboxItem[];
  diagnostics: {
    warnings: string[];
    nextRecommendedActions: string[];
  };
}

export interface GetAgentApiEnvironmentResponse {
  workspaceId: string;
  rootFileNodeId: string | null;
  folders: AgentApiEnvironmentFolder[];
}

export interface GetAgentApiFileTreeResponse {
  nodes: AgentApiFileTreeNode[];
}

export interface AgentApiPrompt {
  path: string;
  fileNodeId: string;
  name: string;
  title: string;
  description: string | null;
  resourceUri: string;
  contentUrl: string;
}

export interface GetAgentApiPromptsResponse {
  prompts: AgentApiPrompt[];
}

export interface McpPrompt {
  name: string;
  title: string;
  description: string;
  arguments: unknown[];
  resourceUri: string;
  contentUrl: string;
}

export interface GetMcpPromptsResponse {
  prompts: McpPrompt[];
}

export interface McpResource {
  uri: string;
  name: string;
  title: string;
  description: string | null;
  mimeType: string;
  contentUrl?: string | undefined;
}

export interface GetMcpResourcesResponse {
  resources: McpResource[];
}

export interface AgentRuntimeTool {
  name: string;
  providerName: string;
  displayName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown> | undefined;
  capabilityScope: string;
  capabilityType:
    | 'read'
    | 'write'
    | 'search'
    | 'compute'
    | 'admin'
    | 'send'
    | 'delete';
  riskLevel: 'low' | 'medium' | 'high';
  approvalPolicy: 'auto' | 'approval_required' | 'blocked';
  minimumWorkspaceRole: string;
  requiredScopes: AgentAccessScope[];
  mutates: {
    artifacts: boolean;
    fileNodes: boolean;
    externalNetwork: boolean;
    externalService?: boolean | undefined;
    sendsMessage?: boolean | undefined;
    deletesData?: boolean | undefined;
    secrets: boolean;
  };
  requiresConnection: boolean;
  integrationProvider: string | null;
}

export interface ListAgentToolsResponse {
  tools: AgentRuntimeTool[];
}

export interface CallAgentToolRequest {
  toolName: string;
  input?: unknown;
  idempotencyKey?: string | undefined;
}

export interface CallAgentToolResponse {
  toolName: string;
  output: unknown;
  provenance: {
    actorType: 'external_agent';
    integrationId: string;
    keyId: string;
    workspaceId: string;
    runId: string;
    toolCallId: string;
    policyDecision: 'allow';
  };
}

export interface GmailSearchToolInput {
  query?: string | undefined;
  limit?: number | undefined;
}

export interface GmailGetMessageToolInput {
  externalId: string;
}

export interface GmailImportMessageToolInput {
  externalId: string;
}

export interface GmailDraftToolInput {
  sourceRecordId?: string | undefined;
  toAddresses: string[];
  ccAddresses?: string[] | undefined;
  bccAddresses?: string[] | undefined;
  subject: string;
  bodyText: string;
  threadExternalId?: string | null | undefined;
}

export interface AgentApiSearchResult {
  artifactId: string;
  fileNodeId: string;
  artifactVersionId: string;
  title: string;
  kind: string;
  excerpt: string;
  score: number;
  contentUrl: string;
}

export interface SearchAgentApiWorkspaceRequest {
  query: string;
  limit?: number | undefined;
  type?: AgentApiSearchMode | undefined;
}

export interface SearchAgentApiWorkspaceResponse {
  results: AgentApiSearchResult[];
  message?: string | undefined;
}

export interface Artifact {
  id: string;
  workspaceId: string;
  fileNodeId: string;
  kind: AgentArtifactKind | 'pdf';
  title: string;
  createdAt: string;
  updatedAt: string;
  privateToUserId?: string | undefined;
  candidateForSubmissionId?: string | undefined;
  latestVersionId: string;
}

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  createdAt: string;
  createdByUserId: string;
  metadata?: {
    label?: string | undefined;
  } | undefined;
}

export interface GetAgentApiFileResponse {
  node: AgentApiFileTreeNode;
  artifact: Artifact | null;
  latestVersion: ArtifactVersion | null;
  content: {
    kind: 'inlineText' | 'unsupported';
    text?: string | undefined;
  };
}

export interface CreateAgentApiArtifactRequest {
  title: string;
  text?: string | undefined;
  kind?: AgentCreateArtifactKind | undefined;
  format?: 'plain_text' | 'markdown' | 'prosemirror_json' | undefined;
}

export interface CreateAgentApiArtifactResponse {
  artifact: Artifact;
  version: ArtifactVersion;
}

export interface CreateAgentApiEventRequest {
  idempotencyKey: string;
  occurredAt: string;
  eventType: string;
  payload?: unknown;
}

export interface CreateAgentApiEventResponse {
  eventId: string;
}

export interface CreateAgentApiSignalRequest {
  findingTypeKey: string;
  summary: string;
  severity?: 'info' | 'warn' | 'high_alert' | undefined;
  value?: Record<string, unknown> | undefined;
  idempotencyKey: string;
}

export interface CreateAgentApiSignalResponse {
  signalId: string;
}

export type AgentSignalSeverity = 'info' | 'warn' | 'high_alert';
export type AgentSignalStatus = 'suggested' | 'accepted' | 'rejected';

export interface AgentSignal {
  id: string;
  workspaceId: string;
  findingTypeKey: string;
  severity: AgentSignalSeverity;
  status: AgentSignalStatus;
  summary: string;
  target: Record<string, unknown>;
  value: Record<string, unknown>;
  citations: unknown[];
  provenance: Record<string, unknown>;
  links: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ListAgentSignalsResponse {
  signals: AgentSignal[];
  nextCursor: string | null;
  asOf: string;
}

export type AgentMailboxItemKind =
  | 'automation.completed'
  | 'automation.failed'
  | 'signal.accepted'
  | 'signal.rejected'
  | 'proposal.approved'
  | 'proposal.rejected'
  | 'context.refresh';

export interface AgentMailboxItem {
  id: string;
  workspaceId: string;
  integrationId: string;
  kind: AgentMailboxItemKind;
  sourceType: string;
  sourceId: string;
  summary: string;
  links: Record<string, unknown>;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface ListAgentMailboxResponse {
  items: AgentMailboxItem[];
  nextCursor: string | null;
  unreadCount: number;
  asOf: string;
}

export interface AckAgentMailboxResponse {
  acknowledgedIds: string[];
}

export type AgentProfileField =
  | 'identity'
  | 'learnings'
  | 'goals'
  | 'timeline';

export interface AgentProfileFile {
  field: AgentProfileField;
  path: string;
  fileNodeId: string;
  artifactId: string | null;
  baseVersionId: string | null;
  text: string;
}

export interface AgentProfile {
  keyId: string;
  files: Partial<Record<AgentProfileField, AgentProfileFile>>;
}

export interface UpdateAgentProfileRequest {
  field: AgentProfileField;
  content: string;
  mode?: 'append' | 'replace' | undefined;
}

export interface UpdateAgentProfileResponse {
  proposalId: string;
  artifactId: string;
  baseVersionId: string;
  field: AgentProfileField;
  mode: 'append' | 'replace';
  status: 'pending_review';
}

export interface FilepadAgentClientConfig {
  /** Base URL of the Filepad backend, e.g. https://app.filepad.ai/api */
  baseUrl: string;
  /** Workspace id, e.g. ws_... */
  workspaceId: string;
  /** Agent Access key id, e.g. ik_... */
  keyId: string;
  /** Agent Access secret (plaintext, shown once on creation) */
  secret: string;
  /** Request timeout in milliseconds. Default: 30000 */
  timeoutMs?: number | undefined;
  /** Maximum retries on 5xx. Default: 3 */
  maxRetries?: number | undefined;
  /** Initial retry delay in milliseconds. Default: 1000 */
  retryDelayMs?: number | undefined;
}

export interface SignedRequest {
  headers: Record<string, string>;
  rawBody: string;
}

// ── Constitution types ──

export interface ConstitutionTerritory {
  readPaths: string[];
  writePaths: string[];
  proposePaths: string[];
  offLimits: string[];
  boundaryRule: string;
}

export interface ConstitutionActiveContextPendingItem {
  kind: 'proposal' | 'signal' | 'notification';
  id: string;
  summary: string;
}

export interface ConstitutionActiveContext {
  currentFocus: string | null;
  hotProjects: string[];
  nextMilestone: string | null;
  pendingItems: ConstitutionActiveContextPendingItem[];
  lastRefreshed: string;
}

export interface ConstitutionBehavioralRule {
  rule: string;
  rationale?: string | undefined;
}

export interface ConstitutionCommunication {
  urgentChannel: string;
  updateLocation: string;
  quietHours: string | null;
  stuckProtocol: string;
}

export interface ConstitutionVocabularyEntry {
  term: string;
  definition: string;
}

export interface WorkspaceConstitution {
  schemaVersion: 1;
  workspaceId: string;
  keyId: string;
  versionId: string;
  lastRefreshed: string;
  identity: {
    workspaceName: string;
    ownerName: string;
    ownerTimezone: string;
    installedKits: string[];
    role: string;
  };
  territory: ConstitutionTerritory;
  activeContext: ConstitutionActiveContext;
  behavioralRules: ConstitutionBehavioralRule[];
  communication: ConstitutionCommunication;
  vocabulary: ConstitutionVocabularyEntry[];
}

export interface GetConstitutionResponse {
  constitution: WorkspaceConstitution;
}

export interface ConstitutionVersionEntry {
  proposalId: string;
  status: 'proposed' | 'approved' | 'rejected' | 'superseded';
  summary: string | null;
  createdAt: string;
  createdByRunId: string | null;
  createdByMessageId: string | null;
  instruction: string | null;
  toolName: string | null;
}

export interface GetConstitutionHistoryResponse {
  versions: ConstitutionVersionEntry[];
}

export interface ExportConstitutionMarkdownResponse {
  content: string;
  filename: string;
}
