#!/usr/bin/env node
/**
 * Clean Install Proof
 *
 * Proves that @filepad/agent-access-sdk and @filepad/mcp-server can be
 * installed and used outside the monorepo without workspace symlinks.
 *
 * Steps:
 * 1. Build both packages
 * 2. Pack them into tarballs (pnpm pack handles workspace:^ resolution)
 * 3. Create a temp directory outside the monorepo
 * 4. npm install both tarballs
 * 5. Run filepad-mcp-server with missing env → confirm clean error
 * 6. Run filepad-mcp-server with test env against Filepad → confirm health check
 *
 * Usage:
 *   FILEPAD_BASE_URL=... FILEPAD_WORKSPACE_ID=... FILEPAD_AGENT_KEY_ID=... FILEPAD_AGENT_SECRET=... \
 *     node scripts/agent-access/clean-install-proof.mjs [local|staging]
 *
 * FILEPAD_BASE_URL takes precedence over the target default. If neither is set:
 *   local   => http://localhost:3000/api
 *   staging => https://app.filepad.ai/api
 */

import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MONOREPO_ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT_NAME = 'clean-install-proof';

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

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

const target = process.argv[2] || 'local';
const envBaseUrl = process.env['FILEPAD_BASE_URL'];
const targetBaseUrl = target === 'staging'
  ? 'https://app.filepad.ai/api'
  : 'http://localhost:3000/api';
const baseUrl = envBaseUrl || targetBaseUrl;

log(`Target argument: ${target}`);
log(`Base URL: ${baseUrl}` + (envBaseUrl ? ' (from env)' : ' (target default)'));

// ── 1. Build both packages ──
log('Building packages...');
run('pnpm -C packages/agent-access-sdk build', { cwd: MONOREPO_ROOT });
run('pnpm -C packages/mcp-server build', { cwd: MONOREPO_ROOT });

// ── 2. Pack tarballs ──
log('Packing tarballs...');
const sdkPackOutput = run('pnpm pack', { cwd: join(MONOREPO_ROOT, 'packages/agent-access-sdk') }).trim();
const mcpPackOutput = run('pnpm pack', { cwd: join(MONOREPO_ROOT, 'packages/mcp-server') }).trim();

const sdkTarball = sdkPackOutput.split('\n').pop().trim();
const mcpTarball = mcpPackOutput.split('\n').pop().trim();

const sdkTarballPath = resolve(MONOREPO_ROOT, 'packages/agent-access-sdk', sdkTarball);
const mcpTarballPath = resolve(MONOREPO_ROOT, 'packages/mcp-server', mcpTarball);

log(`SDK tarball: ${sdkTarballPath}`);
log(`MCP tarball: ${mcpTarballPath}`);

// ── 3. Create temp directory outside monorepo ──
const tmpDir = mkdtempSync(join(tmpdir(), 'filepad-clean-install-'));
log(`Temp directory: ${tmpDir}`);

let passed = false;

const workspaceId = process.env['FILEPAD_WORKSPACE_ID'];
const keyId = process.env['FILEPAD_AGENT_KEY_ID'];
const secret = process.env['FILEPAD_AGENT_SECRET'];

try {
  // ── 4. npm init + install ──
  log('Initializing temp project...');
  run('npm init -y', { cwd: tmpDir });

  log('Installing SDK tarball...');
  run(`npm install "${sdkTarballPath}"`, { cwd: tmpDir });

  log('Installing MCP server tarball...');
  run(`npm install "${mcpTarballPath}"`, { cwd: tmpDir });

  // ── 5. Verify CLI is available ──
  const mcpBin = join(tmpDir, 'node_modules/.bin/filepad-mcp-server');
  if (!existsSync(mcpBin)) {
    fatal('filepad-mcp-server binary not found in node_modules/.bin');
  }
  log('CLI binary found: node_modules/.bin/filepad-mcp-server');

  // ── 6. Missing env test ──
  log('Testing with missing environment variables...');
  let missingEnvOutput;
  try {
    missingEnvOutput = run(`"${mcpBin}"`, {
      cwd: tmpDir,
      env: {
        PATH: process.env.PATH,
        // Explicitly omit all Filepad env vars
      },
    });
    fatal('Expected exit code 1 for missing env, but process succeeded');
  } catch (err) {
    missingEnvOutput = err.stderr || err.stdout || '';
    if (!missingEnvOutput.includes('Missing required environment variables')) {
      fatal(`Expected clean missing-env error, got:\n${missingEnvOutput}`);
    }
  }
  log('✅ Missing env produces clean error message');

  // ── 7. Health check against backend (if credentials available) ──
  if (workspaceId && keyId && secret) {
    log('Testing health check against backend...');
    log(`Workspace: ${workspaceId}`);
    log(`Key ID: ${keyId}`);

    const child = spawn('node', [mcpBin], {
      cwd: tmpDir,
      env: {
        PATH: process.env.PATH,
        FILEPAD_BASE_URL: baseUrl,
        FILEPAD_WORKSPACE_ID: workspaceId,
        FILEPAD_AGENT_KEY_ID: keyId,
        FILEPAD_AGENT_SECRET: secret,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses = [];
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let childExited = false;
    let childExitCode = null;

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { responses.push(JSON.parse(trimmed)); } catch { /* ignore non-JSON */ }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString('utf8');
    });

    child.on('exit', (code) => {
      childExited = true;
      childExitCode = code;
    });

    const steps = [
      { id: 1, method: 'initialize', params: {} },
      { id: 2, method: 'tools/list', params: {} },
      { id: 3, method: 'tools/call', params: { name: 'filepad_health', arguments: {} } },
      { id: 4, method: 'tools/call', params: { name: 'filepad_list_tree', arguments: {} } },
      { id: 5, method: 'tools/call', params: { name: 'filepad_search', arguments: { query: 'test' } } },
      { id: 6, method: 'tools/call', params: { name: 'filepad_emit_event', arguments: { eventType: 'agent.clean-install.proof.completed', payload: { source: 'clean-install-proof.mjs' } } } },
    ];

    // Give server time to start (or fail)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // If child exited early, likely auth failure
    if (childExited && childExitCode !== 0) {
      if (stderrBuffer.includes('Unauthenticated') || stderrBuffer.includes('Authentication')) {
        printAuthFailure(baseUrl, workspaceId, keyId);
      }
      fatal(`MCP server exited early with code ${childExitCode}. stderr: ${stderrBuffer}`);
    }

    for (const step of steps) {
      if (childExited) {
        fatal(`MCP server exited unexpectedly before step id=${step.id}`);
      }

      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...step }) + '\n');
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    child.stdin.end();

    // Wait for close with a reasonable timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for MCP server to close')), 15000);
      child.on('close', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });
    });

    // Check for auth failure in stderr
    if (stderrBuffer.includes('Unauthenticated') || stderrBuffer.includes('Authentication')) {
      printAuthFailure(baseUrl, workspaceId, keyId);
      fatal('MCP server could not authenticate. See diagnostic output above.');
    }

    // Check initialize response
    const initRes = responses.find((r) => r.id === 1);
    if (!initRes || !initRes.result?.serverInfo?.name) {
      fatal(`Initialize failed or returned unexpected shape. Responses: ${JSON.stringify(responses)}`);
    }
    log(`✅ Initialize: server=${initRes.result.serverInfo.name} v${initRes.result.serverInfo.version}`);

    // Check tools/list response
    const toolsRes = responses.find((r) => r.id === 2);
    if (!toolsRes || !Array.isArray(toolsRes.result?.tools)) {
      fatal(`tools/list failed or returned unexpected shape. Responses: ${JSON.stringify(responses)}`);
    }
    log(`✅ tools/list: ${toolsRes.result.tools.length} tools exposed`);

    // Check filepad_health response
    const healthRes = responses.find((r) => r.id === 3);
    if (!healthRes || !healthRes.result?.content?.[0]?.text) {
      fatal(`filepad_health failed or returned unexpected shape. Responses: ${JSON.stringify(responses)}`);
    }
    const healthBody = JSON.parse(healthRes.result.content[0].text);
    if (healthBody.status !== 'ok') {
      fatal(`filepad_health returned non-ok status: ${JSON.stringify(healthBody)}`);
    }
    log(`✅ filepad_health: status=${healthBody.status}, scopes=[${healthBody.scopes?.join(', ') ?? 'none'}]`);

    // Check filepad_list_tree response
    const treeRes = responses.find((r) => r.id === 4);
    if (treeRes && treeRes.result?.content?.[0]?.text) {
      const treeBody = JSON.parse(treeRes.result.content[0].text);
      log(`✅ filepad_list_tree: ${treeBody.nodes?.length ?? 0} nodes`);
    }

    // Check filepad_search response
    const searchRes = responses.find((r) => r.id === 5);
    if (searchRes && searchRes.result?.content?.[0]?.text) {
      const searchBody = JSON.parse(searchRes.result.content[0].text);
      log(`✅ filepad_search: ${searchBody.results?.length ?? 0} results`);
    }

    // Check filepad_emit_event response
    const eventRes = responses.find((r) => r.id === 6);
    if (eventRes && eventRes.result?.content?.[0]?.text) {
      const eventBody = JSON.parse(eventRes.result.content[0].text);
      log(`✅ filepad_emit_event: eventId=${eventBody.eventId ?? 'unknown'}`);
    }

    passed = true;
  } else {
    log('⚠️  Skipping backend health check (no FILEPAD_WORKSPACE_ID/KEY_ID/SECRET in env)');
    log('   Set these env vars to run the full proof.');
    passed = true; // Still pass if install + missing-env tests work
  }

  log('');
  log('═══════════════════════════════════════════════════════════════');
  log('  CLEAN INSTALL PROOF PASSED');
  log('═══════════════════════════════════════════════════════════════');
  log('');
  log('  Packages install cleanly outside the monorepo');
  log('  No workspace symlinks or source dependencies leaked');
  log('  CLI produces clean errors for missing configuration');
  if (workspaceId && keyId && secret) {
    log('  MCP stdio health check succeeded against live backend');
  }
  log('');
} catch (err) {
  if (err.stderr?.includes?.('Unauthenticated') || err.stdout?.includes?.('Unauthenticated')) {
    printAuthFailure(baseUrl, workspaceId, keyId);
  }
  fatal(err.message);
} finally {
  rmSync(sdkTarballPath, { force: true });
  rmSync(mcpTarballPath, { force: true });
  rmSync(tmpDir, { recursive: true, force: true });
  log('Cleaned up temp files');
}

if (!passed) {
  process.exit(1);
}
