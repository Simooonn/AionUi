<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# backend

## Purpose
Locates the `aioncore` backend binary that the desktop main process spawns. Resolves the executable from either the app's bundled resources (production) or the system PATH, and surfaces rich diagnostics when resolution fails.

## Key Files
| File | Description |
| --- | --- |
| `binaryResolver.ts` | Exports `resolveBinaryPath()`, which returns the absolute path to `aioncore` (`.exe` on Windows). Checks bundled layout `resources/bundled-aioncore/{platform}-{arch}/` first, then runs `which`/`where` on PATH. Throws `BackendBinaryResolveError` carrying a `BackendBinaryResolveDiagnostics` object (resources path, runtime key, checked paths, dir listings, PATH lookup result/error). |
| `binaryResolver.test.ts` | Vitest unit test mocking `node:fs` and `node:child_process`; verifies the diagnostics payload attached to the error when the binary is missing from both bundle and PATH. |
| `index.ts` | Barrel re-exporting `resolveBinaryPath`. |

## For AI Agents
- Main-process only — uses `node:fs`, `node:path`, `node:child_process`. Never import here from renderer code.
- Runtime key is `${process.platform}-${process.arch}`; the bundled binary name gains a `.exe` suffix only on `win32`.
- Diagnostics intentionally cap output: directory listings to `MAX_DIR_ENTRIES` (20) entries and PATH lookup text to `MAX_LOOKUP_TEXT_LENGTH` (1000) chars. Keep these caps when extending diagnostics to avoid leaking huge strings into error reports.
- `process.resourcesPath` is read via a typed cast (it is not in the default `NodeJS.Process` type); preserve that pattern rather than reaching for `any`.
- `execSync` PATH lookup has a 5s timeout and may return multiple lines — only the first non-empty existing line is used.

## Dependencies
### External
- `node:fs`, `node:path`, `node:child_process` (Node built-ins)
- `vitest` (test only)

<!-- MANUAL: notes below this line are preserved on regeneration -->
