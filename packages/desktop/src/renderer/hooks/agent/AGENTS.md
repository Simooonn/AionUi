<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# agent

## Purpose

Renderer-side React hooks for resolving AI agent/model metadata: detected ACP agents, per-conversation ACP model info, model provider lists, agent modes, and preset assistant identity. These wrap IPC calls (mostly under `ipcBridge.acpConversation`, `ipcBridge.mode`, `ipcBridge.hub`, `ipcBridge.google*`) and cache results with SWR so multiple components stay in sync.

## Key Files

| File                             | Description                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAgents.ts`                   | Canonical SWR hook for `/api/agents` detected agents (shared `DETECTED_AGENTS_SWR_KEY`). Also exports non-hook `getAgents()` and `refreshAgents()` for plain async call sites.                                                                    |
| `useAcpModelInfo.ts`             | Per-conversation ACP model info via `acpConversation.getModel`; treats 404 as "no active session" (warmup/evict), logs via `writeRendererLog`, avoids overwriting established model cache.                                                        |
| `useModelProviderList.ts`        | Builds provider list (`mode.listProviders`), injects a synthetic Google-Auth provider when authenticated, filters disabled providers/models via `hasSpecificModelCapability`. Exports `PROVIDERS_SWR_KEY`, `fetchProviders`, `useProvidersQuery`. |
| `useModeModeList.ts`             | Fetches a provider's model list (`mode.fetchModelList`); only calls backend when credentials are usable (api_key, or bedrock_config for bedrock); sorts Gemini models (Pro first, version desc).                                                  |
| `useConfigModelListWithImage.ts` | Derives provider list with platform-specific image models injected (gemini, OpenRouter, AntigravityTools). Wraps `useProvidersQuery`.                                                                                                             |
| `usePresetAssistantInfo.ts`      | Resolves preset assistant name/logo/emoji from `conversation.extra`; exports `resolveAssistantConfigId` and `resolvePresetId` with backward-compat across `preset_assistant_id`/`custom_agent_id`/`enabled_skills`.                               |
| `useAgentReadinessCheck.ts`      | Probes whether an ACP/Codex agent is ready, tracks check progress, and recommends a best alternative agent.                                                                                                                                       |
| `useAgentModesForBackend.ts`     | Resolves available agent modes for a backend using cached handshake modes → cached config options → static `getAgentModes` fallback.                                                                                                              |
| `useHubAgents.ts`                | Lists/install/update Hub agent extensions (`ipcBridge.hub.*`); subscribes to `hub.onStateChanged`, revalidates detected-agents cache after install.                                                                                               |
| `useGoogleAuthModels.ts`         | SWR check of Google Auth CLI status + subscription tier; subscription call gated on auth success.                                                                                                                                                 |

## For AI Agents

- Renderer process only — no Node.js APIs. All backend access goes through `ipcBridge` (imported from `@/common`).
- SWR de-dup depends on sharing the same key. Reuse `DETECTED_AGENTS_SWR_KEY` and `PROVIDERS_SWR_KEY` instead of inventing new keys or calling `ipcBridge.acpConversation.getAvailableAgents` directly.
- Provider config is treated as stable local state: `PROVIDERS_SWR_OPTIONS` disables revalidate-on-focus/reconnect — refresh only via explicit `mutate()` after CRUD.
- In `useAcpModelInfo`, a 404 means missing active session, not an error — do not treat it as a failure or clear the cache.
- Inline comments here are mixed English/Chinese; per project convention prefer English for new comments.

## Dependencies

### Internal

- `@/common` (`ipcBridge`), `@/common/config/*` (`configService`, `storage`, `constants`), `@/common/types/*`, `@/common/adapter/httpBridge`
- `@/renderer/utils/model/*` (`agentTypes`, `agentModes`, `modelCapabilities`), `@/renderer/utils/platform`, `@/renderer/pages/guid/hooks/agentSelectionUtils`, `@/renderer/assets/icons/cowork.svg`

### External

- `swr`, `react`, `react-i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
