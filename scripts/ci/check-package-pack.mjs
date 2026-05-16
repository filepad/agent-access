#!/usr/bin/env node
/**
 * CI script: verify a package tarball is clean and publishable.
 *
 * Run from inside the package directory:
 *   node ../../scripts/ci/check-package-pack.mjs
 *
 * Checks:
 * - No workspace:* or workspace:^ in packed dependencies
 * - No src/, test/, *.ts source files in tarball
 * - Only expected files present
 * - package.json inside tarball is valid JSON
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FORBIDDEN_PATTERNS = [
  /^src\//,
  /^test\//,
  /\.ts$/,
  /tsconfig/,
  /\.test\./,
  /vitest/,
];

const ALLOWED_ROOT_FILES = [
  'package.json',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'CHANGELOG.md',
];

function fatal(msg) {
  console.error(`❌ PACK CHECK FAILED: ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`  ${msg}`);
}

const cwd = process.cwd();
const pkgName = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).name;

console.log(`\n🔍 Checking pack for ${pkgName}...`);

// 1. Create tarball using pnpm pack (handles workspace protocol replacement)
let tarballPath;
try {
  const packOutput = execSync('pnpm pack', { cwd, encoding: 'utf8', stdio: 'pipe' });
  // pnpm pack outputs the tarball path as the last line
  tarballPath = packOutput.trim().split('\n').pop()?.trim();
  if (!tarballPath) {
    fatal('Could not determine tarball path from pnpm pack output');
  }
} catch (err) {
  fatal(`pnpm pack failed: ${err.message}`);
}

info(`Tarball: ${tarballPath}`);

// 2. Extract to temp dir
const tmpDir = mkdtempSync(join(tmpdir(), 'pack-check-'));
try {
  execSync(`tar -xzf "${tarballPath}" -C "${tmpDir}"`, { stdio: 'pipe' });

  // Find the package root inside the tarball (usually 'package/')
  const entries = execSync(`ls -1 "${tmpDir}"`, { encoding: 'utf8' }).trim().split('\n');
  if (entries.length !== 1) {
    fatal(`Expected single root directory in tarball, got: ${entries.join(', ')}`);
  }
  const extractedRoot = join(tmpDir, entries[0]);

  // 3. Read and validate package.json from tarball
  const packedPkgJsonPath = join(extractedRoot, 'package.json');
  if (!existsSync(packedPkgJsonPath)) {
    fatal('package.json missing from tarball');
  }

  const packedPkg = JSON.parse(readFileSync(packedPkgJsonPath, 'utf8'));

  // 3a. Verify no workspace:* in dependencies
  const allDeps = {
    ...packedPkg.dependencies,
    ...packedPkg.devDependencies,
    ...packedPkg.peerDependencies,
  };
  for (const [depName, depVersion] of Object.entries(allDeps)) {
    if (typeof depVersion === 'string' && depVersion.includes('workspace:')) {
      fatal(
        `Packed dependency "${depName}" still has workspace protocol: "${depVersion}". ` +
          'Use pnpm pack (not npm pack) or ensure workspace:^ is properly resolved.'
      );
    }
  }
  info('No workspace protocol leaks in dependencies');

  // 3b. Verify no private: true (would block publish)
  if (packedPkg.private === true) {
    fatal('Packed package.json has "private": true');
  }
  info('Package is not private');

  // 3c. Verify publishConfig.access = public
  if (packedPkg.publishConfig?.access !== 'public') {
    fatal('Missing or incorrect publishConfig.access (expected "public")');
  }
  info('publishConfig.access is "public"');

  // 4. Verify file list
  const tarballFileList = execSync(`tar -tzf "${tarballPath}"`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((l) => l.replace(/^[^/]+\//, '')) // strip package/ prefix
    .filter((l) => l.length > 0);

  const leaks = [];
  for (const file of tarballFileList) {
    // Skip package.json, README, LICENSE at root
    if (ALLOWED_ROOT_FILES.includes(file)) continue;
    // Skip dist/ contents
    if (file.startsWith('dist/')) continue;

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(file)) {
        leaks.push(file);
        break;
      }
    }
  }

  if (leaks.length > 0) {
    fatal(`Source/test/private files leaked into tarball:\n  ${leaks.join('\n  ')}`);
  }
  info('No source/test/private file leaks');

  // 4b. Verify declared entrypoints and binaries exist in the packed artifact.
  const entrypointFields = [
    ['main', packedPkg.main],
    ['types', packedPkg.types],
  ].filter(([, value]) => typeof value === 'string' && value.length > 0);
  for (const [field, value] of entrypointFields) {
    const normalized = value.replace(/^\.\//, '');
    if (!tarballFileList.includes(normalized)) {
      fatal(`package.json ${field} points to missing packed file: ${value}`);
    }
  }
  for (const [name, value] of Object.entries(packedPkg.bin ?? {})) {
    if (typeof value !== 'string' || value.length === 0) {
      fatal(`package.json bin "${name}" must point to a file`);
    }
    const normalized = value.replace(/^\.\//, '');
    if (!tarballFileList.includes(normalized)) {
      fatal(`package.json bin "${name}" points to missing packed file: ${value}`);
    }
    const binPath = join(extractedRoot, normalized);
    const mode = statSync(binPath).mode;
    if ((mode & 0o111) === 0) {
      fatal(`package.json bin "${name}" is not executable in the packed artifact: ${value}`);
    }
  }
  info('Declared entrypoints and bins exist in package');

  // 5. Verify dist/ exists and has .js + .d.ts
  const distPath = join(extractedRoot, 'dist');
  if (!existsSync(distPath)) {
    fatal('dist/ directory missing from tarball');
  }
  const distFiles = execSync(`find "${distPath}" -type f`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  const hasJs = distFiles.some((f) => f.endsWith('.js'));
  const hasDts = distFiles.some((f) => f.endsWith('.d.ts'));
  if (!hasJs) fatal('No .js files in dist/');
  if (!hasDts) fatal('No .d.ts files in dist/');
  info(`dist/ contains ${distFiles.length} files (js + d.ts confirmed)`);

  console.log(`✅ PACK CHECK PASSED for ${pkgName}\n`);
} finally {
  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(tarballPath, { force: true });
}
