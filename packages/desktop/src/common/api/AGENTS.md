<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# api

## Purpose

Provider-agnostic API client layer with multi-key rotation and time-based blacklisting. Wraps the OpenAI, Anthropic, and Gemini/Vertex SDKs behind a unified OpenAI-shaped `createChatCompletion` interface, converting requests/responses between protocols so callers can target any provider uniformly.

## Key Files

| File                           | Description                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                     | Barrel re-exporting `OpenAIRotatingClient`, `AnthropicRotatingClient`, `RotatingApiClient`, `ClientFactory` and their config/option types.                                                                                                                              |
| `ClientFactory.ts`             | `ClientFactory.createRotatingClient(provider, options)` picks a client by `AuthType`, injects proxy (`https-proxy-agent`), and normalizes new-api gateway base URLs via `normalizeNewApiBaseUrl`. Default fallback is OpenAI-compatible.                                |
| `RotatingApiClient.ts`         | Abstract base `RotatingApiClient<T>`. Holds an optional `ApiKeyManager`, runs `executeWithRetry`, retries on 401/429/503/5xx (`isRetryableError`), rotates keys, and re-inits the client. Defines `ApiError`, `RotatingApiClientOptions`, and unified completion types. |
| `ApiKeyManager.ts`             | Multi-key rotation with 90s blacklist (`BLACKLIST_DURATION`). Parses comma/newline-separated keys, picks a random start, writes the active key into `process.env[OPENAI/ANTHROPIC/GEMINI_API_KEY]`, and exposes `rotateKey`/`getStatus`.                                |
| `OpenAIRotatingClient.ts`      | Concrete client over the `openai` SDK. Adds `createChatCompletion`, `createImage`, `createEmbedding`; sets `HTTP-Referer`/`X-Title` headers.                                                                                                                            |
| `AnthropicRotatingClient.ts`   | Concrete client over `@anthropic-ai/sdk`. `createChatCompletion` converts via `OpenAI2AnthropicConverter`; `createMessage` is the native passthrough. Default model `claude-sonnet-4-20250514`.                                                                         |
| `GeminiRotatingClient.ts`      | Concrete client over `@google/genai` (also handles `USE_VERTEX_AI`). `createChatCompletion` converts via `OpenAI2GeminiConverter`; `generateContent` is native. Default model `gemini-1.5-flash`.                                                                       |
| `ProtocolConverter.ts`         | Generic `ProtocolConverter<TInput, TOutput, TResponse>` interface and `ConverterConfig` (defaultModel, modelMapping).                                                                                                                                                   |
| `OpenAI2AnthropicConverter.ts` | Converts OpenAI chat params ↔ Anthropic messages, including tools/tool_choice and image content.                                                                                                                                                                        |
| `OpenAI2GeminiConverter.ts`    | Converts OpenAI chat params ↔ Gemini generateContent format, including tools and image content.                                                                                                                                                                         |

## For AI Agents

- Main-process only: these clients call `process.env` and import Node SDKs (`https-proxy-agent`), so never import them from `renderer/`.
- Key rotation hinges on the raw `api_keys` string containing `,` or `\n`; a single key skips `ApiKeyManager` entirely. The active key is mirrored into `process.env`, so subclass `getCurrentApiKey` overrides prefer the env var when multiple keys exist.
- All concrete clients expose an OpenAI-shaped `createChatCompletion`; keep that surface stable when extending. Do new-provider work by subclassing `RotatingApiClient<T>` plus a `ProtocolConverter`, then wiring it into `ClientFactory`'s `AuthType` switch.
- `AuthType` comes from `@office-ai/aioncli-core`; map new providers there, not with ad-hoc strings.

## Dependencies

### Internal

- `../config/storage` (`TProviderWithModel`), `../utils/platformAuthType` (`getProviderAuthType`), `../utils/platformConstants` (`isNewApiPlatform`)

### External

- `@office-ai/aioncli-core` (`AuthType`), `openai`, `@anthropic-ai/sdk`, `@google/genai`, `https-proxy-agent`

<!-- MANUAL: notes below this line are preserved on regeneration -->
