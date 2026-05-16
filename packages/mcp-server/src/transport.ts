// FILE MEMO: Streamable HTTP transport for MCP over Filepad Agent Access.
// Reuses HMAC auth at the transport boundary. No business logic.

import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export interface StreamableHttpConfig {
  baseUrl: string;
  workspaceId: string;
  keyId: string;
  secret: string;
}

function signRequest(
  keyId: string,
  secret: string,
  method: string,
  pathWithQuery: string,
  body: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const bodyHash = createHash('sha256')
    .update(Buffer.from(body, 'utf8'))
    .digest('hex');
  const canonical = [method.toUpperCase(), pathWithQuery, timestamp, nonce, bodyHash].join('\n');
  const signature = createHmac('sha256', secret)
    .update(canonical, 'utf8')
    .digest('base64');
  return {
    'content-type': 'application/json',
    'x-integration-key-id': keyId,
    'x-integration-timestamp': timestamp,
    'x-integration-nonce': nonce,
    'x-integration-signature': signature,
  };
}

/**
 * Send a JSON-RPC message to the Filepad MCP endpoint via Streamable HTTP.
 */
export async function sendMcpMessage(
  config: StreamableHttpConfig,
  message: JSONRPCMessage,
): Promise<JSONRPCMessage[]> {
  const pathWithQuery = `/mcp/v1/workspaces/${encodeURIComponent(config.workspaceId)}/stream`;
  const url = `${config.baseUrl.replace(/\/$/, '')}${pathWithQuery}`;
  const body = JSON.stringify(message);
  const headers = signRequest(config.keyId, config.secret, 'POST', pathWithQuery, body);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP HTTP ${response.status}: ${text}`);
  }

  const responseText = await response.text();
  if (!responseText.trim()) return [];

  // Streamable HTTP can return newline-delimited JSON for multiple messages
  const messages: JSONRPCMessage[] = [];
  for (const line of responseText.split('\n').filter((l) => l.trim())) {
    try {
      messages.push(JSON.parse(line) as JSONRPCMessage);
    } catch {
      // Ignore non-JSON lines
    }
  }
  return messages;
}
