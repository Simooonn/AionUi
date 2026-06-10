<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# feedback

## Purpose
Vitest unit tests for AionUi's one-click bug-report ("feedback") feature: the `FeedbackButton` text-link, the `FeedbackProvider`/`useFeedback` modal owner, the `FeedbackReportModal` form, and every error surface that mounts a feedback button. Covers both the renderer DOM components and the main-process IPC handler that captures screenshots and collects logs.

## Key Files
| File | Description |
| --- | --- |
| `feedbackBridge.test.ts` | Node-env test of `@/process/bridge/feedbackBridge`. Mocks `electron`, captures the `ipcMain.handle` callbacks into a map, and asserts the `feedback:capture-screenshot` handler returns PNG bytes + a `screenshot-*.png` filename, or `null` on missing/destroyed window, empty buffer, or `capturePage` rejection. Also tests `collectFeedbackLogAttachment` (3 recent log days → `logs.gz`). |
| `feedbackMountPoints.test.ts` | DOM-free source-text assertion: reads renderer `.tsx` files and regex-checks each `<FeedbackButton module='...'>` wires the correct module tag, and that referenced tags exist in `feedbackModules.ts`. Catches typos/module drift during refactors. |
| `FeedbackButton.dom.test.tsx` | Renders `@/renderer/components/base/FeedbackButton`; asserts label `settings.oneClickFeedback`, that click calls `openFeedback({ module, autoScreenshot: true })`, stops propagation, and swallows `openFeedback` rejections. |
| `FeedbackContext.dom.test.tsx` | Tests `FeedbackProvider`/`useFeedback`; spies on the modal stub to verify module/tags/extra/screenshot prop wiring, `electronAPI.captureFeedbackScreenshot` flow, cancel clearing, and the no-op fallback outside a provider. |
| `FeedbackReportModal.dom.test.tsx` | Tests `FeedbackReportModal` prefill: `defaultModule` selection, seeding the Arco Upload list from `prefilledScreenshots` (capped at 3), and submitting `feedbackTags`/`feedbackExtra` to mocked `@sentry/electron/renderer` (`setTag` + `captureEvent`). |
| `MessageTipsFeedback.dom.test.tsx` | Largest suite: resolves real `conversation.json` i18n keys, verifies `MessageTips` shows the feedback button only on `error` tips with structured `agent_error` tags/extra, plus a locale-coverage block asserting every agent error/tip code has localized title/body across 9 locales. |
| `MessageToolGroupFeedback.dom.test.tsx` | `MessageToolGroup`: feedback button appears only on `status='Error'`, wired to `conversation-session`. |
| `MessageAgentStatusFeedback.dom.test.tsx` | `MessageAgentStatus`: button only on `error` status, wired to `conversation-session`. |
| `McpServerHeaderFeedback.dom.test.tsx` | `McpServerHeader`: button only when `last_test_status==='error'`, wired to `mcp-tools`. |
| `InlineAgentEditorFeedback.dom.test.tsx` | Asserts `InlineAgentEditor` does NOT render a feedback button before/after success/`fail_cli`/`fail_acp` test results. |
| `InlineAgentEditorManagedRuntime.dom.test.tsx` | `InlineAgentEditor` surfaces backend `error` detail text for `fail_cli`/`fail_acp` managed-runtime test responses. |

## For AI Agents
- Two test environments live side by side here. `*.dom.test.tsx` files exercise renderer components under jsdom; `feedbackBridge.test.ts` is a Node-env main-process test that mocks `electron` and `@/process/...`. Do not import Node APIs into the DOM tests or DOM into the bridge test.
- The i18n mock convention is `t: (k) => k` (identity), so DOM assertions match raw keys like `settings.oneClickFeedback`. `MessageTipsFeedback` is the exception — it loads the real `conversation.json` and asserts translated copy, so update that locale file (and the `requiredAgentErrorCodes`/`requiredAgentTipCodes` lists) together when adding error codes.
- Mount-point tests are intentionally coupled to module tags: changing a `<FeedbackButton module=...>` tag in renderer source requires updating both `feedbackMountPoints.test.ts` regexes and the per-component DOM tests.
- `FeedbackContext` and `FeedbackReportModal` tests stub out the screenshot path via a `window.electronAPI.captureFeedbackScreenshot` shim and the `@sentry/electron/renderer` module (via `vi.hoisted`); reset `window.electronAPI = undefined` in `beforeEach` to avoid cross-test leakage.
- Heavy renderer deps (CodeMirror, EmojiPicker, Markdown, CollapsibleContent, FileChangesPanel) are mocked per file to keep jsdom light — mirror existing `vi.mock` stubs when adding a new component test.

## Dependencies
### Internal
- `@/process/bridge/feedbackBridge`, `@/process/feedback/logs`
- `@/renderer/components/base/FeedbackButton`, `@/renderer/hooks/context/FeedbackContext`, `@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal`
- `@/renderer/pages/conversation/Messages/components/*` (MessageTips, MessageToolGroup, MessageAgentStatus), `@/renderer/pages/settings/*` (InlineAgentEditor, McpServerHeader)
- `@/common/chat/chatLib`, `@/common/config/storage` types; renderer `locales/*/conversation.json`

### External
- `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@arco-design/web-react` (`ConfigProvider`), `@sentry/electron/renderer` (mocked), `react-i18next` (mocked)

<!-- MANUAL: notes below this line are preserved on regeneration -->
