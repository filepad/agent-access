import { loadConfig } from '../../contracts/config.js';
import { createGuardianClient } from '../../contracts/client.js';
import { buildEvidencePayload } from '../../contracts/evidence.js';
import { runCommand } from '../../contracts/command-runner.js';
import { deriveCommand, extractCheckFromRaw, type GuardianDerivedCommand } from '../../contracts/commands.js';
import { runSoundnessVerification } from '../../contracts/soundness.js';
import { runWatch } from '../../contracts/watch.js';
import { migrateContract } from '../../contracts/migrate.js';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function readFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function getGitSha(cwd: string): string | undefined {
  try { return execSync('git rev-parse HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return undefined; }
}

function getGitBranch(cwd: string): string | undefined {
  try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return undefined; }
}

export async function runGuardian(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === '--help' || sub === '-h') {
    printGuardianHelp();
    return;
  }

  switch (sub) {
    case 'status': {
      const config = loadConfig();
      const client = createGuardianClient(config);
      await client.verifyCredentials();
      const contracts = await client.listActiveContracts();
      if (contracts.length === 0) { console.log('No active contracts.'); return; }
      for (const c of contracts) {
        const status = await client.getContractStatus(c.contractId);
        const passing = status.checks.filter((ch) => ch.status === 'pass').length;
        console.log(`${c.name} (${c.contractId}): ${passing}/${status.checks.length} passing — ${status.lifecycleStatus}`);
      }
      return;
    }

    case 'contract': {
      if (rest[0] === 'status') {
        const contractId = readFlag(rest, '--contract-id');
        if (!contractId) throw new Error('Missing --contract-id');
        const config = loadConfig();
        const client = createGuardianClient(config);
        console.log(JSON.stringify(await client.getContractStatus(contractId), null, 2));
      }
      return;
    }

    case 'run': {
      const contractId = readFlag(rest, '--contract-id');
      const checkId = readFlag(rest, '--check-id') ?? '';
      const timeoutMs = readFlag(rest, '--timeout-ms');
      if (!contractId) throw new Error('Missing --contract-id');
      const cwd = process.cwd();
      const config = loadConfig();
      const client = createGuardianClient(config);

      let derived: GuardianDerivedCommand;
      const ddIdx = rest.indexOf('--');
      const explicitCommand = ddIdx >= 0 ? rest.slice(ddIdx + 1) : [];

      if (explicitCommand.length > 0) {
        derived = { command: explicitCommand, commandStr: explicitCommand.join(' '), expectedExitCode: 0, checkType: 'command' };
      } else {
        const { checks: rawChecks } = await client.readContract(contractId);
        const rawCheck = rawChecks.find((c: Record<string, unknown>) => c['checkId'] === checkId);
        if (!rawCheck) throw new Error(`Check "${checkId}" not found in contract ${contractId}`);
        derived = deriveCommand(extractCheckFromRaw(rawCheck as Record<string, unknown>));
      }

      console.log(`Running: ${derived.commandStr}`);
      const result = await runCommand({ command: derived.command, cwd, timeoutMs: timeoutMs ? Number(timeoutMs) : 120_000 });
      const payload = buildEvidencePayload({
        contractId, ...(checkId ? { checkId } : {}), exitCode: result.exitCode, expectedExitCode: derived.expectedExitCode,
        command: derived.commandStr, cwd, startedAt: result.startedAt, finishedAt: result.finishedAt,
        stdout: result.stdout, stderr: result.stderr,
        ...(getGitSha(cwd) !== undefined ? { gitSha: getGitSha(cwd)! } : {}),
        ...(getGitBranch(cwd) !== undefined ? { gitBranch: getGitBranch(cwd)! } : {}),
      });
      console.log(`Exit: ${result.exitCode}  Status: ${payload.status}  Duration: ${payload.provenance.durationMs}ms`);
      console.log('Reporting evidence...');
      await client.recordEvidence(payload);
      console.log('Done.');
      return;
    }

    case 'report': {
      const contractId = readFlag(rest, '--contract-id');
      const jsonPath = readFlag(rest, '--json');
      if (!contractId || !jsonPath) throw new Error('Missing --contract-id or --json');
      const config = loadConfig();
      const client = createGuardianClient(config);
      const payload = JSON.parse(readFileSync(jsonPath, 'utf8')) as Parameters<typeof client.recordEvidence>[0];
      await client.recordEvidence(payload);
      console.log('Evidence reported.');
      return;
    }

    case 'soundness': {
      const contractId = readFlag(rest, '--contract-id');
      const repoRoot = readFlag(rest, '--repo-root') ?? process.cwd();
      if (!contractId) throw new Error('Missing --contract-id');
      const config = loadConfig();
      const client = createGuardianClient(config);
      const { checks: rawChecks } = await client.readContract(contractId);
      const checks = (rawChecks as Record<string, unknown>[]).map(extractCheckFromRaw);
      const report = await runSoundnessVerification({ contractId, checks, repoRoot });
      console.log(rest.includes('--json') ? JSON.stringify(report, null, 2) : `Soundness: ${JSON.stringify(report)}`);
      return;
    }

    case 'watch': {
      const contractId = readFlag(rest, '--contract-id');
      const repoRoot = readFlag(rest, '--repo-root') ?? process.cwd();
      if (!contractId) throw new Error('Missing --contract-id');
      const config = loadConfig();
      const client = createGuardianClient(config);
      const debounceMs = readFlag(rest, '--debounce');
      await runWatch({
        contractId, repoRoot,
        rerunPolicy: (readFlag(rest, '--rerun') as 'auto' | 'manual') ?? 'manual',
        debounceMs: debounceMs ? Number(debounceMs) : 500,
        client,
      });
      return;
    }

    case 'migrate': {
      const source = readFlag(rest, '--source');
      if (!source) throw new Error('Missing --source');
      const result = migrateContract(source);
      const outputPath = readFlag(rest, '--output');
      if (outputPath) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(outputPath, result, 'utf8');
        console.log(`Migrated contract written to ${outputPath}`);
      } else {
        console.log(result);
      }
      return;
    }

    default:
      throw new Error(`Unknown guardian subcommand: ${sub}. Run filepad guardian --help.`);
  }
}

function printGuardianHelp(): void {
  process.stdout.write(`filepad guardian — contract verification and evidence reporting

Subcommands:
  status
  contract status --contract-id <id>
  run --contract-id <id> --check-id <id> [--timeout-ms N] [-- <cmd>]
  report --contract-id <id> --json <path>
  soundness --contract-id <id> --repo-root <path> [--json]
  watch --contract-id <id> --repo-root <path> [--rerun auto|manual] [--debounce <ms>]
  migrate --source <path> [--output <path>]
`);
}
