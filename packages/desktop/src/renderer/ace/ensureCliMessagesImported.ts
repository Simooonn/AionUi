/**
 * Renderer-side wiring for CLI-imported conversations (dual-channel):
 * - memory channel: ensure aioncore's acp_session points at the CLI session id
 *   so the next prompt truly resumes it (must run before EVERY send — aioncore
 *   clears session_id on error cleanup, and a respawned warm agent can undo it);
 * - display channel: lazily sync the on-disk jsonl into the messages table.
 *
 * Degradation is observable: permanent reasons (schema-mismatch / jsonl-missing)
 * warn once per conversation; transient reasons (busy / row-not-ready) escalate
 * to the same visible warning after 3 consecutive failures.
 */

import { Message } from '@arco-design/web-react';
import i18next from 'i18next';
import type { EnsureCliResumeResult, ImportConversationMessagesResult } from '@/common/ace/types';

type AceApi = {
  importConversationMessages?: (conversationId: string) => Promise<ImportConversationMessagesResult>;
  ensureCliResume?: (conversationId: string) => Promise<EnsureCliResumeResult>;
};

const TRANSIENT_ESCALATE_AFTER = 3;
const transientFailures = new Map<string, number>();
const warnedConversations = new Set<string>();

function getAceApi(): AceApi | undefined {
  return (window as unknown as { electronAPI?: AceApi }).electronAPI;
}

function warnDegradedOnce(conversationId: string): void {
  if (warnedConversations.has(conversationId)) return;
  warnedConversations.add(conversationId);
  Message.warning({ content: i18next.t('conversation.ace.cliResumeUnavailable'), duration: 6000 });
}

function trackResumeResult(conversationId: string, result?: EnsureCliResumeResult): void {
  if (!result || result.resumable || result.reason === 'not-imported') {
    transientFailures.delete(conversationId);
    warnedConversations.delete(conversationId); // recovered → allow a future re-warn
    return;
  }
  if (result.reason === 'schema-mismatch' || result.reason === 'jsonl-missing') {
    warnDegradedOnce(conversationId);
    return;
  }
  // busy / row-not-ready / error: transient — escalate only when persistent
  const count = (transientFailures.get(conversationId) ?? 0) + 1;
  transientFailures.set(conversationId, count);
  if (count >= TRANSIENT_ESCALATE_AFTER) warnDegradedOnce(conversationId);
}

/** Best-effort resume wiring; must run immediately before every send. */
export async function ensureCliResumeBeforeSend(conversationId: string): Promise<void> {
  if (!conversationId) return;
  try {
    const result = await getAceApi()?.ensureCliResume?.(conversationId);
    trackResumeResult(conversationId, result);
  } catch {
    /* best-effort: degraded send still works (fresh continue) */
  }
}

/** On conversation open: wire resume and sync jsonl history into the DB.
 * The two channels are independent — run them in parallel so non-imported
 * conversations (both no-op fast) pay a single IPC round-trip of latency. */
export async function ensureCliConversationReady(conversationId: string): Promise<void> {
  if (!conversationId) return;
  const api = getAceApi();
  await Promise.all([
    (async () => {
      try {
        const result = await api?.ensureCliResume?.(conversationId);
        trackResumeResult(conversationId, result);
      } catch {
        /* best-effort */
      }
    })(),
    (async () => {
      try {
        await api?.importConversationMessages?.(conversationId);
      } catch {
        /* best-effort: fall through to whatever the DB already has */
      }
    })(),
  ]);
}
