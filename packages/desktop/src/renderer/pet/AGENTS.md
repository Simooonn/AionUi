<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# pet

## Purpose

Renderer code and standalone HTML entry points for the desktop "pet" — a transparent, frameless, always-on-top floating mascot. Three separate BrowserWindow surfaces work together: the visual SVG pet, an invisible circular hit window that captures drag/click/right-click and manages mouse click-through, and a confirmation card window that surfaces tool-approval prompts beside the pet.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pet.html`              | Body window markup: a single `<object>` loading `../pet-states/idle.svg`; loads `petRenderer.ts`.                                                                                                                                                               |
| `petRenderer.ts`        | Cross-fades SVG state assets (`../pet-states/<state>.svg`) on `onStateChange`; on `onEyeMove` writes SVG `transform` attributes to `.idle-pupil`/`.idle-track` wrapper groups for eye/body tracking.                                                            |
| `pet-hit.html`          | Invisible circular `#hit` div (`cursor: grab`); loads `petHitRenderer.ts`.                                                                                                                                                                                      |
| `petHitRenderer.ts`     | Pointer state machine for drag (threshold 3px), single/multi-click (400ms window, left/right side), and context menu; layered click-through defense via `mousemove`/`mouseleave` + `setIgnoreMouseEvents`; `resetHitState()` re-arms geometry on window resize. |
| `pet-confirm.html`      | Themed (light/dark CSS vars) confirmation card with `#title`/`#description`/`#options`/`#drag-handle`; loads `petConfirmRenderer.ts`.                                                                                                                           |
| `petConfirmRenderer.ts` | Renders `IConfirmation` cards, maps keyboard shortcuts (Enter/Esc/A/Y/N) to option values, responds via `petConfirmAPI.respond`, and applies theme via `applyTheme`.                                                                                            |
| `pet.d.ts`              | Ambient `Window` augmentation declaring `petAPI`, `petHitAPI`, `petConfirmAPI` and their callback signatures.                                                                                                                                                   |

## For AI Agents

- Renderer process — no Node.js APIs. All cross-process access goes through the `window.petAPI` / `petHitAPI` / `petConfirmAPI` bridges declared in `pet.d.ts` (defined in the preload layer).
- These are plain DOM/TypeScript renderers, NOT React/Arco components — manipulate elements directly with `document.createElement`/`setAttribute`. Do not introduce Arco or UnoCSS here; styling lives inline in the three `.html` files.
- `petRenderer.ts` eye tracking depends on SVG assets exposing `.idle-pupil` and `.idle-track` groups; it uses `setAttribute('transform', …)` (not `style.transform`) so it stacks over CSS keyframes — keep that distinction.
- The hit window permanently captures the mouse if click-through is left off; never weaken the `mousemove`/`mouseleave` ignore logic without the `petManager.ts` watchdog still in place. `HIT_RADIUS_SQ` is derived from `innerWidth * 0.4` and must be recomputed on resize.
- Confirmation shortcut hints key off stable `option.value` strings (`cancel`/`deny`/`proceed_always`/`proceed_once`), not labels — preserve those values for locale stability.

## Dependencies

### Internal

- `@/renderer/utils/theme/applyTheme` (theme application in confirm renderer)
- `@/common/theme/types` (`Theme` type referenced in `pet.d.ts`)
- `../pet-states/*.svg` (sibling renderer asset directory for pet pose SVGs)

<!-- MANUAL: notes below this line are preserved on regeneration -->
