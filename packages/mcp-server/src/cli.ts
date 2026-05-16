#!/usr/bin/env node
// FILE MEMO: Production-hardened CLI entry point for stdio MCP server.

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { createInterface } from 'node:readline/promises';
import { FilepadMcpServer } from './server.js';

type ConfigValidation =
  | { ok: true; baseUrl: string; workspaceId: string; keyId: string; secret: string }
  | { ok: false; missing: string[] };

function validateConfig(): ConfigValidation {
  const required = [
    { name: 'FILEPAD_BASE_URL', value: process.env['FILEPAD_BASE_URL'] },
    { name: 'FILEPAD_WORKSPACE_ID', value: process.env['FILEPAD_WORKSPACE_ID'] },
    { name: 'FILEPAD_AGENT_KEY_ID', value: process.env['FILEPAD_AGENT_KEY_ID'] },
    { name: 'FILEPAD_AGENT_SECRET', value: process.env['FILEPAD_AGENT_SECRET'] },
  ];

  const missing = required.filter((r) => !r.value).map((r) => r.name);
  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const [baseUrl, workspaceId, keyId, secret] = required.map((r) => r.value);
  if (!baseUrl || !workspaceId || !keyId || !secret) {
    return { ok: false, missing: [] };
  }

  return { ok: true, baseUrl, workspaceId, keyId, secret };
}

function writeErrorResponse(code: number, message: string, id: string | number | null = null) {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    }) + '\n',
  );
}

async function main() {
  const config = validateConfig();
  if (!config.ok) {
    console.error(
      'Filepad MCP Server startup failed. Missing required environment variables:\n' +
        config.missing.map((v) => `  - ${v}`).join('\n') +
        '\n\nSet these variables and restart.\n' +
        'Docs: https://github.com/filepad/agent-access/tree/main/packages/mcp-server#readme',
    );
    process.exit(1);
  }

  let shuttingDown = false;

  function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    // Stdio transport: no persistent connections to close.
    // Just exit cleanly so the MCP client sees EOF.
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  const server = new FilepadMcpServer({
    baseUrl: config.baseUrl,
    workspaceId: config.workspaceId,
    keyId: config.keyId,
    secret: config.secret,
  });

  try {
    await server.initialize();
  } catch (initErr) {
    const message = initErr instanceof Error ? initErr.message : String(initErr);
    console.error(`Filepad MCP Server initialization failed: ${message}`);
    console.error(
      'Check FILEPAD_BASE_URL, FILEPAD_WORKSPACE_ID, FILEPAD_AGENT_KEY_ID, and FILEPAD_AGENT_SECRET.',
    );
    process.exit(1);
  }

  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  input.on('close', () => {
    shutdown('stdin-close');
  });

  for await (const line of input) {
    if (shuttingDown) break;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let message: JSONRPCMessage;
    try {
      message = JSON.parse(trimmed) as JSONRPCMessage;
    } catch (parseErr) {
      const errText = parseErr instanceof Error ? parseErr.message : 'Invalid JSON';
      writeErrorResponse(-32700, `Parse error: ${errText}`, null);
      continue;
    }

    // Use message id for basic tracing
    const msgId =
      typeof message === 'object' && message !== null && 'id' in message
        ? (message as { id?: string | number }).id ?? null
        : null;

    try {
      const response = await server.handleMessage(message);
      if (!response) continue;

      const responses = Array.isArray(response) ? response : [response];
      for (const res of responses) {
        process.stdout.write(JSON.stringify(res) + '\n');
      }
    } catch (handlerErr) {
      const errText = handlerErr instanceof Error ? handlerErr.message : 'Internal error';
      writeErrorResponse(-32603, errText, msgId);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
