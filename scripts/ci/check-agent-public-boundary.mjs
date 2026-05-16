#!/usr/bin/env node
/**
 * CI script: verify the public Agent Access packages stay publish-safe.
 *
 * This is intentionally narrower than the full monorepo. It protects the
 * open-source/package boundary for:
 * - packages/agent-access-sdk
 * - packages/agent-connect
 * - packages/mcp-server
 * - packages/claude-code-hooks
 * - docs/agent-access
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const PUBLIC_PACKAGES = [
  'packages/agent-access-sdk',
  'packages/agent-connect',
  'packages/mcp-server',
  'packages/claude-code-hooks',
];
const PUBLIC_DOCS = ['docs/agent-access'];
const PUBLIC_EXAMPLES = ['examples'];
const PRIVATE_FILEPAD_DEPS = new Set([
  '@filepad/contracts',
  '@filepad/schemas',
  '@filepad/billing-types',
  '@filepad/editors',
]);

const REAL_ID_PATTERNS = [
  { name: 'workspace id', pattern: /\bws_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { name: 'integration key id', pattern: /\bik_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { name: 'artifact id', pattern: /\ba_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { name: 'file node id', pattern: /\bfn_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
];

const SECRET_PATTERNS = [
  {
    name: 'Filepad agent secret env assignment',
    pattern: /FILEPAD_AGENT_SECRET\s*=\s*["']?(?!x{8,}|\.{3}|<|your_|process\.env)[A-Za-z0-9+/=]{24,}/g,
  },
  {
    name: 'raw secret field',
    pattern: /"FILEPAD_AGENT_SECRET"\s*:\s*"(?!x{8,}|<|your_|process\.env)[A-Za-z0-9+/=]{24,}"/g,
  },
];

function fail(message) {
  console.error(`❌ PUBLIC BOUNDARY FAILED: ${message}`);
  process.exitCode = 1;
}

function info(message) {
  console.log(`  ${message}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listFiles(paths) {
  const existing = paths.filter((path) => existsSync(join(ROOT, path)));
  if (existing.length === 0) return [];
  const quoted = existing.map((path) => `"${path}"`).join(' ');
  let output = '';
  try {
    output = execSync(`git ls-files -- ${quoted}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    output = '';
  }
  if (!output) {
    output = execSync(`find ${quoted} -type f`, { cwd: ROOT, encoding: 'utf8' }).trim();
  }
  return output
    ? output.split('\n').filter((file) => existsSync(join(ROOT, file)))
    : [];
}

function checkPackageMetadata(packageDir) {
  const pkgPath = join(ROOT, packageDir, 'package.json');
  const pkg = readJson(pkgPath);

  if (pkg.private === true) {
    fail(`${packageDir}/package.json must not be private`);
  }
  if (pkg.publishConfig?.access !== 'public') {
    fail(`${packageDir}/package.json must set publishConfig.access to "public"`);
  }
  for (const required of ['README.md', 'LICENSE', 'SECURITY.md']) {
    if (!existsSync(join(ROOT, packageDir, required))) {
      fail(`${packageDir}/${required} is missing`);
    }
    if (!pkg.files?.includes(required)) {
      fail(`${packageDir}/package.json files must include ${required}`);
    }
  }
  if (!pkg.files?.includes('dist')) {
    fail(`${packageDir}/package.json files must include dist`);
  }

  const deps = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  };
  for (const [depName, depVersion] of Object.entries(deps)) {
    if (PRIVATE_FILEPAD_DEPS.has(depName)) {
      fail(`${packageDir} depends on private package ${depName}`);
    }
    if (typeof depVersion === 'string' && depVersion.includes('workspace:')) {
      fail(
        `${packageDir} dependency ${depName} uses workspace protocol (${depVersion}); ` +
          'public packages must be publish-safe with npm publish',
      );
    }
  }
}

function checkContractsHeldBack() {
  const contractsPath = join(ROOT, 'packages/contracts/package.json');
  if (!existsSync(contractsPath)) return;
  const pkg = readJson(contractsPath);
  if (pkg.private !== true) {
    fail('@filepad/contracts must remain private until a public-safe subset is split out');
  }
}

function checkSourceImports() {
  const files = listFiles(PUBLIC_PACKAGES.map((path) => `${path}/src`));
  for (const file of files) {
    const content = readFileSync(join(ROOT, file), 'utf8');
    for (const depName of PRIVATE_FILEPAD_DEPS) {
      if (content.includes(depName)) {
        fail(`${file} imports private package ${depName}`);
      }
    }
    if (/\bas\s+(any|never)\b/.test(content)) {
      fail(`${file} contains a forbidden type assertion`);
    }
  }
}

function checkDocsAndExamplesForLeaks() {
  const files = listFiles([...PUBLIC_PACKAGES, ...PUBLIC_DOCS, ...PUBLIC_EXAMPLES]).filter(
    (file) =>
      !file.includes('/dist/') &&
      !file.includes('/node_modules/') &&
      !file.endsWith('.map')
  );

  for (const file of files) {
    const content = readFileSync(join(ROOT, file), 'utf8');
    for (const { name, pattern } of REAL_ID_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = content.match(pattern);
      if (matches) {
        fail(`${file} contains real-looking ${name}: ${matches.slice(0, 3).join(', ')}`);
      }
    }
    for (const { name, pattern } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        fail(`${file} contains possible ${name}`);
      }
    }
  }
}

console.log('\n🔍 Checking Agent Access public boundary...');
for (const packageDir of PUBLIC_PACKAGES) {
  checkPackageMetadata(packageDir);
}
checkContractsHeldBack();
checkSourceImports();
checkDocsAndExamplesForLeaks();

if (process.exitCode) {
  process.exit(process.exitCode);
}

info('Public packages have README, LICENSE, SECURITY, dist whitelist, and public publishConfig');
info('No private Filepad package imports in public package source');
info('@filepad/contracts is held back as private');
info('No real-looking Filepad ids or secrets found in public docs/package source');
console.log('✅ AGENT ACCESS PUBLIC BOUNDARY PASSED\n');
