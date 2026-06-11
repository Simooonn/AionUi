<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# codex

## Purpose

Shared type/constant definitions for the Codex CLI backend: the curated default model catalog and the agent permission-mode constants plus a normalizer that maps legacy AionUi mode values onto Codex's native modes. Consumed by both main and renderer processes.

## Key Files

| File             | Description                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codexModels.ts` | Exports `DEFAULT_CODEX_MODELS`, an ordered array of `{ id, label, description }` for known Codex-supported models (first entry is the default). AionUi only passes the name through; Codex CLI validates.                                                                                                                                             |
| `codexModes.ts`  | Exports native mode constants (`CODEX_MODE_READ_ONLY` = `'read-only'`, `CODEX_MODE_NATIVE_DEFAULT` = `'auto'`, `CODEX_MODE_NATIVE_FULL_ACCESS` = `'full-access'`) and `normalizeCodexMode()`, which collapses legacy values (`autoEdit`, `yolo`, `yoloNoSandbox`, `default`) into the three native modes and passes unknown values through unchanged. |

## For AI Agents

- These are framework-agnostic constant/function modules in `common/` — no DOM or Node APIs; safe for both processes.
- The model list is hand-maintained, not fetched. Updating it means editing the array; order matters because index 0 is the default selection.
- `normalizeCodexMode` exists for backward compat with persisted user config — do not remove the legacy `autoEdit`/`yolo`/`yoloNoSandbox` cases without a migration. The private legacy constants have no external callers (only used inside the switch).
- Returns `undefined` for falsy input; returns the input verbatim for unrecognized modes.

<!-- MANUAL: notes below this line are preserved on regeneration -->
