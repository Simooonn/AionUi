<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose

Renderer-side React components for the conversation Preview feature. Groups the preview UI into the host panel, file-type viewers, in-place editors, and content renderers, all surfaced through a single barrel.

## Key Files

| File       | Description                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | Barrel that re-exports `PreviewPanel` (default + named) plus everything from `viewers`, `editors`, and `renderers`. |

## Subdirectories

| Directory      | Purpose                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| `PreviewPanel` | Main preview panel host component and its sub-components (see `PreviewPanel/AGENTS.md`). |
| `viewers`      | File-type viewer components for displaying previewed content (see `viewers/AGENTS.md`).  |
| `editors`      | In-place editor components for editable preview content (see `editors/AGENTS.md`).       |
| `renderers`    | Content renderer components (see `renderers/AGENTS.md`).                                 |

## For AI Agents

- Renderer process only — no Node.js APIs; reach the main process via the IPC bridge in `packages/desktop/src/preload`.
- Import preview components from this `index.ts` barrel rather than deep paths so re-exports stay the single entry point. When adding a new component group, export it from `index.ts`.
- Follow project UI conventions: `@arco-design/web-react` components, `@icon-park/react` icons, UnoCSS utilities, and i18n keys for all user-facing text.

<!-- MANUAL: notes below this line are preserved on regeneration -->
