<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# database

## Purpose

SQLite persistence layer for the main process: schema definition, versioned migrations, and the conversation/message repository contract. Backs chat conversations, messages, users, and team-mode tables (teams, mailbox, team_tasks) consumed by the backend services.

## Key Files

| File                             | Description                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema.ts`                      | `initSchema()` creates all tables/indexes (users, conversations, messages, teams, mailbox, team_tasks) and sets PRAGMAs (foreign_keys, busy_timeout=5000, WAL). Exposes `getDatabaseVersion`/`setDatabaseVersion` via SQLite `user_version`, and `CURRENT_DB_VERSION` (currently 26).                                                                                                            |
| `migrations.ts`                  | Numbered migrations `migration_v1`..`migration_v26` (each an `IMigration` with `up`/`down`). Exports `ALL_MIGRATIONS`, `runMigrations`/`rollbackMigrations`, `getMigrationsToRun`/`getMigrationsToRollback`, `getMigrationHistory`, `isMigrationApplied`. `runMigrations` runs forward only (throws on downgrade), wraps all steps in one transaction, and toggles `foreign_keys=OFF` before it. |
| `runLegacyDatabaseMigrations.ts` | One-shot startup pass that upgrades the Electron-managed `aionui.db` to the v26 baseline before the backend starts. Opens a `BetterSqlite3Driver`, runs `initSchema` + `runMigrations`, ensures the `system_default_user` row, then always closes the driver. Exports `resolveLegacyDatabasePath` and `LegacyDatabaseMigrationResult`.                                                           |
| `IConversationRepository.ts`     | Repository interface (async signatures, synchronous better-sqlite3 impl) for conversation/message CRUD, paginated reads, full-text `searchMessages`, and cron-job lookups. Exports `PaginatedResult<T>`.                                                                                                                                                                                         |

## Subdirectories

| Directory | Purpose                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `drivers` | SQLite driver abstraction (`ISqliteDriver`) and concrete `BetterSqlite3Driver` implementation (see `drivers/AGENTS.md`). |

## For AI Agents

- Main-process only — no DOM APIs. Driver work is synchronous (better-sqlite3); the repository interface is async to allow a future async driver.
- All DB calls go through `ISqliteDriver` (`db.pragma`/`db.exec`/`db.prepare`/`db.transaction`), never `better-sqlite3` directly — keep new code driver-agnostic.
- When adding a migration: append `migration_vN`, add it to `ALL_MIGRATIONS`, and bump `CURRENT_DB_VERSION` in `schema.ts` to match. Forward migrations only; `down` is for tests/rollback.
- `runMigrations` disables foreign keys outside the transaction (PRAGMA is ignored inside one) to allow DROP+CREATE table recreation — keep that pattern when a migration rebuilds a table.
- New tables also belong in `initSchema()` so fresh databases get them without replaying migrations.

## Dependencies

### Internal

- `./drivers` (`ISqliteDriver`, `BetterSqlite3Driver`)
- `@process/utils` (`getDataPath`, `ensureDirectory`)
- `@/common/config/storage`, `@/common/chat/chatLib`, `@/common/types/team/database` (types)

### External

- `better-sqlite3` (via the driver), Node `fs`/`path`

<!-- MANUAL: notes below this line are preserved on regeneration -->
