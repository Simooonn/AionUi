<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# providers

## Purpose
Vitest unit tests for the multi-key, multi-protocol API provider layer in `packages/desktop/src/common/api`. Covers API-key parsing/rotation/blacklisting, the rotating-client factory, retry behavior, and OpenAI↔Anthropic protocol conversion.

## Key Files
| File | Description |
| --- | --- |
| `ApiKeyManager.test.ts` | Tests `ApiKeyManager`: comma/newline key parsing with whitespace trimming, env-var assignment (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`) for multi-key, random initial key, rotation + 90-second blacklist expiry, throws for unsupported `AuthType`, 1-based `getStatus()` display. |
| `ClientFactory.test.ts` | Tests `ClientFactory.createRotatingClient` (dispatch to OpenAI/Anthropic/Gemini rotating clients, default headers, proxy/timeout/rotating options, defaults to OpenAI for unknown auth) and `normalizeNewApiBaseUrl` (per-protocol `/v1` handling). Mocks the three rotating clients and `platformAuthType`/`platformConstants`. |
| `RotatingApiClient.test.ts` | Tests the abstract `RotatingApiClient` via a concrete `TestRotatingApiClient` subclass: single-vs-multi key init, `isRetryableError` (401/429/5xx retryable; 400/404 non-retryable; `code` fallback; non-object errors), and `executeWithRetry` retry/rotation/exhaustion. Integration-tested against the real `ApiKeyManager`. |
| `ProtocolConverter.test.ts` | Tests `OpenAI2AnthropicConverter`: `convertRequest` (system extraction, multimodal images, temperature-over-top_p, stop sequences, model mapping) and `convertResponse` (usage tokens, `stop_reason`→`finish_reason`, multi-block text join), plus a roundtrip. |

## For AI Agents
- These exercise main-process / shared `common/api` code (Node-style `process.env`), not renderer code; no DOM.
- Source under test is imported via the `@/*` alias (e.g. `@/common/api/ApiKeyManager`); `AuthType` comes from `@office-ai/aioncli-core`.
- `ApiKeyManager.test.ts` uses `vi.useFakeTimers()` and `advanceTimersByTimeAsync` for the 90s blacklist window — keep timer setup/teardown in `beforeEach`/`afterEach`, and `delete process.env.*_API_KEY` between tests to avoid leakage.
- Private members (`isRetryableError`, `options`) are reached via `(client as any)`; abstract `RotatingApiClient` is tested through a local concrete subclass with a `createClientFn`.
- `ClientFactory.test.ts` mocks the rotating clients and asserts on `mock.calls[i]` positional args (config is arg `[1]`, rotating options `[2]`, authType `[3]`).

## Dependencies
### Internal
`packages/desktop/src/common/api` (`ApiKeyManager`, `ClientFactory`, `RotatingApiClient`, `OpenAIRotatingClient`, `GeminiRotatingClient`, `AnthropicRotatingClient`, `OpenAI2AnthropicConverter`), `packages/desktop/src/common/utils` (`platformAuthType`, `platformConstants`)
### External
`vitest`, `@office-ai/aioncli-core`

<!-- MANUAL: notes below this line are preserved on regeneration -->
