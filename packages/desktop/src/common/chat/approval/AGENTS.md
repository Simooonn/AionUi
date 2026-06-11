<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# approval

## Purpose

Shared, process-agnostic primitives for tool-permission "always allow" memory. Defines the `IApprovalKey`/`IApprovalStore` contracts and a `BaseApprovalStore` session-level cache reused across the Gemini, ACP, and Codex agent backends.

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ApprovalStore.ts` | Declares `IApprovalKey` (`{ action, identifier? }`), the `IApprovalStore` interface (`isApproved` / `approve` / `clear` / `size`), and `BaseApprovalStore<K>` — a `Map<string, boolean>`-backed cache. Keys are serialized via a protected `serializeKey` (JSON of `action` + `identifier`) that subclasses may override. Also exposes `allApproved(keys)` and `approveAll(keys)` accepting the base key type for IPC compatibility. |
| `index.ts`         | Barrel re-exporting `BaseApprovalStore`, `IApprovalKey`, and `IApprovalStore`.                                                                                                                                                                                                                                                                                                                                                       |

## For AI Agents

- This lives under `common/`, so it must stay free of both Node.js and DOM APIs — no `fs`, no `window`. Only plain TS and `Map` are used.
- The cache is intentionally session-level and in-memory; `clear()` resets it. Do not add persistence here.
- `allApproved`/`approveAll` deliberately accept `IApprovalKey[]` (not `K[]`) and cast internally so they can be driven by serialized IPC payloads. Preserve that signature when extending.
- To customize key matching for a backend, subclass `BaseApprovalStore` and override `serializeKey` rather than changing the base.

## Dependencies

None (no internal or external imports).

<!-- MANUAL: notes below this line are preserved on regeneration -->
