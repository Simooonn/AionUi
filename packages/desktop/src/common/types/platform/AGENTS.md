<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# platform

## Purpose
Shared TypeScript type definitions for three platform-level concerns: the ACP (Agent Client Protocol) wire format used to talk to backend agents, the Electron bridge surface exposed on `window`, and file-snapshot/diff metadata. These types are consumed by both the main process and renderer.

## Key Files
| File | Description |
| --- | --- |
| `acpTypes.ts` | ACP protocol types: `AcpInitializeResult` / `AcpAgentCapabilities` (parsed initialize response with safe defaults), session-update payloads (`ToolCallUpdate`, `PlanUpdate`), config/mode/model descriptors (`AcpSessionConfigOption`, `AcpSessionModes`, `AcpModelInfo`), permission requests (`AcpPermissionRequest`), and `CustomAgentAdvancedOverrides` (snake_case backend overrides). Note many fields keep snake_case to match the wire format. |
| `electron.ts` | `ElectronBridgeAPI` (the `window.electronAPI` shape — `emit`/`on`, drag-path, feedback log/screenshot), `WebUIStatus`, backend startup-failure unions (`BackendStartupFailureReason`, `BackendStartupFailureInfo`), and a `declare global` block augmenting `Window` with `electronAPI`, `__initialLanguage`, `__backendStartupFailed`, `__backendStartupFailure`. |
| `fileSnapshot.ts` | Snapshot/diff types: `FileChangeOperation`, `FileChangeInfo`, `CompareResult` (staged/unstaged split for git-repo mode), `SnapshotInfo` (`git-repo` vs `snapshot` mode + branch). |

## For AI Agents
- Type-only directory — no runtime code. Files must remain importable from both main and renderer, so do not pull in Node.js or DOM runtime dependencies here.
- ACP field names intentionally mirror the protocol wire format (mixed camelCase and snake_case, e.g. `auth_methods`, `current_model_id`, `sessionUpdate`). Do not "normalize" casing without checking the actual JSON-RPC payloads.
- ACP capability/session types are documented to have safe defaults (no `undefined` checks expected by callers); preserve that contract when extending — prefer non-optional fields with sentinel `null` (as `AcpSessionCapabilities` does) over optional `?` where defaults are guaranteed.
- `electron.ts` mutates the global `Window` interface; editing it changes typing app-wide. Keep new globals optional (`?`) since they may be absent during early boot.
- Per project convention, prefer `type` aliases; the existing `interface` declarations here predate that and are left as-is.

## Dependencies
### External
None — these are standalone TypeScript type declarations with no imports.

<!-- MANUAL: notes below this line are preserved on regeneration -->
