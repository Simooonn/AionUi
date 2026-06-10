<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose
Renderer-side React component library for the desktop app. The direct files are small cross-cutting helpers; the bulk of UI lives in feature-organized subdirectories (chat, agent, settings, layout, etc.).

## Key Files
| File | Description |
| --- | --- |
| `IconParkHOC.tsx` | HOC wrapping any `@icon-park/react` icon with an `IconProvider` (normal size from `@office-ai/platform` theme), default `strokeWidth=3`, `fill=iconColors.secondary`, and a `cursor-pointer` class. Returns `React.FC<T & { className, strokeWidth, fill }>`. |
| `ShimmerText.tsx` | Animated text span with a gradient "shimmer-scan" sweep using `var(--text-secondary/--primary)`. Injects keyframes into `document.head` once (guarded by `data-shimmer-keyframes`); supports `duration` and `pauseOnHover`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `Markdown` | Markdown rendering components (see `Markdown/AGENTS.md`) |
| `agent` | Agent-related UI (see `agent/AGENTS.md`) |
| `base` | Shared low-level/base components (see `base/AGENTS.md`) |
| `chat` | Chat conversation UI (see `chat/AGENTS.md`) |
| `layout` | App layout/shell components (see `layout/AGENTS.md`) |
| `media` | Media display/playback components (see `media/AGENTS.md`) |
| `settings` | Settings panels and forms (see `settings/AGENTS.md`) |
| `workspace` | Workspace view components (see `workspace/AGENTS.md`) |

## For AI Agents
- Renderer process: NO Node.js APIs. DOM APIs are fine (`ShimmerText` writes to `document.head`).
- `ShimmerText` keeps its keyframes/styles inline by design to avoid global CSS additions — keep that pattern if extending it rather than moving rules into global stylesheets.
- Icon colors come from `@/renderer/styles/colors` (`iconColors`) and sizing from the platform `theme` — do not hardcode icon colors/sizes; reuse `IconParkHOC` so all icons stay consistent.
- Both files default-export; import accordingly.

## Dependencies
### Internal
- `@/renderer/styles/colors` (`iconColors`)
### External
- `react`, `@icon-park/react`, `@office-ai/platform` (theme), `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
