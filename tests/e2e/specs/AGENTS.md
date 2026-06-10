<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# specs

## Purpose
Playwright end-to-end test specs (`*.e2e.ts`) that drive the real packaged/dev Electron app: launch the window, navigate routes, click real UI, and assert behavior. Each file targets one feature area (app launch, navigation, ACP agents, extensions, teams, conversations, settings, WebUI, cron, feedback). Tests import shared fixtures from `../fixtures` and selectors/actions from `../helpers`.

## Key Files
| File | Description |
| --- | --- |
| `app-launch.e2e.ts` | Smoke tests: window opens, renderer loads, no critical console errors (`createErrorCollector`). |
| `navigation.e2e.ts` | Route transitions: guid/chat page, all settings sub-tabs (`SettingsTab`), sidebar nav. |
| `acp-agent.e2e.ts`, `acp-conversation.e2e.ts`, `ext-acp.e2e.ts` | ACP agent settings UI, pill bar (`AGENT_PILL`), backend switching, MCP tools page. |
| `gemini-acp-conversation.e2e.ts`, `conversation-full-cycle.e2e.ts` | Full send→AI-reply cycles (Gemini/Claude/Codex); needs real API keys + installed CLIs. ~60KB, the largest spec. |
| `assistant-settings-crud.e2e.ts`, `-permissions.e2e.ts`, `-skills.e2e.ts` | Assistant/preset CRUD, permission config, skills loading. |
| `agent-settings-detection.e2e.ts`, `hub-backend-install.e2e.ts` | Detected-agents list; Hub "Install from Market" modal install flow. |
| `ext-*.e2e.ts` | Extension system: discovery, lifecycle, capabilities, channels, MCP, permissions, skills, themes, WebUI contrib, settings tabs, no-extensions baseline, IPC queries. |
| `extension-contributed.e2e.ts`, `ext-webui-contrib.e2e.ts` | Extension-contributed UI surfaces. |
| `team-*.e2e.ts` | Aion Team specs: create+preset leader, describe-assistant, empty-state greeting. Parameterized over `TEAM_SUPPORTED_BACKENDS` (claude/codex/gemini). |
| `cron-crud.e2e.ts` | Scheduled-task lifecycle via real AI conversation ([CRON_LIST]/[CRON_CREATE]/[CRON_UPDATE]). |
| `feedback-one-click.e2e.ts`, `feedback-scenarios.e2e.ts` | One-click feedback infra, `feedback:capture-screenshot` IPC, report modal. |
| `channels.e2e.ts`, `webui.e2e.ts` | Channel enable/disable toggles; WebUI service start/stop (port 25808, allow-remote). |
| `guid-agent-selection.e2e.ts`, `guid-mode-to-conversation.e2e.ts` | Guid-page agent/preset selection, mode→conversation handoff. |
| `README.md` | Team E2E spec contract (Chinese): the leader-driven Aion Team model, `invokeBridge` rules, file-structure rules, run commands, red lines. **Read before touching `team-*` specs.** |

## For AI Agents
- These run against the renderer through Playwright; `electronApp.evaluate(...)` reaches the main process (e.g. `BrowserWindow.getAllWindows()`, `process.env`). Do not import Node or main-process modules into spec bodies — only via the `electronApp` fixture.
- All specs import `{ test, expect } from '../fixtures'` (not raw `@playwright/test`) and pull helpers/selectors (`AGENT_PILL`, `ARCO_SWITCH`, `goToGuid`, `goToSettings`, `invokeBridge`, `navigateTo`) from `../helpers`. Reuse existing helpers/selectors instead of hardcoding CSS.
- **Team specs (README red lines):** `invokeBridge` is for setup/assertion only (`team.list`, `team.get`, `team.create`, `team.remove`) — NEVER to trigger add/fire/send. User operations go through the leader chat `textarea`. Parameterize leader type with `for...of TEAM_SUPPORTED_BACKENDS`; never create one file per agent type. Never reference `codebuddy`.
- AI-dependent specs (`conversation-full-cycle`, `cron-crud`, team lifecycle) need real API keys + installed CLIs; use generous timeouts (60–180s) and timestamped names to avoid stale-data collisions. Many `test.skip(...)` guard missing backends — keep these graceful skips.
- Body-text assertions use `expectBodyContainsAny([...])` with both English and Chinese strings to stay i18n-agnostic. Screenshot tests gate on `process.env.E2E_SCREENSHOTS`. Run via `E2E_PACKAGED=1` (packaged) scripts described in `README.md`.

## Dependencies
### Internal
`../fixtures`, `../helpers` (selectors + page actions), and `@/common/types/...` (e.g. `agentModes`, `teamTypes` via `TEAM_SUPPORTED_BACKENDS`).
### External
`@playwright/test` (re-exported through `../fixtures`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
