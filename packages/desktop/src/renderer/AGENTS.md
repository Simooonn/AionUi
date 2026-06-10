<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# renderer

## Purpose
The Electron renderer process (and PWA/web build) for AionUi: React UI mounted at `#root`. This is the front-end half of the app and must never call Node.js APIs directly — all main-process access goes through `ipcBridge`. It bootstraps Sentry, i18n, config, theme, and the Arco Design provider before rendering the router.

## Key Files
| File | Description |
| --- | --- |
| `main.tsx` | App entry point: conditionally inits `@sentry/electron/renderer` (web fallback via browser SDK), kicks off `configService.initialize()` early, wires `AppProviders` (Auth/Theme/Preview/Feedback), Arco `ConfigProvider` with per-language locales (incl. patched `ko-KR`), prefetches `/api/agents` into SWR, mounts `RuntimeFailureDialogs` + `BackendStartupFailureDialog`, and `createRoot`-renders `<App>` (or a startup-failure dialog when `window.__backendStartupFailure` is set). |
| `index.html` | HTML shell with PWA manifest/icons; inline scripts synchronously restore `__aionui_theme` from `localStorage` onto `data-theme` / `arco-theme` to prevent theme flash before React mounts. |
| `types.d.ts` | Ambient module declarations for `*.svg`, `*.png`, `*.module.css`, `*?raw`, and `unocss`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `api` | Renderer-side API/data fetching helpers (see `api/AGENTS.md`) |
| `components` | Shared React components incl. `layout/` (Layout, Router, Sider, InstallationIntegrityDialog) (see `components/AGENTS.md`) |
| `hooks` | React hooks and context providers (Auth, Theme, Preview, Feedback, ConversationHistory) (see `hooks/AGENTS.md`) |
| `pages` | Route-level page components (conversation, cron, settings, etc.) (see `pages/AGENTS.md`) |
| `pet` | Desktop "pet" feature UI (see `pet/AGENTS.md`) |
| `services` | Renderer runtime services: i18n setup, PWA registration (see `services/AGENTS.md`) |
| `styles` | Global CSS: `arco-override.css`, `themes/`, `markdown.css` (see `styles/AGENTS.md`) |
| `theme` | Theme definitions; holds `builtinThemes.ts` (see `theme/AGENTS.md`) |
| `utils` | Renderer utilities incl. `ui/runtimePatches`, `ui/HOC`, `model/agentTypes` (see `utils/AGENTS.md`) |
| `assets` | Static assets: `logo.svg`, `channel-logos/`, `icons/`, `logos/`, `themes/` (no AGENTS.md) |

## For AI Agents
- Renderer constraint: NO Node.js APIs. Reach the main process only via `ipcBridge` (`@/common`); event subscriptions like `ipcBridge.runtime.statusChanged.on(...)` return an unsubscribe fn — return it from `useEffect`.
- Import order in `main.tsx` is load-bearing: Sentry first, then `./utils/ui/runtimePatches`, then `@/common/adapter/browser`, then `configService.initialize()` before i18n/theme. Preserve this ordering when editing bootstrap.
- Web vs Electron is detected via `window.electronAPI`; gate Electron-only code (e.g. `@sentry/electron`) behind that check and use dynamic `import()` to keep it out of the web bundle.
- All user-facing strings use i18n (`useTranslation`/`t(...)`); never hardcode. Colors use semantic tokens (`bg-bg-1`, `text-t-secondary`) via UnoCSS — no raw hex.
- Use path aliases `@/*`, `@renderer/*` for cross-directory imports.

## Dependencies
### Internal
`@/common` (ipcBridge, adapter/browser, configService, types), `@renderer/pages/cron`, and the local `hooks/`, `pages/`, `components/`, `services/`, `utils/` subtrees.
### External
`react`, `react-dom/client`, `@arco-design/web-react` (+ react-19-adapter, locales), `react-i18next` / `i18next`, `swr`, `@sentry/electron/renderer`, `uno.css`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
