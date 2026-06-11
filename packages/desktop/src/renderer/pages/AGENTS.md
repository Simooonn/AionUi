<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# pages

## Purpose

Top-level route pages of the AionUi renderer. Each subdirectory is a feature area (chat conversation, cron scheduling, onboarding guide, login, settings, team) rendered as a full screen. The one direct file is a developer-only showcase for verifying custom Arco component styling.

## Key Files

| File               | Description                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TestShowcase.tsx` | Dev/demo page (`ComponentsShowcase`) rendering Arco `Message`, `Button`, `Collapse`, `Tag`, plus the wrapped `StepsWrapper` and `ModalWrapper` to visually verify the customizations in `arco-override.css` (light/dark themes). |

## Subdirectories

| Directory      | Purpose                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `conversation` | Chat conversation views and message rendering (see `conversation/AGENTS.md`) |
| `cron`         | Scheduled/cron task management UI (see `cron/AGENTS.md`)                     |
| `guid`         | First-run onboarding / guide flow (see `guid/AGENTS.md`)                     |
| `login`        | Authentication and login screens (see `login/AGENTS.md`)                     |
| `settings`     | Application settings pages (see `settings/AGENTS.md`)                        |
| `team`         | Team / multi-agent management UI (see `team/AGENTS.md`)                      |

## For AI Agents

- Renderer process only: NO Node.js APIs here. Reach the main process via the IPC bridge in `packages/desktop/src/preload`.
- Use `@arco-design/web-react` components and `@icon-park/react` icons; never raw interactive HTML. Prefer the project wrappers (`StepsWrapper`, `ModalWrapper` from `@/renderer/components/base/`) over raw Arco `Steps`/`Modal` so override styles apply consistently.
- Layout/styling uses UnoCSS utility classes (e.g. `text-t-secondary`, `space-y-8`). Use semantic color tokens, not hardcoded values.
- `TestShowcase.tsx` is a styling-verification page; its hardcoded Chinese strings are intentional demo text, not user-facing product copy, so they are exempt from the i18n key requirement. Real pages must use i18n keys.

## Dependencies

### Internal

- `@/renderer/components/base` (`StepsWrapper`, `ModalWrapper`)

### External

- `@arco-design/web-react` (Button, Message, Collapse, Tag), `@icon-park/react`, `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
