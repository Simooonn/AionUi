<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# hooks

## Purpose
Root for all React hooks (and a few React context providers) used by the AionUi desktop renderer. It holds no direct files — every hook lives in a domain-scoped subdirectory so related stateful logic stays grouped by feature area (agents, chat, files, MCP, system, UI primitives, etc.).

## Subdirectories
| Directory | Purpose |
| --------- | ------- |
| agent | Hooks for agent/model discovery and selection: provider lists, ACP model info, agent modes, hub/preset agents, Google auth models, readiness checks (see `agent/AGENTS.md`) |
| assistant | Assistant config hooks — editor state, assistant list, detected agents (see `assistant/AGENTS.md`) |
| chat | Conversation send-box and message-stream hooks: auto-scroll, auto-title, slash commands, draft/file handling, typing animation, composition input (see `chat/AGENTS.md`) |
| config | App/user config access hook (`useConfig`) (see `config/AGENTS.md`) |
| context | React Context providers + their hooks (Auth, Conversation, ConversationHistory, Feedback, Layout, NavigationHistory, Theme) (see `context/AGENTS.md`) |
| file | File-handling hooks: upload/drag/paste, directory & workspace selection, Office/diff preview, conversation export, upload abort/state (see `file/AGENTS.md`) |
| mcp | MCP server hooks and helpers: connection, OAuth, server CRUD, modal, catalog, message queue (see `mcp/AGENTS.md`) |
| system | OS/runtime integration hooks: theme, deep links, protocol detection, PWA mode, notifications, speech input, ext i18n, settings tabs (see `system/AGENTS.md`) |
| ui | Generic UI primitive hooks: debounce, throttle, latest-ref, font scale/sizes, resizable split, text selection, indexed refs, shortcuts (see `ui/AGENTS.md`) |

## For AI Agents
- Renderer-only: NO Node.js APIs here. Reach the main process exclusively through the IPC bridge (`packages/desktop/src/preload`).
- This directory is a categorization layer — do not add hook files directly at this level; place new hooks in the matching domain subdirectory. Create a new subdirectory only if a hook fits none of the existing domains.
- Hook files use camelCase `useXxx.ts` (or `.tsx` when returning JSX). Context providers live under `context/` despite ending in `Context.tsx`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
