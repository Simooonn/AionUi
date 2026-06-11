<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# gemini

## Purpose

Renderer-side model-selection UI for the Gemini/Google platform conversation. Provides a reusable dropdown component and a hook that centralizes the model list, current-model state, and selection logic so the same picker can be shared by the chat header, send box, and channel settings.

## Key Files

| File                         | Description                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GoogleModelSelector.tsx`    | Default-exported `GoogleModelSelector` component. Renders an Arco `Dropdown`/`Menu` of providers and their models grouped by `Menu.ItemGroup`; `variant` (`'header'` \| `'settings'`) and preview/mobile layout decide compact styling. When `disabled` or no `selection` is given, falls back to a tooltip-wrapped non-interactive `Button`.                                      |
| `useGoogleModelSelection.ts` | `useGoogleModelSelection` hook and the `GoogleModelSelection` / `UseGoogleModelSelectionOptions` types. Tracks `current_model` state synced to `initialModel`, pulls providers/models from `useModelProviderList`, and exposes `handleSelectModel` (awaits the caller's `onSelectModel`, commits state only on success) plus `getDisplayModelName` (truncates labels to 20 chars). |

## For AI Agents

- Renderer-only code: no Node.js APIs. UI must stay on `@arco-design/web-react` (`Button`, `Dropdown`, `Menu`, `Tooltip`) and `@icon-park/react` icons (`Brain`, `Down`) — no raw HTML controls.
- The component is presentational and driven entirely by the `GoogleModelSelection` object from the hook; keep that contract in sync when changing either file. `handleSelectModel` returns `void` to the menu (`onClick={() => void handleSelectModel(...)}`) while the hook's option `onSelectModel` returns `Promise<boolean>` gating the state update.
- All user-facing strings go through `useTranslation()` / `t(...)`; do not hardcode labels. Label resolution defers to `getModelDisplayLabel` and `formatModelLabel` rather than raw model names.
- Note the snake_case fields (`current_model`, `use_model`) come from the shared storage types (`TProviderWithModel`) — preserve that casing.

## Dependencies

### Internal

- `@/common/config/storage` (`IProvider`, `TProviderWithModel`)
- `@/renderer/hooks/agent/useModelProviderList`
- `@/renderer/pages/conversation/Preview` (`usePreviewContext`)
- `@/renderer/hooks/context/LayoutContext`
- `@/renderer/utils/model/agentLogo` (`getModelDisplayLabel`)
- `@/renderer/styles/colors` (`iconColors`)

### External

- `@arco-design/web-react`, `@icon-park/react`, `react`, `react-i18next`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
