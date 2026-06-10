<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# AtFileMenu

## Purpose
Presentational dropdown for the `@`-file mention feature in the chat input. Renders a scrollable listbox of file/folder candidates with keyboard-style active highlighting, plus loading and empty states. It owns no selection logic — all state and behavior are passed in via props.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | Default-exports the `AtFileMenu` component. Maps `FileOrFolderItem[]` to `role="option"` rows showing `name` and `relativePath \|\| path`; highlights the row at `activeIndex`, fires `onHoverItem(index)` on mouse enter and `onSelectItem(item)` on `mouseDown` (with `preventDefault` to keep input focus). Shows `loadingText` when `loading`, otherwise `emptyText`, when `items` is empty. |

## For AI Agents
- Renderer-only component (no Node.js APIs). Pure/controlled — no internal state or data fetching; the parent supplies `items`, `activeIndex`, and the callbacks.
- Selection uses `onMouseDown` + `event.preventDefault()` (not `onClick`) so the chat textarea does not lose focus before selection completes — preserve this if editing.
- Styling follows project rules: UnoCSS utility classes plus semantic CSS variables (`--color-border-2`, `--color-bg-1`, `--color-fill-2`, `text-t-primary`, `text-t-secondary`). No hardcoded colors. Accessibility wiring (`role="listbox"`/`role="option"`, `aria-selected`, `aria-label`) is intentional.
- Keep this component dumb: add fetching/keyboard-nav logic in the parent, not here.

## Dependencies
### Internal
- `@/renderer/utils/file/fileTypes` — `FileOrFolderItem` type (`path`, `name`, `relativePath`).
### External
- `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
