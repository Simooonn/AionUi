/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_PANEL_COLLAPSED_KEY,
  applyMainContentInvariant,
  coercePanelState,
  cycleLayoutMode,
  hydratePanelState,
  layoutModeToPanelState,
  nextPanelState,
  panelStateToLayoutMode,
  readChatCollapsePreference,
  suggestRightCollapsed,
  writeChatCollapsePreference,
  writeWorkspaceCollapsePreference,
  readWorkspaceCollapsePreference,
} from '@/renderer/utils/workspace/mainContentPanels';

const memoryStore = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
  clear: () => {
    memoryStore.clear();
  },
};

vi.stubGlobal('localStorage', localStorageMock);

describe('mainContentPanels', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  describe('applyMainContentInvariant / nextPanelState', () => {
    it('toggles chat open → collapsed with right open', () => {
      expect(nextPanelState({ chatCollapsed: false, rightCollapsed: false }, 'chat')).toEqual({
        chatCollapsed: true,
        rightCollapsed: false,
      });
    });

    it('toggles chat collapse when right is collapsed → force-opens right', () => {
      expect(nextPanelState({ chatCollapsed: false, rightCollapsed: true }, 'chat')).toEqual({
        chatCollapsed: true,
        rightCollapsed: false,
      });
    });

    it('toggles right collapse when chat is collapsed → force-opens chat', () => {
      expect(nextPanelState({ chatCollapsed: true, rightCollapsed: false }, 'right')).toEqual({
        chatCollapsed: false,
        rightCollapsed: true,
      });
    });

    it('never returns both collapsed from nextPanelState', () => {
      const a = nextPanelState({ chatCollapsed: false, rightCollapsed: true }, 'chat');
      const b = nextPanelState({ chatCollapsed: true, rightCollapsed: false }, 'right');
      expect(a.chatCollapsed && a.rightCollapsed).toBe(false);
      expect(b.chatCollapsed && b.rightCollapsed).toBe(false);
    });

    it('coerce both-true with trigger chat force-opens right', () => {
      expect(
        coercePanelState(
          { chatCollapsed: false, rightCollapsed: false },
          { chatCollapsed: true, rightCollapsed: true },
          'chat'
        )
      ).toEqual({ chatCollapsed: true, rightCollapsed: false });
    });

    it('applyMainContentInvariant is identity when only one side collapsed', () => {
      expect(applyMainContentInvariant({ chatCollapsed: true, rightCollapsed: false }, 'chat')).toEqual({
        chatCollapsed: true,
        rightCollapsed: false,
      });
    });
  });

  describe('suggestRightCollapsed (hasFiles / layout suppress)', () => {
    it('no-ops when chat collapsed and suggested right collapsed', () => {
      expect(suggestRightCollapsed({ chatCollapsed: true, rightCollapsed: false }, true)).toBeNull();
    });

    it('applies expand while chat collapsed', () => {
      expect(suggestRightCollapsed({ chatCollapsed: true, rightCollapsed: true }, false)).toEqual({
        chatCollapsed: true,
        rightCollapsed: false,
      });
    });

    it('applies collapse when chat expanded', () => {
      expect(suggestRightCollapsed({ chatCollapsed: false, rightCollapsed: false }, true)).toEqual({
        chatCollapsed: false,
        rightCollapsed: true,
      });
    });

    it('no-ops when already at target', () => {
      expect(suggestRightCollapsed({ chatCollapsed: false, rightCollapsed: true }, true)).toBeNull();
    });
  });

  describe('hydratePanelState', () => {
    it('force-opens right when both prefs collapsed and workspace enabled', () => {
      expect(
        hydratePanelState({
          chatPref: 'collapsed',
          rightPref: 'collapsed',
          workspaceEnabled: true,
          isMobile: false,
        })
      ).toEqual({ chatCollapsed: true, rightCollapsed: false });
    });

    it('forces chat expanded when workspace disabled', () => {
      expect(
        hydratePanelState({
          chatPref: 'collapsed',
          rightPref: 'collapsed',
          workspaceEnabled: false,
          isMobile: false,
        })
      ).toEqual({ chatCollapsed: false, rightCollapsed: true });
    });

    it('forces chat expanded on mobile', () => {
      expect(
        hydratePanelState({
          chatPref: 'collapsed',
          rightPref: 'expanded',
          workspaceEnabled: true,
          isMobile: true,
        })
      ).toEqual({ chatCollapsed: false, rightCollapsed: true });
    });

    it('defaults right collapsed when no right pref and chat expanded', () => {
      expect(
        hydratePanelState({
          chatPref: 'expanded',
          rightPref: null,
          workspaceEnabled: true,
          isMobile: false,
        })
      ).toEqual({ chatCollapsed: false, rightCollapsed: true });
    });
  });

  describe('chat preference storage', () => {
    it('defaults to expanded', () => {
      expect(readChatCollapsePreference()).toBe('expanded');
    });

    it('round-trips collapsed/expanded', () => {
      writeChatCollapsePreference('collapsed');
      expect(readChatCollapsePreference()).toBe('collapsed');
      expect(localStorage.getItem(CHAT_PANEL_COLLAPSED_KEY)).toBe('collapsed');
      writeChatCollapsePreference('expanded');
      expect(readChatCollapsePreference()).toBe('expanded');
    });
  });

  describe('workspace preference storage', () => {
    it('writes and reads per preference key', () => {
      writeWorkspaceCollapsePreference('team-1', false);
      expect(readWorkspaceCollapsePreference('team-1')).toBe('expanded');
      writeWorkspaceCollapsePreference('team-1', true);
      expect(readWorkspaceCollapsePreference('team-1')).toBe('collapsed');
    });

    it('returns null without preference key', () => {
      expect(readWorkspaceCollapsePreference(undefined)).toBeNull();
    });
  });

  describe('layout mode cycle', () => {
    it('maps panel state to layout modes', () => {
      expect(panelStateToLayoutMode({ chatCollapsed: false, rightCollapsed: false })).toBe('both');
      expect(panelStateToLayoutMode({ chatCollapsed: false, rightCollapsed: true })).toBe('chat-only');
      expect(panelStateToLayoutMode({ chatCollapsed: true, rightCollapsed: false })).toBe('workspace-only');
    });

    it('cycles both → chat-only → workspace-only → both', () => {
      const both = layoutModeToPanelState('both');
      const chatOnly = cycleLayoutMode(both);
      expect(chatOnly).toEqual({ chatCollapsed: false, rightCollapsed: true });
      const workspaceOnly = cycleLayoutMode(chatOnly);
      expect(workspaceOnly).toEqual({ chatCollapsed: true, rightCollapsed: false });
      const backToBoth = cycleLayoutMode(workspaceOnly);
      expect(backToBoth).toEqual({ chatCollapsed: false, rightCollapsed: false });
    });
  });
});
