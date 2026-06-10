<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# settings

## Purpose
Route-mounted settings pages for the renderer's `/settings/*` section. Most pages are thin wrappers that embed the corresponding `SettingsModal/contents/*ModalContent` component inside `SettingsPageWrapper`, so the same content renders both in the modal and as a full page. Larger self-contained pages (Skills Hub, Capabilities, extension settings, Pet) live here directly.

## Key Files
| File | Description |
| --- | --- |
| `CapabilitiesSettings.tsx` | `/settings/capabilities` page that merges Skills Hub and MCP/Tools into one `Tabs` view; reads/writes the `?tab=` query param (`skills` \| `tools`) and embeds `SkillsHubSettings` + `ToolsModalContent`. |
| `SkillsHubSettings.tsx` | Large page (~21KB) listing built-in/custom/extension skills via `ipcBridge`; supports search, delete, refresh, and `?highlight=` scroll-to. Accepts `withWrapper` prop so it can render standalone or embedded in the Capabilities tab. |
| `ExtensionSettingsPage.tsx` | `/settings/ext/:tabId` page that hosts extension-contributed settings UIs in an `<iframe>` (local) or `WebviewHost` (external URL); does `postMessage` locale init (`aion:init`) and activity-snapshot bridging. |
| `PetSettings.tsx` | Desktop-pet preferences (enable, size, DND, confirm bubble) using `configService.setLocal` + `systemSettings.*` IPC with optimistic rollback; shows a "desktop only" notice on non-Electron. |
| `ModeSettings.tsx` | Thin wrapper around `ModelModalContent` (model/provider config). |
| `SystemSettings.tsx` | Renders `SystemModalContent`, or `AboutModalContent` when path is `/settings/about`. |
| `WebuiSettings.tsx` | Thin wrapper around `WebuiModalContent`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `AgentSettings` | Agent configuration page (see `AgentSettings/AGENTS.md`). |
| `AppearanceSettings` | Theme/appearance settings page (see `AppearanceSettings/AGENTS.md`). |
| `AssistantSettings` | Assistant configuration page (see `AssistantSettings/AGENTS.md`). |
| `ToolsSettings` | MCP/tools settings page (see `ToolsSettings/AGENTS.md`). |
| `components` | Shared page-level building blocks, notably `SettingsPageWrapper` (see `components/AGENTS.md`). |

## For AI Agents
- Renderer-only code: no Node.js APIs. All main-process access goes through `@/common/adapter/ipcBridge` (`systemSettings`, `extensions`, `ipcBridge`) or `@/common/config/configService`.
- Most pages here are intentionally thin: real settings UI lives in `@/renderer/components/settings/SettingsModal/contents/`. When adding a setting, prefer editing the shared `*ModalContent` so it appears in both modal and page; add a page wrapper here only for new routes.
- Always wrap page content in `SettingsPageWrapper` (from `./components`) for consistent layout; pass `contentClassName` for width caps (e.g. `max-w-1100px`).
- State pattern in `PetSettings`: optimistic local update via `configService.setLocal`, then `.invoke()` with rollback on failure. Reuse this pattern for similar toggles.
- All user-facing strings use `useTranslation()` / `t(...)` i18n keys — never hardcode. Use `@arco-design/web-react` components and `@icon-park/react` icons only.
- `ExtensionSettingsPage` distinguishes local (`iframe`, sandboxed) vs external (`WebviewHost`) tabs and tolerates an empty extension-tab cache on first mount (defers "not found" error) — keep that guard if editing.

## Dependencies
### Internal
`@/renderer/components/settings/SettingsModal/contents/*` (ModelModalContent, SystemModalContent, AboutModalContent, WebuiModalContent, ToolsModalContent, SystemModalContent/PreferenceRow), `@/common/adapter/ipcBridge`, `@/common/config/configService`, `@/renderer/utils/platform`, `@/renderer/hooks/system/*`, `@/renderer/components/media/WebviewHost`, `@/renderer/components/base/AionScrollArea`, `./components/SettingsPageWrapper`.
### External
`react`, `react-router-dom` (useSearchParams/useParams/useLocation), `react-i18next`, `@arco-design/web-react`, `@icon-park/react`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
