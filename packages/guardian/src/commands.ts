import { existsSync } from 'node:fs';

export type GuardianCheckSpec = {
  checkId: string;
  type: string | undefined;
  command: string | undefined;
  query: string | undefined;
  paths: string[] | undefined;
  path: string | undefined;
  expect_exit_code?: number | undefined;
};

export type GuardianDerivedCommand = {
  command: string[];
  commandStr: string;
  expectedExitCode: number;
  checkType: string;
  paths?: string[];
  filePath?: string;
};

export function buildRgCommand(query: string, paths: string[]): string[] {
  const args: string[] = ['rg', '--no-heading', query];
  for (const path of paths) {
    const firstGlob = path.search(/[*?{[]/);
    if (firstGlob === -1) {
      args.push(path);
    } else {
      const lastSlashBeforeGlob = path.lastIndexOf('/', firstGlob - 1);
      if (lastSlashBeforeGlob === -1) {
        args.push('--glob', path, '.');
      } else {
        const dir = path.slice(0, lastSlashBeforeGlob);
        const glob = path.slice(lastSlashBeforeGlob + 1);
        args.push('--glob', glob, dir);
      }
    }
  }
  return args;
}

export function filterExistingSearchPaths(paths: string[]): string[] {
  return paths.filter((path) => {
    const firstGlob = path.search(/[*?{[]/);
    if (firstGlob === -1) {
      return existsSync(path);
    }
    const lastSlashBeforeGlob = path.lastIndexOf('/', firstGlob - 1);
    const dir = lastSlashBeforeGlob === -1
      ? '.'
      : path.slice(0, lastSlashBeforeGlob);
    return existsSync(dir);
  });
}

export function extractCheckFromRaw(raw: Record<string, unknown>): GuardianCheckSpec {
  const expectation = raw['expectation'] as Record<string, unknown> | undefined;
  return {
    checkId: raw['checkId'] as string,
    type: raw['type'] as string | undefined,
    command: raw['command'] as string | undefined,
    query: raw['query'] as string | undefined,
    paths: Array.isArray(raw['paths']) ? (raw['paths'] as string[]) : undefined,
    path: typeof raw['path'] === 'string' ? (raw['path'] as string) : undefined,
    expect_exit_code: typeof expectation?.['expect_exit_code'] === 'number'
      ? (expectation['expect_exit_code'] as number)
      : undefined,
  };
}

export function deriveCommand(check: GuardianCheckSpec): GuardianDerivedCommand {
  const type = check.type;

  if (type === 'command' || (!type && check.command)) {
    if (!check.command) throw new Error(`Check "${check.checkId}" is type command but has no command field`);
    return {
      command: ['sh', '-lc', check.command],
      commandStr: check.command,
      expectedExitCode: check.expect_exit_code ?? 0,
      checkType: 'command',
    };
  }

  if (type === 'search_absent' || type === 'search_present') {
    const pattern = check.query;
    if (!pattern) throw new Error(`Check "${check.checkId}" (${type}) has no pattern/query field`);
    const paths = check.paths ?? [];
    if (paths.length === 0) throw new Error(`Check "${check.checkId}" (${type}) has no paths field`);
    const searchablePaths = filterExistingSearchPaths(paths);
    if (searchablePaths.length === 0) {
      return {
        command: ['sh', '-lc', 'exit 1'],
        commandStr: 'exit 1',
        expectedExitCode: type === 'search_absent' ? 1 : 0,
        checkType: type,
        paths: searchablePaths,
      };
    }
    const rgArgs = buildRgCommand(pattern, searchablePaths);
    return {
      command: rgArgs,
      commandStr: rgArgs.join(' '),
      expectedExitCode: type === 'search_absent' ? 1 : 0,
      checkType: type,
      paths: searchablePaths,
    };
  }

  if (type === 'file_exists' || type === 'file_absent') {
    const filePath = check.path;
    if (!filePath) throw new Error(`Check "${check.checkId}" (${type}) has no path field`);
    return {
      command: ['stat', filePath],
      commandStr: `stat ${filePath}`,
      expectedExitCode: type === 'file_exists' ? 0 : 1,
      checkType: type,
      filePath,
    };
  }

  throw new Error(
    `Check "${check.checkId}" has unsupported type "${type ?? 'unknown'}". ` +
    'Supported types: command, search_absent, search_present, file_exists, file_absent',
  );
}
