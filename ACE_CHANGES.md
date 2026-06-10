# ACE_CHANGES — fork 改动清单

本仓库 fork 自上游 AionUi。为降低同步上游时的合并冲突，所有 fork 新增逻辑放在各进程下的 `ace/` 子目录；对**现有文件**的改动一律用 `// ace:start` … `// ace:end` marker 包裹，并登记在本清单。

> 同步上游后：`git grep -n "ace:start"` 复核每个挂载点是否仍然成立。

## 功能：导入 Claude Code / Codex CLI 会话（幂等，仅元数据，只读）

### 新增文件（纯新增，不与上游冲突）
| 文件 | 作用 |
|------|------|
| `packages/desktop/src/common/ace/types.ts` | CLI 会话导入相关类型 |
| `packages/desktop/src/process/ace/sessionTitle.ts` | Claude/Codex 共用的标题提取（跳过系统注入前缀） |
| `packages/desktop/src/process/ace/claudeParser.ts` | 解析 `~/.claude/projects/**/*.jsonl` → 会话元数据 |
| `packages/desktop/src/process/ace/codexParser.ts` | 解析 `~/.codex/{sessions,archived_sessions}/**/rollout-*.jsonl` → 会话元数据 |
| `packages/desktop/src/process/ace/importCliSessions.ts` | 幂等导入逻辑（Claude + Codex，GET 预过滤 + acp 落库） |
| `packages/desktop/src/process/ace/aceBridge.ts` | `ipcMain.handle('ace:import-cli-sessions')` 自注册 |
| `packages/desktop/src/renderer/ace/readonly.ts` | `isReadOnlyConversation` helper（含 cli 导入会话） |
| `packages/desktop/src/renderer/ace/useImportCliSessions.ts` | 渲染层 hook |
| `packages/desktop/src/renderer/ace/ImportCliSessionsButton.tsx` | 设置页导入按钮 |

### 现有文件挂载点（均有 `// ace:` marker）
| 文件 | 改动 | 行 |
|------|------|----|
| `packages/desktop/src/process/bridge/index.ts` | side-effect import `../ace/aceBridge` 触发注册 | 顶部 |
| `packages/desktop/src/preload/main.ts` | `electronAPI.importCliSessions` 暴露 IPC | electronAPI 对象内 |
| `packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx` | 2 处只读判断改用 `isReadOnlyConversation(conversation)` | ~225,226 |
| `packages/desktop/src/renderer/pages/team/components/TeamChatView.tsx` | 2 处只读判断改用 `isReadOnlyConversation(conversation)` | ~73,78 |
| `packages/desktop/src/renderer/pages/settings/SystemSettings.tsx` | 挂载 `ImportCliSessionsButton` | 导入按钮区 |

### 设计要点（实证验证）
- 落库用 `type='acp'`（后端唯一可新建类型；codex/legacy type 被后端 400 拒绝）。
- 来源 + 图标：`extra.backend='claude'|'codex'`（`getBackendKeyFromConversation` 读此字段，logo map 已含 claude/codex）。
- 幂等键：`extra.cli_session_id`（后端忽略 client `id` 自生成，故不能用主键；改用导入前 `GET /api/conversations` 按 `extra.cli_session_id` 预过滤）。
- 只读：`extra.cli_session_id` 存在 → 走现成 `LegacyReadOnlyConversation`（空消息占位、无发送框）。
