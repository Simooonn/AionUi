/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-only detection for conversations.
 *
 * CLI-imported conversations (extra.cli_session_id) are NO LONGER read-only:
 * they are continuable via true ACP resume (see process/ace/sessionResume.ts).
 * Only legacy conversation types still render read-only.
 */

import type { CliSource } from '@/common/ace/types';
import { buildResumeCommand } from '@/common/ace/resumeCommand';
import type { TChatConversation } from '@/common/config/storage';
import { isLegacyReadOnlyConversationType } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { addEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

export function isImportedCliConversation(conversation?: TChatConversation | null): boolean {
  if (!conversation) return false;
  const extra = conversation.extra as { cli_session_id?: string } | undefined;
  return !!extra?.cli_session_id;
}

/**
 * Build the terminal command a user can paste to resume the underlying CLI session
 * (e.g. `claude --resume <id>`) for an IMPORTED conversation, whose session id is
 * persisted in extra. App-created conversations keep their session id only in the
 * backend's acp_session table — use {@link useNativeResumeCommand} for those.
 */
export function buildCliResumeCommand(conversation?: TChatConversation | null): string | null {
  if (!conversation) return null;
  const extra = conversation.extra as { cli_session_id?: string; cli_source?: CliSource } | undefined;
  return buildResumeCommand(extra?.cli_source, extra?.cli_session_id);
}

/** True when the conversation should render read-only (legacy types only). */
export function isReadOnlyConversation(conversation?: TChatConversation | null): boolean {
  if (!conversation) return false;
  return isLegacyReadOnlyConversationType(conversation.type);
}

// ---------------------------------------------------------------------------
// App-created (native) ACP resume commands.
//
// Imported conversations build their command synchronously from extra; native
// ACP conversations only have their CLI session id in the backend's acp_session
// table, so resolve it lazily over IPC and cache the result per conversation.
// A cached `null` means "resolved, no command"; it is dropped on the next list
// refresh so a freshly-started session (no session id yet) re-resolves.
// ---------------------------------------------------------------------------

type AceResumeApi = { resolveResumeCommands?: (ids: string[]) => Promise<Record<string, string>> };

const nativeResumeCache = new Map<string, string | null>();
const pendingIds = new Set<string>();
const nativeListeners = new Set<() => void>();
let flushScheduled = false;
let refreshUnsub: (() => void) | null = null;

function notifyNative(): void {
  nativeListeners.forEach((listener) => listener());
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    const ids = [...pendingIds];
    pendingIds.clear();
    if (!ids.length) return;
    const resolve = (window as unknown as { electronAPI?: AceResumeApi }).electronAPI?.resolveResumeCommands;
    if (!resolve) {
      ids.forEach((id) => nativeResumeCache.set(id, null));
      notifyNative();
      return;
    }
    void resolve(ids)
      .then((map) => {
        ids.forEach((id) => nativeResumeCache.set(id, map[id] ?? null));
        notifyNative();
      })
      .catch(() => {
        ids.forEach((id) => nativeResumeCache.set(id, null));
        notifyNative();
      });
  });
}

function subscribeNativeResume(listener: () => void): () => void {
  nativeListeners.add(listener);
  if (nativeListeners.size === 1) {
    // Drop unresolved entries on each list refresh so newly-started sessions re-resolve.
    refreshUnsub = addEventListener('chat.history.refresh', () => {
      let changed = false;
      for (const [id, command] of nativeResumeCache) {
        if (command === null) {
          nativeResumeCache.delete(id);
          changed = true;
        }
      }
      if (changed) notifyNative();
    });
  }
  return () => {
    nativeListeners.delete(listener);
    if (nativeListeners.size === 0 && refreshUnsub) {
      refreshUnsub();
      refreshUnsub = null;
    }
  };
}

/**
 * Resolve the resume command for an app-created ACP conversation (whose CLI
 * session id lives only in the backend's acp_session table). Returns null until
 * resolved, then the command string, or null when none exists. Pass `enabled`
 * false to skip resolution (e.g. for imported conversations handled elsewhere).
 */
export function useNativeResumeCommand(conversationId: string, enabled: boolean): string | null {
  const getSnapshot = useCallback((): string | null => (enabled ? nativeResumeCache.get(conversationId) ?? null : null), [enabled, conversationId]);
  const value = useSyncExternalStore(subscribeNativeResume, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!enabled) return;
    if (nativeResumeCache.has(conversationId) || pendingIds.has(conversationId)) return;
    pendingIds.add(conversationId);
    scheduleFlush();
  }, [enabled, conversationId]);
  return value;
}
