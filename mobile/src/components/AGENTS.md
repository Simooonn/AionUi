<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose
React Native UI components for the AionUi mobile app, grouped by feature area. Holds the chat experience, conversation list/management, workspace file viewing, and shared themed primitives that the mobile screens compose together.

## Subdirectories
| Directory | Purpose |
| --- | --- |
| chat | Chat screen and its building blocks: input bar, message bubbles, markdown rendering, tool-call blocks, sidebar, and picker bottom sheets for models/modes/workspaces/files (see `chat/AGENTS.md`) |
| conversation | Conversation list, list items, and the new-conversation modal (see `conversation/AGENTS.md`) |
| files | Workspace file browsing: files sidebar, file content viewer, and mobile file tab header (see `files/AGENTS.md`) |
| ui | Shared themed primitives (`ThemedText`, `ThemedView`) and the `ConnectionBanner` (see `ui/AGENTS.md`) |

## For AI Agents
- This is a React Native app — use RN primitives (`View`, `Text`, etc.) and RN-compatible libraries, NOT the desktop renderer's `@arco-design/web-react`, DOM elements, or web-only CSS. The desktop process/renderer split does not apply here.
- This directory has no direct files; place new components inside the matching feature subdirectory. If you introduce a new feature area, create a new subdirectory rather than dropping loose files here, and respect the 10-children-per-directory limit.
- Prefer the themed primitives in `ui/` (`ThemedText`/`ThemedView`) over raw RN `Text`/`View` so components honor light/dark theming.
- User-facing strings must use i18n keys (see `mobile/src/i18n`), not hardcoded text.

## Dependencies
### Internal
- `mobile/src/i18n`, `mobile/src/context`, `mobile/src/hooks`, `mobile/src/services`, `mobile/src/constants`, `mobile/src/utils` (consumed by the feature subdirectories)

<!-- MANUAL: notes below this line are preserved on regeneration -->
