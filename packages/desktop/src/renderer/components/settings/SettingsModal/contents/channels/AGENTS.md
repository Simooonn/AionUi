<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# channels

## Purpose
Renderer UI for the Settings "Channels" panel: lets users enable and configure messaging-platform integrations (Telegram, Lark, DingTalk, WeChat/Weixin, WeCom, plus coming-soon Slack/Discord and extension channels) that bridge external chat apps to AionUi agents. `ChannelModalContent` is the orchestrator; each `*ConfigForm` renders one channel's connection/pairing/model settings.

## Key Files
| File | Description |
| --- | --- |
| `ChannelModalContent.tsx` | Top-level panel. Loads plugin/WebUI status over the `channel`/`webui` IPC bridge, persists per-channel `defaultModel` via `configService` keys (`assistant.<channel>.defaultModel`), manages collapse state, and renders a `ChannelItem` per channel. Defines `useChannelModelSelection` (wraps `useGoogleModelSelection` for restore-without-toast) and handles built-in vs extension channel schemas (`ExtensionFieldSchema`). |
| `ChannelItem.tsx` | Wraps one channel in an Arco `Collapse.Item`; header is `ChannelHeader`, body is `channel.content`. |
| `ChannelHeader.tsx` | Collapse header: channel logo (built-in SVG map or resolved extension icon), title, "Coming Soon" tag, and enable `Switch` (disabled for coming-soon channels). |
| `TelegramConfigForm.tsx` | Telegram bot config: token input, agent/model selection, paired-user list, pairing-request approval. |
| `LarkConfigForm.tsx` | Lark (Feishu) config with credential fields, pairing, and external-doc links. |
| `DingTalkConfigForm.tsx` | DingTalk config: credentials, pairing, model/agent selection. |
| `WeixinConfigForm.tsx` | WeChat config with QR-login flow (`LoginState` machine, `qrcode.react` `QRCodeSVG`) and pairing. |
| `WecomConfigForm.tsx` | WeCom config; also consumes `IWebUIStatus` and `getBaseUrl` to surface the local WebUI callback endpoint. |
| `types.ts` | `ChannelConfig` (id, title, status, enabled, icon, `isExtension`, `content`) and `ChannelStatus` (`'active' | 'coming_soon'`). |

## For AI Agents
- Renderer-only code: no Node.js APIs. All backend access goes through `@/common/adapter/ipcBridge` (`channel`, `webui`) and `configService`; do not import from `@process/*`.
- The five `*ConfigForm` components share a near-identical prop contract: `{ pluginStatus: IChannelPluginStatus | null; modelSelection: GoogleModelSelection; onStatusChange(status) }`. `WecomConfigForm` adds `webuiStatus: IWebUIStatus | null`. Keep new forms consistent with this shape.
- Each form re-declares local `PreferenceRow` / `SectionHeader` helpers — intentional duplication; match the existing pattern rather than inventing a new layout.
- Channel-to-model wiring uses `useGoogleModelSelection` + `GoogleModelSelector`; restore persisted models via `initialModel` (not the `onSelectModel` callback) to avoid mount-time toasts.
- All user-facing strings use `useTranslation` (`settings.channels.*` keys). No hardcoded copy. Use `@arco-design/web-react` components and `@icon-park/react` icons only.
- Logos live in `@/renderer/assets/channel-logos/`; extension icons resolve through `resolveExtensionAssetUrl`. `BUILTIN_CHANNEL_TYPES` in `ChannelModalContent.tsx` gates built-in vs extension rendering.

## Dependencies
### Internal
- `@/common/adapter/ipcBridge`, `@/common/adapter/httpBridge` (`getBaseUrl`)
- `@/common/config/configService`, `@/common/config/storage`, `@/common/types/channel/channel`
- `@/renderer/hooks/agent/useAgents`, `@/renderer/hooks/agent/useModelProviderList`
- `@/renderer/pages/conversation/platforms/gemini` (`GoogleModelSelector`, `useGoogleModelSelection`)
- `@/renderer/utils/platform` (`resolveExtensionAssetUrl`, `openExternalUrl`), `@/renderer/utils/model/agentTypeSupportPolicy`
- `@/renderer/components/base/AionScrollArea`, `../../settingsViewContext`
### External
- `react`, `react-i18next`, `@arco-design/web-react`, `@icon-park/react`, `qrcode.react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
