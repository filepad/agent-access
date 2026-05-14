// FILE MEMO: MCP Server factory. Wires protocol handlers to Agent Access SDK.

import { FilepadAgentClient } from '@filepad/agent-access-sdk';
import type { AgentAccessScope } from '@filepad/agent-access-sdk';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  handleInitialize,
  handleListTools,
  handleCallTool,
  handleListResources,
  handleReadResource,
  handleListPrompts,
  handleGetPrompt,
  type McpHandlerContext,
} from './handlers.js';

export interface FilepadMcpServerConfig {
  baseUrl: string;
  workspaceId: string;
  keyId: string;
  secret: string;
}

// ── Custom discriminated request types (MCP SDK unions method as string) ──

interface McpMethodMessage {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

interface McpRequest extends McpMethodMessage {
  id: string | number;
}

function isMcpMethodMessage(msg: JSONRPCMessage): msg is McpMethodMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'method' in msg &&
    typeof msg.method === 'string'
  );
}

function isMcpRequest(msg: McpMethodMessage): msg is McpRequest {
  return (
    'id' in msg &&
    (typeof msg.id === 'string' || typeof msg.id === 'number')
  );
}

export class FilepadMcpServer {
  private readonly client: FilepadAgentClient;
  private readonly workspaceId: string;
  private scopes: AgentAccessScope[] = [];

  constructor(config: FilepadMcpServerConfig) {
    this.client = new FilepadAgentClient(config);
    this.workspaceId = config.workspaceId;
  }

  private get context(): McpHandlerContext {
    return {
      client: this.client,
      workspaceId: this.workspaceId,
      scopes: this.scopes,
    };
  }

  async initialize(): Promise<void> {
    const caps = await this.client.verifyCredentials();
    this.scopes = caps.scopes;
  }

  async handleMessage(
    message: JSONRPCMessage,
  ): Promise<JSONRPCMessage | JSONRPCMessage[] | null> {
    if (!isMcpMethodMessage(message)) {
      return null; // Response, not request
    }

    // MCP uses JSON-RPC notifications such as notifications/initialized.
    // Notifications have no id and must not receive a response.
    if (!isMcpRequest(message)) {
      return null;
    }

    const { id, method } = message;

    try {
      switch (method) {
        case 'ping': {
          return { jsonrpc: '2.0', id, result: {} };
        }

        case 'initialize': {
          const result = await handleInitialize();
          return { jsonrpc: '2.0', id, result };
        }

        case 'tools/list': {
          const result = await handleListTools(message, this.context);
          return { jsonrpc: '2.0', id, result };
        }

        case 'tools/call': {
          const result = await handleCallTool(message, this.context);
          return { jsonrpc: '2.0', id, result };
        }

        case 'resources/list': {
          const result = await handleListResources(message, this.context);
          return { jsonrpc: '2.0', id, result };
        }

        case 'resources/read': {
          const result = await handleReadResource(message, this.context);
          return { jsonrpc: '2.0', id, result };
        }

        case 'prompts/list': {
          const result = await handleListPrompts(message, this.context);
          return { jsonrpc: '2.0', id, result };
        }

        case 'prompts/get': {
          const result = await handleGetPrompt(message, this.context);
          return { jsonrpc: '2.0', id, result };
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }
    } catch (err) {
      const message_text = err instanceof Error ? err.message : String(err);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: message_text,
        },
      };
    }
  }
}
