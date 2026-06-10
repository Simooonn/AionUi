<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# MobileActionSheet

## Purpose
A bottom-sheet UI primitive for the mobile/WebUI chat sendbox: a slide-up panel of tappable entries (model picker, permission, skills, attach, etc.), with optional one-level submenus that slide in from the right. Renders into `document.body` via a portal and locks body scroll while open.

## Key Files
| File | Description |
| --- | --- |
| `MobileActionSheet.tsx` | Default-exported component. Manages mount/visibility/submenu animation phases with rAF + `useLayoutEffect` to guarantee the slide-up/slide-in transitions paint correctly; renders main pane of `entries` and one sub-pane via `createPortal`. |
| `types.ts` | Type definitions: `MobileActionSheetOption`, `MobileActionSheetSubMenu` (with `onSelect`, `selectable`), `MobileActionSheetEntry` (icon/label/meta/`variant`/`submenu`/`onClick`/`dividerBefore`), `MobileActionSheetProps`. |
| `useAttachEntry.tsx` | Hook that builds the "Attach" entry/entries, branching on `isElectronDesktop()`: one row on desktop (host file picker), two flat rows on WebUI (host picker + browser `<input type=file>` upload). Returns `entries` plus a `hiddenFileInput` element to mount near the sendbox. |
| `MobileActionSheet.module.css` | Scoped styles driving the mask/sheet/pane transitions, item rows, radio indicators, chevron, and divider. |
| `index.ts` | Barrel re-exporting the default component, the four public types, and `useAttachEntry`. |

## For AI Agents
- Renderer-only code (no Node APIs). Uses DOM directly: `createPortal(..., document.body)` and `document.body.style.overflow` for scroll lock — keep cleanup in effect returns intact.
- The animation logic is deliberate: `visible` lags `mounted` by a paint, and submenu `subPhase` cycles `idle→enter→shown→exit` (see `TRANSITION_MS = 260`). Don't collapse these into a single state or the slide effect breaks under React 18 batching.
- Submenu close behavior depends on `selectable`: stateful selectors (`selectable !== false`) slide back to the main pane; action menus (`selectable === false`) call `onClose()` to dismiss the whole sheet. Preserve this in `handleSubSelect`.
- All user-facing strings use `react-i18next` `t()` with `defaultValue`; do not hardcode. Items expose `data-testid` hooks (`mobile-action-sheet-*`) — keep them for tests.
- Use Arco components and `@icon-park/react` icons; no raw interactive HTML except the intentional hidden `<input type=file>` in `useAttachEntry` and the submenu back `<button>`.

## Dependencies
### Internal
- `@/renderer/hooks/context/ConversationContext` (`useConversationContextSafe`)
- `@/renderer/services/FileService` (`FileService`, `FileMetadata`)
- `@/renderer/utils/platform` (`isElectronDesktop`)

### External
- `react`, `react-dom` (`createPortal`)
- `react-i18next`
- `@arco-design/web-react` (`Message`)
- `@icon-park/react` (`Left`, `Right`, `FolderOpen`, `FolderUpload`, `Paperclip`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
