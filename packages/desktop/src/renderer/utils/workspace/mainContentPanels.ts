/**
 * Pure main-content panel state (middle chat + right workspace).
 * Single source of truth for the mutual-exclusion invariant.
 */

export const CHAT_PANEL_COLLAPSED_KEY = 'chat-panel-collapsed';

export type CollapsePref = 'collapsed' | 'expanded';
export type PanelState = {
  chatCollapsed: boolean;
  rightCollapsed: boolean;
};
export type ToggleTarget = 'chat' | 'right';

export function applyMainContentInvariant(next: PanelState, trigger: ToggleTarget): PanelState {
  if (next.chatCollapsed && next.rightCollapsed) {
    // Trigger side wins collapse; the other side force-opens.
    if (trigger === 'chat') {
      return { chatCollapsed: true, rightCollapsed: false };
    }
    return { chatCollapsed: false, rightCollapsed: true };
  }
  return next;
}

export function nextPanelState(current: PanelState, toggle: ToggleTarget): PanelState {
  const attempted: PanelState =
    toggle === 'chat'
      ? { chatCollapsed: !current.chatCollapsed, rightCollapsed: current.rightCollapsed }
      : { chatCollapsed: current.chatCollapsed, rightCollapsed: !current.rightCollapsed };
  return applyMainContentInvariant(attempted, toggle);
}

export function coercePanelState(
  current: PanelState,
  patch: Partial<PanelState>,
  trigger: ToggleTarget
): PanelState {
  return applyMainContentInvariant({ ...current, ...patch }, trigger);
}

/**
 * When chat is collapsed, non-toggle writers that want to collapse the right
 * panel must no-op (no storage write). Returns null when the patch is suppressed.
 */
export function suggestRightCollapsed(
  current: PanelState,
  suggestedRightCollapsed: boolean
): PanelState | null {
  if (current.chatCollapsed && suggestedRightCollapsed) {
    return null;
  }
  if (current.rightCollapsed === suggestedRightCollapsed) {
    return null;
  }
  return coercePanelState(current, { rightCollapsed: suggestedRightCollapsed }, 'right');
}

export function readChatCollapsePreference(): CollapsePref {
  if (typeof localStorage === 'undefined') {
    return 'expanded';
  }
  try {
    const stored = localStorage.getItem(CHAT_PANEL_COLLAPSED_KEY);
    if (stored === 'collapsed' || stored === 'expanded') {
      return stored;
    }
  } catch {
    // ignore quota / private mode
  }
  return 'expanded';
}

export function writeChatCollapsePreference(value: CollapsePref): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(CHAT_PANEL_COLLAPSED_KEY, value);
  } catch {
    // ignore
  }
}

export function workspacePreferenceStorageKey(preferenceKey: string | undefined): string | null {
  if (!preferenceKey) {
    return null;
  }
  return `workspace-preference-${preferenceKey}`;
}

export function readWorkspaceCollapsePreference(preferenceKey: string | undefined): CollapsePref | null {
  const key = workspacePreferenceStorageKey(preferenceKey);
  if (!key || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'collapsed' || stored === 'expanded') {
      return stored;
    }
  } catch {
    // ignore
  }
  return null;
}

export function writeWorkspaceCollapsePreference(
  preferenceKey: string | undefined,
  collapsed: boolean
): void {
  const key = workspacePreferenceStorageKey(preferenceKey);
  if (!key || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // ignore
  }
}

export type HydratePanelInput = {
  chatPref: CollapsePref;
  /** null = no user preference; default right collapsed matches historical useState(true) */
  rightPref: CollapsePref | null;
  workspaceEnabled: boolean;
  isMobile: boolean;
};

/**
 * Synchronous initial pair for lazy useState. Never returns both collapsed when
 * workspace is enabled on desktop.
 */
export function hydratePanelState(input: HydratePanelInput): PanelState {
  if (!input.workspaceEnabled || input.isMobile) {
    return { chatCollapsed: false, rightCollapsed: true };
  }

  const chatCollapsed = input.chatPref === 'collapsed';
  const rightCollapsed = input.rightPref !== 'expanded';

  // If chat memory wants collapse while right would also be collapsed, keep chat
  // collapsed and force-open right (trigger:'chat').
  return applyMainContentInvariant({ chatCollapsed, rightCollapsed }, 'chat');
}

export function toCollapsePref(collapsed: boolean): CollapsePref {
  return collapsed ? 'collapsed' : 'expanded';
}
