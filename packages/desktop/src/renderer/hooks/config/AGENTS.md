<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# config

## Purpose

Renderer-side React hook for reading and writing typed application config keys. Bridges React components to the shared `configService`, giving live, reactive access to persisted settings.

## Key Files

| File           | Description                                                                                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useConfig.ts` | `useConfig<K>(key)` hook returning `[value, setValue]`. Subscribes to `configService` via `useSyncExternalStore` for reactive reads, and exposes a memoized async setter (`Promise<void>`). Fully generic over `ConfigKey`/`ConfigKeyMap`, so value and setter are type-narrowed per key. |

## For AI Agents

- Renderer-only code — no Node.js APIs. State sync uses React's `useSyncExternalStore`; the subscribe callback returns `configService.subscribe(key, onStoreChange)`'s unsubscribe handle, and the snapshot is `configService.get(key)`.
- Value may be `undefined` before a config key is loaded; handle that in consumers.
- New config keys go in `@/common/config/configKeys` (`ConfigKey` union + `ConfigKeyMap`); this hook needs no change to support them.

## Dependencies

### Internal

- `@/common/config/configKeys` — `ConfigKey`, `ConfigKeyMap` types
- `@/common/config/configService` — `configService` store (get/set/subscribe)

### External

- `react` — `useCallback`, `useSyncExternalStore`

<!-- MANUAL: notes below this line are preserved on regeneration -->
