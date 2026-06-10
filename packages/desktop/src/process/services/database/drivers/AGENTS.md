<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# drivers

## Purpose
SQLite driver abstraction for the main-process database layer. Defines a minimal driver/statement interface (`ISqliteDriver`) and ships one concrete implementation backed by `better-sqlite3`, so the rest of the database service depends on the interface rather than the native binding directly.

## Key Files
| File | Description |
| --- | --- |
| `ISqliteDriver.ts` | Type-only contract: `IStatement` (`get`/`all`/`run`) and `ISqliteDriver` (`prepare`, `exec`, `pragma`, `transaction`, `close`). No runtime code. |
| `BetterSqlite3Driver.ts` | `BetterSqlite3Driver` and `BetterSqlite3Statement` implementing the interfaces by wrapping a `better-sqlite3` `Database`. Constructor opens the DB synchronously from a `dbPath`. |

## For AI Agents
- Main-process only — `better-sqlite3` is a native Node addon; never import this directory from `renderer/`.
- Operations are synchronous (better-sqlite3 is sync by design); do not add `await` around `prepare`/`run`/`get`/`all`.
- `run()` returns `{ changes, lastInsertRowid }` where `lastInsertRowid` is `number | bigint` — handle the bigint case when reading inserted ids.
- Keep `ISqliteDriver` as the abstraction boundary: add a new driver class implementing the interface rather than referencing `better-sqlite3` elsewhere. If you extend the interface, update every implementation.

## Dependencies
### External
- `better-sqlite3` (and its `Database`/`Statement` types) — used only in `BetterSqlite3Driver.ts`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
