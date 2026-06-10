<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# agent

## Purpose
Shared TypeScript type definitions for AionUi's agent layer: detected execution engines, user-configured assistants, remote agent connection configs, extension hub index entries, and per-backend full-auto mode IDs. Imported by both the main process and the renderer.

## Key Files
| File | Description |
| --- | --- |
| `detectedAgent.ts` | Canonical `DetectedAgent<K>` generic over `DetectedAgentKind` (`acp` \| `remote` \| `aionrs` \| `openclaw-gateway` \| `nanobot`), with `KindFields` mapping, convenience aliases (`AcpDetectedAgent`, etc.), and the `isAgentKind` type guard. Source of truth for `RemoteAgentProtocol` / `RemoteAgentAuthType`. |
| `assistantTypes.ts` | `Assistant` config layer (presets with skills/prompts/models, i18n fields) plus Create/Update/SetState/Import request and result shapes. Mirrors Rust `aionui-api-types/src/assistant.rs` — keep both in sync in the same PR. |
| `remoteAgentTypes.ts` | `RemoteAgentConfig` (mirrors the `remote_agents` DB table) and `RemoteAgentInput`. Re-exports the protocol/auth types from `detectedAgent.ts`. Includes OpenClaw-only Ed25519 device key fields and `RemoteAgentStatus`. |
| `hub.ts` | Extension hub types: `IHubExtension`, `IHubIndex`, `IHubAgentItem`, `HubContributes` (capability ID arrays), and `HubExtensionStatus` install lifecycle union. |
| `agentModes.ts` | `FULL_AUTO_MODE` map of backend → YOLO/full-access mode ID and `getFullAutoMode()` helper (defaults to `'yolo'`). |

## For AI Agents
- Type-only directory living in `common/` — shared by main process and renderer, so no DOM or Node.js APIs. Keep it dependency-free except for sibling type imports.
- `detectedAgent.ts` is the canonical home for `RemoteAgentProtocol` / `RemoteAgentAuthType`; `remoteAgentTypes.ts` re-exports them. Edit the definition here, not downstream copies.
- `assistantTypes.ts` is a hand-mirror of a Rust struct — any field change must land alongside the matching Rust change in the same PR.
- Note the naming mismatch between layers: assistant/remote DB shapes use snake_case fields (`auth_type`, `name_i18n`), while `DetectedAgent` uses camelCase (`authType`, `remoteAgentId`). Match the convention of the file you edit.
- "Assistants" (config presets) are deliberately NOT "detected agents" (execution engines) — keep that distinction when adding types.

## Dependencies
### Internal
- `@/common/types/codex/codexModes` (`CODEX_MODE_NATIVE_FULL_ACCESS`, used by `agentModes.ts`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
