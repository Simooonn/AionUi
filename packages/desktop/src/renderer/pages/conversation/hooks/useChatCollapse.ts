import { dispatchChatStateEvent } from '@/renderer/utils/workspace/chatPanelEvents';
import { writeChatCollapsePreference, toCollapsePref } from '@/renderer/utils/workspace/mainContentPanels';
import { useEffect, useState } from 'react';

type UseChatCollapseParams = {
  controlAvailable: boolean;
  initialChatCollapsed: boolean;
};

type UseChatCollapseReturn = {
  chatCollapsed: boolean;
  setChatCollapsed: (collapsed: boolean) => void;
  /** Update React state only — does not write global localStorage. */
  setChatCollapsedState: (collapsed: boolean) => void;
};

/**
 * Holds middle-chat collapse state and broadcasts CHAT_STATE.
 * Toggle listening lives in ChatLayout coordinator — this hook does not free-toggle.
 */
export function useChatCollapse({
  controlAvailable,
  initialChatCollapsed,
}: UseChatCollapseParams): UseChatCollapseReturn {
  const [chatCollapsed, setChatCollapsedState] = useState(initialChatCollapsed);

  const setChatCollapsed = (collapsed: boolean) => {
    setChatCollapsedState(collapsed);
    // Only persist when the control is meaningful (desktop + workspace).
    // Mobile / no-workspace runtime coerce must not rewrite global preference.
    if (controlAvailable) {
      writeChatCollapsePreference(toCollapsePref(collapsed));
    }
  };

  useEffect(() => {
    dispatchChatStateEvent({
      collapsed: chatCollapsed,
      controlAvailable,
    });
  }, [chatCollapsed, controlAvailable]);

  return { chatCollapsed, setChatCollapsed, setChatCollapsedState };
}
