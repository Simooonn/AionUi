<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# integration

## Purpose
End-to-end integration tests that exercise full pipelines against a **real running aioncore backend** (not mocks). Currently holds the assistant-migration spec verifying `migrateAssistantsToBackend` from legacy Electron config decode through backend HTTP import and rule-file upload.

## Key Files
| File | Description |
| --- | --- |
| `migrateAssistants.realFixture.test.ts` | Decodes a real `aionui-config.txt` fixture, stages legacy `Archive/*.md` rule files, spawns a real `aioncore` binary on a free port bound to a throw-away temp data-dir, runs `migrateAssistantsToBackend`, then asserts 3 user assistants land in the db (via `/api/assistants`), 4 rule `.md` files are uploaded to `<dataDir>/assistant-rules/`, the legacy `assistants` field is preserved, byte content round-trips, and a re-run skips re-import and preserves user edits (read-before-write guard). |

## For AI Agents
- This is a **main-process / Node** test (uses `node:child_process`, `node:fs`, `node:net`, `fetch`); no DOM. It imports `@/process/utils/migrateAssistants` and mocks `@/process/utils/initStorage`'s `getAssistantsDir` via `vi.doMock` before a dynamic `await import(...)`.
- The whole suite is **gated by fixture presence**: `FIXTURES_AVAILABLE` checks hardcoded paths (`/Users/zhoukai/Downloads/aionui-config.txt` + `Archive`). When absent it uses `describe.skip` plus a single skipped placeholder test so Vitest does not error on "no test found". These fixtures are machine-specific and not in the repo — the suite is effectively skipped in CI.
- Backend binary is resolved from `AIONUI_BACKEND_BINARY`, `~/.cargo/bin/aioncore`, or `../../../AionCore/target/debug/aioncore` (sibling AionCore repo); throws if none exist.
- Config decode mirrors `JsonFileBuilder`: `base64` -> `decodeURIComponent` -> `JSON.parse`. Tests carry a 60s timeout; `beforeEach`/`afterEach` spawn and SIGTERM/SIGKILL the backend and `rm -rf` the temp dir. New integration tests here should follow the same gate-on-fixture + spawn-real-backend + temp-dir-cleanup pattern.

## Dependencies
### Internal
`@/process/utils/migrateAssistants`, `@/process/utils/initStorage` (mocked)
### External
`vitest`, Node built-ins (`node:child_process`, `node:fs`, `node:os`, `node:path`, `node:net`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
