<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# extension

## Purpose

Vitest unit/integration tests for the renderer extension settings feature (referenced as N4a items E1/E2/E3). They smoke-test the two settings UI components and verify the extension HTTP bridge call surface with mocks — no deep rendering or real IPC.

## Key Files

| File                                       | Description                                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExtensionSettingsPage.dom.test.tsx`       | Smoke test for `@/renderer/pages/settings/ExtensionSettingsPage`: asserts it is a function component, has a name/displayName, and instantiates as a JSX element. Mocks `react-i18next`. |
| `ExtensionSettingsTabContent.dom.test.tsx` | Same shallow checks for `@/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent`. Mocks `react-i18next`.                                                     |
| `extensionMapperIntegration.test.ts`       | Mocks `@/common/adapter/httpBridge` (`httpGet`/`httpPost`) and verifies the `/api/extension/list` and `/api/extension/install` route call shape returns invokable promises.             |

## For AI Agents

- These are renderer-side tests: the two `.dom.test.tsx` files run under jsdom and import React, so keep them DOM-safe (no Node.js APIs in the components under test).
- Both component tests mock `react-i18next` with a passthrough `t: (k) => k` and `i18n.language: 'en'`; replicate this pattern when adding component smoke tests so missing translations never break them.
- Tests are deliberately shallow (import + structure only); `extensionMapperIntegration` mocks the entire `httpBridge` module, so it asserts call wiring, not real backend behavior. If you make these deeper, mock the IPC bridge rather than calling it.
- The `import React from 'react'` line sits above the license header in the `.dom.test.tsx` files — preserve JSX support when editing.

## Dependencies

### Internal

`@/renderer/pages/settings/ExtensionSettingsPage`, `@/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent`, `@/common/adapter/httpBridge`

### External

`vitest`, `react`, `react-i18next` (mocked)

<!-- MANUAL: notes below this line are preserved on regeneration -->
