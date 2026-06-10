<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# channel

## Purpose
Shared TypeScript type definitions for AionUi's external messaging-channel integrations (e.g. bot plugins that connect to platforms like Telegram). Describes plugin status, user pairing/authorization, and per-user channel sessions used across both the main and renderer processes.

## Key Files
| File | Description |
| --- | --- |
| `channel.ts` | Declares four interfaces: `IChannelPluginStatus` (plugin id/type/name plus enabled/connected/error state, `activeUsers`, `botUsername`, and an `extensionMeta` block describing credential/config form fields for extension plugins), `IChannelPairingRequest` (pairing code with platform user id/type and expiry timestamps), `IChannelUser` (an authorized platform user bound to a `session_id`), and `IChannelSession` (a user's active session: `agent_type`, optional `conversation_id`/`workspace`/`chatId`, plus created/lastActivity timestamps). |

## For AI Agents
- Pure type module — no runtime code, no imports, safe to consume from either process. Keep it DOM- and Node-free.
- Note the deliberately mixed naming: snake_case (`last_connected`, `display_name`, `user_id`, `agent_type`, `conversation_id`, `session_id`, `created_at`) sits alongside camelCase (`activeUsers`, `botUsername`, `lastActivity`, `lastActive`, `authorizedAt`). The snake_case fields mirror an external/persisted channel-server schema; preserve existing field names when editing to avoid breaking serialization.
- `extensionMeta.credentialFields` and `configFields` share the same field-descriptor shape (`type` union of `'text' | 'password' | 'select' | 'number' | 'boolean'`); update both together if the descriptor changes.

<!-- MANUAL: notes below this line are preserved on regeneration -->
