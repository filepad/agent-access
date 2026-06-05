import { doctorClaudeCodeRuntime } from '../../install/doctor.js';

export async function runDoctor(_args: string[]): Promise<void> {
  const result = await doctorClaudeCodeRuntime();
  for (const check of result.checks) {
    const icon = check.ok ? '✓' : '✗';
    process.stdout.write(`  ${icon} ${check.id}: ${check.message}\n`);
  }
  process.stdout.write(`\nOverall: ${result.ok ? 'healthy' : 'issues found'}\n`);
  if (!result.ok) process.exitCode = 1;
}
