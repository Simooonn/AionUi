<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# common-config

## Purpose

Vitest unit tests for the shared config layer under `@/common/config`. Covers legacy-to-backend config/provider migration, font-size clamping helpers, and the `ConfigStorage`/`EnvStorage` storage namespaces. Each file corresponds to a numbered item in the "N3 test checklist" (T4/T5).

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configMigration.test.ts` | Tests `migrateConfigStorage` and `migrateProviders`. Asserts merge-strategy PUTs to `/api/settings/client`, legacy-field field mapping (camelCase → snake_case, e.g. `baseUrl`→`base_url`, `bedrockConfig`→`bedrock_config`), the one-shot `migration.providersMigrated_v1` flag, and ELECTRON-1KT regression (don't re-import user-deleted providers). |
| `fontSizes.test.ts`       | Tests `FONT_SIZE_KEYS` (`chat`/`markdown`/`code`), `defaultFontSizes()`, and `clampFontSize` (min/max clamp, integer rounding, NaN fallback to default, Infinity → max).                                                                                                                                                                                |
| `storage.test.ts`         | Tests `BUILTIN_IMAGE_GEN_ID` constant, and that `ConfigStorage` (namespace `agent.config`) / `EnvStorage` (namespace `agent.env`) are isolated instances with `get`/`set`/`remove`.                                                                                                                                                                     |

## For AI Agents

- These tests target `@/common` code (shared by both processes), so they avoid DOM and Node-specific APIs.
- Mocks are registered with `vi.mock(...)` BEFORE importing the module under test — keep that ordering when adding cases (`@/common/adapter/httpBridge`, `@/common`, `@office-ai/platform`).
- `storage.test.ts` and `configMigration.test.ts` use in-memory `Map`-backed fakes (`buildStorage`, `makeConfig`) instead of real persistence; mirror that pattern.
- `configMigration.test.ts` imports the shared `createMockHttpBridge` helper from `../_helpers/mockHttpBridge` purely to satisfy a "Phase 8 §8.5" grep gate — the final `describe` block is a reachability smoke test, not real T4 coverage. Do not delete it without understanding that gate.
- Migration assertions deliberately verify the legacy `model.config` field is PRESERVED (downgrade safety) and that the completion flag is NOT set on partial failure (so retries can fill gaps).

## Dependencies

### Internal

- `@/common/config/configMigration`, `@/common/config/fontSizes`, `@/common/config/storage` (modules under test)
- `@/common/adapter/httpBridge`, `@/common` (`ipcBridge`) — mocked
- `../_helpers/mockHttpBridge` (shared test helper)

### External

- `vitest` (`describe`/`it`/`expect`/`vi`/`beforeEach`)
- `@office-ai/platform` (`storage.buildStorage`) — mocked in `storage.test.ts`

<!-- MANUAL: notes below this line are preserved on regeneration -->
