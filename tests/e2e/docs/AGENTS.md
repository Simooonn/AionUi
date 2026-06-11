<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# docs

## Purpose

Planning and analysis documents for the AionUi E2E test suite. Holds per-feature test design dossiers (requirements, test cases, implementation mappings, discussion logs) plus cross-cutting infrastructure analyses. These are reference/working docs for authoring E2E specs under `tests/e2e/specs`, not executable code.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parallel-feasibility.md` | Analysis concluding E2E tests cannot run in parallel under the current architecture (singleton Electron app, shared `aionui.db`, `workers: 1`). Documents shared-resource conflicts and proposed multi-instance/sharding solutions, citing `playwright.config.ts`, `tests/e2e/fixtures.ts`, and `tests/e2e/README.md`. |

## Subdirectories

| Directory     | Purpose                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assistants`  | Test-design docs (`requirements.zh.md`, `test-cases.zh.md`, `implementation-mapping.zh.md`, `discussion-log.zh.md`) for the Assistants feature E2E coverage. |
| `chat-aionrs` | Same doc set for the chat / aionrs flow E2E coverage.                                                                                                        |
| `skills-hub`  | Doc set for the Skills Hub E2E coverage, plus `test-strategy.zh.md` and engineer review notes.                                                               |

## For AI Agents

- These are documentation files, not source. No process/renderer constraint applies, but the specs they describe live in `tests/e2e/specs` and run against a single shared Electron app — keep that singleton/`workers: 1` constraint in mind when designing new tests.
- Most subdirectory docs are written in Simplified Chinese (`.zh.md` suffix); `parallel-feasibility.md` and a few engineer notes are in English. Match the existing language/naming when adding files.
- Each feature folder follows a consistent quartet: `requirements` → `test-cases` → `implementation-mapping` → `discussion-log`. Preserve this naming pattern for new feature dossiers.
- Treat code references inside these docs (line numbers, env vars like `AIONUI_EXTENSION_STATES_FILE`, `AIONUI_CDP_PORT`) as snapshots that may drift; verify against current `tests/e2e/fixtures.ts` before relying on them.

<!-- MANUAL: notes below this line are preserved on regeneration -->
