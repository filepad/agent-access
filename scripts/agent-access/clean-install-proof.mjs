#!/usr/bin/env node
/**
 * Clean Install Proof
 *
 * Proves the public Agent Access packages install and execute outside the
 * monorepo without workspace symlinks or private package leakage.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MONOREPO_ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT_NAME = 'clean-install-proof';

function log(message) {
  console.log(`[${SCRIPT_NAME}] ${message}`);
}

function fatal(message) {
  console.error(`[${SCRIPT_NAME}] ${message}`);
  process.exit(1);
}

function run(command, options = {}) {
  return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...options });
}

function packPackage(packagePath) {
  const output = run('pnpm pack', { cwd: join(MONOREPO_ROOT, packagePath) }).trim();
  const fileName = output.split('\n').pop()?.trim();
  if (!fileName) fatal(`Could not determine packed file name for ${packagePath}`);
  return resolve(MONOREPO_ROOT, packagePath, fileName);
}

log('Building public packages...');
run('pnpm -C packages/agent-access-sdk build', { cwd: MONOREPO_ROOT });
run('pnpm -C packages/claude-code-hooks build', { cwd: MONOREPO_ROOT });
run('pnpm -C packages/mcp-server build', { cwd: MONOREPO_ROOT });
run('pnpm -C packages/agent-connect build', { cwd: MONOREPO_ROOT });

log('Packing public packages...');
const tarballs = [
  packPackage('packages/agent-access-sdk'),
  packPackage('packages/claude-code-hooks'),
  packPackage('packages/mcp-server'),
  packPackage('packages/agent-connect'),
];
for (const tarball of tarballs) log(`Tarball: ${tarball}`);

const tmpDir = mkdtempSync(join(tmpdir(), 'filepad-clean-install-'));
log(`Temp directory: ${tmpDir}`);

try {
  run('npm init -y', { cwd: tmpDir });
  for (const tarball of tarballs) {
    run(`npm install "${tarball}"`, { cwd: tmpDir });
  }

  const agentConnectBin = join(tmpDir, 'node_modules/.bin/filepad-agent-connect');
  const claudeHooksBin = join(tmpDir, 'node_modules/.bin/filepad-claude-code-hook');
  const mcpServerBin = join(tmpDir, 'node_modules/.bin/filepad-mcp-server');
  if (!existsSync(agentConnectBin)) {
    fatal('filepad-agent-connect binary not found in node_modules/.bin');
  }
  if (!existsSync(claudeHooksBin)) {
    fatal('filepad-claude-code-hook binary not found in node_modules/.bin');
  }
  if (!existsSync(mcpServerBin)) {
    fatal('filepad-mcp-server binary not found in node_modules/.bin');
  }

  log('Testing Agent Connect usage error...');
  try {
    run(`"${agentConnectBin}"`, { cwd: tmpDir });
    fatal('Expected Agent Connect to fail without required arguments');
  } catch (error) {
    const output = error.stderr || error.stdout || '';
    if (!output.includes('filepad-agent-connect failed: Usage:')) {
      fatal(`Unexpected Agent Connect output:\n${output}`);
    }
  }

  log('Testing Claude Code hook adapter missing credentials...');
  try {
    run(`"${claudeHooksBin}" doctor`, {
      cwd: tmpDir,
      env: { PATH: process.env.PATH },
    });
    fatal('Expected Claude Code hook doctor to fail without credentials');
  } catch (error) {
    const output = error.stderr || error.stdout || '';
    if (!output.includes('Filepad hook credentials not found')) {
      fatal(`Unexpected Claude Code hook output:\n${output}`);
    }
  }

  log('Testing MCP server missing credentials...');
  try {
    run(`"${mcpServerBin}" --health`, {
      cwd: tmpDir,
      env: { PATH: process.env.PATH },
    });
    fatal('Expected MCP server health check to fail without credentials');
  } catch (error) {
    const output = error.stderr || error.stdout || '';
    if (!output.includes('Filepad MCP Server startup failed')) {
      fatal(`Unexpected MCP server output:\n${output}`);
    }
  }

  log('');
  log('CLEAN INSTALL PROOF PASSED');
  log('Public packages install cleanly outside the monorepo');
  log('Agent Connect CLI is executable');
  log('Claude Code hook adapter CLI is executable');
  log('MCP server CLI is executable');
} catch (error) {
  fatal(error.message);
} finally {
  for (const tarball of tarballs) rmSync(tarball, { force: true });
  rmSync(tmpDir, { recursive: true, force: true });
  log('Cleaned up temp files');
}
