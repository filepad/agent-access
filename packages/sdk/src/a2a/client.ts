// A2A v0.3 outbound client — submit tasks to a Filepad workspace via A2A JSON-RPC.

import { randomUUID } from 'node:crypto';
import type { A2AMessage, A2ATask } from '../core/types.js';

export interface A2AClientConfig {
  baseUrl: string;
  bearerToken: string;
  workspaceId: string;
}

export interface SendTaskOptions {
  metadata?: Record<string, unknown> | undefined;
  acceptedOutputModes?: string[] | undefined;
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

export function extractTaskText(task: A2ATask): string {
  const artifact = task.artifacts?.[0];
  if (artifact) {
    const textParts = artifact.parts.filter((p) => p.kind === 'text');
    if (textParts.length > 0) {
      return textParts.map((p) => (p.kind === 'text' ? p.text : '')).join('\n');
    }
  }
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
  options?: SendTaskOptions,
): Promise<A2ATask> {
  const endpointUrl = `${config.baseUrl.replace(/\/$/, '')}/a2a`;
  const message: A2AMessage = {
    kind: 'message',
    messageId: randomUUID(),
    role: 'user',
    parts: [{ kind: 'text', text }],
    ...(options?.metadata ? { metadata: options.metadata } : {}),
  };

  return jsonRpc<A2ATask>(endpointUrl, config.bearerToken, 'message/send', {
    message,
    configuration: {
      blocking: false,
      acceptedOutputModes: options?.acceptedOutputModes ?? ['text/plain'],
    },
  });
}

export const submitTask = sendTask;

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
