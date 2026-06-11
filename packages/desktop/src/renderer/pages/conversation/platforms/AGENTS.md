<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# platforms

## Purpose

Houses the per-backend conversation UI implementations (ACP, AionRS, Gemini, legacy) that render and drive a chat session against a specific agent platform. The two direct files are cross-platform helpers shared by those implementations: a bridge-result assertion helper and a client-side command queue hook.

## Key Files

| File                             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assertBridgeSuccess.ts`         | `assertBridgeSuccess(result, fallbackMessage)` — narrows an IPC `BridgeResult` to `{ success: true; data? }`, throwing `new Error(result.msg ?? fallbackMessage)` when the bridge call did not succeed.                                                                                                                                                                                                                                                                                        |
| `useConversationCommandQueue.ts` | `useConversationCommandQueue` hook plus its pure helpers (`createQueuedCommandItem`, `validateQueuedCommandItem`, `normalizeQueueState`, `removeQueuedCommand`, `reorderQueuedCommand`, `getCommandQueueExecutionGate`, etc.). Queues user commands while the agent is busy and flushes them when an execution gate (busy/hydrated/runtimeGate) allows. Enforces caps: 20 items, 20k input chars, 50 files, 256KB serialized state. Persists per-`conversation_id` state and loads it via SWR. |

## Subdirectories

| Directory | Purpose                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `acp`     | ACP (Agent Client Protocol) conversation implementation (see `acp/AGENTS.md`).      |
| `aionrs`  | AionRS backend conversation implementation (see `aionrs/AGENTS.md`).                |
| `gemini`  | Gemini backend conversation implementation (see `gemini/AGENTS.md`).                |
| `legacy`  | Legacy conversation implementation kept for compatibility (see `legacy/AGENTS.md`). |

## For AI Agents

- Renderer-only code: no Node.js APIs. All cross-process access goes through the IPC bridge; wrap bridge calls with `assertBridgeSuccess` so failures surface as thrown `Error`s with i18n-safe fallback messages.
- The command queue keeps mutable state in module-level `Map`s and `useRef`s, mirroring it into SWR cache (key `/conversation-command-queue/${conversation_id}`) — keep `stateRef`/`pausedRef` in sync when adding mutations, and always re-validate against the cap constants before enqueuing.
- The queue flushes via `getCommandQueueExecutionGate` driven by `isBusy`/`isHydrated`/`runtimeGate` and the `onExecute` callback; do not call `onExecute` directly from platform code, drive it through the gate so turn-start/turn-finish ordering is preserved.
- Validation reasons are a closed union (`QueueValidationFailureReason`); extend the type when adding a new failure path and surface it through the `arco` `Message` UI used here.

## Dependencies

### Internal

- `@/common/utils` (`uuid`), `@/renderer/utils/emitter` (`useAddEventListener`)

### External

- `react`, `swr`, `react-i18next`, `@arco-design/web-react` (`Message`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
