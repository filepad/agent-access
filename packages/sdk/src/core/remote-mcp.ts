// FILE MEMO: Remote MCP Streamable HTTP helpers for Filepad Agent Access.

export type JsonRpcMessage = {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type RemoteMcpConfig = {
  url: string;
  bearerToken?: string | undefined;
  headers?: Record<string, string> | undefined;
};

function headersFor(config: RemoteMcpConfig, accept?: string): Headers {
  const headers = new Headers(config.headers ?? {});
  headers.set('content-type', 'application/json');
  if (accept) headers.set('accept', accept);
  if (config.bearerToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${config.bearerToken}`);
  }
  return headers;
}

function parseJsonLines(text: string): JsonRpcMessage[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) return [JSON.parse(trimmed) as JsonRpcMessage];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as JsonRpcMessage[];
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRpcMessage);
}

function parseSseMessages(text: string): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];
  for (const frame of text.split('\n\n')) {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n');
    if (data) messages.push(JSON.parse(data) as JsonRpcMessage);
  }
  return messages;
}

export async function sendRemoteMcpMessage(
  config: RemoteMcpConfig,
  message: JsonRpcMessage | JsonRpcMessage[],
  options?: { sse?: boolean | undefined },
): Promise<JsonRpcMessage[]> {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: headersFor(config, options?.sse ? 'text/event-stream' : 'application/json'),
    body: JSON.stringify(message),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Remote MCP HTTP ${response.status}: ${text}`);
  }
  if (response.status === 202 || !text.trim()) return [];

  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('text/event-stream')
    ? parseSseMessages(text)
    : parseJsonLines(text);
}

export const sendMcpMessage = sendRemoteMcpMessage;
