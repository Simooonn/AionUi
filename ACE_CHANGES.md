# ACE_CHANGES — fork 改动清单

本仓库 fork 自上游 AionUi。为降低同步上游时的合并冲突，所有 fork 新增逻辑放在各进程下的 `ace/` 子目录；对**现有文件**的改动一律用 `// ace:start` … `// ace:end` marker 包裹，并登记在本清单。

> 同步上游后：`git grep -n "ace:start"` 复核每个挂载点是否仍然成立。

## 功能：导入 Claude Code / Codex CLI 会话（幂等，仅元数据，只读）

### 新增文件（纯新增，不与上游冲突）

| 文件                                                            | 作用                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/desktop/src/common/ace/types.ts`                      | CLI 会话导入相关类型                                                         |
| `packages/desktop/src/process/ace/sessionTitle.ts`              | Claude/Codex 共用的标题提取（跳过系统注入前缀）                              |
| `packages/desktop/src/process/ace/claudeParser.ts`              | 解析 `~/.claude/projects/**/*.jsonl` → 会话元数据                            |
| `packages/desktop/src/process/ace/codexParser.ts`               | 解析 `~/.codex/{sessions,archived_sessions}/**/rollout-*.jsonl` → 会话元数据 |
| `packages/desktop/src/process/ace/importCliSessions.ts`         | 幂等导入逻辑（Claude + Codex，GET 预过滤 + acp 落库）                        |
| `packages/desktop/src/process/ace/aceBridge.ts`                 | `ipcMain.handle('ace:import-cli-sessions')` 自注册                           |
| `packages/desktop/src/renderer/ace/readonly.ts`                 | `isReadOnlyConversation` helper（含 cli 导入会话）                           |
| `packages/desktop/src/renderer/ace/useImportCliSessions.ts`     | 渲染层 hook                                                                  |
| `packages/desktop/src/renderer/ace/ImportCliSessionsButton.tsx` | 设置页导入按钮                                                               |

### 现有文件挂载点（均有 `// ace:` marker）

| 文件                                                                               | 改动                                                    | 行                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------ |
| `packages/desktop/src/process/bridge/index.ts`                                     | side-effect import `../ace/aceBridge` 触发注册          | 顶部               |
| `packages/desktop/src/preload/main.ts`                                             | `electronAPI.importCliSessions` 暴露 IPC                | electronAPI 对象内 |
| `packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx` | 2 处只读判断改用 `isReadOnlyConversation(conversation)` | ~225,226           |
| `packages/desktop/src/renderer/pages/team/components/TeamChatView.tsx`             | 2 处只读判断改用 `isReadOnlyConversation(conversation)` | ~73,78             |
| `packages/desktop/src/renderer/pages/settings/SystemSettings.tsx`                  | 挂载 `ImportCliSessionsButton`                          | 导入按钮区         |

### 设计要点（实证验证）

- 落库用 `type='acp'`（后端唯一可新建类型；codex/legacy type 被后端 400 拒绝）。
- 来源 + 图标：`extra.backend='claude'|'codex'`（`getBackendKeyFromConversation` 读此字段，logo map 已含 claude/codex）。
- 幂等键：`extra.cli_session_id`（后端忽略 client `id` 自生成，故不能用主键；改用导入前 `GET /api/conversations` 按 `extra.cli_session_id` 预过滤）。
- ⚠️ **已踩坑（全量重复导入）**：预过滤拉取失败时早期实现"静默当空集合继续"，恰逢列表接口 500 → 379 条全部重复创建。现已改为：列表拉取失败**直接中止导入**；返回 200 但为空时再用 better-sqlite3 直读 DB 交叉核对（防分页/接口回归造成的假空），DB 里已有导入会话同样中止。
- 只读：`extra.cli_session_id` 存在 → 走现成 `LegacyReadOnlyConversation`（空消息占位、无发送框）。

## 功能：导入会话真 resume 继续 + 懒同步消息历史（双通道）

> 实施计划：`.omc/plans/continue-imported-cli-sessions.md`（共识 rev4）；规格：`.omc/specs/deep-interview-continue-imported-cli-sessions.md`（两次运行时 spike 实证）。

### 架构（双通道）

- **记忆通道（真 resume）**：点开/每次发送前，main 进程 better-sqlite3 直写 aioncore 私有运行时表 `acp_session.session_id = extra.cli_session_id`（写前先驱逐该会话的 idle agent 进程——spike 证实温热 agent 持内存态会无视 DB 写）。aioncore 下次 prompt 时 `session/load` → CLI 加载原会话文件 → agent 全记忆，新轮次**追加进原 jsonl，不新建会话**。
- **展示通道（jsonl 增量同步）**：点开会话时把 CLI 会话文件新记录同步进 `messages` 表（终端侧 `claude --resume` 聊的历史也会出现）；跨通道排重用"内容键(position+规范化文本) + 10 分钟时间窗"双因子。
- **解锁**：`readonly.ts` 不再把 `cli_session_id` 当只读触发器，导入会话直接走 `<AcpChat>` 可聊。

### 新增文件（纯新增）

| 文件                                                             | 作用                                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/ace/aioncoreSchema.ts`             | **耦合 schema 单一事实源**（acp_session/messages 所需列清单 + PRAGMA 校验）                                                                                          |
| `packages/desktop/src/process/ace/sessionResume.ts`              | resume 接线：schema 防御→jsonl 检查→warmup 建行→驱逐 idle agent（SIGTERM→宽限→SIGKILL，进程组级）→幂等 UPDATE→重生复查                                               |
| `packages/desktop/src/process/ace/messageParser.ts`              | 解析单个 CLI 会话消息历史（text/thinking；tool 本版跳过）；导出 `findSessionFile`                                                                                    |
| `packages/desktop/src/process/ace/messageImporter.ts`            | 映射 + 直写 `messages` 表；INSERT OR IGNORE 自身幂等 + 跨通道双因子排重                                                                                              |
| `packages/desktop/src/renderer/ace/ensureCliMessagesImported.ts` | 渲染层统一入口 `ensureCliConversationReady` / `ensureCliResumeBeforeSend` + 降级可见提示（i18n `conversation.ace.cliResumeUnavailable`，瞬态失败连续 ≥3 次升级提示） |
| `tests/unit/ace-cli-resume.test.ts`                              | schema 防御 / 双因子排重 / 幂等 UPDATE 语义单测                                                                                                                      |

### 现有文件挂载点（均有 `// ace:` marker）

| 文件                                                                                     | 改动                                                                                                          | 备注                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `packages/desktop/src/process/ace/aceBridge.ts`                                          | `ace:import-conversation-messages` + `ace:ensure-cli-resume` 两个 handler                                     | ace 自有文件                         |
| `packages/desktop/src/preload/main.ts`                                                   | 暴露 `importConversationMessages` / `ensureCliResume`                                                         |                                      |
| `packages/desktop/src/renderer/pages/conversation/Messages/hooks.ts`                     | loadMessages 前 `ensureCliConversationReady(key)`                                                             |                                      |
| `packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx`          | `executeCommand` 内 sendMessage 前 `ensureCliResumeBeforeSend`                                                | ⚠️ 高变更上游文件，marker 为单行委托 |
| `packages/desktop/src/renderer/pages/conversation/platforms/acp/useAcpInitialMessage.ts` | 初始消息自动发送前 `ensureCliResumeBeforeSend`                                                                | 覆盖 guid 首条消息路径               |
| `packages/web-host/src/agent-process-registry.ts`                                        | 导出 `readAgentProcessRegistry`/`isAgentProcessTreeAlive`/`terminateAgentProcess`（复用进程组判活与终止原语） |                                      |
| `packages/web-host/src/index.ts`                                                         | 上述导出转发                                                                                                  |                                      |
| `packages/desktop/src/renderer/services/i18n/locales/*/conversation.json`                | 加 `ace.cliResumeUnavailable`（9 语言）                                                                       |                                      |

### ⚠️ aioncore 升级核对清单（深度 schema 耦合）

直写依赖以下**私有** schema，升级 `aioncoreVersion` 后必须核对（单一事实源：`process/ace/aioncoreSchema.ts`，PRAGMA 防御失败时自动降级 fresh-continue + UI 提示，不崩）：

- `acp_session(conversation_id, session_id, session_status, agent_backend)` —— resume 驱动表（migration v26）。
- `messages(id, conversation_id, msg_id, type, content, position, status, hidden, created_at)` —— 展示表。
- `conversations(id, updated_at, extra)` —— 侧栏排序键（渲染层 modified_at）。
- `runtime/agent-process-registry.json`（由 aioncore 异步写入）—— 驱逐判活依据。
- **TODO（环境侧，非代码）**：`~/.codex/config.toml` 中 `service_tier = "priority"` 已临时注释（内置 codex-acp 0.14.0 只认 fast/flex，读到 priority 启动失败）。aioncore 升级捆绑新版 codex-acp 后，恢复该行（文件内有同款 TODO 注释可定位）。

### 侧栏真实活跃时间排序（导入会话）

侧栏按 `conversations.updated_at` 倒序（渲染层 `getActivityTime = modified_at || created_at`），导入会话该值是**导入时刻** → 不反映原 CLI 会话的真实最后活跃。修正（写助手集中在 `aioncoreSchema.ts`）：

- **导入时批量回填**（`importCliSessions.ts` 末尾，best-effort）：`BACKFILL_IMPORTED_ACTIVITY_SQL` 把无应用内轮次（无非 `cli-` 行）的导入会话 `updated_at` 回拨为 `extra.cli_updated_at`；幂等。再点一次"导入 CLI 会话"即可修正存量排序。
- ⚠️ **已踩坑（整张列表 500）**：直写 aioncore 的 INTEGER 列时**绝不能绑浮点**——一行 REAL（来源：codex 的 `statSync().mtimeMs`）就会让 aioncore 的 i64 反序列化失败，`GET /api/conversations` 全量 500、侧栏全空。防线：`touchConversationActivity` 内 `Math.round`（咽喉点）、`tsMs` 数值分支取整、`mtimeMs` 源头取整、回填 SQL 本就 `CAST AS INTEGER`；有回归单测锁住。
- **懒同步时 touch**（`messageImporter.ts`）：取 jsonl 最新记录时间——有应用内轮次只允许前进（`TOUCH_FORWARD_SQL`），无则精确设置允许回拨（`TOUCH_EXACT_SQL`）→ 终端 `claude --resume` 聊过的会话下次点开自动上浮。

### 设计要点（两次 spike 实证）

- `conversations.extra.acp_session_id` 被 aioncore 无视并清空（**证伪**）；真正驱动 resume 的是内部 `acp_session.session_id`（**证实**：探针被追加进原终端 jsonl，无新建文件）。
- `session/load` 的 replay 只发流不落库 → UI 展示必须靠 jsonl 同步通道。
- aioncore 在错误清理时会把 session_id 清回 NULL → 每次打开/发送前幂等写回。**驱逐仅在 session_id 为 NULL/陈旧时执行**：若 row 已指向 cli_session_id，活 agent 是在该值生效后 spawn 并已加载正确会话的（日志实证），此时驱逐反而会切断 aioncore 在途 ACP 连接导致 Broken pipe → -32603 与 set_model "Active agent not found"（已踩坑修复）。
- 已知限制：原 cwd 已不存在（导入时 workspace 回退 home）的会话，CLI 按 cwd 派生项目目录找不到该 session → resume 被拒，aioncore 自动 session/new 降级为新会话（属预期降级）。
- 已知残余：UPDATE 后注册表复查只能收窄、不能消除 agent 重生竞态窗口（注册表由闭源二进制异步写）；发送前 re-ensure 是兜底。
- 已知局限：同 10 分钟窗口内逐字重复的消息可能被排重误跳（罕见）；规范化漂移退化为可见重复（不丢数据）；aioncore 写的 live thinking 行若非 `{content:string}` 形状，thinking 排重不会命中（退化为可见重复，方向安全）。Codex `threads.id==cli_session_id` 等价性待运行时验证，不成立时自动降级新会话并应记录于此。
- **已踩坑修复（Codex 历史不显示）**：Codex msgId 原为纯位置索引（`codex-0`），而 `messages.id` 是全局主键 → 所有 Codex 会话共用同一套 id，首个导入的会话独占全部行，其余会话 INSERT OR IGNORE 全部静默冲突（DB 0 行）。修复：msgId 改为 `codex-<sessionId>-<idx>`；导入时按会话清理旧版冲突行（`LEGACY_CODEX_ID` 正则识别 `cli-codex-<数字>-<数字>`），幂等重建。
