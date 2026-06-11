/**
 * Types for the "import CLI sessions" fork feature.
 * Kept under common/ace so both process and renderer can share them.
 */

export type CliSource = 'claude-code' | 'codex';

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
export type ParsedCliItem = { kind: 'text'; text: string } | { kind: 'thinking'; text: string };

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
