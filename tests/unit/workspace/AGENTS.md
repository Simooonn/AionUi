<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# workspace

## Purpose

Unit tests for the conversation Workspace file-tree UI helpers and components under `@/renderer/pages/conversation/Workspace`. Covers extension-to-icon mapping logic and the `FileTypeIcon` React component rendering, plus the fork's configurable "Open with" apps (`WorkspaceOpenButton` and the Settings → System section from `renderer/ace/settings/`).

## Key Files

| File                               | Description                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fileIcon.test.ts`                 | Tests `getFileIconName`, `getFolderIconName`, `getNodeIconExtension` from `Workspace/utils/fileIcon`: lowercase extension extraction, `relativePath` fallback when name is empty, known extension → vscode-icons name mapping, default-file fallback, and expanded/collapsed folder icons.                                                |
| `WorkspaceOpenButton.dom.test.tsx` | DOM test of `ChatLayout/WorkspaceOpenButton` with configured apps: name + real icon, launch via `window.electronAPI.openWithLaunch`, every fallback branch, click before the installed list loads, multi-instance sync, temp workspace / non-mac / WebUI unchanged. Re-imports the module-level store after `vi.resetModules()` per test. |
| `OpenWithSettings.dom.test.tsx`    | DOM test of `renderer/ace/settings/OpenWithSettings`: platform gating, per-category options, icons filled in after the list, JSON write / clear, missing-app placeholder, cross-window `storage` events.                                                                                                                                  |
| `FileTypeIcon.dom.test.tsx`        | DOM render test for the `FileTypeIcon` component from `Workspace/components/FileTypeIcon`: renders file icon (`file-type-icon-file` testid) for file nodes vs folder icon (`file-type-icon-folder` testid) for directory nodes.                                                                                                           |

## For AI Agents

- Pure logic helpers are tested in `fileIcon.test.ts` with plain `expect` assertions; no mocks or fixtures.
- Component tests use the `.dom.test.tsx` suffix and `@testing-library/react` (`render`, `screen`) with `getByTestId` / `queryByTestId`. The component exposes `data-testid` hooks (`file-type-icon-file`, `file-type-icon-folder`).
- Node shape under test: `{ name, relativePath, isFile? }`.
- Run all: `bun run test`; coverage: `bun run test:coverage`.

## Dependencies

### Internal

- `@/renderer/pages/conversation/Workspace/utils/fileIcon`
- `@/renderer/pages/conversation/Workspace/components/FileTypeIcon`

### External

- `vitest`, `@testing-library/react`, `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
