<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# cases

## Purpose

Holds end-to-end test scenarios organized by feature area, complementing the flat `../specs` directory. Currently scoped to the multi-agent "teams" feature, with one `*.e2e.ts` spec per user-facing flow.

## Subdirectories

| Directory | Purpose                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| teams     | E2E specs for the AI team / multi-agent feature: team create & delete (logic + UI), agent lifecycle, member ops & messaging, name/whitelist validation, rename/pin, view modes, tab context, session mode, stale-URL handling, and workspace migration. |

## For AI Agents

- These are Playwright-style E2E specs (`*.e2e.ts`) that drive the packaged Electron app — they exercise both renderer (DOM) and main-process behavior end to end, so neither process constraint applies in isolation here.
- Shared setup lives one level up: import test fixtures from `../fixtures.ts` and reuse helpers in `../helpers/` rather than re-implementing app launch or selectors.
- File naming convention: `<feature>-<scenario>.e2e.ts`; UI-focused variants use the `-ui` suffix (e.g. `team-create-ui.e2e.ts`) versus logic-level specs (`team-create.e2e.ts`). Match this pattern when adding cases.
- This is a leaf `cases/` directory with no direct files; add new feature folders as siblings of `teams/` to keep scenarios grouped by area.

## Dependencies

### Internal

- `../fixtures.ts`, `../helpers/` — test fixtures and reusable E2E helpers consumed by the specs under `teams/`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
