// WebUI 状态接口 / WebUI status interface
export interface WebUIStatus {
  running: boolean;
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  adminUsername: string;
  initialPassword?: string;
}

export interface ElectronBridgeAPI {
  emit: (name: string, data: unknown) => Promise<unknown> | void;
  on: (callback: (event: { value: string }) => void) => void;
  // 获取拖拽文件/目录的绝对路径 / Get absolute path for dragged file/directory
  getPathForFile?: (file: File) => string;
  // Feedback log collection / 收集反馈日志
  collectFeedbackLogs?: () => Promise<{ filename: string; data: number[] } | null>;
  // Feedback screenshot capture / 反馈截图
  captureFeedbackScreenshot?: () => Promise<{ filename: string; data: number[] } | null>;
  // Forward feedback diagnostics logs to the main process console / 转发反馈诊断日志到主进程控制台
  logFeedbackEvent?: (payload: { details?: unknown; level: 'info' | 'warn' | 'error'; message: string }) => void;
  recoverCorruptedDatabase?: () => Promise<void>;
}

// Embedded terminal (node-pty + xterm) — renderer-facing data plane.
// `terminalId` is the canonical id field on every payload here and on the
// main-process native wire (no remap). Control calls (create/resize/dispose/list)
// + the exit event go through the typed ipcBridge `terminal` namespace; the
// high-rate output stream + input + reattach ride dedicated native channels that
// this surface wraps.

/** One coalesced output frame from a PTY. */
export interface TerminalOutputPayload {
  terminalId: string;
  data: string;
}

/** Emitted once when a PTY exits; the renderer shows a banner + Restart. */
export interface TerminalExitPayload {
  terminalId: string;
  exitCode: number;
  signal?: number;
}

export interface TerminalBridgeAPI {
  /** Renderer → main keystroke/paste input for a terminal. */
  input: (terminalId: string, data: string) => void;
  /** Re-bind this webContents as the terminal's output target and replay its
   *  scrollback buffer (the reattach primitive, used on mount / reload). */
  attach: (terminalId: string) => void;
  /** Subscribe to PTY output frames; returns an unsubscribe fn. */
  onOutput: (callback: (payload: TerminalOutputPayload) => void) => () => void;
  /** Subscribe to PTY exit events; returns an unsubscribe fn. */
  onExit: (callback: (payload: TerminalExitPayload) => void) => () => void;
}

export type BackendStartupFailureReason =
  | 'backend_incompatible_runtime'
  | 'backend_incomplete_installation'
  | 'backend_package_architecture_mismatch'
  | 'backend_data_migration_failed'
  | 'backend_local_data_repair_failed'
  | 'backend_recoverable_database_corruption'
  | 'backend_transient_concurrent_startup'
  | 'backend_startup_directory_unavailable'
  | 'backend_startup_failed';

export type BackendIncompleteInstallationKind = 'missing_backend_binary' | 'missing_directory_resources';
export type BackendLocalDataIssueKind = 'agent_metadata_invalid_utf8' | 'assistant_storage_bootstrap_failed';
export type BackendStartupDirectoryIssueKind = 'missing_or_unavailable_directory' | 'permission_denied';

export interface BackendStartupFailureInfo {
  incompleteInstallationKind?: BackendIncompleteInstallationKind;
  localDataIssueKind?: BackendLocalDataIssueKind;
  startupDirectoryIssueKind?: BackendStartupDirectoryIssueKind;
  missingBackendBinary?: boolean;
  missingBundledAioncoreDir?: boolean;
  missingHubDir?: boolean;
  missingPetStatesDir?: boolean;
  missingPwaDir?: boolean;
  reason: BackendStartupFailureReason;
  backendBoundaryCode?: string;
  backendBoundaryStage?: string;
  runtime?: 'glibc';
  requiredVersions?: string[];
  missingResources?: string[];
  missingRuntimeDir?: boolean;
  packageArch?: string;
  deviceArch?: string;
  expectedDownloadArch?: string;
  isRosettaTranslated?: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridgeAPI;
    terminalAPI?: TerminalBridgeAPI;
    __initialLanguage?: string | null;
    __aionuiE2ETest?: boolean;
    __backendStartupFailed?: boolean;
    __backendStartupFailure?: BackendStartupFailureInfo | null;
    __installationIntegrityReportCount?: number;
    __lastInstallationIntegrityReportMessage?: string;
  }
}
