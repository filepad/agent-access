export type GuardianConfig = {
  baseUrl: string;
  workspaceId: string;
  keyId: string;
  secret: string;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): GuardianConfig {
  const baseUrl = env['FILEPAD_BASE_URL'];
  const workspaceId = env['FILEPAD_WORKSPACE_ID'];
  const keyId = env['FILEPAD_AGENT_KEY_ID'];
  const secret = env['FILEPAD_AGENT_SECRET'];

  const missing: string[] = [];
  if (!baseUrl) missing.push('FILEPAD_BASE_URL');
  if (!workspaceId) missing.push('FILEPAD_WORKSPACE_ID');
  if (!keyId) missing.push('FILEPAD_AGENT_KEY_ID');
  if (!secret) missing.push('FILEPAD_AGENT_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.\n` +
      `Guardian uses Agent Access credentials (keyId + secret) to authenticate.\n` +
      `Run 'filepad-agent-connect' to create keys, then set:\n` +
      `  FILEPAD_BASE_URL=https://api.filepad.ai\n` +
      `  FILEPAD_WORKSPACE_ID=ws_...\n` +
      `  FILEPAD_AGENT_KEY_ID=ik_...\n` +
      `  FILEPAD_AGENT_SECRET=...\n`,
    );
  }

  return {
    baseUrl: baseUrl as string,
    workspaceId: workspaceId as string,
    keyId: keyId as string,
    secret: secret as string,
  };
}
