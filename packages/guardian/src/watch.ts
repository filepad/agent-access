import { watch as chokidarWatch } from 'chokidar';
import { buildEvidencePayload } from './evidence.js';
import { runCommand } from './command-runner.js';
import { deriveCommand, type GuardianDerivedCommand } from './commands.js';
import { execSync } from 'node:child_process';
import type { createGuardianClient } from './client.js';

export type RerunPolicy = 'auto' | 'manual';

export type WatchOptions = {
  contractId: string;
  repoRoot: string;
  rerunPolicy: RerunPolicy;
  debounceMs: number;
  client: ReturnType<typeof createGuardianClient>;
};

type CheckSpec = {
  checkId: string;
  type: string | undefined;
  command: string | undefined;
  query: string | undefined;
  paths: string[] | undefined;   // for search_absent / search_present
  path: string | undefined;      // for file_exists / file_absent
  expect_exit_code: number | undefined;
};

function extractChecks(rawChecks: Array<Record<string, unknown>>): CheckSpec[] {
  return rawChecks.map((c) => {
    const expectation = c['expectation'] as Record<string, unknown> | undefined;
    return {
      checkId: c['checkId'] as string,
      type: c['type'] as string | undefined,
      command: c['command'] as string | undefined,
      query: c['query'] as string | undefined,
      paths: Array.isArray(c['paths']) ? (c['paths'] as string[]) : undefined,
      path: typeof c['path'] === 'string' ? (c['path'] as string) : undefined,
      expect_exit_code: typeof expectation?.['expect_exit_code'] === 'number'
        ? (expectation['expect_exit_code'] as number)
        : undefined,
    };
  });
}

function getGitSha(cwd: string): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

function getGitBranch(cwd: string): string | undefined {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export async function runWatch(options: WatchOptions): Promise<void> {
  const { contractId, repoRoot, rerunPolicy, debounceMs, client } = options;

  console.log(`[guardian watch] Loading contract ${contractId}...`);
  const { checks: rawChecks } = await client.readContract(contractId);
  const checks = extractChecks(rawChecks);
  console.log(`[guardian watch] Loaded ${checks.length} checks.`);
  console.log(`[guardian watch] Watching ${repoRoot} (rerun: ${rerunPolicy}, debounce: ${debounceMs}ms)`);
  console.log('[guardian watch] Press Ctrl+C to stop.\n');

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingPaths = new Set<string>();

  const watcher = chokidarWatch(repoRoot, {
    ignored: [
      /(^|[/\\])\../,          // dotfiles
      /node_modules/,
      /\.git/,
      /dist/,
      /\.turbo/,
      /coverage/,
    ],
    persistent: true,
    ignoreInitial: true,
  });

  const handleChange = (filePath: string) => {
    // Make path relative to repoRoot for matching
    const rel = filePath.startsWith(repoRoot)
      ? filePath.slice(repoRoot.endsWith('/') ? repoRoot.length : repoRoot.length + 1)
      : filePath;
    pendingPaths.add(rel);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const changed = Array.from(pendingPaths);
      pendingPaths.clear();
      debounceTimer = null;
      void processChanges(changed);
    }, debounceMs);
  };

  watcher.on('change', handleChange);
  watcher.on('add', handleChange);
  watcher.on('unlink', handleChange);

  const processChanges = async (changedPaths: string[]) => {
    console.log(`[guardian watch] Change detected: ${changedPaths.join(', ')}`);

    let markedStale: string[] = [];
    try {
      const staleResult = await client.markStale({
        contractId,
        reason: `File change detected: ${changedPaths.join(', ')}`,
        changedPaths,
      });
      markedStale = staleResult.markedStale;
      if (markedStale.length === 0) {
        console.log('[guardian watch] Backend invalidation found no affected checks.');
        return;
      }
      console.log(`[guardian watch] Checks marked stale: ${markedStale.join(', ')}`);
    } catch (err) {
      console.error(`[guardian watch] Failed to mark stale: ${(err as Error).message}`);
      return;
    }

    if (rerunPolicy === 'auto') {
      const gitSha = getGitSha(repoRoot);
      const gitBranch = getGitBranch(repoRoot);
      const affected = checks.filter((check) => markedStale.includes(check.checkId));

      for (const check of affected) {
        let derived: GuardianDerivedCommand;
        try {
          derived = deriveCommand(check);
        } catch {
          continue;
        }

        console.log(`[guardian watch] Auto-rerunning: ${derived.commandStr}`);
        try {
          const result = await runCommand({ command: derived.command, cwd: repoRoot });
          const payload = buildEvidencePayload({
            contractId,
            checkId: check.checkId,
            exitCode: result.exitCode,
            expectedExitCode: derived.expectedExitCode,
            command: derived.commandStr,
            cwd: repoRoot,
            startedAt: result.startedAt,
            finishedAt: result.finishedAt,
            stdout: result.stdout,
            stderr: result.stderr,
            ...(gitSha !== undefined ? { gitSha } : {}),
            ...(gitBranch !== undefined ? { gitBranch } : {}),
          });

          // Collect matched lines for search checks
          const evidenceData: Record<string, unknown> = {};
          if (check.type === 'search_absent' || check.type === 'search_present') {
            const matchedLines = result.stdout.trim().split('\n').filter((l) => l.length > 0);
            if (matchedLines.length > 0) {
              evidenceData['matchedLines'] = matchedLines.slice(0, 100);
            }
            evidenceData['pathsSearched'] = check.paths ?? [];
          }
          if (check.type === 'file_exists' || check.type === 'file_absent') {
            evidenceData['filePath'] = check.path;
          }

          const response = await client.recordEvidence(
            payload,
            Object.keys(evidenceData).length > 0 ? evidenceData : undefined,
          );
          console.log(`[guardian watch] ${check.checkId}: ${payload.status} (contract: ${response.contractStatus ?? 'unknown'})`);
        } catch (err) {
          console.error(`[guardian watch] Rerun failed for ${check.checkId}: ${(err as Error).message}`);
        }
      }
    }
  };

  // Keep process alive
  await new Promise<void>((_, reject) => {
    process.on('SIGINT', () => {
      console.log('\n[guardian watch] Stopping.');
      void watcher.close();
      process.exit(0);
    });
    watcher.on('error', reject);
  });
}
