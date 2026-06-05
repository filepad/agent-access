export type EnforcementMode = 'off' | 'observe' | 'warn' | 'block';
export type OfflinePolicy = 'allow' | 'deny';

export type InstallOptions = {
  baseUrl: string;
  workspaceId: string;
  agentKeyId: string;
  agentSecret: string;
  contractId: string;
  repoRoot: string;
  settingsPath?: string | undefined;
  credentialsPath?: string | undefined;
  enforcementMode: EnforcementMode;
  offlinePolicy: OfflinePolicy;
  hookPackageVersion: string;
  guardianPackageVersion: string;
  now?: Date | undefined;
};

export type InstallFromPairingCodeOptions = Omit<
  InstallOptions,
  'workspaceId' | 'agentKeyId' | 'agentSecret'
> & {
  pairCode: string;
  label?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
};

export type RuntimeManifest = {
  schemaVersion: 1;
  runtime: 'claude-code';
  contractId: string;
  repoRoot: string;
  settingsPath: string;
  credentialsPath: string;
  hookCommand: string;
  guardianCommand: string;
  enforcementMode: EnforcementMode;
  offlinePolicy: OfflinePolicy;
  packages: {
    hooks: string;
    guardian: string;
  };
  installedAt: string;
};

export type InstallResult = {
  manifestPath: string;
  settingsPath: string;
  credentialsPath: string;
  hookEvents: string[];
  guardianCommand: string;
};

export type DoctorCheck = {
  id: string;
  ok: boolean;
  message: string;
};

export type DoctorResult = {
  ok: boolean;
  manifestPath: string;
  checks: DoctorCheck[];
};
