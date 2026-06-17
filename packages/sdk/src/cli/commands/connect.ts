export async function runConnect(_args: string[]): Promise<void> {
  throw new Error(
    'SDK_CONNECT_MOVED: use `npx -y @filepad/agent-connect@latest connect --runtime <runtime>` for OAuth remote MCP setup.',
  );
}
