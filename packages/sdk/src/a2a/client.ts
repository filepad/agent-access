// A2A v0.3 outbound client — send tasks to a Filepad workspace via A2A JSON-RPC.

import { randomUUID } from 'node:crypto';
import type { A2ATask, A2ATaskResult, A2AMessage } from '../core/types.js';

export interface A2AClientConfig {
  baseUrl: string;
  bearerToken: string;
  workspaceId: string;
}

function rpcBody(method: string, params: unknown, id?: string) {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? randomUUID(), method, params });
}

async function jsonRpc<T>(
  endpointUrl: string,
  bearerToken: string,
  method: string,
  params: unknown,
): Promise<T> {
  const id = randomUUID();
  const body = rpcBody(method, params, id);
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearerToken}`,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`A2A HTTP ${res.status}: ${text}`);
  const parsed = JSON.parse(text) as { result?: T; error?: { code: number; message: string } };
  if (parsed.error) throw new Error(`A2A error ${parsed.error.code}: ${parsed.error.message}`);
  return parsed.result as T;
}

function extractResultText(task: A2ATask): string {
  // Try artifacts first
  const artifact = task.artifacts?.[0];
  if (artifact) {
    const textParts = artifact.parts.filter((p) => p.kind === 'text');
    if (textParts.length > 0) {
      return textParts.map((p) => (p.kind === 'text' ? p.text : '')).join('\n');
    }
  }
  // Fall back to status message
  const msg = task.status.message;
  if (msg) {
    return msg.parts
      .filter((p) => p.kind === 'text')
      .map((p) => (p.kind === 'text' ? p.text : ''))
      .join('\n');
  }
  return '';
}

export async function sendTask(
  config: A2AClientConfig,
  text: string,
  options?: { timeoutMs?: number },
): Promise<A2ATaskResult> {
  const timeoutMs = options?.timeoutMs ?? 300_000;
  const endpointUrl = `${config.baseUrl.replace(/\/$/, '')}/a2a`;
  const startMs = Date.now();

  const message: A2AMessage = {
    kind: 'message',
    messageId: randomUUID(),
    role: 'user',
    parts: [{ kind: 'text', text }],
  };

  // Try blocking first (server waits up to 30s before returning)
  let task = await jsonRpc<A2ATask>(endpointUrl, config.bearerToken, 'message/send', {
    message,
    configuration: { blocking: true, acceptedOutputModes: ['text/plain'] },
  });

  const terminalStates = new Set(['completed', 'failed', 'canceled', 'rejected']);

  // If not terminal, poll until terminal or timeout
  if (!terminalStates.has(task.status.state)) {
    const taskId = task.id;
    const pollIntervalMs = 2_000;
    while (!terminalStates.has(task.status.state)) {
      if (Date.now() - startMs > timeoutMs) {
        throw new Error(`A2A task ${taskId} timed out after ${timeoutMs}ms (state: ${task.status.state})`);
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      task = await jsonRpc<A2ATask>(endpointUrl, config.bearerToken, 'tasks/get', {
        id: taskId,
      });
    }
  }

  if (task.status.state === 'failed') {
    throw new Error(`A2A task failed: ${extractResultText(task) || task.status.state}`);
  }
  if (task.status.state === 'canceled' || task.status.state === 'rejected') {
    throw new Error(`A2A task ${task.status.state}`);
  }

  return {
    taskId: task.id,
    contextId: task.contextId,
    result: extractResultText(task),
    rawTask: task,
    executionMs: Date.now() - startMs,
  };
}

export async function getTask(
  config: A2AClientConfig,
  taskId: string,
): Promise<A2ATask> {
  const endpointUrl = `${config.baseUrl.replace(/\/$/, '')}/a2a`;
  return jsonRpc<A2ATask>(endpointUrl, config.bearerToken, 'tasks/get', { id: taskId });
}

export async function cancelTask(
  config: A2AClientConfig,
  taskId: string,
): Promise<void> {
  const endpointUrl = `${config.baseUrl.replace(/\/$/, '')}/a2a`;
  await jsonRpc(endpointUrl, config.bearerToken, 'tasks/cancel', { id: taskId });
}
