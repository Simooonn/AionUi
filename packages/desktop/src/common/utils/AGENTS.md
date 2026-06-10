<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose
Cross-process helper functions shared by the main and renderer halves of AionUi. Centralizes model/provider capability detection, auth-type and API-protocol inference, conversation-param assembly, URL host validation, and small primitives (uuid, error parsing, locale resolution).

## Key Files
| File | Description |
| --- | --- |
| `index.ts` | Barrel re-exporting `uuid`, `parseError`, `resolveLocaleKey` from `utils.ts`. |
| `utils.ts` | `uuid()` (crypto-backed with Date fallback), `parseError()` (extracts message from unknown errors), `resolveLocaleKey()` (language code → `zh-CN`/`en-US`/`ja-JP`/`zh-TW`/`ko-KR`/`tr-TR`). |
| `appConfig.ts` | Mutable module-level app config (`setAppConfig`) + getters for client name/version and Codex MCP protocol version; main process sets it via Electron `app`. |
| `buildAgentConversationParams.ts` | `buildAgentConversationParams()` / `getConversationTypeForBackend()` — assembles `ICreateConversationParams` for ACP/aionrs backends, handling preset vs custom agents and `extra` field wiring. |
| `modelCapabilities.ts` | `CAPABILITY_PATTERNS` / `CAPABILITY_EXCLUSIONS` regex maps per `ModelType`; `getBaseModelName()`, `hasSpecificModelCapability()` (returns true/false/undefined). |
| `imageModelAllowlist.ts` | `isImageGenSupported()` — platform+model allowlist (gemini, openrouter, antigravity) for the built-in image-gen tool; only OpenAI multimodal "form B" output is supported. |
| `platformAuthType.ts` | `getAuthTypeFromPlatform()` / `getProviderAuthType()` — maps platform strings to `AuthType`, with per-model protocol override for new-api. |
| `platformConstants.ts` | `NEW_API_PLATFORM_ID` constant and `isNewApiPlatform()` guard. |
| `presetAssistantResources.ts` | `loadPresetAssistantResources()` — DI-friendly loader for preset assistant rules/skills/enabled-skills over `ipcBridge.fs`/`assistants`. |
| `protocolDetector.ts` | AionRouter protocol detection: `ProtocolType`, signature/key-pattern tables, `parseApiKeys`, `maskApiKey`, `normalizeBaseUrl`, `guessProtocolFromUrl/Key`, `getRecommendedPlatform`, etc. |
| `urlValidation.ts` | `API_HOST_CONFIG` + `isOfficialHost()`/`isGoogleApisHost()`/`isOpenAIHost()`/`isAnthropicHost()` — URL-parsed host checks (no substring matching). |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `shims` | Cross-environment shim/polyfill helpers (see `shims/AGENTS.md`). |

## For AI Agents
- This dir is in `common/`, so code must run in BOTH main and renderer: no DOM-only and no Node-only APIs. `utils.ts` deliberately feature-detects `globalThis.crypto` instead of importing `node:crypto`.
- `presetAssistantResources.ts` reaches the backend via `ipcBridge` and takes an injectable `deps` arg — keep that seam for tests; do not hardcode `ipcBridge` calls into new logic.
- Capability/auth/protocol matching is regex/allowlist driven. When adding a provider or model family, extend the existing pattern/rule tables (e.g. `CAPABILITY_PATTERNS`, `imageModelAllowlist` RULES, `PROTOCOL_SIGNATURES`) rather than scattering new conditionals.
- `urlValidation.ts` uses `new URL().hostname` exact-match by design to block lookalike-host bypass; never relax it to `includes()`.
- Comments are mixed EN/中文 here; follow the surrounding file's style.

## Dependencies
### Internal
- `@/common` (`ipcBridge`), `@/common/adapter/ipcBridge`, `@/common/config/storage` (`IProvider`, `ModelType`, `TProviderWithModel`)
### External
- `@office-ai/aioncli-core` (`AuthType`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
