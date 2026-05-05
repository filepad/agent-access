#!/usr/bin/env node
/**
 * MCP Proof Harness
 *
 * Performs a deterministic stdio JSON-RPC proof against Filepad Agent Access.
 *
 * Protocol:
 *   1. initialize
 *   2. tools/list
 *   3. filepad_health
 *   4. filepad_list_tree
 *   5. filepad_search (optional)
 *   6. filepad_list_signals
 *   7. filepad_emit_event (optional)
 *
 * Usage:
 *   FILEPAD_BASE_URL=... FILEPAD_WORKSPACE_ID=... FILEPAD_AGENT_KEY_ID=... FILEPAD_AGENT_SECRET=... \
 *     node scripts/agent-access/mcp-proof.mjs [local|staging]
 *
 * FILEPAD_BASE_URL takes precedence over the target default. If neither is set:
 *   local   => http://localhost:3000/api
 *   staging => https://app.filepad.ai/api
 *
 * Requirements:
 *   - Must use ONLY MCP stdio JSON-RPC + Agent Access HMAC credentials
 *   - Must NOT use direct DB, local files, session cookies, private routes,
 *     psql, curl to private endpoints, or app session auth.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const MONOREPO_ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT_NAME = 'mcp-proof';

function log(msg) {
  console.log(`[${SCRIPT_NAME}] ${msg}`);
}

function fatal(msg) {
  console.error(`[${SCRIPT_NAME}] ❌ ${msg}`);
  process.exit(1);
}

function printAuthFailure(baseUrl, workspaceId, keyId) {
  console.error('');
  console.error('╔═══════════════════════════════════════════════════════════════╗');
  console.error('║  AGENT ACCESS AUTHENTICATION FAILED                           ║');
  console.error('╚═══════════════════════════════════════════════════════════════╝');
  console.error(`  Base URL:    ${baseUrl}`);
  console.error(`  Workspace:   ${workspaceId}`);
  console.error(`  Key ID:      ${keyId}`);
  console.error('');
  console.error('  Likely causes:');
  console.error('    - Key has been revoked or rotated');
  console.error('    - Secret does not match the key id');
  console.error('    - Wrong workspace id for this key');
  console.error('    - Base URL does not match the deployment (e.g. missing /api)');
  console.error('    - Clock skew: system time is more than a few minutes off');
  console.error('    - Key was created in a different workspace');
  console.error('');
  console.error('  Fix: Create a fresh Agent Access key in the target workspace,');
  console.error('        copy the secret, and update FILEPAD_AGENT_SECRET.');
  console.error('');
}

const target = process.argv[2] || 'local';
const envBaseUrl = process.env['FILEPAD_BASE_URL'];
const targetBaseUrl = target === 'staging'
  ? 'https://app.filepad.ai/api'
  : 'http://localhost:3000/api';
const baseUrl = envBaseUrl || targetBaseUrl;

const workspaceId = process.env['FILEPAD_WORKSPACE_ID'];
const keyId = process.env['FILEPAD_AGENT_KEY_ID'];
const secret = process.env['FILEPAD_AGENT_SECRET'];

if (!workspaceId || !keyId || !secret) {
  fatal(
    'Missing required environment variables:\n' +
      '  FILEPAD_WORKSPACE_ID\n' +
      '  FILEPAD_AGENT_KEY_ID\n' +
      '  FILEPAD_AGENT_SECRET\n\n' +
      'Create an Agent Access key in Filepad and set these variables.'
  );
}

log(`Target argument: ${target}`);
log(`Base URL: ${baseUrl}` + (envBaseUrl ? ' (from env)' : ' (target default)'));
log(`Workspace: ${workspaceId}`);
log(`Key ID: ${keyId}`);

// Use the built MCP server from the monorepo
const mcpBin = resolve(MONOREPO_ROOT, 'packages/mcp-server/dist/cli.js');

const child = spawn('node', [mcpBin], {
  env: {
    ...process.env,
    FILEPAD_BASE_URL: baseUrl,
    FILEPAD_WORKSPACE_ID: workspaceId,
    FILEPAD_AGENT_KEY_ID: keyId,
    FILEPAD_AGENT_SECRET: secret,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const responses = [];
let stderrBuffer = '';
let stdoutBuffer = '';
let childExited = false;
let childExitCode = null;

child.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk.toString('utf8');
  const lines = stdoutBuffer.split('\n');
  stdoutBuffer = lines.pop() || '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      if ('id' in msg) {
        responses.push(msg);
      }
      if (msg && 'result' in msg) {
        log(`← ${JSON.stringify(msg.result).slice(0, 120)}...`);
      } else if (msg && 'error' in msg) {
        log(`← ERROR: ${msg.error?.message || 'unknown'}`);
      }
    } catch {
      // ignore non-JSON lines
    }
  }
});

child.stderr.on('data', (chunk) => {
  stderrBuffer += chunk.toString('utf8');
});

child.on('exit', (code) => {
  childExited = true;
  childExitCode = code;
});

child.on('error', (err) => fatal(`MCP server process error: ${err.message}`));

const STEPS = [
  {
    name: 'initialize',
    send: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    validate: (res) => {
      if (!res.result?.serverInfo?.name) throw new Error('Missing serverInfo.name');
      return `server=${res.result.serverInfo.name} v${res.result.serverInfo.version}`;
    },
  },
  {
    name: 'tools/list',
    send: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    validate: (res) => {
      if (!Array.isArray(res.result?.tools)) throw new Error('Missing tools array');
      const names = res.result.tools.map((t) => t.name).join(', ');
      return `${res.result.tools.length} tools: ${names}`;
    },
  },
  {
    name: 'filepad_health',
    send: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'filepad_health', arguments: {} },
    },
    validate: (res) => {
      const text = res.result?.content?.[0]?.text;
      if (!text) throw new Error('Missing content text');
      const body = JSON.parse(text);
      if (body.status !== 'ok') throw new Error(`Status: ${body.status}`);
      return `status=${body.status}, scopes=[${body.scopes?.join(', ') ?? 'none'}]`;
    },
  },
  {
    name: 'filepad_list_tree',
    send: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'filepad_list_tree', arguments: {} },
    },
    validate: (res) => {
      const text = res.result?.content?.[0]?.text;
      if (!text) throw new Error('Missing content text');
      const body = JSON.parse(text);
      if (!Array.isArray(body.nodes)) throw new Error('Missing nodes array');
      return `${body.nodes.length} tree nodes`;
    },
  },
  {
    name: 'filepad_search',
    send: {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'filepad_search', arguments: { query: 'test' } },
    },
    validate: (res) => {
      const text = res.result?.content?.[0]?.text;
      if (!text) throw new Error('Missing content text');
      const body = JSON.parse(text);
      return `${body.results?.length ?? 0} search results`;
    },
  },
  {
    name: 'filepad_list_signals',
    send: {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'filepad_list_signals', arguments: { limit: 5 } },
    },
    validate: (res) => {
      const text = res.result?.content?.[0]?.text;
      if (!text) throw new Error('Missing content text');
      const body = JSON.parse(text);
      if (!Array.isArray(body.signals)) throw new Error('Missing signals array');
      return `${body.signals.length} visible signals`;
    },
  },
  {
    name: 'filepad_emit_event',
    send: {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'filepad_emit_event', arguments: { eventType: 'agent.mcp.proof.completed', payload: { source: 'mcp-proof.mjs' } } },
    },
    validate: (res) => {
      const text = res.result?.content?.[0]?.text;
      if (!text) throw new Error('Missing content text');
      const body = JSON.parse(text);
      return `eventId=${body.eventId ?? 'unknown'}`;
    },
  },
];

function checkEarlyExit() {
  if (childExited && childExitCode !== 0) {
    if (stderrBuffer.includes('Unauthenticated') || stderrBuffer.includes('Authentication')) {
      printAuthFailure(baseUrl, workspaceId, keyId);
    } else {
      console.error(`[${SCRIPT_NAME}] MCP server exited early with code ${childExitCode}`);
      if (stderrBuffer) {
        console.error(`[${SCRIPT_NAME}] stderr:\n${stderrBuffer}`);
      }
    }
    process.exit(1);
  }
}

async function runProof() {
  // Give the server a moment to start up (or fail)
  await new Promise((resolve) => setTimeout(resolve, 1000));
  checkEarlyExit();

  const results = [];

  for (const step of STEPS) {
    // Check if child exited before we could send
    if (childExited) {
      checkEarlyExit();
      fatal(`MCP server exited unexpectedly before ${step.name}`);
    }

    const line = JSON.stringify(step.send);
    log(`→ ${step.send.method}`);
    child.stdin.write(line + '\n');

    // Wait for response with timeout
    const res = await new Promise((resolve, reject) => {
      const start = Date.now();
      const timeout = 15000;
      const interval = setInterval(() => {
        checkEarlyExit();
        const found = responses.find((r) => r.id === step.send.id);
        if (found) {
          clearInterval(interval);
          resolve(found);
        }
        if (Date.now() - start > timeout) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for ${step.name}`));
        }
      }, 50);
    });

    try {
      const detail = step.validate(res);
      results.push({ step: step.name, status: 'PASS', detail });
      log(`✅ ${step.name}: ${detail}`);
    } catch (err) {
      results.push({ step: step.name, status: 'FAIL', detail: err.message });
      log(`❌ ${step.name}: ${err.message}`);
    }
  }

  child.stdin.end();

  const allPassed = results.every((r) => r.status === 'PASS');

  log('');
  log('═══════════════════════════════════════════════════════════════');
  log(`  MCP PROOF ${allPassed ? 'PASSED' : 'FAILED'}`);
  log('═══════════════════════════════════════════════════════════════');
  log('');

  for (const r of results) {
    log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.step}: ${r.detail}`);
  }

  log('');
  log('  Protocol: MCP stdio JSON-RPC');
  log('  Auth: Agent Access HMAC (x-integration-key-id + signature)');
  log('  Transport: stdin/stdout only');
  log('  No DB, filesystem, session cookies, or private routes used');
  log('');

  child.kill();
  process.exit(allPassed ? 0 : 1);
}

runProof().catch((err) => {
  if (stderrBuffer.includes('Unauthenticated') || stderrBuffer.includes('Authentication')) {
    printAuthFailure(baseUrl, workspaceId, keyId);
  } else if (stderrBuffer) {
    console.error(`[${SCRIPT_NAME}] stderr:\n${stderrBuffer}`);
  }
  child.kill();
  fatal(err.message);
});
