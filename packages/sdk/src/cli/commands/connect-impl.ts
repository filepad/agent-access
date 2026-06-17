// FILE MEMO: SDK-level MCP setup command was hardcut. Use @filepad/agent-connect for OAuth remote MCP setup.

export type AgentRuntime = 'openclaw' | 'claude-code' | 'cursor' | 'windsurf' | 'codex' | 'generic-mcp';
export const SUPPORTED_RUNTIMES: readonly AgentRuntime[] = [
  'openclaw',
  'claude-code',
  'cursor',
  'windsurf',
  'codex',
  'generic-mcp',
];

export async function connectAgent(): Promise<never> {
  throw new Error(
    'SDK_CONNECT_MOVED: use `npx -y @filepad/agent-connect@latest connect --runtime <runtime>` for OAuth remote MCP setup.',
  );
}
