<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# Workspace

## Purpose

Renders the conversation-side workspace panel: a VSCode-style file tree of the agent's working directory plus a "Changes" tab listing file modifications. `index.tsx` (`ChatWorkspace`) is the orchestrator that wires together all the local hooks (tree, search, paste, drag-import, file ops, modals, events) and components (toolbar, tab bar, context menu, dialogs, file-change list).

## Key Files

| File                            | Description                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`                     | `ChatWorkspace` component. Composes the workspace hooks/components, manages the `files`/`changes` tab state, collapse toggle, context-menu positioning, and preview opening (file + diff via `usePreviewContext`).                                                                                                          |
| `types.ts`                      | Shared types: `WorkspaceProps` (`workspace`, `conversation_id`, `eventPrefix: 'acp' \| 'codex' \| 'aionrs'`, `isTemporaryWorkspace`), modal/menu state shapes (`ContextMenuState`, `RenameModalState`, `DeleteModalState`, `PasteConfirmState`), `WorkspaceTreeState`, `SelectedNodeRef`, `WorkspaceTab`, and `MessageApi`. |
| `workspace.css`                 | Plain CSS for the tree chevron rotation (overrides Arco switcher), header toggle button, and mobile (`max-width:767px`) tree/toolbar density. Row hover/selection backgrounds live in `styles/arco-override.css`.                                                                                                           |
| `README.en.md` / `README.cn.md` | Developer docs for the Workspace module (English / Chinese).                                                                                                                                                                                                                                                                |

## Subdirectories

| Directory    | Purpose                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components` | Presentational pieces — toolbar, tab bar, context menu, dialogs, paste-confirm modal, file-change list, file-type icon (see `components/AGENTS.md`) |
| `hooks`      | Stateful logic hooks — tree, search, paste, drag-import, file ops, modals, events, collapse, file changes (see `hooks/AGENTS.md`)                   |
| `utils`      | Tree/path helpers like `flattenSingleRoot`, `extractNodeData`, `computeContextMenuPosition`, `getTargetFolderPath` (see `utils/AGENTS.md`)          |

## For AI Agents

- Renderer-only code: no Node.js APIs. All filesystem access goes through `ipcBridge` (from `@/common`); workspace I/O is keyed by `conversation_id` + `eventPrefix`.
- `eventPrefix` selects the agent backend channel (`acp` / `codex` / `aionrs`); thread it through to hooks/events rather than hardcoding.
- `isTemporaryWorkspace` is authoritative from `conversation.extra.is_temporary_workspace`; do NOT re-derive it from the directory path shape (see the comment in `index.tsx`). `rootName` is intentionally unused (`void rootName`).
- `messageApi` may be supplied externally; only render the local Arco `messageContext` when no external one is passed (`shouldRenderLocalMessageContext`).
- This file is `index.tsx`-heavy: adding a feature usually means a new hook in `hooks/` + a component in `components/`, then wiring both here — keep `index.tsx` as composition, not logic.

## Dependencies

### Internal

- `@/common` (`ipcBridge`, `IDirOrFile`), `@/renderer/components/layout/FlexFullContainer`, `@/renderer/hooks/context/LayoutContext`, `@/renderer/hooks/file/useAbortUploadsOnConversationChange`, `@/renderer/pages/conversation/Preview` (`usePreviewContext`), `@/renderer/utils/workspace/workspace`
- `./components/*`, `./hooks/*`, `./utils/treeHelpers`

### External

- `@arco-design/web-react` (`Tree`, `Message`, `Empty`), `@icon-park/react`, `react`, `react-i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
