// @filepad/sdk — single entry point for all Filepad agent SDK functionality.

// ── Main class ────────────────────────────────────────────────────────────────
export { FilePad, type FilePadConfig } from './core/filepad.js';

// ── Low-level client (for direct access) ─────────────────────────────────────
export { FilepadAgentClient } from './core/client.js';
export { FilepadAgentHttpClient } from './core/http.js';
export { signRequest, serializeBody, sha256Hex, buildCanonicalString } from './core/auth.js';
export { sendRemoteMcpMessage, sendMcpMessage, type RemoteMcpConfig, type JsonRpcMessage } from './core/remote-mcp.js';
export { McpAdapter } from './core/mcp.js';

// ── Error types ───────────────────────────────────────────────────────────────
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
} from './core/errors.js';

// ── All types ─────────────────────────────────────────────────────────────────
export type {
  AgentAccessScope,
  AgentArtifactKind,
  AgentApiFileTreeNode,
  AgentConnectDiagnosticsResponse,
  GetAgentApiCapabilitiesResponse,
  GetAgentApiEnvironmentResponse,
  GetAgentApiFileTreeResponse,
  GetAgentApiFileResponse,
  CreateAgentApiArtifactRequest,
  CreateAgentApiArtifactResponse,
  SearchAgentApiWorkspaceRequest,
  SearchAgentApiWorkspaceResponse,
  AgentRuntimeTool,
  CallAgentToolRequest,
  CallAgentToolResponse,
  ListAgentMailboxResponse,
  AgentMailboxItem,
  ListAgentSignalsResponse,
  AgentSignal,
  FilepadAgentClientConfig,
  WorkspaceConstitution,
  GetConstitutionResponse,
  // A2A types
  A2ATaskState,
  A2APart,
  A2ATextPart,
  A2AFilePart,
  A2ADataPart,
  A2AMessage,
  A2AArtifact,
  A2ATask,
  A2ATaskStatus,
  A2ATaskResult,
  A2AInboundTask,
} from './core/types.js';

// ── Pairing ───────────────────────────────────────────────────────────────────
export {
  pairAgent,
  renderPairResult,
  SUPPORTED_RUNTIMES,
  type AgentRuntime,
  type PairOptions,
  type PairResult,
  type PairResponse,
} from './cli/commands/connect-impl.js';

// ── Hooks ─────────────────────────────────────────────────────────────────────
export { createHookClient } from './hooks/client.js';
export { resolveCredentials, writeCredentialsFile } from './hooks/config.js';
export { resolveEnforcementMode, resolveOfflinePolicy } from './hooks/enforcement.js';

// ── Contracts / guardian ──────────────────────────────────────────────────────
export { createGuardianClient } from './contracts/client.js';
export { loadConfig as loadGuardianConfig } from './contracts/config.js';
export { buildEvidencePayload } from './contracts/evidence.js';
export { deriveCommand, extractCheckFromRaw } from './contracts/commands.js';
export { runCommand } from './contracts/command-runner.js';

// ── Install / doctor ──────────────────────────────────────────────────────────
export {
  installClaudeCodeRuntime,
  installClaudeCodeRuntimeFromPairingCode,
} from './install/install.js';
export { doctorClaudeCodeRuntime } from './install/doctor.js';
export { buildClaudeCodeHooksConfig, mergeClaudeCodeHooks } from './install/claude-settings.js';

// ── A2A ───────────────────────────────────────────────────────────────────────
export { sendTask, submitTask, getTask, cancelTask, extractTaskText, type A2AClientConfig, type SendTaskOptions } from './a2a/client.js';
export { registerEndpoint, type EndpointRegistrationConfig, type EndpointRegistration } from './a2a/registration.js';
export { startReceiver, type ReceiverOptions } from './a2a/receiver.js';
