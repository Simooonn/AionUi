<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# base

## Purpose

Renderer-side base component library wrapping Arco Design primitives (Modal, Collapse, Select, Steps) with AionUi's unified theming, plus a few standalone widgets (file-changes panel, feedback chip). These `Aion*` components are the canonical building blocks re-exported from `index.ts` and consumed across the renderer UI.

## Key Files

| File                   | Description                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`             | Barrel exporting `AionModal`, `AionCollapse`, `AionSelect`, `AionScrollArea`, `AionSteps` and their public types (`ModalSize`, `MODAL_SIZES`, etc.). Does not export `FeedbackButton`, `FileChangesPanel`, `ModalWrapper`, `StepsWrapper`. |
| `AionModal.tsx`        | Arco `Modal` wrapper with preset sizes (`MODAL_SIZES`: small→full), configurable header/footer render, custom close icon; uses `useThemeContext` and i18n.                                                                                 |
| `AionCollapse.tsx`     | Custom controlled/uncontrolled collapsible panel (accordion mode, expand-icon position, bordered). Not a thin Arco wrapper — own state logic via `normalizeKeys`.                                                                          |
| `AionSelect.tsx`       | Arco `Select` wrapper adding a `middle` (32px) size; forces popup to `document.body` (`defaultGetPopupContainer`) to avoid ResizeObserver loops. Theme colors live in `.aion-select` in arco-override.css.                                 |
| `AionScrollArea.tsx`   | `div` with unified scrollbar; `direction` (`y`/`x`/`both`) maps to overflow utility classes, `disableOverflow` for embeds. Marks `data-scroll-area`.                                                                                       |
| `AionSteps.tsx`        | Arco `Steps` wrapper applying `.aionui-steps` class; re-exposes `.Step` subcomponent.                                                                                                                                                      |
| `FileChangesPanel.tsx` | Expandable list of generated/modified files (insertions/deletions, preview + diff click callbacks); uses `diffColors`/`iconColors` tokens and i18n.                                                                                        |
| `FeedbackButton.tsx`   | Inline feedback pill; calls `useFeedback().openFeedback` with auto-screenshot, Sentry tags/extra and a preselected module.                                                                                                                 |
| `ModalWrapper.tsx`     | Legacy lightweight Modal wrapper (`aionui-modal` class, custom close button). Predates `AionModal`; not re-exported.                                                                                                                       |
| `StepsWrapper.tsx`     | Legacy thin `Steps` wrapper (`aionui-steps`). Predates `AionSteps`; not re-exported.                                                                                                                                                       |

## For AI Agents

- Renderer-only code: no Node.js APIs; cross-process work goes through the IPC bridge.
- Prefer the `Aion*` components and import via `index.ts`. `ModalWrapper`/`StepsWrapper` appear to be legacy duplicates of `AionModal`/`AionSteps` — do not extend them; reach for the `Aion*` equivalents.
- Theme-dependent colors are NOT inline here — they live in `arco-override.css` under classes like `.aion-select`, `.aionui-steps`, `.aionui-modal`. Style structure uses Arco-targeting UnoCSS arbitrary variants (`[&_.arco-select-view]:...`) and semantic tokens (`border-2`, `fill-2`, `var(--color-primary)`), never hardcoded colors.
- `FeedbackButton` uses a raw `<button>` (against the usual Arco-only rule) for the pill; match its existing styling if editing rather than swapping libraries.
- All user-facing strings use `useTranslation()` i18n keys (e.g. `settings.oneClickFeedback`).

## Dependencies

### Internal

- `@/renderer/hooks/context/ThemeContext` (AionModal), `@/renderer/hooks/context/FeedbackContext` (FeedbackButton), `@/renderer/styles/colors` (FileChangesPanel).

### External

- `@arco-design/web-react` (Modal, Select, Steps, Button), `@icon-park/react` (Close, Comment, Down, PreviewOpen), `classnames`, `react-i18next`, `react`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
