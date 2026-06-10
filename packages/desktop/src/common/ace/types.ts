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
