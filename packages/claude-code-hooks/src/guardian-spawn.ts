// FILE MEMO: Guardian auto-spawn for Claude Code sessions.
// On session-start, spawns `filepad-guardian watch --rerun auto` as a detached background process.
// On session-end, kills it by PID file.
// Fails silently — guardian availability is optional; hook must never block the session.

import { spawn } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HookCredentials } from './config.js';

function guardianPidFile(sessionId: string): string {
  // Sanitize sessionId to avoid path traversal
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return join(tmpdir(), `filepad-guardian-${safeId}.pid`);
}

/**
 * Resolve the guardian CLI command.
 * Order: FILEPAD_GUARDIAN_PATH env var → `filepad-guardian` in PATH.
 */
function resolveGuardianCommand(): string {
  return process.env['FILEPAD_GUARDIAN_PATH'] ?? 'filepad-guardian';
}

/**
 * Spawn `filepad-guardian watch --rerun auto` detached.
 * Stores PID in /tmp/filepad-guardian-{sessionId}.pid.
 * Returns true if spawn succeeded, false otherwise.
 */
export async function spawnGuardianForSession(
  sessionId: string,
  credentials: HookCredentials,
): Promise<boolean> {
  const cmd = resolveGuardianCommand();
  try {
    const child = spawn(cmd, ['watch', '--rerun', 'auto'], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        FILEPAD_BASE_URL: credentials.baseUrl,
        FILEPAD_WORKSPACE_ID: credentials.workspaceId,
        FILEPAD_AGENT_KEY_ID: credentials.keyId,
        FILEPAD_AGENT_SECRET: credentials.secret,
      },
    });

    // Absorb async spawn errors (e.g. ENOENT when guardian not in PATH)
    child.on('error', () => { /* silent */ });
    child.unref();

    if (typeof child.pid === 'number') {
      await writeFile(guardianPidFile(sessionId), String(child.pid), 'utf8');
      return true;
    }
    return false;
  } catch {
    // guardian not installed or spawn failed — fail silently
    return false;
  }
}

/**
 * Kill the guardian process spawned for this session (if any).
 * Reads PID from temp file and sends SIGTERM. Cleans up the file.
 */
export async function stopGuardianForSession(sessionId: string): Promise<void> {
  const pidFile = guardianPidFile(sessionId);
  try {
    const pidText = await readFile(pidFile, 'utf8');
    const pid = parseInt(pidText.trim(), 10);
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Process may have already exited — ignore
      }
    }
  } catch {
    // No PID file — guardian was never spawned or already cleaned up
  } finally {
    try {
      await unlink(pidFile);
    } catch {
      // ignore
    }
  }
}
