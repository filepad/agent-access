// FILE MEMO: Public exports for @filepad/agent-access-sdk.

export { FilepadAgentClient } from './client.js';
export { FilepadAgentHttpClient } from './endpoints.js';
export { McpAdapter } from './mcp.js';
export { signRequest, buildCanonicalString, serializeBody, sha256Hex } from './auth.js';
export {
  FilepadAgentError,
  AuthenticationError,
  ForbiddenScopeError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ProposalPathError,
  BaseTextMismatchError,
  StaleVersionError,
  InvalidRequestError,
  fromResponse,
} from './errors.js';

export type {
  FilepadAgentClientConfig,
  SignedRequest,
  AgentAccessScope,
  AgentApiPrompt,
  AgentApiSearchMode,
  AgentApiSearchResult,
  CreateAgentApiArtifactRequest,
  CreateAgentApiArtifactResponse,
  CreateAgentApiEventRequest,
  CreateAgentApiEventResponse,
  CreateAgentApiSignalRequest,
  CreateAgentApiSignalResponse,
  AckAgentMailboxResponse,
  AgentProfile,
  AgentProfileField,
  AgentProfileFile,
  AgentMailboxItem,
  AgentMailboxItemKind,
  AgentSignal,
  AgentSignalSeverity,
  AgentSignalStatus,
  GetAgentApiCapabilitiesResponse,
  GetAgentApiEnvironmentResponse,
  GetAgentApiFileResponse,
  GetAgentApiFileTreeResponse,
  GetAgentApiPromptsResponse,
  ListAgentMailboxResponse,
  ListAgentSignalsResponse,
  GetMcpPromptsResponse,
  GetMcpResourcesResponse,
  McpPrompt,
  McpResource,
  SearchAgentApiWorkspaceRequest,
  SearchAgentApiWorkspaceResponse,
  UpdateAgentProfileRequest,
  UpdateAgentProfileResponse,
} from './types.js';
