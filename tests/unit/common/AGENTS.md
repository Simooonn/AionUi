<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# common

## Purpose
Vitest unit tests for pure logic in `packages/desktop/src/common` (the code shared by both Electron processes). Covers chat message composition, provider/auth resolution, image-generation gating, and URL/protocol validation — all process-agnostic helpers with no DOM or Node IPC dependencies.

## Key Files
| File | Description |
| --- | --- |
| `chatLib.test.ts` | Tests `composeMessage`, `transformMessage`, `normalizeAgentStreamError` from `@/common/chat/chatLib` — thinking-message merging across tool-call boundaries, structured stream-error metadata, hidden system messages, and tips error/info preservation. |
| `normalizeToolCall.test.ts` | Tests `normalizeAcpToolCall` from `@/common/chat/normalizeToolCall` — flattening compact snake_case ACP tool-call history into key/name/status/description/output fields. |
| `OpenAI2GeminiConverter.test.ts` | Tests `@/common/api/OpenAI2GeminiConverter`: requesting IMAGE+TEXT response modalities and converting Gemini `inlineData` into OpenAI `image_url` data URLs. |
| `platformAuthType.test.ts` | Tests `getAuthTypeFromPlatform` / `getProviderAuthType` — mapping platform strings to `AuthType`, with `model_protocols` overrides for the `new-api` platform. Mocks `platformConstants`. |
| `platformConstants.test.ts` | Tests `isNewApiPlatform` and `NEW_API_PLATFORM_ID` (case-sensitive `'new-api'` matching). |
| `imageGenerationMcpEnv.test.ts` | Tests `resolveImageGenerationMcpEnv` / `IMAGE_GEN_ENV_KEYS` — resolving image-gen MCP env by provider id vs. legacy field-match, with `ok`-discriminated result and failure reasons. |
| `imageModelAllowlist.test.ts` | Tests `isImageGenSupported` — the provider/model allowlist (Gemini, Vertex AI, OpenRouter, AntigravityTools) and rejection of non-allowlisted image models. |
| `protocolDetector.test.ts` | Tests `@/common/utils/protocolDetector` API-key parsing/masking, base-URL normalization, and protocol/provider guessing. |
| `urlValidation.test.ts` | Tests `isOfficialHost` / host-family checks (`isGoogleApisHost`, `isOpenAIHost`, `isAnthropicHost`) including subdomain and path-based attack rejection. |
| `utils.test.ts` | Tests `uuid`, `parseError`, `resolveLocaleKey` from `@/common/utils/utils` (uuid length branching between `crypto.randomUUID` and `getRandomValues`). |

## For AI Agents
- These exercise shared `@/common` code only — keep tests free of DOM (`window`) and Node (`fs`, IPC) usage so they match the cross-process contract.
- Import the unit under test via the `@/common/...` path alias, not relative paths.
- Result-type helpers (`resolveImageGenerationMcpEnv`) return discriminated unions; tests narrow with `if (!result.ok) return;` before asserting `.env`/`.source` — follow that pattern.
- `vi.mock` is used to stub sibling modules (see `platformAuthType.test.ts` mocking `platformConstants`); prefer mocking over importing real heavy deps.
- Most files carry the Apache-2.0 license header; new test files should keep it.

## Dependencies
### Internal
`@/common/chat`, `@/common/api`, `@/common/config`, `@/common/utils`, `@/common/adapter/ipcBridge` (types only).
### External
`vitest` (`describe`/`it`/`expect`/`vi`); `@office-ai/aioncli-core` for the `AuthType` enum.

<!-- MANUAL: notes below this line are preserved on regeneration -->
