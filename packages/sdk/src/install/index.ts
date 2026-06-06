export {
  defaultInstallOptions,
  defaultInstallFromPairingCodeOptions,
  defaultCredentialsPath,
  defaultSettingsPath,
  installClaudeCodeRuntime,
  installClaudeCodeRuntimeFromPairingCode,
  manifestPath,
} from './install.js';
export { doctorClaudeCodeRuntime } from './doctor.js';
export {
  CLAUDE_CODE_HOOK_EVENTS,
  buildClaudeCodeHooksConfig,
  hasExpectedFilepadHooks,
  mergeClaudeCodeHooks,
} from './claude-settings.js';
export type {
  DoctorCheck,
  DoctorResult,
  EnforcementMode,
  InstallFromPairingCodeOptions,
  InstallOptions,
  InstallResult,
  OfflinePolicy,
  RuntimeManifest,
} from './types.js';
