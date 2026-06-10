<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# model

## Purpose
Renderer-side helpers for AI model/agent metadata: mapping agent backends to logos, listing per-backend session modes, classifying model API errors, resolving model capabilities and context-window sizes, and the catalog of provider platforms used in settings forms.

## Key Files
| File | Description |
| --- | --- |
| `agentLogo.ts` | `AGENT_LOGO_PATH_MAP` (lowercase backend → `/api/assets/logos/...` path). `getAgentLogo`/`resolveAgentLogo`/`hasAgentLogo` resolve logos; handles dark-theme `opencode` variant and `ext:…:adapterId` extraction. Also `isDefaultModel` and `getModelDisplayLabel`. |
| `agentModes.ts` | `AGENT_MODES` per-backend session modes (claude, qwen, opencode, gemini, aionrs, codex, cursor, snow). `getAgentModes`, `mergeWithCapabilities` (merge static + handshake-reported modes), `supportsModeSwitch`. Re-exports `getFullAutoMode` from common. |
| `agentTypes.ts` | `AgentMetadata` type and related shapes for `/api/agents`. `DETECTED_AGENTS_SWR_KEY`, `fetchDetectedAgents` (via `ipcBridge.acpConversation.getAvailableAgents`), `getSupportedMcpTransports` (reads handshake mcp_capabilities). |
| `agentTypeSupportPolicy.ts` | Whitelist/deprecation sets for conversation agents. `isSupportedNewConversationAgent`, `isDeprecatedRuntimeAgentType`, `resolveSupportedConversationType`, `normalizeSupportedAgentSelection` (normalizes to `acp`/`aionrs`). |
| `errorDetection.ts` | Pure string-matchers on model API responses: `isQuotaErrorMessage` (429/quota), `isApiKeyError`, `isApiErrorMessage` (4xx/5xx, excludes key errors). |
| `modelCapabilities.ts` | `hasModelCapability` — three-tier resolution (user config → per-provider rules → regex patterns from common), with a memo cache. `clearModelCapabilitiesCache`; re-exports `hasSpecificModelCapability`. |
| `modelContextLimits.ts` | `MODEL_CONTEXT_LIMITS` table (Gemini/OpenAI/Claude). `getModelContextLimit` with longest-substring fuzzy match; `DEFAULT_CONTEXT_LIMIT`. |
| `modelPlatforms.ts` | `MODEL_PLATFORMS` provider catalog (name/value/logo/base_url/i18nKey) for settings. Helpers: `getPlatformByValue`, `getPresetProviders`, `getProviderLogo`, `getGeminiPlatforms`, `isGeminiPlatform`, `isCustomOption`, `searchPlatformsByName`, `detectNewApiProtocol`, `NEW_API_PROTOCOL_OPTIONS`. |
| `presetAssistantResources.ts` | Thin barrel re-exporting `loadPresetAssistantResources` and its types from `@/common/utils/presetAssistantResources`. |

## For AI Agents
- Renderer-only code: no Node.js APIs. `agentLogo.ts` guards `document`/`window` access (`typeof document === 'undefined'`) so it stays safe outside the DOM.
- Logo and platform paths build on `resolveBackendAssetUrl` from `@/renderer/utils/platform` — never hardcode asset URLs; backend serves `/api/assets/logos/...`.
- `AGENT_MODES` labels match each CLI's display text exactly and are intentionally NOT i18n'd. Mode `value`s are sent over ACP `session/set_mode` — keep them in sync with backend/adapter expectations. Codex modes import constants from `@/common/types/codex/codexModes`.
- When adding a provider, add the row to `MODEL_PLATFORMS` (preset providers need `base_url`; translatable names use `i18nKey`) — the helper functions derive everything else from this single list.
- Capability/error logic prefers reusing shared rules from `@/common/utils/*`; extend those rather than duplicating regexes here.

## Dependencies
### Internal
`@/common` (ipcBridge), `@/common/config/storage` (`IProvider`, `ModelType`), `@/common/utils/modelCapabilities`, `@/common/utils/platformConstants`, `@/common/utils/presetAssistantResources`, `@/common/types/codex/codexModes`, `@/common/types/agent/agentModes`, `@/renderer/utils/platform`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
