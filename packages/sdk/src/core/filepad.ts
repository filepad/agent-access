// Unified FilePad entry point. Composes all modules under one class.

import { FilepadAgentClient } from './client.js';
import type { FilepadAgentClientConfig } from './types.js';
import type { A2AInboundTask, A2ATask } from './types.js';
import { createHookClient } from '../hooks/client.js';
import { createGuardianClient } from '../contracts/client.js';
import { sendTask, type A2AClientConfig } from '../a2a/client.js';
import { registerEndpoint } from '../a2a/registration.js';

export interface FilePadConfig {
  workspaceId: string;
  auth: {
    keyId: string;
    secret: string;
  };
  baseUrl?: string;
  displayName?: string;
  a2aBearerToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class FilePad {
  private readonly _client: FilepadAgentClient;
  public readonly contracts: ReturnType<typeof createGuardianClient>;
  private readonly _hooksClient: ReturnType<typeof createHookClient>;
  private readonly _config: FilePadConfig;

  constructor(config: FilePadConfig) {
    this._config = config;
    const clientConfig: FilepadAgentClientConfig = {
      baseUrl: config.baseUrl ?? 'https://app.filepad.com',
      workspaceId: config.workspaceId,
      keyId: config.auth.keyId,
      secret: config.auth.secret,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
    };
    this._client = new FilepadAgentClient(clientConfig);
    this.contracts = createGuardianClient({
      baseUrl: clientConfig.baseUrl,
      workspaceId: config.workspaceId,
      keyId: config.auth.keyId,
      secret: config.auth.secret,
    });
    this._hooksClient = createHookClient(clientConfig);
  }

  // ── Connection ────────────────────────────────────────────────────────────

  connect() { return this._client.connect(); }
  bootstrap() { return this._client.bootstrap(); }
  verifyCredentials() { return this._client.verifyCredentials(); }
  getCapabilities() { return this._client.getCapabilities(); }

  // ── Workspace reads ───────────────────────────────────────────────────────

  getEnvironment() { return this._client.getEnvironment(); }
  getFileTree() { return this._client.getFileTree(); }
  getFile(fileNodeId: string) { return this._client.getFile(fileNodeId); }
  getPrompts() { return this._client.getPrompts(); }
  getConstitution() { return this._client.getConstitution(); }
  getConstitutionHistory() { return this._client.getConstitutionHistory(); }
  exportConstitutionMarkdown() { return this._client.exportConstitutionMarkdown(); }
  exportConstitutionPdf() { return this._client.exportConstitutionPdf(); }
  search(query: string, options?: { type?: 'semantic' | 'keyword' | 'hybrid'; limit?: number }) {
    return this._client.search(query, options);
  }
  getAgentProfile(options?: { fields?: string[] }) {
    return this._client.getAgentProfile(options as Parameters<FilepadAgentClient['getAgentProfile']>[0]);
  }

  // ── Tools ─────────────────────────────────────────────────────────────────

  listTools() { return this._client.listTools(); }
  callTool(params: Parameters<FilepadAgentClient['callTool']>[0]) {
    return this._client.callTool(params);
  }

  // ── Mailbox / signals ─────────────────────────────────────────────────────

  getMailbox(options?: Parameters<FilepadAgentClient['getMailbox']>[0]) {
    return this._client.getMailbox(options);
  }
  ackMailbox(ids: string[]) { return this._client.ackMailbox(ids); }
  getSignals(filters?: Parameters<FilepadAgentClient['getSignals']>[0]) {
    return this._client.getSignals(filters);
  }
  getSignal(signalId: string) { return this._client.getSignal(signalId); }

  // ── Write ─────────────────────────────────────────────────────────────────

  createArtifact(params: Parameters<FilepadAgentClient['createArtifact']>[0]) {
    return this._client.createArtifact(params);
  }
  createMarkdownArtifact(params: Parameters<FilepadAgentClient['createMarkdownArtifact']>[0]) {
    return this._client.createMarkdownArtifact(params);
  }
  createEvent(params: Parameters<FilepadAgentClient['createEvent']>[0]) {
    return this._client.createEvent(params);
  }
  createSignal(params: Parameters<FilepadAgentClient['createSignal']>[0]) {
    return this._client.createSignal(params);
  }
  proposeEdit(params: Parameters<FilepadAgentClient['proposeEdit']>[0]) {
    return this._client.proposeEdit(params);
  }

  // ── Contracts ─────────────────────────────────────────────────────────────

  createContract(params: Parameters<FilepadAgentClient['createContract']>[0]) {
    return this._client.createContract(params);
  }
  getContractStatus(params: Parameters<FilepadAgentClient['getContractStatus']>[0]) {
    return this._client.getContractStatus(params);
  }

  // ── Hooks (for hook event processors) ────────────────────────────────────

  get hooks() {
    return this._hooksClient;
  }

  // ── A2A outbound — send task to Filepad ───────────────────────────────────

  async task(text: string, options?: { metadata?: Record<string, unknown> }): Promise<A2ATask> {
    if (!this._config.a2aBearerToken) {
      throw new Error('A2A_BEARER_TOKEN_REQUIRED: pass a Filepad A2A bearer token in FilePadConfig.a2aBearerToken');
    }
    const a2aConfig: A2AClientConfig = {
      baseUrl: this._config.baseUrl ?? 'https://app.filepad.com',
      bearerToken: this._config.a2aBearerToken,
      workspaceId: this._config.workspaceId,
    };
    return sendTask(a2aConfig, text, options);
  }

  // ── A2A inbound — receive delegations from FilepadAI ─────────────────────

  async onTask(
    handler: (task: A2AInboundTask) => Promise<string>,
    options: { endpoint: string; port?: number; displayName?: string },
  ): Promise<{ stop: () => void }> {
    const { startReceiver } = await import('../a2a/receiver.js');
    const displayName = options.displayName ?? this._config.displayName ?? 'filepad-agent';
    const reg = await registerEndpoint({
      baseUrl: this._config.baseUrl ?? 'https://app.filepad.com',
      keyId: this._config.auth.keyId,
      secret: this._config.auth.secret,
      workspaceId: this._config.workspaceId,
      endpointUrl: options.endpoint,
      displayName,
    });
    const server = await startReceiver({ port: options.port ?? 7730, handler });
    return {
      stop: async () => {
        server.close();
        await reg.unregister();
      },
    };
  }

  // ── Raw client access ─────────────────────────────────────────────────────

  get raw(): FilepadAgentClient {
    return this._client;
  }
}
