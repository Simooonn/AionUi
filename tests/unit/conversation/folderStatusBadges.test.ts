/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  collectFolderStatuses,
  resolveRowStatus,
  type ConversationStatusLookup,
} from '@/renderer/pages/conversation/GroupedHistory/utils/folderStatusBadges';

const lookupFrom = (
  states: Record<string, { generating?: boolean; waiting?: boolean; unread?: boolean }>
): ConversationStatusLookup => ({
  isGenerating: (id) => states[id]?.generating ?? false,
  isWaitingConfirmation: (id) => states[id]?.waiting ?? false,
  hasUnread: (id) => states[id]?.unread ?? false,
});

const conversations = (...ids: string[]) => ids.map((id) => ({ id }));

describe('resolveRowStatus', () => {
  it('follows the row precedence waiting > generating > unread', () => {
    const lookup = lookupFrom({ a: { waiting: true, generating: true, unread: true } });
    expect(resolveRowStatus('a', lookup)).toBe('waiting');
  });

  it('reports generating when a running conversation is also unread', () => {
    const lookup = lookupFrom({ a: { generating: true, unread: true } });
    expect(resolveRowStatus('a', lookup)).toBe('generating');
  });

  it('reports no status when the row shows no badge', () => {
    expect(resolveRowStatus('a', lookupFrom({}))).toBeNull();
  });
});

describe('collectFolderStatuses', () => {
  it('returns nothing for an empty folder', () => {
    expect(collectFolderStatuses([], lookupFrom({}))).toEqual([]);
  });

  it('returns nothing when no conversation shows a badge', () => {
    expect(collectFolderStatuses(conversations('a', 'b'), lookupFrom({}))).toEqual([]);
  });

  it('surfaces every distinct status present in the folder, in display order', () => {
    const lookup = lookupFrom({ a: { unread: true }, b: { generating: true }, c: { waiting: true } });
    expect(collectFolderStatuses(conversations('a', 'b', 'c'), lookup)).toEqual(['waiting', 'generating', 'unread']);
  });

  it('de-duplicates a status shared by several conversations', () => {
    const lookup = lookupFrom({ a: { generating: true }, b: { generating: true } });
    expect(collectFolderStatuses(conversations('a', 'b'), lookup)).toEqual(['generating']);
  });

  it('keeps a status while any conversation still shows it', () => {
    const lookup = lookupFrom({ a: { generating: true }, b: {} });
    expect(collectFolderStatuses(conversations('a', 'b'), lookup)).toEqual(['generating']);
  });

  it('drops a status once the last conversation showing it clears, leaving the others', () => {
    const lookup = lookupFrom({ a: {}, b: { unread: true } });
    expect(collectFolderStatuses(conversations('a', 'b'), lookup)).toEqual(['unread']);
  });

  it('never surfaces a status hidden on every row by precedence', () => {
    // The only unread conversation is also waiting, so its row shows the waiting
    // icon and no unread dot — the folder must not invent one.
    const lookup = lookupFrom({ a: { waiting: true, unread: true } });
    expect(collectFolderStatuses(conversations('a'), lookup)).toEqual(['waiting']);
  });

  it('reads the grouped conversations, so a collapsed folder reports the same statuses', () => {
    const lookup = lookupFrom({ a: { waiting: true }, b: { unread: true } });
    const grouped = conversations('a', 'b');
    expect(collectFolderStatuses(grouped, lookup)).toEqual(collectFolderStatuses([...grouped].toReversed(), lookup));
  });
});
