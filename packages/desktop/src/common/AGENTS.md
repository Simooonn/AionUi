<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# common

## Purpose

Code shared by both the Electron main process and the renderer: the IPC bridge contract, platform service abstractions, chat/message models, API types, config, theming, and cross-process utilities. Files here must stay process-agnostic except for explicitly-gated shims.

## Key Files

| File              | Description                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`        | Barrel re-exporting the IPC bridge: `export * as ipcBridge` and the named `conversation` from `./adapter/ipcBridge`.                                                                                                                                                                                                     |
| `electronSafe.ts` | `@internal` null-safe Electron shim. `loadElectron()` `require('electron')` only when `process.versions.electron` is set, exporting `electronApp`, `electronUtilityProcess`, `electronPowerSaveBlocker`, `electronBrowserWindow`, `electronNotification`, `electronMenu`, `electronNativeImage`, `electronTray` (each `T | null`). Restricted to `tray.ts`, `conversionService.ts`, and `ElectronPlatformServices.ts`; everything else must use `getPlatformServices()`from`@/common/platform`. |

## Subdirectories

| Directory  | Purpose                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `adapter`  | IPC bridge definitions and message adapters between processes (see `adapter/AGENTS.md`).                     |
| `api`      | Provider/API request and response types and clients (see `api/AGENTS.md`).                                   |
| `chat`     | Chat conversation and message data models (see `chat/AGENTS.md`).                                            |
| `config`   | Shared configuration definitions and i18n config (see `config/AGENTS.md`).                                   |
| `platform` | Platform service abstraction (`getPlatformServices`) and Electron implementation (see `platform/AGENTS.md`). |
| `theme`    | Theme tokens and theming utilities (see `theme/AGENTS.md`).                                                  |
| `types`    | Shared TypeScript type declarations (see `types/AGENTS.md`).                                                 |
| `update`   | App update domain types/helpers (see `update/AGENTS.md`).                                                    |
| `utils`    | Cross-process utility functions (see `utils/AGENTS.md`).                                                     |

## For AI Agents

- This directory is imported by BOTH main and renderer, so direct files must NOT use Node.js-only or DOM-only APIs unconditionally. The only sanctioned exception is `electronSafe.ts`, which gates `require('electron')` behind a runtime check.
- Do NOT import `electronSafe.ts` from new locations — the allowed import sites are listed in its header doc. Use `getPlatformServices()` from `@/common/platform` instead.
- `import type { ... } from 'electron'` is fine anywhere (erased at compile time); only value imports of `electron` are restricted.
- Prefer extending `index.ts` re-exports only for genuinely shared, stable APIs (currently just the IPC bridge).

## Dependencies

### Internal

- `./adapter/ipcBridge` (re-exported by `index.ts`)
- Referenced consumers: `@/common/platform`, `src/process/utils/tray.ts`, `src/process/services/conversionService.ts`

### External

- `electron` (type-only plus gated runtime `require` in `electronSafe.ts`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
