<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# src

## Purpose
Non-route source for the AionUi Expo / React Native mobile app. The expo-router screens live in `mobile/app/`; everything reusable — React contexts, components, hooks, API/WebSocket services, i18n, and helpers — lives here, organized by responsibility.

## Subdirectories
| Directory | Purpose |
| --- | --- |
| components | Shared RN UI components, split into `chat`, `conversation`, `files`, and generic `ui` groups (see `components/AGENTS.md`) |
| constants | App constants: `agentModes.ts`, `theme.ts` (see `constants/AGENTS.md`) |
| context | React Context providers — chat, connection, conversation, files tab, WebSocket, workspace state (see `context/AGENTS.md`) |
| hooks | Custom hooks: `useProcessedMessages`, `useThemeColor` (see `hooks/AGENTS.md`) |
| i18n | i18n setup (`index.ts`) plus `locales` translation data (see `i18n/AGENTS.md`) |
| services | Backend integration: `api.ts`, `bridge.ts`, `websocket.ts`, `pendingInitialMessages.ts` (see `services/AGENTS.md`) |
| utils | Pure helpers: message adapter, timeline, grouping, JWT, UUID, workspace (see `utils/AGENTS.md`) |

## For AI Agents
- This is a React Native (Expo) target, NOT the desktop renderer or main process. Use RN/Expo APIs and components — no DOM and no `@arco-design/web-react` here.
- Routing is handled by expo-router under `mobile/app/`; `src/` should stay route-agnostic and importable from those screens.
- State flows through the `context/` providers; UI in `components/` consumes them rather than holding cross-screen state.
- Backend access is centralized in `services/` (REST via `api.ts`, realtime via `websocket.ts`/`WebSocketContext`); do not scatter fetch/socket logic into components.
- All user-facing strings go through `i18n/`; do not hardcode copy.

## Dependencies
### Internal
- Cross-imports among these siblings: `components` uses `context`, `hooks`, `utils`, `constants`, `i18n`; `context` wraps `services`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
