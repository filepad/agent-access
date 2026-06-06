import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export function expandHome(path: string): string {
  if (path === '~') return process.env['HOME'] ?? path;
  if (path.startsWith('~/')) {
    const home = process.env['HOME'];
    return home ? join(home, path.slice(2)) : path;
  }
  return path;
}

export function resolveFrom(base: string, path: string): string {
  const expanded = expandHome(path);
  return isAbsolute(expanded) ? expanded : resolve(base, expanded);
}

export async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeJsonFile(
  path: string,
  data: Record<string, unknown>,
  mode?: number | undefined,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, mode ? { mode } : undefined);
  if (mode) await chmod(path, mode);
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return false;
    throw error;
  }
}

export function looksLikeGitRepo(repoRoot: string): boolean {
  return existsSync(join(repoRoot, '.git'));
}
