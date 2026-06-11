<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# config

## Purpose

Shared configuration layer used by both the main process and the renderer: the canonical TypeScript schema for persisted app settings (`storage.ts`, `configKeys.ts`), a client-settings access service backed by the backend HTTP API (`configService.ts`), one-shot migration routines, and cross-cutting constants for i18n, font sizes, file/MIME handling, and image-generation MCP env wiring.

## Key Files

| File                       | Description                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage.ts`               | Central type hub. Builds `ConfigStorage` (`agent.config`) and `EnvStorage` (`agent.env`) via `@office-ai/platform`; defines `IConfigStorageRefer`, `IEnvStorageRefer`, and the app's core domain types: `TChatConversation`, `IProvider`/`TProviderWithModel`, `IMcpServer`/transport types, `ICssTheme`, plus `BUILTIN_IMAGE_GEN_*` constants. |
| `configKeys.ts`            | `ConfigKeyMap` — the typed map of every client-settings key (acp/codex config, theme, UI font sizes, assistant integrations, pet, migration flags) and the `ConfigKey` union.                                                                                                                                                                   |
| `configService.ts`         | `configService` singleton: in-memory cache + subscriber model over the backend `/api/settings/client` HTTP endpoint. `initialize`/`whenReady`, typed `get`/`set`/`setLocal`/`remove`/`setBatch`/`subscribe`. Runs a one-time theme migration on init.                                                                                           |
| `configMigration.ts`       | One-shot migrations: `migrateConfigStorage`, `migrateLegacyMcpConfigToDb`, `migrateProviders`. Lists `ALL_LEGACY_KEYS` moved from the local config file to the backend.                                                                                                                                                                         |
| `constants.ts`             | App-wide constants: `AIONUI_TIMESTAMP_*` markers, image extension / MIME maps, `WEBUI_DEFAULT_PORT` (env-derived), `TEAM_MODE_ENABLED`, `GOOGLE_AUTH_PROVIDER_ID`.                                                                                                                                                                              |
| `fontSizes.ts`             | Per-region font-size specs (`chat`/`markdown`/`code`) with CSS var names, `clampFontSize`, `defaultFontSizes`, and `fontSizeConfigKey` helper.                                                                                                                                                                                                  |
| `appEnv.ts`                | `getEnvAwareName` — appends `-dev` / `-dev-2` suffixes to dir/symlink names off `isPackaged()` + `AIONUI_MULTI_INSTANCE`.                                                                                                                                                                                                                       |
| `i18n.ts`                  | Shared i18n utilities: `normalizeLanguageCode`, `mergeWithFallback`, `ensureAndSwitch`; re-exports `SUPPORTED_LANGUAGES`/`DEFAULT_LANGUAGE` from the JSON.                                                                                                                                                                                      |
| `i18n-config.json`         | Source of truth for `referenceLanguage`, supported languages, and the i18n module list.                                                                                                                                                                                                                                                         |
| `imageGenerationMcpEnv.ts` | Resolves an image-generation provider/model selection into MCP env vars (`AIONUI_IMG_*`); `resolveImageGenerationMcpEnv`, `removeImageGenerationEnvKeys`.                                                                                                                                                                                       |
| `storageKeys.ts`           | `STORAGE_KEYS` — centralized renderer `localStorage` key names (workspace/sidebar collapse, theme, language).                                                                                                                                                                                                                                   |

## For AI Agents

- This directory is **shared** (`common`): no DOM APIs and no Node-only APIs in files imported by both processes. `fontSizes.ts` explicitly notes "no DOM"; keep it that way.
- `storage.ts` and `configKeys.ts` are the schema source of truth — adding a setting means updating both the `ConfigKeyMap` (configKeys) and `IConfigStorageRefer` (storage), and often `ALL_LEGACY_KEYS` in `configMigration.ts`.
- `configService` talks to the backend over HTTP (`fetch`), not the IPC bridge; it works in WebUI browser mode (same-origin) and desktop mode (`window.__backendPort`). Settings deletes are sent as `null`.
- Migration flags (`migration.*_v1`) are intentionally kept in the local config file, not the backend bag, so a downgrade re-reads legacy data — do not "clean these up".
- `WEBUI_DEFAULT_PORT` and `getEnvAwareName` branch on `process.env` (`NODE_ENV`, `AIONUI_MULTI_INSTANCE`); preserve the prod/dev/multi-instance split when editing.
- Comments are English by convention (some existing Chinese annotations remain); user-facing strings belong in locales, never here.

## Dependencies

### Internal

`@/common` (ipcBridge), `@/common/platform`, `@/common/adapter/httpBridge`, `@/common/theme/*`, `@/common/types/provider/*`, `@/common/types/platform/acpTypes`.

### External

`@office-ai/platform` (storage builders); browser `fetch` in `configService`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
