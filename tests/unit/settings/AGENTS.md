<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# settings

## Purpose

Unit tests for the renderer Settings area: assistant/appearance/tools utility functions, settings-page routing, the System settings modal DOM behavior, and managed-Node i18n copy. Targets `packages/desktop/src/renderer/pages/settings/` and `packages/desktop/src/renderer/components/settings/`.

## Key Files

| File                              | Description                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assistantUtils.test.ts`          | Pure helpers from `AssistantSettings/assistantUtils`: `isEmoji`, `resolveAvatarImageSrc`, `sortAssistants`, `filterAssistants` (search + status/source + i18n locale), `groupAssistantsByEnabled`. |
| `backgroundUtils.test.ts`         | `AppearanceSettings/backgroundUtils.injectBackgroundCssBlock` — injecting/replacing/removing the marked background CSS block around existing CSS.                                                  |
| `mcpJsonImport.test.ts`           | `ToolsSettings/mcpJsonImport.parseMcpJsonImport` — parsing `mcpServers`/array configs, stdio arg normalization, `streamable_http`→`http` mapping, and validation error keys.                       |
| `managedNodeRuntimeI18n.test.ts`  | Reads `settings.json`/`conversation.json` locale files (en-US, zh-CN) to assert managed-Node-runtime error/warmup copy does not wrongly tell users to install Node.js.                             |
| `SystemModalContent.dom.test.tsx` | DOM test of `SettingsModal/contents/SystemModalContent`: directory picker, persisting log/work dirs via `updateSystemInfo`, restart flow, failure messages, manual-restart hint, tooltips.         |
| `SystemSettings.dom.test.tsx`     | DOM test of `pages/settings/SystemSettings`: route-based rendering of System vs About modal content and `contentClassName` for the about page.                                                     |

## For AI Agents

- Two test styles: pure-function specs (`.test.ts`) and `@testing-library/react` DOM specs (`.dom.test.tsx`).
- DOM tests mock heavily via `vi.mock` / `vi.hoisted`: `react-i18next` (t returns the key), `@/renderer/utils/platform`, `@/common` ipcBridge, `@/common/config/configService`, and partial `@arco-design/web-react` (`Message.info`, `Modal.useModal`). `SystemModalContent` wraps render in `SWRConfig` + `ConfigProvider` and stubs `window.matchMedia`.
- i18n test reads locale JSON directly from `packages/desktop/src/renderer/services/i18n/locales/<lang>/` via `readFileSync` + `import.meta.url`; assertions check substring presence/absence.
- Run a single file: `bun run test tests/unit/settings/<file>`.

## Dependencies

### Internal

Source under test: `@/renderer/pages/settings/*`, `@/renderer/components/settings/*`, and `services/i18n/locales` JSON.

### External

`vitest`, `@testing-library/react`, `@testing-library/user-event`, `@arco-design/web-react`, `swr`, `node:fs`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
