// Minimal HTTP server that accepts inbound A2A tasks from Filepad.
// Accepts POST /a2a, dispatches to handler, returns task response.

import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { A2AInboundTask, A2AMessage, A2ATask } from '../core/types.js';

export interface ReceiverOptions {
  port: number;
  handler: (task: A2AInboundTask) => Promise<string>;
}

function extractText(message: A2AMessage): string {
  return message.parts
    .filter((p) => p.kind === 'text')
    .map((p) => (p.kind === 'text' ? p.text : ''))
    .join('\n');
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

export async function startReceiver(options: ReceiverOptions): Promise<Server> {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;

    let parsed: { jsonrpc: string; id?: unknown; method?: string; params?: unknown };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(rpcError(null, -32700, 'Parse error'));
      return;
    }

    const { id, method, params } = parsed;

    if (method === '/.well-known/agent-card.json' || req.url === '/.well-known/agent-card.json') {
      // Redirect agent card requests to the right path
      res.writeHead(302, { location: '/.well-known/agent-card.json' });
      res.end();
      return;
    }

    if (method !== 'message/send') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(rpcError(id as string, -32601, 'Method not found'));
      return;
    }

    const msgParams = params as { message?: A2AMessage; configuration?: unknown };
    const message = msgParams?.message;
    if (!message || message.kind !== 'message') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(rpcError(id as string, -32602, 'Invalid params: message required'));
      return;
    }

    const taskId = message.taskId ?? randomUUID();
    const contextId = message.contextId ?? randomUUID();
    const timestamp = new Date().toISOString();

    // Return SUBMITTED immediately
    const submittedTask: A2ATask = {
      kind: 'task',
      id: taskId,
      contextId,
      status: { state: 'submitted', timestamp },
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(rpcResult(id as string, submittedTask));

    // Execute handler asynchronously
    const inboundTask: A2AInboundTask = {
      taskId,
      contextId,
      text: extractText(message),
      parts: message.parts,
      rawMessage: message,
    };

    options.handler(inboundTask).catch((err) => {
      console.error('[filepad-sdk] A2A task handler error:', err);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(options.port, () => resolve());
    server.on('error', reject);
  });

  return server;
}
