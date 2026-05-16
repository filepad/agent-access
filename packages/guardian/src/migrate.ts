/**
 * Contract YAML migration: assigns check types to untyped checks, or moves
 * un-provable checks to the rules: section.
 *
 * Rules applied in order:
 *  1. If check already has a type → keep as-is
 *  2. If check has a command field → type: command
 *  3. If check id contains: no_, absent_, _absent, _removed, _gone, _clean → search_absent candidate
 *     (only if there's enough context to infer a pattern; else → rules)
 *  4. If check id contains: _exists, _present, has_ → search_present candidate
 *     (only if there's enough context; else → rules)
 *  5. Otherwise → move to rules: (advisory text only)
 */

// Very minimal YAML manipulation without a library: we parse structurally and regenerate.
// This is intentionally simple — only handles the common patterns in real contract YAML.

type RawCheck = {
  id: string;
  type?: string;
  title?: string;
  description?: string;
  command?: string;
  query?: string;
  pattern?: string;
  paths?: string[];
  path?: string;
  expect_exit_code?: number;
  depends_on?: string[];
  freshness?: Record<string, unknown>;
  [key: string]: unknown;
};

type RawRule = {
  id: string;
  text: string;
};

type MigrationDecision =
  | { action: 'keep'; check: RawCheck }
  | { action: 'upgrade'; check: RawCheck }
  | { action: 'to_rule'; id: string; text: string };

function idHints(id: string): 'search_absent' | 'search_present' | 'file' | null {
  const absentPatterns = ['no_', '_absent', '_removed', '_gone', '_clean'];
  const presentPatterns = ['_exists', '_present', 'has_', 'reconciliation_'];
  const filePatterns = ['_file', 'migration_', 'script_'];

  if (absentPatterns.some((p) => id.includes(p))) return 'search_absent';
  if (presentPatterns.some((p) => id.includes(p))) return 'search_present';
  if (filePatterns.some((p) => id.includes(p))) return 'file';
  return null;
}

function migrateCheck(check: RawCheck): MigrationDecision {
  // Already typed
  if (check.type) return { action: 'keep', check };

  // Has command → command type
  if (check.command) {
    return {
      action: 'upgrade',
      check: { ...check, type: 'command', expect_exit_code: check.expect_exit_code ?? 0 },
    };
  }

  // Has query/pattern + paths → search type based on id hints
  if ((check.query || check.pattern) && check.paths?.length) {
    const hint = idHints(check.id);
    const type = hint === 'search_present' ? 'search_present' : 'search_absent';
    return {
      action: 'upgrade',
      check: { ...check, type },
    };
  }

  // Has path → file type based on id hints
  if (check.path) {
    const hint = idHints(check.id);
    const type = hint === 'search_absent' ? 'file_absent' : 'file_exists';
    return {
      action: 'upgrade',
      check: { ...check, type },
    };
  }

  // Cannot be made machine-verifiable → move to rules
  const text = check.description ?? check.title ?? `${check.id} (migrated from untyped check — requires manual verification)`;
  return {
    action: 'to_rule',
    id: check.id,
    text,
  };
}

function serializeYamlValue(value: unknown, indent: string): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Quote strings containing special chars
    if (/[:#\[\]{}&*!|>'"%@`,]/.test(value) || value.includes('\n') || value.trim() !== value) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '\n' + value.map((v) => `${indent}  - ${serializeYamlValue(v, indent + '  ')}`).join('\n');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    return '\n' + keys
      .map((k) => `${indent}  ${k}: ${serializeYamlValue(obj[k], indent + '  ')}`)
      .join('\n');
  }
  return String(value);
}

function serializeCheck(check: RawCheck, indent: string): string {
  const keyOrder = ['id', 'type', 'title', 'description', 'command', 'expect_exit_code', 'pattern', 'query', 'paths', 'path', 'depends_on', 'freshness'];
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const key of keyOrder) {
    if (key in check && check[key] !== undefined) {
      lines.push(`${indent}  ${key}: ${serializeYamlValue(check[key], indent + '  ')}`);
      seen.add(key);
    }
  }
  // Any remaining keys
  for (const [key, val] of Object.entries(check)) {
    if (!seen.has(key) && val !== undefined) {
      lines.push(`${indent}  ${key}: ${serializeYamlValue(val, indent + '  ')}`);
    }
  }
  return lines.join('\n');
}

function serializeRule(rule: RawRule, indent: string): string {
  return [`${indent}  id: ${rule.id}`, `${indent}  text: ${serializeYamlValue(rule.text, indent + '  ')}`].join('\n');
}

export function migrateContract(source: string): string {
  // Parse the YAML manually enough to extract checks and rules arrays
  // We use a structured approach: parse with JSON-compatible YAML then re-serialize
  let parsed: Record<string, unknown>;
  try {
    // Dynamic import not needed — use a simple regex-based line parser for the migration
    // Actually use dynamic require since yaml is available in the guardian package
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse } = require('yaml') as { parse: (s: string) => unknown };
    parsed = parse(source) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${(err as Error).message}`);
  }

  const rawChecks = (parsed['checks'] as RawCheck[] | undefined) ?? [];
  const rawRules = (parsed['rules'] as RawRule[] | undefined) ?? [];

  const decisions = rawChecks.map(migrateCheck);

  const upgradedChecks: RawCheck[] = [];
  const newRules: RawRule[] = [...rawRules];
  const movedToRules: string[] = [];

  for (const d of decisions) {
    if (d.action === 'keep' || d.action === 'upgrade') {
      upgradedChecks.push(d.check);
    } else {
      newRules.push({ id: d.id, text: d.text });
      movedToRules.push(d.id);
    }
  }

  // Re-serialize
  const topLevelKeys = ['kind', 'name', 'owner', 'status', 'goal'];
  const lines: string[] = [];

  for (const key of topLevelKeys) {
    if (key in parsed && parsed[key] !== undefined) {
      lines.push(`${key}: ${serializeYamlValue(parsed[key], '')}`);
    }
  }

  if (newRules.length > 0) {
    lines.push('');
    lines.push('rules:');
    for (const rule of newRules) {
      lines.push('  -');
      lines.push(serializeRule(rule, ''));
    }
  }

  if (upgradedChecks.length > 0) {
    lines.push('');
    lines.push('checks:');
    for (const check of upgradedChecks) {
      lines.push('  -');
      lines.push(serializeCheck(check, ''));
    }
  }

  const doneWhen = parsed['done_when'] as string[] | undefined;
  if (doneWhen && doneWhen.length > 0) {
    // Remove any done_when entries that were moved to rules
    const filteredDoneWhen = doneWhen.filter((id) => !movedToRules.includes(id));
    if (filteredDoneWhen.length > 0) {
      lines.push('');
      lines.push(`done_when:${serializeYamlValue(filteredDoneWhen, '')}`);
    }
  }

  if (movedToRules.length > 0) {
    lines.push('');
    lines.push(`# Migration note: moved ${movedToRules.length} untyped check(s) to rules:`);
    lines.push(`#   ${movedToRules.join(', ')}`);
    lines.push('# These could not be assigned a machine-verifiable type.');
    lines.push('# Add command/pattern/path fields to convert them back to checks.');
  }

  return lines.join('\n') + '\n';
}
