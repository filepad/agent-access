#!/usr/bin/env node
import { loadConfig } from './config.js';
import { createGuardianClient } from './client.js';
import { buildEvidencePayload } from './evidence.js';
import { runCommand } from './command-runner.js';
import { deriveCommand, extractCheckFromRaw, type GuardianDerivedCommand, type GuardianCheckSpec } from './commands.js';
import { runSoundnessVerification, type SoundnessReport } from './soundness.js';
import { runWatch } from './watch.js';
import { migrateContract } from './migrate.js';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function printHelp(): void {
  console.log(`Filepad Guardian — local evidence reporter for Active Contracts.

Usage:
  filepad-guardian status
  filepad-guardian contract status --contract-id <id>
  filepad-guardian run --contract-id <id> --check-id <id> [--timeout-ms 120000] [-- <command...>]
  filepad-guardian report --contract-id <id> [--check-id <id>] --json <path>
  filepad-guardian soundness --contract-id <id> --repo-root <path> [--timeout-ms 30000] [--json] [--submit]
  filepad-guardian watch --contract-id <id> --repo-root <path> [--rerun auto|manual] [--debounce <ms>]
  filepad-guardian migrate --source <path> [--output <path>]

Check types (run without explicit command):
  command       pnpm -C apps/backend typecheck
  search_absent rg --no-heading <pattern> <paths>  (exit 1 = absent = passing)
  search_present rg --no-heading <pattern> <paths> (exit 0 = found = passing)
  file_exists   stat <path>                        (exit 0 = exists = passing)
  file_absent   stat <path>                        (exit 1 = absent = passing)

Environment:
  FILEPAD_BASE_URL       Filepad backend URL (e.g. https://api.filepad.ai)
  FILEPAD_WORKSPACE_ID   Workspace ID (ws_...)
  FILEPAD_AGENT_KEY_ID   Agent Access key ID (ik_...)
  FILEPAD_AGENT_SECRET   Agent Access secret

Examples:
  filepad-guardian status
  filepad-guardian contract status --contract-id ac_abc123
  filepad-guardian run --contract-id ac_abc123 --check-id backend_typecheck
  filepad-guardian run --contract-id ac_abc123 --check-id backend_typecheck -- \\
    pnpm -C apps/backend typecheck
  filepad-guardian run --contract-id ac_abc123 --check-id backend_tests_pass --timeout-ms 600000 -- \\
    pnpm -C apps/backend test
  filepad-guardian report --contract-id ac_abc123 --json evidence.json
  filepad-guardian soundness --contract-id ac_abc123 --repo-root .
  filepad-guardian watch --contract-id ac_abc123 --repo-root . --rerun auto
  filepad-guardian migrate --source contract.yaml --output contract.migrated.yaml
`);
}

function readFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function splitOnDoubleDash(args: string[]): { guardianArgs: string[]; command: string[] } {
  const idx = args.indexOf('--');
  if (idx >= 0) {
    return {
      guardianArgs: args.slice(0, idx),
      command: args.slice(idx + 1),
    };
  }
  return { guardianArgs: args, command: [] };
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

async function cmdStatus(client: ReturnType<typeof createGuardianClient>): Promise<void> {
  console.log('Verifying connection to Filepad...');
  const creds = await client.verifyCredentials();
  const rc = creds as unknown as Record<string, unknown>;
  console.log(`Connected. Workspace: ${rc['workspaceId'] ?? 'unknown'}`);
  console.log(`Scopes: ${JSON.stringify(rc['scopes'] ?? [])}`);

  console.log('\nActive Contracts:');
  const contracts = await client.listActiveContracts();
  if (contracts.length === 0) {
    console.log('  (none)');
  } else {
    for (const c of contracts) {
      console.log(`  ${c.contractId}  ${c.lifecycleStatus.padEnd(14)} ${c.name}`);
    }
  }
}

async function cmdContractStatus(
  client: ReturnType<typeof createGuardianClient>,
  contractId: string,
): Promise<void> {
  const status = await client.getContractStatus(contractId);
  console.log(`Contract: ${status.contractId}`);
  console.log(`Status:   ${status.lifecycleStatus}`);
  if (status.stale) console.log(`  STALE: ${status.staleReason ?? 'artifact version changed'}`);
  console.log(`Checks:`);
  for (const c of status.checks) {
    console.log(`  ${c.status.padEnd(14)} ${c.checkId} ${c.title ?? ''}`);
  }
}

async function cmdRun(args: {
  contractId: string;
  checkId: string;
  explicitCommand: string[];
  timeoutMs: number;
  client: ReturnType<typeof createGuardianClient>;
  cwd: string;
}): Promise<void> {
  const { contractId, checkId, explicitCommand, timeoutMs, client, cwd } = args;

  let derived: GuardianDerivedCommand;

  if (explicitCommand.length > 0) {
    // Explicit command provided via `-- <cmd>` — run as-is with exit code 0
    derived = {
      command: explicitCommand,
      commandStr: explicitCommand.join(' '),
      expectedExitCode: 0,
      checkType: 'command',
    };
  } else {
    // Auto-derive from contract check spec
    console.log(`Fetching check spec for ${checkId} from contract ${contractId}...`);
    const { checks: rawChecks } = await client.readContract(contractId);
    const rawCheck = rawChecks.find((c) => (c as Record<string, unknown>)['checkId'] === checkId);
    if (!rawCheck) throw new Error(`Check "${checkId}" not found in contract ${contractId}`);
    const check = extractCheckFromRaw(rawCheck as Record<string, unknown>);
    derived = deriveCommand(check);
    console.log(`Check type: ${derived.checkType}  Expected exit: ${derived.expectedExitCode}`);
  }

  console.log(`Running: ${derived.commandStr}`);
  const gitSha = getGitSha(cwd);
  const gitBranch = getGitBranch(cwd);

  const result = await runCommand({ command: derived.command, cwd, timeoutMs });

  const payload = buildEvidencePayload({
    contractId,
    checkId,
    exitCode: result.exitCode,
    expectedExitCode: derived.expectedExitCode,
    command: derived.commandStr,
    cwd,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(gitSha !== undefined ? { gitSha } : {}),
    ...(gitBranch !== undefined ? { gitBranch } : {}),
  });

  console.log(`Exit code: ${result.exitCode}  Status: ${payload.status}`);
  console.log(`Duration: ${payload.provenance.durationMs}ms`);
  if (gitSha) console.log(`Git SHA: ${gitSha}`);

  // For search checks: include matched lines in evidence data
  const evidenceData: Record<string, unknown> = {};
  if (derived.checkType === 'search_absent' || derived.checkType === 'search_present') {
    const matchedLines = result.stdout.trim().split('\n').filter((l) => l.length > 0);
    if (matchedLines.length > 0) {
      evidenceData['matchedLines'] = matchedLines.slice(0, 100); // cap at 100 lines
    }
    evidenceData['pathsSearched'] = derived.paths ?? [];
  }
  if (derived.checkType === 'file_exists' || derived.checkType === 'file_absent') {
    evidenceData['filePath'] = derived.command[1];
  }

  console.log('\nReporting evidence to Filepad...');
  const response = await client.recordEvidence(payload, Object.keys(evidenceData).length > 0 ? evidenceData : undefined);
  console.log(`Evidence recorded. Contract status: ${response.contractStatus ?? 'unknown'}`);
  if (response.checkStatuses) {
    for (const cs of response.checkStatuses) {
      console.log(`  ${cs.checkId}: ${cs.status}`);
    }
  }

  process.exitCode = result.exitCode;
}

async function cmdReport(args: {
  contractId: string;
  checkId: string | undefined;
  jsonPath: string;
  client: ReturnType<typeof createGuardianClient>;
}): Promise<void> {
  const { contractId, checkId, jsonPath, client } = args;
  const raw = jsonPath === '-' ? readFileSync(0, 'utf-8') : readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw);

  // Validate required fields
  const required = ['status', 'summary'];
  for (const field of required) {
    if (!(field in data)) throw new Error(`Missing required field in evidence JSON: ${field}`);
  }

  const response = await client.recordEvidence({
    contractId,
    checkId: checkId ?? data['checkId'],
    source: 'guardian',
    status: data['status'],
    summary: data['summary'],
    provenance: data['provenance'] ?? {},
  });

  console.log(`Evidence recorded. Contract status: ${response.contractStatus ?? 'unknown'}`);
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function recommendPattern(pattern: string | undefined): string {
  if (!pattern) return 'Use a concrete code symbol or file path from this repository.';
  const words = pattern.trim().split(/\s+/);
  if (words.length >= 5 && !/[\\.()[\]|*+?{}]/.test(pattern)) {
    return 'This looks like a description, not a code symbol.';
  }
  return 'Check spelling, escaping, and searched paths.';
}

type LocalStaticResult = {
  checks: Array<{
    checkId: string;
    confidence: 'code_symbol' | 'mixed' | 'natural_language' | 'unanalyzable';
    confidenceReason: string;
    extractedIdentifiers: string[];
    resolvedCount: number;
    unresolvedCount: number;
    resolutions: Array<{
      identifier: string;
      resolved: boolean;
      filePath: string | null;
      line: number | null;
      kind: string | null;
    }>;
  }>;
  symbolGraphHash: string;
  sourceFileCount: number;
  analysisMs: number;
};

async function maybeRunLocalStaticAnalysis(params: {
  repoRoot: string;
  checks: GuardianCheckSpec[];
}): Promise<SoundnessReport['staticAnalysis']> {
  try {
    const modulePath = path.join(
      params.repoRoot,
      'apps/backend/src/application/active-contracts/symbol-graph-resolver.ts',
    );
    const mod = await import(pathToFileURL(modulePath).href) as {
      buildSymbolGraph?: (input: {
        repoRoot: string;
        tsConfigPath: string;
        maxFiles: number;
      }) => {
        resolver: {
          analyzeChecks: (
            checks: Array<{
              checkId: string;
              type: string | undefined;
              query?: string | undefined;
              path?: string | undefined;
            }>,
            analysisMs: number,
          ) => LocalStaticResult;
        };
        analysisMs: number;
      };
    };
    if (!mod.buildSymbolGraph) return undefined;
    const built = mod.buildSymbolGraph({
      repoRoot: params.repoRoot,
      tsConfigPath: path.join(params.repoRoot, 'tsconfig.json'),
      maxFiles: 3000,
    });
    const staticResult = built.resolver.analyzeChecks(
      params.checks.map((check) => ({
        checkId: check.checkId,
        type: check.type,
        query: check.query,
        path: check.path,
      })),
      built.analysisMs,
    );
    return {
      checks: staticResult.checks.map((check) => ({
        checkId: check.checkId,
        confidence: check.confidence,
        confidenceReason: check.confidenceReason,
        resolvedCount: check.resolvedCount,
        unresolvedCount: check.unresolvedCount,
        extractedIdentifiers: check.extractedIdentifiers,
        resolvedSymbols: check.resolutions
          .filter((resolution) => resolution.resolved && resolution.filePath !== null)
          .map((resolution) => ({
            identifier: resolution.identifier,
            filePath: resolution.filePath ?? '',
            line: resolution.line ?? 0,
            kind: resolution.kind ?? 'unknown',
          })),
      })),
      symbolGraphHash: staticResult.symbolGraphHash,
      sourceFileCount: staticResult.sourceFileCount,
      analysisMs: staticResult.analysisMs,
    };
  } catch {
    return undefined;
  }
}

function printSoundnessReport(report: SoundnessReport, contractName?: string): void {
  const passing = report.checkResults.filter((result) => result.verdict === 'passing').length;
  const failing = report.checkResults.filter((result) => result.verdict === 'failing').length;
  const impossible = new Set(report.impossibleCheckIds);

  console.log('Contract Soundness Report');
  console.log('─────────────────────────');
  console.log(`Contract: ${contractName ? `"${contractName}"` : report.contractId}`);
  console.log(`Verdict:  ${report.soundnessVerdict.toUpperCase()}`);
  console.log('');

  if (report.staticAnalysis) {
    console.log('Static Analysis (TypeScript Symbol Graph)');
    console.log(`  Source files analyzed: ${report.staticAnalysis.sourceFileCount}`);
    console.log(`  Analysis time: ${(report.staticAnalysis.analysisMs / 1000).toFixed(1)}s`);
    console.log(`  Symbol graph hash: ${report.staticAnalysis.symbolGraphHash}`);
    console.log('');
    for (const check of report.staticAnalysis.checks) {
      const mark = check.confidence === 'code_symbol' ? '✓' : check.confidence === 'unanalyzable' ? '-' : '✗';
      console.log(`  ${mark} ${check.checkId}  [${check.confidence}]`);
      if (check.extractedIdentifiers.length > 0) {
        console.log(`    Identifiers extracted: ${check.extractedIdentifiers.join(', ')}`);
      } else {
        console.log('    Identifiers extracted: (none)');
      }
      console.log(`    Resolved: ${check.resolvedCount}/${check.resolvedCount + check.unresolvedCount} - ${check.confidenceReason}`);
      for (const symbol of check.resolvedSymbols) {
        console.log(`      → ${symbol.identifier}: ${symbol.filePath}:${symbol.line} (${symbol.kind})`);
      }
      if (check.confidence === 'natural_language') {
        console.log('    → Pattern is prose, not code');
      }
      console.log('');
    }
  }

  console.log('Dynamic Verification (Git + Runtime)');
  console.log(`Checks: ${report.checkResults.length} total`);
  console.log(`  ${passing} passing at baseline`);
  console.log(`  ${failing} failing at baseline`);
  console.log(`  ${report.impossibleCheckIds.length} impossible (never existed in git history)`);
  console.log('');

  if (report.impossibleCheckIds.length > 0) {
    console.log('Impossible checks:');
    for (const result of report.checkResults.filter((candidate) => impossible.has(candidate.checkId))) {
      console.log(`  ✗ ${result.checkId}`);
      console.log(`    Command: ${result.executedCommand}`);
      console.log('    Reason: git log -S found zero commits containing this string');
      console.log(`    → ${recommendPattern(result.executedCommand)}`);
      console.log('');
    }
  }

  console.log(`Baseline failure rate: ${formatPercent(report.baselineFailureRate)}`);
  if (report.gitSha) console.log(`Git SHA: ${report.gitSha}`);
  console.log(`Captured: ${report.capturedAt}`);
  if (report.soundnessVerdict !== 'sound') {
    console.log('');
    console.log('Recommendation: Reject or revise suspicious checks so they reference real code patterns.');
    console.log('Real pattern example: "UnifiedApprovalService\\\\.recordDecision|approvalStore\\\\.approve"');
  }
}

async function cmdSoundness(args: {
  contractId: string;
  repoRoot: string;
  timeoutMs: number;
  json: boolean;
  submit: boolean;
  client: ReturnType<typeof createGuardianClient>;
}): Promise<void> {
  const { contractId, repoRoot, timeoutMs, json, submit, client } = args;
  const { contract, checks: rawChecks } = await client.readContract(contractId);
  const checks: GuardianCheckSpec[] = rawChecks.map((raw) => extractCheckFromRaw(raw));
  const report = await runSoundnessVerification({
    contractId,
    checks,
    repoRoot,
    timeoutMs,
  });
  const staticAnalysis = await maybeRunLocalStaticAnalysis({ repoRoot, checks });
  if (staticAnalysis) {
    report.staticAnalysis = staticAnalysis;
    const analyzableChecks = staticAnalysis.checks.filter((check) => check.confidence !== 'unanalyzable');
    if (
      report.impossibleCheckIds.length > 0 &&
      analyzableChecks.length > 0 &&
      analyzableChecks.every((check) => check.confidence === 'natural_language')
    ) {
      report.soundnessVerdict = 'unsound';
    }
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printSoundnessReport(report, typeof contract['name'] === 'string' ? contract['name'] : undefined);
  }

  if (submit) {
    console.error('[guardian soundness] --submit requested, but certificate submission endpoint is not exposed through Agent Access yet.');
  }
}

// ── Main ──

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const subcommand = args[0];

  // `migrate` does not need credentials
  if (subcommand === 'migrate') {
    const sourcePath = readFlag(args, '--source');
    const outputPath = readFlag(args, '--output');
    if (!sourcePath) throw new Error('--source is required');
    const source = sourcePath === '-' ? readFileSync(0, 'utf-8') : readFileSync(sourcePath, 'utf-8');
    const migrated = migrateContract(source);
    if (outputPath) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(outputPath, migrated, 'utf-8');
      console.log(`Migrated contract written to ${outputPath}`);
    } else {
      process.stdout.write(migrated);
    }
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const client = createGuardianClient(config);

  try {
    if (subcommand === 'status') {
      await cmdStatus(client);
    } else if (subcommand === 'contract' && args[1] === 'status') {
      const contractId = readFlag(args, '--contract-id');
      if (!contractId) throw new Error('--contract-id is required');
      await cmdContractStatus(client, contractId);
    } else if (subcommand === 'run') {
      const contractId = readFlag(args, '--contract-id');
      const checkId = readFlag(args, '--check-id');
      const timeoutRaw = readFlag(args, '--timeout-ms');
      const timeoutMs = timeoutRaw ? parseInt(timeoutRaw, 10) : 120_000;
      if (!contractId) throw new Error('--contract-id is required');
      if (!checkId) throw new Error('--check-id is required');
      if (isNaN(timeoutMs) || timeoutMs <= 0) throw new Error('--timeout-ms must be a positive integer (ms)');
      const { command } = splitOnDoubleDash(args);
      await cmdRun({ contractId, checkId, explicitCommand: command, timeoutMs, client, cwd: process.cwd() });
    } else if (subcommand === 'report') {
      const contractId = readFlag(args, '--contract-id');
      const checkId = readFlag(args, '--check-id');
      const jsonPath = readFlag(args, '--json');
      if (!contractId) throw new Error('--contract-id is required');
      if (!jsonPath) throw new Error('--json is required');
      await cmdReport({ contractId, checkId, jsonPath, client });
    } else if (subcommand === 'soundness') {
      const contractId = readFlag(args, '--contract-id');
      const repoRoot = readFlag(args, '--repo-root') ?? process.cwd();
      const timeoutRaw = readFlag(args, '--timeout-ms');
      const timeoutMs = timeoutRaw ? parseInt(timeoutRaw, 10) : 30_000;
      if (!contractId) throw new Error('--contract-id is required');
      if (isNaN(timeoutMs) || timeoutMs <= 0) throw new Error('--timeout-ms must be a positive integer (ms)');
      await cmdSoundness({
        contractId,
        repoRoot,
        timeoutMs,
        json: args.includes('--json'),
        submit: args.includes('--submit'),
        client,
      });
    } else if (subcommand === 'watch') {
      const contractId = readFlag(args, '--contract-id');
      const repoRoot = readFlag(args, '--repo-root') ?? process.cwd();
      const rerunRaw = readFlag(args, '--rerun') ?? 'manual';
      const debounceRaw = readFlag(args, '--debounce');
      if (!contractId) throw new Error('--contract-id is required');
      if (rerunRaw !== 'auto' && rerunRaw !== 'manual') throw new Error('--rerun must be "auto" or "manual"');
      const debounceMs = debounceRaw ? parseInt(debounceRaw, 10) : 500;
      if (isNaN(debounceMs) || debounceMs < 0) throw new Error('--debounce must be a non-negative integer (ms)');
      await runWatch({ contractId, repoRoot, rerunPolicy: rerunRaw, debounceMs, client });
    } else {
      console.error(`Unknown command: ${subcommand}`);
      printHelp();
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(2);
  }
}

main();
