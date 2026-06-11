<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# pet

## Purpose

Main-process backend for the desktop pet — a frameless, transparent, always-on-top mascot window that reacts to AI chat activity. Owns the pet's animation state machine, idle/cursor-tracking loop, AI-event-to-animation mapping, and a separate confirmation-bubble window for permission requests.

## Key Files

| File                   | Description                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `petManager.ts`        | Orchestrator and IPC surface. Creates/destroys the pet `BrowserWindow` plus a transparent click-through "hit" window, wires drag-follow + hit-region watchdog timers, and exports `isPetSupported`, `createPetWindow`, `destroyPetWindow`, `show/hidePetWindow`, `getEventBridge`, `resizePetWindow`, `setPetDndMode`, `setPetConfirmEnabled`. |
| `petStateMachine.ts`   | `PetStateMachine` class — priority-based transitions (`requestState`/`forceState`), min-display queuing, auto-return timers, DND gating, and `onStateChange` listeners.                                                                                                                                                                        |
| `petIdleTicker.ts`     | `PetIdleTicker` — 50ms loop polling `screen.getCursorScreenPoint()`. Drives idle→random→yawn→doze→sleep escalation and feeds eye/body tracking offsets via `onEyeMove`.                                                                                                                                                                        |
| `petEventBridge.ts`    | `PetEventBridge` — translates chat/openclaw stream messages and `confirmation.add` into pet states (thinking/working/done/error/notification).                                                                                                                                                                                                 |
| `petTypes.ts`          | `PET_STATES` union plus `STATE_PRIORITY`, `MIN_DISPLAY_MS`, `AUTO_RETURN` tables and `PetSize`/`HitBounds`/`EyeMoveData` types.                                                                                                                                                                                                                |
| `petConfirmManager.ts` | Manages the standalone confirmation-bubble `BrowserWindow`: queues `IConfirmation`s, tracks user-dragged position, reacts to theme changes. `unhookPetConfirm` is a retained no-op (confirmations now route via WS).                                                                                                                           |

## For AI Agents

- Main-process only — uses Electron `app`, `BrowserWindow`, `ipcMain`, `screen`, `Menu`, and Node `path`. No DOM/renderer APIs. The pet renderer lives at `packages/desktop/src/renderer/pet`.
- Module is dynamically imported, so `__dirname` resolves to `out/main/chunks/`; preload/renderer dirs are reached via `'../..'` (see the comments before `PRELOAD_DIR`). Don't "fix" these paths.
- State is module-level singletons in `petManager.ts`/`petConfirmManager.ts`, not classes — call init/destroy in pairs.
- Tick/listener callbacks swallow errors on purpose ("Never crash the tick loop") — keep that defensive pattern.
- Animation timing lives entirely in the tables in `petTypes.ts`; adding a new state means updating `PET_STATES`, `STATE_PRIORITY`, and the relevant `AI_DRIVEN_STATES`/`SLEEP_STATES` sets in `petIdleTicker.ts`.
- `isPetSupported()` returns false on Linux headless (ozone-platform=headless) to avoid fatal window crashes — gate new window creation on it.

## Dependencies

### Internal

`@process/services/i18n`, `@process/bridge/themeBridge`, `../../common/adapter/main` (`setPetNotifyHook`), `@/common` (`ipcBridge`), `@/common/chat/chatLib` (`IConfirmation`).

### External

`electron` (`app`, `BrowserWindow`, `ipcMain`, `screen`, `Menu`), `node:path`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
