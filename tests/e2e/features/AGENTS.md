<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# features

## Purpose
Playwright Electron end-to-end test suites, grouped by product feature (assistants, conversations, previews, settings, workspaces, etc.). Each `*.e2e.ts` drives the real launched app, asserting on `data-testid` selectors and capturing screenshots. Empty subdirectories are placeholders for not-yet-written feature coverage.

## Key Files
| File | Description |
| --- | --- |
| `.gitkeep` | Keeps the directory tracked in git; no behavior. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `assistants` | Assistant Settings page tests (core interactions, edge cases, UI states), prioritized P0/etc. |
| `assistants-user-data` | Assistant user-data persistence flow tests. |
| `builtin-skill-migration` | Migration of built-in skills coverage. |
| `conversations` | Conversation/message-list tests, with `acp`, `aionrs`, `other`, `remote` sub-suites. |
| `pet` | Placeholder (empty) for pet-feature tests. |
| `previews` | Preview panel + office document flows (auto-open, panel render, history UI), runs aioncore in `--local` mode. |
| `remote` | Remote `channels` and `webui` test suites. |
| `settings` | Settings sub-pages: `about`, `display`, `extension`, `llm_providers`, `skills`, `system`. |
| `teams` | Placeholder (empty) for teams tests. |
| `workspaces` | Workspace panel/file-ops tests; seed temp dirs, mock `dialog.showOpenDialog`, drive file tree. |

## For AI Agents
- This is test code (Node-side Playwright runner), not app source — it freely uses `fs`/`os`/`path` and Playwright APIs, and is exempt from the renderer/main DOM/Node split.
- Always import the shared harness from `../../fixtures` (`test`, `expect`) and `../../helpers` (e.g. `goToGuid`, `goToAssistantSettings`, `invokeBridge`, `takeScreenshot`); do not re-create fixtures locally.
- Target elements via `data-testid` (e.g. `[data-testid^="assistant-card-"]`); avoid text/CSS-only selectors.
- Use `test.describe.serial` to share one expensive conversation across cases (conversation creation can take ~30s); set generous `test.setTimeout` (90s–120s) accordingly.
- Gracefully `test.skip()` when an external dependency is absent (e.g. the `officecli` binary in `previews`) instead of failing.
- Mock native dialogs via `electronApp.evaluate(({ dialog }) => { dialog.showOpenDialog = ... })` rather than clicking OS pickers.

## Dependencies
### Internal
- `../../fixtures` (custom `test`/`expect`), `../../helpers` (navigation + bridge helpers).
### External
- `@playwright/test` (`Page`, `ElectronApplication`, `Locator`); Node `fs`, `os`, `path`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
