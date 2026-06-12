/**
 * Types for the "import CLI sessions" fork feature.
 * Kept under common/ace so both process and renderer can share them.
 */

export type CliSource = 'claude-code' | 'codex' | 'gemini' | 'opencode';

/**
 * What "delete this conversation's local CLI data" resolves to — a discriminated
 * union shared by main (sessionFiles) and renderer (deleteWithLocalFiles).
 *
 * The 'opencode' arm structurally has NO path-shaped field: opencode sessions
 * are rows in ONE shared SQLite DB, and a db path flowing into the file-unlink
 * channel would destroy every session at once. The type makes that
 * inexpressible (plan opencode-cli-adapter.md, decision A1/D1).
 */
export type ResolvedFile =
  | {
      kind: 'file';
      path?: string;
      /** Further files of the SAME session (gemini ACP resume continues a session
       * in new files sharing one sessionId — all must be deleted together). */
      extraPaths?: string[];
      /** App-owned cache of the session's materialized inline images (a directory). */
      imageCacheDir?: string;
    }
  | {
      kind: 'opencode';
      /** Deleted via the controlled DB-delete channel (sessionFiles.deleteOpencodeSessions). */
      opencodeSessionId: string;
      imageCacheDir?: string;
    };

export type UnlinkResult = { deleted: boolean; reason?: 'no-file' | 'out-of-scope' | 'delete-failed' };

/** Parsed metadata for one CLI session (the source of truth stays in the CLI's own files). */
export type CliSessionMeta = {
  source: CliSource;
  /** Stable CLI session id — used as the idempotency key via extra.cli_session_id. */
  sessionId: string;
  /** AionUi extra.backend value, drives the sidebar icon ('claude' | 'codex'). */
  backend: string;
  /** Derived display name for the conversation. */
  title: string;
  /** Original working directory of the CLI session. */
  workspace?: string;
  /** Original session start time (ms epoch), preserved in extra. */
  createdAt?: number;
  /** Original session last-activity time (ms epoch), preserved in extra. */
  updatedAt?: number;
};

/** extra payload written onto an imported AionUi conversation. */
export type ImportedConversationExtra = {
  backend: string;
  /** Workspace handed to the backend; must be an existing path (falls back to home dir). */
  workspace: string;
  /** Idempotency key: the CLI session id. Presence also marks the conversation read-only. */
  cli_session_id: string;
  cli_source: CliSource;
  /** Original CLI cwd, preserved for display even when it no longer exists on disk. */
  cli_cwd?: string;
  cli_created_at?: number;
  cli_updated_at?: number;
};

export type ImportCliSessionsResult = {
  imported: number;
  /** Already present (matched by cli_session_id) — proves idempotency. */
  skipped: number;
  failed: number;
  errors: string[];
};

/** One renderable item parsed from a CLI message turn. */
export type ParsedCliItem =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  /** Inline image attachment (both CLIs embed base64 in the session file). */
  | { kind: 'image'; mediaType: string; dataBase64: string }
  /** Post-/compact summary wall — rendered as a collapsed, expandable block. */
  | { kind: 'compact-summary'; text: string }
  /** CLI notice record (Gemini error/info/warning) — rendered via the app's
   * existing tips row (MessageTips natively handles all three types). */
  | { kind: 'tip'; tipType: 'error' | 'info' | 'warning'; text: string }
  /** Tool execution (Claude tool_use/tool_result, Codex function_call/_output)
   * — rendered via the app's existing acp_tool_call row. */
  | {
      kind: 'tool';
      callId: string;
      name: string;
      title: string;
      toolKind: string;
      status: 'completed' | 'failed';
      rawInput?: unknown;
      output?: string;
    };

/** One CLI message turn (a record) with its content items. */
export type ParsedCliMessage = {
  /** Stable record id → AionUi messages.msg_id (groups items of one turn). */
  msgId: string;
  role: 'user' | 'assistant';
  createdAt?: number;
  items: ParsedCliItem[];
};

export type ImportConversationMessagesResult = {
  /** New message rows written. */
  imported: number;
  /** Rows already present (idempotent skip by message id). */
  skipped: number;
  /** Items that could not be mapped (e.g. tool_use in this version). */
  unmapped: number;
};

/** Why a CLI-imported conversation could not be wired for true resume right now. */
export type EnsureCliResumeReason =
  | 'not-imported' // no cli_session_id → nothing to do
  | 'schema-mismatch' // aioncore private schema changed → degraded to fresh-continue
  | 'jsonl-missing' // CLI session file deleted → resume would be rejected
  | 'busy' // agent mid-turn or respawn race → transient, retried on next open/send
  | 'row-not-ready' // acp_session row not created by warmup yet → transient
  | 'error'; // unexpected failure (logged)

export type EnsureCliResumeResult = {
  resumable: boolean;
  reason?: EnsureCliResumeReason;
};

// ---------------------------------------------------------------------------
// Lark group notification (fork feature)
// ---------------------------------------------------------------------------

/** Display status of a session row in the Lark notification list. */
export type LarkNotifyStatus = 'waiting_decision' | 'error' | 'generating' | 'done';

/** Sort weight: lower = higher in the list (user-locked order). */
export const LARK_NOTIFY_STATUS_WEIGHT: Record<LarkNotifyStatus, number> = {
  waiting_decision: 0,
  error: 1,
  generating: 2,
  done: 3,
};

/** One session row crossing the renderer→main IPC boundary (structured-clone safe, bounded). */
export type LarkNotifyRow = {
  conversation_id: string;
  name: string;
  /** Session type shown to the user, e.g. claude / codex / gemini / aionrs. */
  backend: string;
  workspace: string;
  /** Last-activity epoch ms (same source as sidebar sort). */
  activity_time: number;
  /** Authoritative DB message-row count; null when the per-row fetch failed. */
  total: number | null;
  status: LarkNotifyStatus;
  /** Plain text of the last user message, pre-extracted and truncated renderer-side. */
  last_user_message: { id: string; text: string } | null;
};

/** Persisted notification config (main-process ProcessConfig only — never renderer storage). */
export type AceLarkNotifyConfig = {
  enabled: boolean;
  app_id: string;
  app_secret: string;
  chat_id: string;
  /** Open platform the app belongs to; absent = 'feishu' (backward compatible). */
  domain?: AceLarkNotifyDomain;
  summary_provider?: { id: string; use_model: string };
};

/** Which Lark open platform hosts the app (separate account systems). */
export type AceLarkNotifyDomain = 'feishu' | 'lark';

/** Config shape returned to the renderer: secret replaced by a presence flag. */
export type AceLarkNotifyMaskedConfig = {
  enabled: boolean;
  app_id: string;
  chat_id: string;
  domain?: AceLarkNotifyDomain;
  summary_provider?: { id: string; use_model: string };
  has_secret: boolean;
};

/** Payload accepted by save-config: empty app_secret means "keep the stored one". */
export type AceLarkNotifySaveConfig = {
  enabled: boolean;
  app_id: string;
  app_secret?: string;
  chat_id: string;
  domain?: AceLarkNotifyDomain;
  summary_provider?: { id: string; use_model: string };
};
