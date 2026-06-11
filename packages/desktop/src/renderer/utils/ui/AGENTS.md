<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# ui

## Purpose

Renderer-side React/DOM UI helpers: higher-order-component composition utilities, a typed Modal HOC with `useModal` hook, a lightweight Context factory, and DOM-level patches/helpers (clipboard, focus, ResizeObserver/console noise suppression, sidebar tooltip mounting).

## Key Files

| File                | Description                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOC.tsx`           | Default-exported `HOC` with `.Wrapper` (compose multiple HOCs right-to-left), `.Create` (bind default props), and `.Hook` (run hooks before rendering children).                                                                                      |
| `ModalHOC.tsx`      | Wraps an Arco `Modal` body component; returns a component exposing `useModal()` → `[{ open, close }, ReactNode]`. `ModalHOC.Extra(defaultModalProps)` curries default `ModalProps`.                                                                   |
| `createContext.tsx` | Factory returning `[useContext, ContextComponent, useUpdateContext]` for a value + `setValue` pair, with a stateful provider that syncs to the `value` prop.                                                                                          |
| `clipboard.ts`      | `copyText(text)` — uses `navigator.clipboard` in secure contexts, falls back to a hidden `<textarea>` + `document.execCommand('copy')` for HTTP WebUI; restores prior focus.                                                                          |
| `focus.ts`          | `blurActiveElement()` plus a timed `blockMobileInputFocus(durationMs)` / `shouldBlockMobileInputFocus()` guard to stop mobile soft-keyboard re-trigger after route changes.                                                                           |
| `runtimePatches.ts` | Self-invoking `applyRuntimePatches()`: wraps `ResizeObserver` in rAF and filters `error`/`unhandledrejection`/`console.error` for ResizeObserver-loop, Arco message-key, and React 19 ref-deprecation noise. Idempotent via `window.__Aion*__` flags. |
| `siderTooltip.ts`   | Sidebar Arco Tooltip helpers: `getSiderPopupContainer` mounts popups into `.layout-sider`, `getSiderTooltipProps(enabled)` disables tooltips on touch/no-hover devices, `cleanupSiderTooltips()` removes detached popup nodes.                        |

## For AI Agents

- Renderer-only: every file here touches DOM/React/`window`; never import Node.js APIs. Most functions guard with `typeof window`/`typeof document === 'undefined'` — preserve those checks for SSR/non-browser safety.
- `runtimePatches.ts` runs its side effect at import time and mutates globals (`window.addEventListener`, `ResizeObserver`, `console.error`). Keep patches idempotent via the existing `__Aion*Patched__` flags; only add new silence patterns to the existing pattern arrays.
- Inline comments here are bilingual (English + Chinese); the codebase default is English comments — match the surrounding file's existing style when editing.
- `HOC.Wrapper` composes right-to-left (uses `toReversed()`); order matters for layered providers.

## Dependencies

### External

- `react` — all HOC/context/modal helpers.
- `@arco-design/web-react` — `ModalProps`/`TooltipProps` types in `ModalHOC.tsx` and `siderTooltip.ts`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
