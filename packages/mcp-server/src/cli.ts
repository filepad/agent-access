#!/usr/bin/env node
// FILE MEMO: Production-hardened CLI entry point for stdio MCP server.

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { FilepadAgentClient } from '@filepad/agent-access-sdk';
import { createInterface } from 'node:readline/promises';
import { FilepadMcpServer } from './server.js';
import { listToolsForScopes } from './tool-registry.js';

type ConfigValidation =
  | { ok: true; baseUrl: string; workspaceId: string; keyId: string; secret: string }
  | { ok: false; missing: string[] };

type CliMode = 'stdio' | 'health' | 'bootstrap' | 'tools' | 'call' | 'help';

interface CliOptions {
  mode: CliMode;
  withSchemas: boolean;
  toolName?: string | undefined;
  argsJson?: string | undefined;
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function parseOptions(argv: string[]): CliOptions {
  const first = argv[0];
  const withSchemas = argv.includes('--with-schemas');
  if (!first) return { mode: 'stdio', withSchemas };
  if (first === '--health' || first === 'health') return { mode: 'health', withSchemas };
  if (first === '--bootstrap' || first === 'bootstrap') return { mode: 'bootstrap', withSchemas };
  if (first === '--tools' || first === 'tools') return { mode: 'tools', withSchemas };
  if (first === '--call' || first === 'call') {
    const toolName = first === '--call' ? argv[1] : argv[1];
    return {
      mode: 'call',
      withSchemas,
      toolName,
      argsJson: readFlag(argv, '--args') ?? argv[2],
    };
  }
  if (first === '--help' || first === '-h' || first === 'help') return { mode: 'help', withSchemas };
  return { mode: 'stdio', withSchemas };
}

function printHelp() {
  process.stdout.write(
    [
      'Filepad MCP Server',
      '',
      'Stdio MCP mode:',
      '  filepad-mcp-server',
      '',
      'Agent-facing diagnostics:',
      '  filepad-mcp-server --health      Verify credentials and print scopes',
      '  filepad-mcp-server --bootstrap   Print the same payload as filepad_bootstrap',
      '  filepad-mcp-server --tools       Print available Filepad MCP and RuntimeTool names',
      '  filepad-mcp-server --tools --with-schemas',
      '  filepad-mcp-server --call filepad_list_tree --args \'{}\'',
      '',
      'Required environment:',
      '  FILEPAD_BASE_URL',
      '  FILEPAD_WORKSPACE_ID',
      '  FILEPAD_AGENT_KEY_ID',
      '  FILEPAD_AGENT_SECRET',
      '',
    ].join('\n'),
  );
}

function requiredFieldsFromSchema(schema: Record<string, unknown>): string[] {
  const required = schema['required'];
  return Array.isArray(required)
    ? required.filter((field): field is string => typeof field === 'string')
    : [];
}

function toolSignature(name: string, inputSchema: Record<string, unknown>): string {
  const required = requiredFieldsFromSchema(inputSchema);
  return required.length === 0
    ? `${name}()`
    : `${name}(${required.join(', ')})`;
}

function writeJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

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

function createClient(config: Extract<ConfigValidation, { ok: true }>) {
  return new FilepadAgentClient({
    baseUrl: config.baseUrl,
    workspaceId: config.workspaceId,
    keyId: config.keyId,
    secret: config.secret,
  });
}

async function runDiagnosticMode(
  options: CliOptions & { mode: 'health' | 'bootstrap' | 'tools' | 'call' },
  config: Extract<ConfigValidation, { ok: true }>,
) {
  const client = createClient(config);
  if (options.mode === 'health') {
    const result = await client.verifyCredentials();
    writeJson({
      status: 'ok',
      workspaceId: config.workspaceId,
      agent: result.agent,
      scopes: result.scopes,
    });
    return;
  }

  if (options.mode === 'bootstrap') {
    writeJson(await client.bootstrap());
    return;
  }

  const capabilities = await client.verifyCredentials();
  if (options.mode === 'call') {
    if (!options.toolName) {
      throw new Error('Missing tool name. Usage: filepad-mcp-server --call <toolName> --args \'{}\'');
    }
    let parsedArgs: unknown = {};
    if (options.argsJson) {
      try {
        parsedArgs = JSON.parse(options.argsJson);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid --args JSON: ${message}`);
      }
    }
    const server = new FilepadMcpServer(config);
    await server.initialize();
    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'cli-call',
      method: 'tools/call',
      params: {
        name: options.toolName,
        arguments: parsedArgs,
      },
    });
    writeJson(response);
    return;
  }

  const runtimeTools = await client.listTools().catch(() => ({ tools: [] }));
  writeJson({
    status: 'ok',
    workspaceId: config.workspaceId,
    mcpTools: listToolsForScopes(capabilities.scopes).map((tool) => ({
      name: tool.name,
      signature: toolSignature(tool.name, tool.inputSchema),
      description: tool.description,
      requiredScopes: tool.requiredScopes,
      ...(options.withSchemas ? { inputSchema: tool.inputSchema } : {}),
    })),
    runtimeTools: runtimeTools.tools.map((tool) => ({
      name: tool.providerName,
      signature: toolSignature(tool.providerName, tool.inputSchema),
      description: tool.description,
      requiredScopes: tool.requiredScopes,
      ...(options.withSchemas ? { inputSchema: tool.inputSchema } : {}),
    })),
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.mode === 'help') {
    printHelp();
    return;
  }

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

  if (options.mode !== 'stdio') {
    await runDiagnosticMode(
      options as CliOptions & { mode: 'health' | 'bootstrap' | 'tools' | 'call' },
      config,
    );
    return;
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
