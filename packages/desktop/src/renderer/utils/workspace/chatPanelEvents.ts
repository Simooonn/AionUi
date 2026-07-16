export const CHAT_TOGGLE_EVENT = 'aionui-chat-panel-toggle';
export const CHAT_STATE_EVENT = 'aionui-chat-panel-state';

export type ChatStateDetail = {
  collapsed: boolean;
  /** False when middle-collapse control must be hidden (no workspace / mobile). */
  controlAvailable: boolean;
};

export function dispatchChatToggleEvent(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(CHAT_TOGGLE_EVENT));
}

export function dispatchChatStateEvent(detail: ChatStateDetail): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<ChatStateDetail>(CHAT_STATE_EVENT, { detail }));
}
