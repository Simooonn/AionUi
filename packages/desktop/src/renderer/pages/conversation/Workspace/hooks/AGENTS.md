<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# hooks

## Purpose
React hooks that power the conversation Workspace file panel: file-tree loading/selection, file operations (open/rename/delete/preview/download), drag/paste import, modal/context-menu state, search, collapse persistence, and git-style file-change tracking. The parent `Workspace.tsx` composes these hooks together, threading shared state (e.g. `selectedNodeRef`, `setFiles`) between them.

## Key Files
| File | Description |
| --- | --- |
| `useWorkspaceTree.ts` | Core tree state + selection. `loadWorkspace`/`refreshWorkspace` call `ipcBridge.conversation.getWorkspace`; uses `loadSeqRef` to drop stale responses, `mergeLoadedChildren` to preserve lazy-loaded subtrees on refresh, and debounced loading. Exposes `ensureNodeSelected`, `clearSelection`, and refs (`selectedNodeRef`, `selectedKeysRef`). |
| `useWorkspaceFileOps.ts` | File actions: open/reveal via `ipcBridge.shell`, delete/rename via `workspaceFs` utils, preview (reads text/image/office through `ipcBridge.fs`, truncates large text), add-to-chat, download. Drives rename/delete modals and emits `${eventPrefix}.selected.file*` events. |
| `useWorkspacePaste.ts` | Paste/upload import. Copies host files into workspace via `ipcBridge.fs.copyFilesToWorkspace`, WebUI upload via `uploadFileViaHttp`, paste-confirm modal gated by `configService` `workspace.pasteConfirm`; registers global paste through `usePasteService`. |
| `useWorkspaceEvents.ts` | All event listeners: resets state on conversation switch, throttled (2s) auto-refresh on agent `tool_call`/`acp_tool_call` responses, manual refresh / clear-selection / selected-file-sync emitter events, search response provider, and context-menu close on click/scroll/Escape. |
| `useWorkspaceDragImport.ts` | Drag-and-drop import. Tracks drag state via `dragCounterRef`, resolves dropped paths (Electron `getPathForFile`, `webkitGetAsEntry`), inspects file vs directory via `ipcBridge.fs.getFileMetadata`, falls back to `FileService.processDroppedFiles` for path-less files. |
| `useWorkspaceModals.ts` | Plain state container for context-menu, rename, delete, and paste-confirm modals with open/close helpers. |
| `useWorkspaceSearch.ts` | Search box state with debounced `onSearch` (via `useDebounce`), focus-on-open behavior, and WebUI host-file-selector toggle. |
| `useFileChanges.ts` | Git-style change tracking via `ipcBridge.fileSnapshot` (init/dispose per workspace, compare, stage/unstage/discard/reset). Silent vs loading refresh. |
| `useWorkspaceCollapse.ts` | Persists global workspace-tree collapse boolean to `localStorage` (`STORAGE_KEYS.WORKSPACE_TREE_COLLAPSE`). |

## For AI Agents
- Renderer-only code: no Node.js APIs. All filesystem/shell/git work goes through `ipcBridge.*` or renderer service wrappers (`FileService`, `workspaceFs`, `download`); never import `fs`/`path` here.
- Hooks are intentionally non-self-contained — most take state setters and refs from `useWorkspaceTree`/`useWorkspaceModals` as params. When adding a hook, follow this dependency-injection pattern rather than duplicating state.
- Cross-component signaling uses the `emitter` with keys namespaced by `eventPrefix` (`'acp' | 'codex' | 'aionrs'`), e.g. `${eventPrefix}.selected.file`, `.selected.file.append`, `.selected.file.clear`, `.workspace.refresh`. Match this prefix scheme exactly.
- Refresh after mutations is deliberately delayed (200-300ms `setTimeout`) and event-driven refresh is throttled to 2s — avoid adding synchronous refreshes that fight these guards.
- User-facing strings use `t('conversation.workspace.*')` keys; keep i18n keys, don't hardcode. Code comments here are bilingual (English + Chinese) — match the existing style.
- Shared types come from `../types`; tree helpers from `../utils/treeHelpers`. Avoid redefining `IDirOrFile`, `ContextMenuState`, etc.

## Dependencies
### Internal
- `@/common` (`ipcBridge`), `@/common/adapter/ipcBridge`, `@/common/config` (`configService`, `storageKeys`), `@/common/types/*`
- `@/renderer/services/FileService`, `@/renderer/utils/emitter`, `@/renderer/utils/file/*`, `@/renderer/hooks/file/*`, `@/renderer/hooks/ui/useDebounce`, `@/renderer/utils/platform`, `@/renderer/utils/previewError`, `@/renderer/utils/workspace/workspaceEvents`
- `../types`, `../utils/treeHelpers`, Preview module (`../../Preview/*`)

### External
- `react`, `i18next` (`TFunction`), `@arco-design/web-react` (Input ref type)

<!-- MANUAL: notes below this line are preserved on regeneration -->
