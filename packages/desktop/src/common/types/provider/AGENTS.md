<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# provider

## Purpose

Shared TypeScript type definitions for AI model provider configuration and speech-to-text. `providerApi.ts` holds the wire-contract types for the `/api/providers/*` HTTP endpoints (a direct mirror of the Rust types in `crates/aionui-api-types/src/provider.rs`); `speech.ts` holds the config/request/result types for the speech-to-text feature. Imported by both Main and Renderer processes.

## Key Files

| File             | Description                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providerApi.ts` | Request/response interfaces for provider CRUD and diagnostics: `CreateProviderRequest`, `UpdateProviderRequest` (partial update), `FetchModelsResponse`, `FetchModelsAnonymousRequest`, plus health-check types `ProviderHealthCheckRequest`/`Response` and the `ProviderHealthCheckErrorKind` union. Uses snake_case fields to match the backend JSON contract. |
| `speech.ts`      | Speech-to-text types: `SpeechToTextProvider` (`'openai' \| 'deepgram'`), per-provider config (`OpenAISpeechToTextConfig`, `DeepgramSpeechToTextConfig`), the combined `SpeechToTextConfig`, and request/result/buffer types (`SpeechToTextRequest`, `SpeechToTextResult`, `SpeechToTextAudioBuffer`).                                                            |

## For AI Agents

- Type-only directory — no runtime code, no DOM or Node.js APIs, safe to import from either process.
- `providerApi.ts` fields are deliberately **snake_case** (`base_url`, `api_key`, `model_protocols`) to match the Rust backend wire format; do NOT camelCase them. If you change a type here, keep it in sync with `crates/aionui-api-types/src/provider.rs`.
- `speech.ts` types mostly use camelCase (`autoSend`, `detectLanguage`, `smartFormat`) — note the mix; this directory is not internally consistent on casing because each file mirrors a different contract.
- `providerApi.ts` reuses field shapes from `IProvider` / `ModelCapability` in `@/common/config/storage` (e.g. `model_health`, `bedrock_config`); reference those rather than redefining.

## Dependencies

### Internal

- `@/common/config/storage` — `IProvider`, `ModelCapability` (used by `providerApi.ts`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
