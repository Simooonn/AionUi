# ACE_CHANGES — fork 改动清单

本仓库 fork 自上游 AionUi。为降低同步上游时的合并冲突，所有 fork 新增逻辑放在各进程下的 `ace/` 子目录；对**现有文件**的改动一律用 `// ace:start` … `// ace:end` marker 包裹，并登记在本清单。

> 同步上游后：`git grep -n "ace:start"` 复核每个挂载点是否仍然成立。
>
> 想适配新的 CLI 后端（Gemini CLI / opencode 等）：需求模板见 [docs/ace/cli-adapter-requirements-template.md](docs/ace/cli-adapter-requirements-template.md)。

## 功能：导入 Claude Code / Codex CLI 会话（幂等，仅元数据，只读）

> 内部工作区排除（2026-10-13）：规格 `.omc/specs/deep-interview-live-verify-workspace.md`；计划 `计划/AionUi/实测验证工作区统一与导入排除计划/实测验证工作区统一与导入排除计划.md`。
>
> 不再复制原生会话（2026-10-14）：规格 `.omc/specs/deep-interview-native-session-reimport.md`；计划 `计划/AionUi/导入不再复制原生会话计划/导入不再复制原生会话计划.md`（含只读真实数据核对 `verify.sh`）。

### 新增文件（纯新增，不与上游冲突）

| 文件                                                            | 作用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/common/ace/types.ts`                      | CLI 会话导入相关类型                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/desktop/src/process/ace/parsers/sessionTitle.ts`      | Claude/Codex 共用的标题提取（跳过系统注入前缀）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/desktop/src/process/ace/parsers/claudeParser.ts`      | 解析 `~/.claude/projects/**/*.jsonl` → 会话元数据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/desktop/src/process/ace/parsers/codexParser.ts`       | 解析 `~/.codex/{sessions,archived_sessions}/**/rollout-*.jsonl` → 会话元数据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `packages/desktop/src/process/ace/importCliSessions.ts`         | 幂等导入逻辑（Claude / Codex / Gemini / OpenCode；**只读直读 DB 名单（含归档行）∪ `acp_session` sid（含孤儿行：AionUi 自己的会话不导入）+ 空名单 HTTP 绊线（只看已导入部分）** + acp 落库 + **导入末尾受保护重复清理**（含导入副本 vs 原生会话，原生恒保留；只走后端单条删除端点；禁止走 deleteWithLocalFiles / sessionFiles）） + **统一内部工作区排除**（`isAionUiInternalWorkspace` / `filterImportableSessions`：原始 cwd 任一路径段以 `.aionui` 开头，或出现 `Library/Application Support/AionUi*` 连续段即丢弃；`parseAllCliSessions()` 内生效，scan 与 import 共用；Claude 目录标记排除保留作第一道；Linux/Windows 的 app 内部数据根不在判据内） |
| `packages/desktop/src/process/ace/aceBridge.ts`                 | `ipcMain.handle('ace:import-cli-sessions')` 自注册；注入 `hasOpenTerminal`（直接导入 `@process/bridge/terminalBridge` 的 `getTerminalManager`，不走 barrel 以免成环；依赖 ace 新增但尚未登记的 `terminalBridge.ts` / `TerminalManager.ts`——既有登记缺口，本次仅注明）                                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/desktop/src/renderer/ace/readonly.ts`                 | `isReadOnlyConversation` helper（含 cli 导入会话）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `packages/desktop/src/renderer/ace/useImportCliSessions.ts`     | 渲染层 hook + 纯函数 `resolveScanAction` / `buildImportSummary` / `releaseRemovedConversations`（按钮只接线，node 单测覆盖）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `packages/desktop/src/renderer/ace/ImportCliSessionsButton.tsx` | 设置页导入按钮（0 条新会话时也执行导入以触发清理、无弹窗；toast 摘要 i18n；errors 写 console；对 `removedIds` 发 `conversation.deleted` 并释放终端）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tests/unit/process/aceImportDedupe.test.ts`                    | 名单 / schema 闸门 / 导入编排 / 重复清理（含原生认领 / 孤儿 / 自我认领 / fork / 生产基线分支 / 绊线不被掩盖；AC7 本地文件通道 automock 零调用、sidebar 其余端点零调用）/ `hasOpenTerminalIn`（真实 TerminalManager + fake pty）/ 渲染层纯函数单测（node:sqlite 适配 better-sqlite3，parser 全 mock）                                                                                                                                                                                                                                                                                                                                                    |
| `tests/unit/process/aceImportWorkspaceFilter.test.ts`           | 内部工作区排除：两种路径形态表测（含 `..` 归一、反斜杠分隔符、系统临时目录不排除的反向钉住）+ 四来源 scan/import 编排（`aioncoreSchema` 边界打桩；`create` 收到的 id 集合精确等于正常会话；基线中止 `failed` 只计可导入数）                                                                                                                                                                                                                                                                                                                                                                                                                             |

### 现有文件挂载点（均有 `// ace:` marker）

| 文件                                                                               | 改动                                                                                                                                                                                                                                   | 行                                                                                               |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/desktop/src/process/bridge/index.ts`                                     | side-effect import `../ace/aceBridge` 触发注册                                                                                                                                                                                         | 顶部                                                                                             |
| `packages/desktop/src/preload/main.ts`                                             | `electronAPI.importCliSessions` 暴露 IPC                                                                                                                                                                                               | electronAPI 对象内                                                                               |
| `packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx` | 2 处只读判断改用 `isReadOnlyConversation(conversation)`                                                                                                                                                                                | ~225,226                                                                                         |
| `packages/desktop/src/renderer/pages/team/components/TeamChatView.tsx`             | 2 处只读判断改用 `isReadOnlyConversation(conversation)`                                                                                                                                                                                | ~73,78                                                                                           |
| `packages/desktop/src/renderer/pages/settings/SystemSettings.tsx`                  | 挂载 `ImportCliSessionsButton`                                                                                                                                                                                                         | 导入按钮区                                                                                       |
| `packages/desktop/src/renderer/services/i18n/locales/*/conversation.json`          | `conversation.importCli.{done,summaryImported,summarySkipped,summaryFailed,duplicatesRemoved,duplicatesKept,separator}`（13 语言；fr-FR 连同既有 4 键新建 `importCli` 对象；`separator` 逐语言：zh `，`、ja `、`、fa `، `、其余 `, `） | `importCli` 对象（JSON 无 marker）                                                               |
| `AGENTS.md`                                                                        | Testing 段一行：实测验证统一工作区 `~/.aionui/live-verify`                                                                                                                                                                             | `## Testing` 段 "See the `testing` skill" 行之前；`<!-- ace:start live-verify -->` HTML 注释标记 |
| `.claude/skills/testing/SKILL.md`                                                  | 新增 "Live Verification Workspace" 小节                                                                                                                                                                                                | `## Two Test Environments` 表之后、`## Workflow` 之前；同名 HTML 注释标记                        |

### 设计要点（实证验证）

- 落库用 `type='acp'`（后端唯一可新建类型；codex/legacy type 被后端 400 拒绝）。
- 来源 + 图标：`extra.backend='claude'|'codex'`（`getBackendKeyFromConversation` 读此字段，logo map 已含 claude/codex）。
- 幂等键：`extra.cli_session_id`（后端忽略 client `id` 自生成，故不能用主键）。"已导入"名单由主进程 **只读直读** `aionui-backend.db` 的 `conversations` 表得到（`readImportedCliSessionIds`，`json_type = 'text'` 且非空），**天然包含已归档行**——后端 `GET /api/conversations` 排除 `archived_at` 非空的行，曾让归档后的会话被当成新会话重复导入。scan（确认弹窗计数）与 import 共用同一名单函数。名单另并入 `acp_session.session_id`（`readAcpSessionIds`，含孤儿行）：原生会话的 CLI 会话落在用户项目目录，曾被当成终端会话导入成副本（2026-10-13 正式库 12 对）；空名单绊线只看已导入部分，`acp_session` 非空不能掩盖 `conversations` 读空。
- ⚠️ **已踩坑（全量重复导入）**：早期实现在名单拉取失败时"静默当空集合继续"，恰逢列表接口 500 → 379 条全部重复创建。现规则：名单 **读不到或可疑即中止**（`db-unavailable` / `schema-mismatch` / `query-failed` 带原因进 errors）；DB 名单为空时再调一次 `GET /api/conversations` 做绊线——列表仍报有导入行 → `baseline-suspect` 中止，HTTP 失败 → `list-failed` 中止；两边都空才视为真正首次导入。
- 重复兜底清理（每次点击导入末尾，含 0 条新会话）：`findDuplicateImportLosers` 按同用户、同非空文本 sid 分组：导入行以 `extra.cli_session_id` 认领（`extra.fork IS NULL`），非导入（原生）会话以 `acp_session.session_id` 认领；有原生认领者则它为 survivor，否则最早导入（`created_at, rowid`）；loser 只能是导入行；loser 若有应用内消息（`messages.id NOT LIKE 'cli-%'`）/ cron 绑定 / 打开的内嵌终端（`hasOpenTerminal`，终端 UI 已于 `8ed831b84` 移除，当前恒 false）则保留并计入 `duplicatesSkipped` 提示；其余经 `DELETE /api/conversations/{id}`（归档行经 `DELETE /api/sidebar/archived/conversation/{id}`）删除——后端删除会终止 agent、级联 cron / artifacts / snapshots，**不碰本地 CLI 文件**；清理侧 schema 不匹配只记 `cleanup skipped`，不阻断导入；渲染层对 `removedIds` 发 `conversation.deleted` + `terminal.disposeByConversation`。
- 只读：`extra.cli_session_id` 存在 → 走现成 `LegacyReadOnlyConversation`（空消息占位、无发送框）。

## 功能：导入会话真 resume 继续 + 懒同步消息历史（双通道）

> 实施计划：`.omc/plans/continue-imported-cli-sessions.md`（共识 rev4）；规格：`.omc/specs/deep-interview-continue-imported-cli-sessions.md`（两次运行时 spike 实证）。

### 架构（双通道）

- **记忆通道（真 resume）**：点开/每次发送前，main 进程 better-sqlite3 直写 aioncore 私有运行时表 `acp_session.session_id = extra.cli_session_id`（写前先驱逐该会话的 idle agent 进程——spike 证实温热 agent 持内存态会无视 DB 写）。aioncore 下次 prompt 时 `session/load` → CLI 加载原会话文件 → agent 全记忆，新轮次**追加进原 jsonl，不新建会话**。
- **展示通道（jsonl replace-sync）**：点开会话时按 jsonl **重建**该会话全部 `cli-` 行（aioncore 写的 live 行不动；jsonl 已删除则跳过、保留既有导入），终端侧 `claude --resume` 聊的历史也会出现；跨通道排重用"内容键(position+规范化文本) + 10 分钟时间窗"双因子。**噪音过滤**：harness 注入记录不入库——Claude 侧跳过 `isMeta` 记录、`<local-command-*>`/`<task-notification>`/"Caveat:"/`[Assistant Rules]`/`[Request interrupted…]` 记录，剥离内嵌 `<system-reminder>` 块与 `[Image #N]` 附件占位（真图另行落盘展示），斜杠命令帧压缩为 `/cmd args` 一行；Codex 侧跳过 `<environment_context>`/`<turn_aborted>`/`<user_instructions>`/`# AGENTS.md instructions`/`# Files mentioned by the user`/`<image>` 帧用户记录。**压缩摘要折叠**：`isCompactSummary` 记录不丢弃，导成 `thinking` 行（content 带 `aceCompactSummary:true`、`status:'done'`）→ `MessageThinking` 的 ace 变体渲染为一行"会话已压缩"说明（i18n `conversation.ace.compactSummary`），默认折叠，展开为 MarkdownView（包一层 `whitespace-normal` + 紧凑块边距——`.body` 的 `pre-wrap` 会让 markdown 渲染间距翻倍）；普通导入 thinking 行也补 `status:'done'`（否则组件按"进行中"显示转圈计时）。**字面 marker 防御**：CLI 文本里字面出现的 `[[AION_FILES]]`（比如聊"本应用"的会话）会被 MessageText 当附件分隔符、把后文渲染成乱码文件卡——导入时用零宽空格隐形断开（`escapeFilesMarker`，仅 text 行）。**工具调用行**：Claude `tool_use`/`tool_result`（跨记录按 id 配对）与 Codex `function_call`/`function_call_output`（按 call_id 配对、退出码判 failed）导成 `acp_tool_call` 行，content 与 aioncore live 持久化形状逐字段一致（`update.tool_call_id/title/kind/status/raw_input/raw_output/content` + Claude 侧 `_meta.claudeCode.toolName`）→ 现成紧凑工具行/分组 UI 直接渲染（"已执行"形态）；与 live 行按 `tool_call_id` 精确排重；`raw_output` 截断 8000 字符、超大 `raw_input` 丢弃（标题已含要点）。replace-sync 同时自愈旧版已入库的噪音行与 Codex 位置型 id 因过滤产生的位移。**图片可预览**：两侧 jsonl 都把附件图片内联成 base64（Claude `image/source.data`、Codex `input_image` data URL），导入时解码落盘到 `<getDataPath()>/ace-cli-images/<sessionId>/<sha1>.<ext>`（内容寻址、幂等），消息正文追加 `[[AION_FILES]]` 标记挂路径——复用现成 MessageText→FilePreview→Arco Image 渲染链，点击可放大预览；纯图片轮次合成一条附件行（`cli-<msgId>-img`）。删除会话/项目时缓存目录随 CLI 文件一并清理（`unlinkSessionFiles` 白名单新增 `ace-cli-images` 根，目录递归删除）。
- **解锁**：`readonly.ts` 不再把 `cli_session_id` 当只读触发器，导入会话直接走 `<AcpChat>` 可聊。

### 新增文件（纯新增）

| 文件                                                             | 作用                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/ace/aioncoreSchema.ts`             | **耦合 schema 单一事实源**（acp_session/messages 所需列清单 + PRAGMA 校验）；另含导入专用的 `ACE_IMPORT_BASELINE_SCHEMA` / `ACE_IMPORT_DEDUPE_SCHEMA` + `hasImportSchema`（与共享闸门分开，按操作独立降级）及名单 SQL `readImportedCliSessionIds` / `readAcpSessionIds` |
| `packages/desktop/src/process/ace/sessionResume.ts`              | resume 接线：schema 防御→jsonl 检查→warmup 建行→驱逐 idle agent（SIGTERM→宽限→SIGKILL，进程组级）→幂等 UPDATE→重生复查                                                                                                                                                  |
| `packages/desktop/src/process/ace/messageParser.ts`              | 解析单个 CLI 会话消息历史（text/thinking/image/compact-summary/tool）+ harness 注入噪音过滤；导出 `findSessionFile`/`parseSessionFile`                                                                                                                                  |
| `packages/desktop/src/process/ace/messageImporter.ts`            | 映射 + 直写 `messages` 表；按会话 replace-sync `cli-` 行（幂等、自愈）+ 跨通道双因子排重                                                                                                                                                                                |
| `packages/desktop/src/renderer/ace/ensureCliMessagesImported.ts` | 渲染层统一入口 `ensureCliConversationReady` / `ensureCliResumeBeforeSend` + 降级可见提示（i18n `conversation.ace.cliResumeUnavailable`，瞬态失败连续 ≥3 次升级提示）                                                                                                    |
| `tests/unit/ace-cli-resume.test.ts`                              | schema 防御 / 双因子排重 / 幂等 UPDATE 语义单测                                                                                                                                                                                                                         |

### 现有文件挂载点（均有 `// ace:` marker）

| 文件                                                                                       | 改动                                                                                                          | 备注                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `packages/desktop/src/process/ace/aceBridge.ts`                                            | `ace:import-conversation-messages` + `ace:ensure-cli-resume` 两个 handler                                     | ace 自有文件                         |
| `packages/desktop/src/preload/main.ts`                                                     | 暴露 `importConversationMessages` / `ensureCliResume`                                                         |                                      |
| `packages/desktop/src/renderer/pages/conversation/Messages/hooks.ts`                       | loadMessages 前 `ensureCliConversationReady(key)`                                                             |                                      |
| `packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx`            | `executeCommand` 内 sendMessage 前 `ensureCliResumeBeforeSend`                                                | ⚠️ 高变更上游文件，marker 为单行委托 |
| `packages/desktop/src/renderer/pages/conversation/platforms/acp/useAcpInitialMessage.ts`   | 初始消息自动发送前 `ensureCliResumeBeforeSend`                                                                | 覆盖 guid 首条消息路径               |
| `packages/web-host/src/agent-process-registry.ts`                                          | 导出 `readAgentProcessRegistry`/`isAgentProcessTreeAlive`/`terminateAgentProcess`（复用进程组判活与终止原语） |                                      |
| `packages/web-host/src/index.ts`                                                           | 上述导出转发                                                                                                  |                                      |
| `packages/desktop/src/renderer/pages/conversation/Messages/components/MessageThinking.tsx` | compact-summary 变体：`aceCompactSummary` 行用固定一行标题 + 展开 MarkdownView                                |
| `packages/desktop/src/renderer/services/i18n/locales/*/conversation.json`                  | 加 `ace.cliResumeUnavailable` / `ace.compactSummary`（9 语言）                                                |                                      |

### ⚠️ aioncore 升级核对清单（深度 schema 耦合）

直写依赖以下**私有** schema，升级 `aioncoreVersion` 后必须核对（单一事实源：`process/ace/aioncoreSchema.ts`，PRAGMA 防御失败时自动降级 fresh-continue + UI 提示，不崩）：

- `acp_session(conversation_id, session_id, session_status, agent_backend)` —— resume 驱动表（migration v26）。
- `messages(id, conversation_id, msg_id, type, content, position, status, hidden, created_at)` —— 展示表。
- `conversations(id, updated_at, extra)` —— 侧栏排序键（渲染层 modified_at）。
- `conversations(id, extra)` + `acp_session(session_id)` —— 导入名单（已导入 ∪ AionUi 已绑定；`ACE_IMPORT_BASELINE_SCHEMA`，只读直读；不匹配 → **中止导入**）。
- `conversations(id, user_id, extra, created_at, archived_at)` + `acp_session(conversation_id, session_id)` + `messages(id, conversation_id)` + `cron_jobs(id, conversation_id)` —— 导入末尾重复清理（`ACE_IMPORT_DEDUPE_SCHEMA`；不匹配只降级为 `cleanup skipped`，不阻断导入）。
- **非 schema 核对**：(a) `POST /api/conversations` 创建后 `extra.cli_session_id` 仍被持久化（v0.2.2 已剥离 client 传入的 `extra.fork` / `extra.model`；若自定义键也被剥离，名单恒空 → 绊线 `baseline-suspect` 中止导入）；(b) `DELETE /api/conversations/{id}` 与 `DELETE /api/sidebar/archived/conversation/{id}` 的副作用（终止 agent、级联 cron / artifacts / snapshots）未变化。(c) 统一内部工作区排除仍位于 `parseAllCliSessions()`（scan/import 共用）；`~/.aionui/live-verify` 下由 Claude / Codex / Gemini / opencode 创建的验证会话——无论 CLI 记录的是 `~/.aionui/...` 还是解析后的 `~/Library/Application Support/AionUi/aionui/...`——导入后 0 新增。
- **`acp_session` 语义依赖（导入名单 / 原生认领）**：`session_id` 是会话的**当前 resume 指针，不是台账**——会被原地改写（`sqlite_acp_session.rs:262`，调用方 `acp_session_sync.rs:237`、`session_agent.rs:3513`）与清空（`sqlite_acp_session.rs:283`，调用方 `session_agent.rs:1369`/`:3495`、`acp_error_recovery.rs:259`、团队清上下文 `service.rs:2584`），被改掉的旧 sid 会脱离名单并作为终端会话导入、清理也关联不到。"删掉的会话不导回"靠**孤儿行**：`ConversationService::delete` 先删会话行、后调 `delete_for_user`（`service.rs:2656` 注释写明本意是删掉该行），后者（`sqlite_acp_session.rs:298-310`）要求会话行仍存在，实为空操作；迁移代码有清扫孤儿行的先例（`migrate_repair.rs:258`）。实际暴露面小：UI 删除原生会话本就会 unlink 其 jsonl（`sessionFiles.ts:89-96`）。升级核对：(1) 升级前、以及升级后**先启动一次新版**（迁移在启动时执行）再跑 `sqlite3 -readonly ~/.aionui/aionui-backend.db "SELECT count(*) FROM acp_session a WHERE typeof(a.session_id)='text' AND a.session_id <> '' AND NOT EXISTS (SELECT 1 FROM conversations c WHERE c.id=a.conversation_id)"`，数值不得下降；(2) 先 `git -C ~/wmm-code/ace-diy/AionCore fetch`，再 `git show <新版本>:crates/aionui-conversation/src/service.rs` 核对 `ConversationService::delete` 仍是先 `conversation_repo.delete` 后 `acp_session_repo.delete_for_user`，且 `crates/aionui-db/src/repository/sqlite_acp_session.rs` 的 `delete_for_user` 仍带 `EXISTS (SELECT 1 FROM conversations …)`；(3) 重跑 `计划/AionUi/导入不再复制原生会话计划/verify.sh`，`sdk-cli` 覆盖探针非 0 时逐条核对（终端 `claude -p`、OMC 工具也会产生 `sdk-cli` 会话），确认是 AionUi 来源才补救（见该计划附录三 ADR Follow-up 1）。需要新建会话的核对只在 dev 或沙箱里做，不在正式版建验证会话。
- ⚠️ **共用 CLI 会话的删除陷阱**：原生会话与其导入副本（以及导入会话的 fork）共用同一个 jsonl；侧栏 / 归档页删除走 `deleteConversationsWithFiles` → `resolveSessionFilePath` 按 `cli_session_id`（原生按 `acp_session`）解析并 `rmSync`，没有"仍被其他会话引用"检查——删任一边都会毁掉另一边的 Claude 上下文。处理受保护副本只走后端 `DELETE /api/conversations/{id}` 或只归档；共享守卫另行立项（`计划/AionUi/导入不再复制原生会话计划/` 附录三 ADR Follow-up 3）。
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

## 功能：删除会话/项目联动删本地 CLI 文件 + 项目目录失效置灰

> 计划：`.omc/plans/delete-and-gray-projects.md`（Architect+Critic 共识）。

### 新增文件（纯新增）

| 文件                                                        | 作用                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/ace/sessionFiles.ts`          | main 进程：`resolveConversationFiles`（删 DB 前解析路径+图片缓存目录，开库一次）、`unlinkSessionFiles`（删文件，**路径白名单仅限 ~/.claude/projects、~/.codex、`<getDataPath()>/ace-cli-images`**）、`checkWorkspacesExist`（置灰存在性） |
| `packages/desktop/src/renderer/ace/deleteWithLocalFiles.ts` | 渲染层编排：DB 优先 + order-zip（仅 unlink DB 删成功 id 的文件）                                                                                                                                                                          |
| `packages/desktop/src/renderer/ace/useStaleWorkspaces.ts`   | 项目存在性 hook（cancelled 守卫防 resolve-after-unmount）                                                                                                                                                                                 |
| `tests/unit/ace-delete-files.test.ts`                       | 路径白名单 / workspace 存在性 / order-zip 单测                                                                                                                                                                                            |

### 现有文件挂载点（均有 `// ace:` marker）

| 文件                                                                                         | 改动                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/ace/aceBridge.ts`                                              | 加 `ace:resolve-conversation-files` / `ace:unlink-session-files` / `ace:check-workspaces-exist` 三 handler                                                                                                                                      |
| `packages/desktop/src/preload/main.ts`                                                       | 暴露 `resolveConversationFiles` / `unlinkSessionFiles` / `checkWorkspacesExist`                                                                                                                                                                 |
| `packages/desktop/src/renderer/pages/settings/ArchivedSettings/deleteArchivedWithCleanup.ts` | 上游把侧栏"删除"改成"归档"后，硬删除入口移到设置的归档页；此文件把单条/团队/项目三种删除端点接回 `deleteConversationsWithLocalData`（先解析、删后端、再 unlink），并补回 `conversation.deleted` 事件与 PTY 释放（后端 HTTP 删除不经 main 进程） |
| `packages/desktop/src/renderer/pages/settings/ArchivedSettings/index.tsx`                    | 三个删除 onOk（单删/批量/删项目）改走 `deleteArchivedWithCleanup`，失败弹一次 `localFileDeleteFailed` 警告；团队行携带 `member_conversation_ids` 供级联清理                                                                                     |
| `packages/desktop/src/renderer/pages/conversation/GroupedHistory/index.tsx`                  | 项目区 displayName 在 workspace 目录不存在时灰显（`text-t-disabled`，仅样式）                                                                                                                                                                   |
| `packages/desktop/src/renderer/services/i18n/locales/*/conversation.json`                    | 加 `history.localFileDeleteFailed`（9 语言）                                                                                                                                                                                                    |

### 设计要点

- **DB 优先**：先解析文件路径（DB 行还在）→ 删 DB（既有可靠通道）→ 仅对删成功的 id unlink。避免"会话还在、历史文件没了"的可见坏态。
- **路径白名单**：`unlinkSessionFiles` 先 `path.normalize` 再判前缀（裸 `startsWith` 会被 `<root>/../../etc/x` 绕过——字面前缀匹配但 syscall 解析到别处；已加遍历测试锁住），并用规范化后的路径调 `rmSync`，杜绝"渲染层传任意路径删任意文件"。
- **order-zip 不变量**：依赖 `Promise.all` 保序，`dbResults[i] ↔ ids[i] ↔ refs[ids[i]]`；绝不直接遍历 refs key。
- **删除范围**：导入会话经 `extra.cli_session_id`，应用内新建经 `acp_session.session_id`+`extra.backend`，统一 `findSessionFile`。
- **置灰**：仅视觉（下次列表刷新生效）；文件删失败仍删 DB + 一次性提示（best-effort）。aioncore 不参与文件删除。

### 子功能：失效项目置灰向下传播 + 禁用新建 + 刷新按钮

> 规格：`.omc/specs/deep-interview-stale-project-gray-subtree-and-refresh.md`。

- `renderer/ace/useStaleWorkspaces.ts`（ace 自有）：返回 `{ stale, recheck }`；`recheck()` 用内部 nonce 强制重查（即便路径集合未变）。
- `GroupedHistory/ConversationRow.tsx`（marker）+ `types.ts`：新增 `stale` prop —— 名字 `text-t-disabled`、前置 logo `grayscale opacity-50`。
- `pages/conversation/components/WorkspaceCollapse.tsx`（marker）：新增 `dimmed` prop —— 文件夹图标 `text-t-disabled`。
- `GroupedHistory/index.tsx`（marker）：`isStale` 一处计算下传（文件夹/子会话名/logo 全置灰）；失效项目"新建会话(+)"按钮禁用（`opacity-40 cursor-not-allowed` + onClick/onKeyDown 短路 + `aria-disabled`），**"移除项目/..."不动**；"项目"区标题 `trailing` 加刷新按钮调 `recheck()`。
- i18n：`history.refreshProjects`（9 语言）。
- 唯一行为变更：失效项目的 + 按钮禁用；其余纯视觉。
- **已踩坑修复（Codex 历史不显示）**：Codex msgId 原为纯位置索引（`codex-0`），而 `messages.id` 是全局主键 → 所有 Codex 会话共用同一套 id，首个导入的会话独占全部行，其余会话 INSERT OR IGNORE 全部静默冲突（DB 0 行）。修复：msgId 改为 `codex-<sessionId>-<idx>`。旧版冲突行的专项清理（`LEGACY_CODEX_ID` 正则）已被 replace-sync（每次打开按 jsonl 重建本会话 `cli-` 行）取代——位置型 id 任意位移都能自愈。

## 功能：Gemini CLI 五条管线适配

> 计划：`.omc/plans/gemini-cli-adapter.md`（共识：Architect APPROVE + Critic APPROVED）；规格：`.omc/specs/deep-interview-gemini-cli-adapter.md`。

### 新增文件（纯新增）

| 文件                                                       | 作用                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/ace/parsers/geminiParser.ts` | 扫描 `~/.gemini/tmp/<dir>/chats/session-*.jsonl` → 会话元数据；`projectHash=sha256(projects.json 原始 key)` 反查 workspace |

> 同时把 `claudeParser.ts`/`codexParser.ts`/`sessionTitle.ts` `git mv` 进 `process/ace/parsers/`（目录 10 子项硬上限；三文件均为 ace 纯新增，无上游冲突）。

### gemini 分支挂点（全部在 ace 自有文件内，无新增上游 marker）

- `common/ace/types.ts`：`CliSource` 加 `'gemini'`；`ParsedCliItem` 加 `{kind:'tip'; tipType:'error'|'info'|'warning'}`。
- `messageParser.ts`：`findGeminiFiles`（header 感知遍历——文件名仅 8hex 前缀，候选必须读 header 全等，撞车跳过继续）、`parseGeminiFiles`（A1 双通道合并：最后一次 `$set.messages` 快照 + 顶层 typed 记录，按 record id 去重、过滤 `<session_context>` 种子[仅 user]）；新增导出 `findSessionFiles`/`parseSessionFiles`（多文件语义）。
- `messageImporter.ts`：`mapRows` 加 tips 分支（`type:'tips'`，content `{content,type}`，复用 MessageTips 现成渲染含无 icon 的 info 分支，零 UI/零 i18n）；改用 `findSessionFiles`+`parseSessionFiles`。
- `sessionFiles.ts`：删除白名单加 `~/.gemini/tmp` 根；`ResolvedFile` 加 `extraPaths`（gemini 一会话多文件须全删）；`isResolvableSessionId` 正则原样匹配 UUID（回归确认）。
- `renderer/ace/deleteWithLocalFiles.ts`：unlink 列表收集 `extraPaths`。
- `importCliSessions.ts`：sessions 数组并入 `parseGeminiSessions()`。

### ⚠️ Resume spike 实证结论（2026-06-11，dev 实例 + 真实会话 bd291494）

- aioncore 内置 gemini ACP agent（`gemini --experimental-acp`）可用；直写 `acp_session.session_id` 后重生 agent，aioncore 发 **`session/load` 且 gemini 正常应答**——resume 通道接通，机制与 claude/codex 一致。
- **持久化语义与 Claude 不同**：gemini 不追加原文件，而是**新开一个 chats 文件延续同一 header sessionId**（探针 user 轮次落入 `session-<新时间戳>-<同8hex>.jsonl`）。⇒ 定位/解析/导入/删除全部按"一个 sessionId 可跨多文件"实现：扫描器按 sessionId 聚合（一个会话一条）、解析器跨文件合并（A1 的 id 去重天然吸收）、删除收集全部文件。
- **续接文件的历史只存在于 `$set.messages` 快照**——A1 双通道合并从"漂移保险"升级为**现实必需**（Architect 反方论证成真）；合成 fixture + 真实续接文件双重覆盖。
- 端到端回复未完成：Google 模型 API 404 "Requested entity was not found"（终端裸跑 `gemini -p` 同样 404，默认模型已下线、交互态走 fallback 而 headless 不走）——**环境问题，与机制无关**。API 恢复后建议复验一轮带回复的记忆接续。
- 复证已知坑：手动 SIGTERM agent 不会让 aioncore 感知死亡，旧内存 session 上的 prompt 报 Broken pipe → -32603（第一次探针）——这正是 `sessionResume.ts` 驱逐设计存在的原因。

### 限制（NON-GOAL，待真实样本）

- gemini 工具调用/思考/图片记录本机 24 文件中不存在 → 本期宽容跳过 + unmapped 计数；出现真实样本后再补管线。
- `$set.summary`（compact-summary 的天然数据源）与 `$set.memoryScratchpad` 本期忽略。

### TODO（环境侧，非代码）

- **`~/.zshrc` 已加 `export GEMINI_MODEL=gemini-3.1-pro-preview`**（2026-06-12）：Gemini CLI 0.46 的默认模型已下线（Google API 404 "Requested entity was not found"），导致应用内新建/续聊 gemini 会话首句必失败（UNKNOWN_UPSTREAM_ERROR），且 agent 随之被驱逐 → 右上角切换模型也连带 502（"oneshot canceled"，请求落在死 agent 上；warmup 期 aioncore 自发的 `session/set_model` 实证可成功，机制本身没坏）。实测解析链 `argv.model || env.GEMINI_MODEL || settings.model?.name` 中 **settings 通道不生效**（嵌套/平铺两种写法均 404，疑似 CLI bug），`-m` 与 env 均可用。`~/.gemini/settings.json` 里同时保留了 `model.name`（当前无效，留作 CLI 修复后的接力）。Gemini CLI 修复 settings 模型配置或更新默认模型后，可移除 zshrc 行。注意：dev 从终端启动才继承 env；Dock 启动的安装版不继承（届时需 launchctl setenv 或等 CLI 修复）。

- **已踩坑（gemini 模型切换 404 连环）**：应用内模型列表来自 gemini agent 广播目录，其中含 **`gemini-3.1-pro-preview-customtools`** 这类带后缀变体——`session/set_model` 会确认成功，但下一句 prompt 在 Google API 上 404（"Requested entity was not found"）→ agent 被驱逐 → 再切任何模型都"切换模型失败"（请求落在死 agent 上）。且该坏模型 id 持久化在 `acp_session.session_config.runtime.current_model_id`，每次重生都复发。修复配方：`UPDATE acp_session SET session_config = json_set(session_config,'$.runtime.current_model_id','gemini-2.5-pro') WHERE ...`（2026-06-12 已修 3 个会话）。应用内实测可用：`gemini-2.5-pro`；终端实测可用：无后缀的 `gemini-3.1-pro-preview`。避免选带 `-customtools` 后缀的条目。

## 功能：opencode 五条管线适配

> 计划：`.omc/plans/opencode-cli-adapter.md`（共识 iteration 4：Architect APPROVE + Critic APPROVED）；规格：`.omc/specs/deep-interview-opencode-cli-adapter.md`（ambiguity 12%, PASSED）。

### 与既有三家的根本差异：存储是共享 SQLite 库

opencode 没有每会话文件——全部数据在 `<XDG_DATA_HOME|~/.local/share>/opencode/opencode.db`（drizzle，WAL）里：`session` 行自带 directory/title/time\_\*列，`message.data`/`part.data` 是 JSON。由此：

- **"会话文件存在" ⇒ "session 行存在"**：`findOpencodeFiles(sessionId)` 返回 `[opencode.db]` 当且仅当行存在——messageImporter 的 keep-imported 自愈与 sessionResume 的存在性门零改动复用。
- **🔴 整库误删防线（安全关键）**：该路径**绝不能**流入文件删除通道（删一个=毁全部会话）。三道防线：`ResolvedFile` 改判别联合（`common/ace/types.ts`），`'opencode'` 臂**结构上没有 path 字段**（编译期不可表达）；`unlinkSessionFiles` 白名单**不含** opencode 目录；双分支（imported+app-created）回归测试钉死。
- **唯一写通道**：`sessionFiles.deleteOpencodeSessionRows`——库路径硬编码、id 形态校验（`/^ses_[A-Za-z0-9]{8,}$/`，实证全部真实 id 为 `ses_`+26 位字母数字）、`PRAGMA foreign_keys=ON` 执行前断言（断言失败拒删，fail-loud 防孤儿行）、逐 id 自动提交（部分成功是预期契约）。级联实证：message/session_message/session_input/session_share/session_context_epoch/todo 直接 CASCADE，part 经 message 传递；**`session.parent_id` 无 FK** → 删父会话不级联子会话（有意行为：子会话本就是独立导入的 conversation；opencode 自身 UI 对孤儿 parent_id 的容忍度未验证）。

### 新增文件（纯新增）

| 文件                                                         | 作用                                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/ace/parsers/opencodeParser.ts` | 只读扫描 opencode.db → 会话元数据（全部导入含子/global/空会话）；message/part → ParsedCliItem；库路径单一事实源 `opencodeDbPath()` |
| `packages/desktop/src/process/ace/parsers/parseHelpers.ts`   | toolTitle/capText/boundedRawInput/imageFromDataUrl 共享工具（messageParser 与 opencodeParser 共用，保持依赖单向）                  |

### opencode 分支挂点

- `common/ace/types.ts`：`CliSource` 加 `'opencode'`；**`ResolvedFile` 判别联合**（`'file'` 臂 = 原 path/extraPaths/imageCacheDir 逐字段照搬；`'opencode'` 臂 = `{opencodeSessionId, imageCacheDir?}`）挪入 common 供主/渲染两侧共享。
- `messageParser.ts`：`findSessionFile(s)`/`parseSessionFiles` 加 opencode 分支；本地工具函数迁出至 `parsers/parseHelpers.ts`。
- `sessionFiles.ts`：`isResolvableSessionId` 按 source 分派（hex 规则原样保留给 claude/codex/gemini）；`resolveSessionFilePath` 的 imported/app-created 两分支均产 opencode 描述符（app-created 按 `extra.backend` n 路分派）；新增 `deleteOpencodeSessionRows`（纯核）/`deleteOpencodeSessions`（薄壳）。
- `aceBridge.ts`：加 `ace:delete-opencode-sessions` handler。
- `preload/main.ts`：ace marker 块内加 `deleteOpencodeSessions`（既有 marker 区，无新增挂载点）。
- `renderer/ace/deleteWithLocalFiles.ts`：本地 `ResolvedFile` 重复定义删除、改 import common 联合；按 `kind` 分流（file→unlink，opencode→DB delete，图片缓存走 file 通道）。
- `importCliSessions.ts`：sessions 数组并入 `parseOpencodeSessions()`。
- 噪音过滤：`synthetic:1` 标记文本一律跳过（opencode 自身注入标记）；`[Assistant Rules]` 前缀仅对 user 记录生效。`msgId = 'opencode-' + message.id`（`msg_…` 全局唯一，天然规避 codex 位置型 id 全局主键碰撞旧坑）。
- 驱动加载：opencodeParser 经 `createRequire` **同步惰性**加载 better-sqlite3（find/parse 处于同步分派链；纯函数可被 vitest 导入而不触发原生模块）。

### ⚠️ Resume spike 实证结论（2026-06-12，dev 实例 + 真实会话 ses_16cddf242ffe…）

- **1a 路由门通过**：aioncore warmup 接受 `backend:'opencode'`——`acp_session` 行 `agent_backend='opencode'`、`session_status='idle'`，agent 由内置适配器以 `opencode acp` 拉起；handshake 报 **`loadSession=true`**（session_capabilities 含 resume）。warmup 自建的新会话**直接写进 opencode.db**（佐证 ACP 模式与 CLI 共享同一存储）。
- **1b 写回门通过**：驱逐 idle agent → 直写 `acp_session.session_id=<真实 ses_ id>` → 应用内发一句：目标会话 message 行数 64→66（**追加进原 session，无新建**，总 session 数 36 不变）、`time_updated` 前进、回复准确说出原会话主题（zcf 卸载方法）——**全记忆真接续**。
- 复证已知坑：手动 SIGTERM agent 后第一句报 -32603（Broken pipe / 重生竞态），重试即过——发送前 re-ensure 兜底有效，机制与 claude/codex 一致。
- spike 副产物：opencode.db 多了 1 个 warmup 会话（`ses_148253247ffe…`，"New session - 2026-06-11T18:03…"）；探针两轮已留在目标真实会话内（无害问答）。

### 限制（NON-GOAL）

- `step-start`/`step-finish`/`patch`/`snapshot` part 为结构性记录，跳过不渲染（patch 的 diff 视图本期不做）。
- compact 摘要本机无样本（`time_compacting` 全空）→ 出现样本后接 `aceCompactSummary` 现成折叠行。
- 对 opencode.db 的 schema 耦合面（升级 opencode 后核对）：`session(id, directory, title, time_created, time_updated)` 列集 + message/part 的 data JSON 形状 + FK 级联拓扑；扫描器有 PRAGMA 列校验，mismatch 时**中止导入并报错**（不静默空集合——这是格式漂移信号）。但"库打不开"（如 WAL 恢复被只读句柄拒绝、驱动加载失败）**只软跳过 opencode 扫描并日志**，不连坐其他三家 CLI 的导入（评审修复：原实现会让整次多 CLI 导入一起中止）。

---

## 会话消息计数徽标 + 侧栏相对时间 + 处理中转圈淡蓝（2026-06-12）

仿 Codex 桌面端侧栏的三个纯展示特性（不改排序/行为）。计划：`.omc/plans/msg-count-and-relative-time.md`（共识迭代 3）。

### 新增文件（纯新增）

| 文件                                                               | 作用                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/renderer/ace/relativeTime.ts`                | 纯函数相对时间格式器：刚刚/X 分钟/X 小时/X 天/X 周前/X 月前/X 年前（混合"前"后缀风格）；固定除数 `floor(days/7)`/`floor(days/30)` 月数封顶 11/`floor(days/365)`；`ts<=0`/非有限 → 空串（杜绝"56 年前"）                                           |
| `packages/desktop/src/renderer/ace/useRelativeTimeTick.ts`         | 模块级共享 60s tick（`useSyncExternalStore`），订阅者引用计数，归零即 `clearInterval`                                                                                                                                                             |
| `packages/desktop/src/renderer/ace/useConversationMessageCount.ts` | 权威消息总数 hook：开会话时 `getConversationMessages({page:0, page_size:1})` 读 `PaginatedResult.total`；订阅 `turnCompleted`（按 `event.session_id` 过滤、500ms 防抖）回合结束后重取；失败/加载中返回 `undefined`（徽标整体不渲染，best-effort） |
| `tests/unit/ace-relative-time.test.ts`                             | 格式器全档位边界单测（59s/60s/59m/23h/24h/6d/7d/27d/30d/359d/**364d→11 月前封顶**/365d/730d）+ 退化输入 + 时钟漂移                                                                                                                                |

### marker 挂点

- `GroupedHistory/ConversationRow.tsx`：①导入 + 行内计算 `formatRelativeTime(getActivityTime(conversation), nowMs, t)`（与排序同源）；②尾部灰色小字时间标签——`batchMode`/`collapsed`/菜单可见/移动端/未读蓝点优先时隐藏，`group-hover:hidden` hover 让位菜单；③处理中 Spin 加 `[&_.arco-spin-icon]:text-[rgb(var(--primary-5))]`（Arco 默认 `.arco-spin-icon{color:rgb(var(--primary-6))}` 有自有规则，须更高优先级 arbitrary-variant 覆盖；primary-5 = 淡蓝语义 token，尺寸/触发条件不变）。
- `ChatLayout/index.tsx`：新增 `titleSuffix?: React.ReactNode` 属性，渲染为 title `FlexFullContainer` 的兄弟节点（其后、`headerExtra` 之前），仅 `!editingTitle` 时显示（重命名时让位）。移动端不渲染 desktopHeader → 徽标移动端不显示（by design，Follow-up）。
- `ChatConversation.tsx`：`ConversationMessageCountBadge` 组件（`count === undefined` 返回 null）；**两个** `ChatLayout` 调用点（aionrs 面板 `chatLayoutProps` + acp 主路径）均传 `titleSuffix`。

### i18n

`conversation.time.*` 8 key × 9 语言：`justNow/minutes/hours/days/weeksAgo/monthsAgo/yearsAgo/messageCount`（`{{count}}` 插值，无 `_one/_other` 复数后缀——repo 未配置 i18next 复数）。zh 保留混合后缀风格（低档无"前"、周/月/年带"前"）；非 CJK 语言用数字不变式缩写（en `{{count}}m` / `{{count}}w ago` 等）规避单复数问题。

### Follow-up（未做，记录在计划 ADR）

- 零 IPC 徽标：`useMessageLstCache`（`Messages/hooks.ts`）已收到 `result.total` 但丢弃，未来可外传省掉开会话时的 fetch（本期不动上游 hooks.ts）。
- 移动端徽标补齐；hover 绝对时间 tooltip（Non-Goal）。
- 上游缺陷（安全审查发现，非本期引入、未修）：`common/adapter/ipcBridge.ts` `getConversationMessages` URL 模板对 `conversation_id` 未做 `encodeURIComponent`（同文件 `getConversationMessage` 对 `message_id` 已编码）；本期徽标 hook 仅新增调用方。建议后续对齐修复。

---

## Lark 群通知 —— 会话完成/待决策/出错推送 24h 会话列表（2026-06-12）

多会话并行时的 Lark 群提醒。计划：`.omc/plans/lark-session-notify.md`（共识迭代 3）；规格：`.omc/specs/deep-interview-lark-session-notify.md`。

### 行为契约

- **触发**：`turnCompleted` 状态 ∈ {`ai_waiting_input`, `ai_waiting_confirmation`, `error`}（`runtime.pending_confirmations > 0` 强制视为待决策）；`stopped` 不触发。
- **频控**：60s 固定窗口防抖——首触发开窗、窗口内吸收不顺延、期满发一条最新快照；**期满空列表（会话删除/滑出 24h/列表级获取失败）零发送**。
- **列表**：最后活跃（`getActivityTime`，与侧栏排序同源）距今 ≤24h 的会话；排序 🟡待决策 > 🔴出错 > 🔵进行中 > 🟢已完成、同档最新在前；**单条 interactive 卡片消息**（蓝色 header 带总数；按用户反馈由纯文本改卡片），每会话两行——加粗图标化元信息行（序号/🤖类型/🕒秒档友好时间/💬消息总数=API total/状态/📁项目目录尾段，>6h 的会话状态去彩色圆点只留文字）+「会话名（15 字符超出…截断）：AI 摘要」行（二轮用户反馈定稿，规格：`.omc/specs/deep-interview-lark-card-layout-fix.md`）；30 行封顶尾行"…还有 N 条"；正文固定中文（不走 i18n，设置 UI 文案走 i18n×9）。
- **摘要**：最后一条用户消息（渲染端只取 string content——多模态/结构化跳过，不会把 JSON 串进摘要；预截 2000 字符，主进程侧再截一次）→ 任意协议 provider（三家 RotatingClient 统一 `createChatCompletion`）→ 5-30 字短语；**只对将渲染的前 30 行调模型**（排序后裁剪再摘要，结构性杜绝无界 LLM 调用），并发 5；按 `conversation:message` id 缓存（上限 500，**逐条淘汰最旧**而非整清；**只缓存模型产出**——截断兜底不入缓存，模型恢复后同消息自愈）；失败/超时(8s)/未配模型 → 截原文 30 字兜底，消息照发。
- **🔴 凭证红线**：app_id/app_secret/chat_id 走专用 IPC 直写主进程 ProcessConfig 本地文件——**绝不经渲染端 configService/ConfigStorage**（其写路径 `PUT /api/settings/client` 过 aioncore HTTP）；get-config 只回掩码（`has_secret` 布尔），secret 永不回读。
- **降级**：任何失败（凭证错/限流/网络/摘要超时）console 静默，本窗口放弃、下窗口自愈；token 401/auth code 强制刷新重试一次。

### 新增文件（纯新增）

| 文件                                              | 作用                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common/ace/larkNotify.ts`                        | 共享纯函数：秒档友好时间、24h 窗口判定、四档状态解析/权重排序、interactive 卡片构建（30 行封顶）、终态归一化；主/渲染两侧 + 单测共用                                                                                                              |
| `process/ace/larkNotifySender.ts`                 | 主进程发送器：tenant_access_token 缓存（提前 5min 刷新 + in-flight 并发去重 + 401 重试一次）、群消息（通知走 interactive 卡片，测试按钮走文本）、摘要（ClientFactory 多协议 + 消息 id 缓存 + 截断兜底）；fetch 可注入、零 electron 依赖（可单测） |
| `renderer/ace/larkNotify/windowController.ts`     | 60s 固定窗口控制器（fake-timers 可测）                                                                                                                                                                                                            |
| `renderer/ace/larkNotify/assembleSnapshot.ts`     | 快照组装：`getUserConversations({limit:10000})`（沿用侧栏单次调用形态，替代计划中的 cursor 循环）→ 24h 过滤 → 并发 5 取 total/最后用户消息（`order:'DESC'`）→ 行级降级 → 排序                                                                     |
| `renderer/ace/larkNotify/useLarkNotifyTrigger.ts` | 触发 hook：自维护终态登记表（sync hook 的 Set 表达不了四档）；**配置在窗口期满时重读**（比计划的"窗口启动时"更新鲜且无竞态，微偏差）                                                                                                              |
| `renderer/ace/larkNotify/LarkNotifySettings.tsx`  | 设置区块：开关/app_id/app_secret(password+占位)/chat_id/摘要模型选择（走 `useModelProviderList` 统一枚举——曾误读静态 `provider.models` 致下拉为空；空列表显示配置指引）/测试按钮                                                                  |
| `tests/unit/ace-lark-notify.test.ts`              | 30 测：时间档位、24h 边界、触发集（stopped 排除/pending 兜底）、状态优先级、四档排序、卡片排版（?总数/30 行封顶/interactive 发送）、固定窗口防抖、用户消息抽取（2000 截断/多模态空文本）、token 并发去重/缓存/401 重试、摘要缓存                  |

### marker 挂点

- ~~`common/config/configKeys.ts` + `storage.ts`~~：**安全评审后撤销**——键若注册进公共类型面，渲染端 `ConfigStorage`/`configService`（写路径过 aioncore HTTP）就能编译通过地读到 secret。改为 `aceBridge.ts` 内主进程私有的类型收窄访问器（`LarkConfigStore`），键在渲染端类型面不可达。
- `process/ace/aceBridge.ts`：4 个 handler（get-config 掩码 / save-config 空 secret 保留旧值 + 标识符字符集校验 + 凭证变更即重置 token 缓存 / test / send）；**send 入口对渲染端 rows 做信任边界再校验**（行数 ≤60、字段类型/长度/状态枚举、摘要文本重截 2000）——纯 ace 文件无需 marker。
- `preload/main.ts`：既有 ace marker 区 + 4 方法。
- `GroupedHistory/hooks/useConversationListSync.ts`：一行只读 getter `getGeneratingConversationIds`。
- `renderer/hooks/context/ConversationHistoryContext.tsx`：`useLarkNotifyTrigger()` 单点挂载（app 级 Provider，单实例锁保证无重复订阅）。
- `SettingsModal/contents/WebuiModalContent.tsx`：远程连接页新增第三个 **Groups** tab（WebUI / Channels / Groups），Lark 群通知设置挂在 Groups 下（浏览器 WebUI 模式不展示——依赖主进程 IPC）。（原 SystemModalContent 挂载已按用户要求迁移并移除）

### 前提与已知边界

- Lark 侧：开放平台自建应用开通 **im:message 发消息权限**、机器人已拉进目标群；chat*id 手动填写（oc* 开头）。
- 仅应用运行期间有效；60s 窗口内退出应用则本条不发。
- 触发会话可能因最后消息已超 24h 而不在自己触发的列表里（口径使然）。
- secret 以明文存主进程本地配置文件（与既有配置同级风险）；加密为 Follow-up。
- "发送测试消息"为手动验收项（真实打群）。

## Lark（国际版）渠道 + 群通知双平台支持（2026-06-12）

**背景**：Lark 国际版（open.larksuite.com）与飞书（open.feishu.cn）账号体系隔离、API 域名不同但协议同构。
上游 aioncore 把飞书域名硬编码在 Lark 插件里，国际版应用连长连接时被服务端拒绝
（`1000040351: Incorrect domain name`），配对请求永远不会出现。

**AionCore 补丁**（不在本仓库，位于 `../AionCore`，需配套编译）：

- `crates/aionui-channel/src/types.rs`：`PluginType` 新增 `LarkIntl`（serde/Display/from_str `"lark_intl"`）。
- `crates/aionui-channel/src/plugins/lark/api.rs`：`LarkApi::new` 接收 domain 参数（`FEISHU_DOMAIN` / `LARK_INTL_DOMAIN`），
  五个 REST/WS 端点 URL 改为实例字段拼接。
- `crates/aionui-channel/src/plugins/lark/plugin.rs`：`LarkPlugin` 持有 `platform` + `domain`，
  新增 `new_international()`；`platform` 穿透 ws_loop → handler，事件消息携带正确的 platform_type。
- `plugins/mod.rs` / `manager.rs` / `message_service.rs` / `formatter.rs`：`LarkIntl` 分支
  （工厂注册、默认名 "Lark Bot (International)"、ConversationSource/格式化复用 Lark）。
- 部署：`cargo build --release` 后替换 `resources/bundled-aioncore/darwin-arm64/aioncore`（已 ad-hoc 签名）。
  升级上游 aioncore 版本时需 rebase 该补丁（或等上游合并 domain 支持 PR）。

**AionUi 侧（本仓库，ace 标记）**：

- `common/config/storage.ts` / `configKeys.ts` / `configMigration.ts`：注册 `assistant.lark_intl.defaultModel` / `.agent`
  偏好 key（非敏感，走 aioncore client_preferences，与上游渠道设计一致）。
- `channels/LarkConfigForm.tsx`：参数化 `platform?: 'lark' | 'lark_intl'`（配对/用户过滤、enable/test plugin_id、
  配置 key、开发者后台链接按平台切换）。
- `channels/ChannelHeader.tsx`：`lark_intl` 复用 Lark 品牌 logo。
- `channels/ChannelModalContent.tsx`：Channels 列表在 Lark 下方新增 **Lark（国际版）** 平行卡片
  （独立状态/开关/模型选择，plugin_id `lark_intl`）。
- i18n：`channels.larkIntlTitle/larkIntlDesc`、`lark.devConsoleLinkIntl` ×9 locales。

**Groups 群通知双平台**（本仓库自有模块，无标记）：

- `common/ace/types.ts`：`AceLarkNotifyConfig/Masked/Save` 新增 `domain?: 'feishu' | 'lark'`（缺省 feishu，向后兼容）。
- `process/ace/larkNotifySender.ts`：REST base 按 domain 解析；token 缓存 key 含 domain（同 app_id 跨平台不串用）。
- `process/ace/aceBridge.ts`：save/get 透传 domain（枚举闸门）；domain 变更同样重置 token 缓存。
- `renderer/ace/larkNotify/LarkNotifySettings.tsx`：新增"平台"下拉（飞书 / Lark 国际版）；i18n `larkNotify.domain*` ×9。
- 测试：`tests/unit/ace-lark-notify.test.ts` 新增 larksuite 路由 + 缓存隔离用例（30 用例全绿）。

## 目录级会话状态汇总标志（2026-10-12）

> 规格：`.omc/specs/deep-interview-folder-status.md`。

折叠项目目录后，内部"进行中 / 等待操作 / 完成未读"的会话标志一起被藏起来，看不出哪个项目还在干活。现在目录名后汇总组内会话**实际可见**的标志，多种状态并列、同类只显示一个。

- `GroupedHistory/utils/folderStatusBadges.ts`（ace 新增）：纯函数。`resolveRowStatus` 复刻 ConversationRow 的优先级（waiting > generating > unread）取单会话**可见**的那一个；`collectFolderStatuses` 取组内去重并集，按固定顺序返回。读 `group.conversations` 而非已渲染的行，所以折叠态结果与展开态一致。
- `components/WorkspaceCollapse.tsx`（marker）：新增 `badges` 插槽，位于 header 与 trailing 之间。`group-hover:hidden` —— 与 ConversationRow 未读点同款处理，hover 时让位给尾部 `+` / `⋯`（trailing 固定 22px，按钮展开会左溢出）。
- `GroupedHistory/index.tsx`（marker）：`renderFolderStatusBadges()` 一处计算，置顶区与项目区共用 `renderProjectGroup` 自动同享。batchMode 下行标志全隐藏，目录同步不显示。视觉常量直接复用 ConversationRow（`text-warning animate-wiggle` / `[&_.arco-spin-icon]:text-#2C7FFF` / `bg-#2C7FFF` 圆点）——注意本项目 Arco `primaryColor` 是灰色，不能用 `--primary-*` token。
- i18n：`history.folderStatusWaiting` / `folderStatusGenerating` / `folderStatusUnread`（13 语言），仅作 `aria-label`。
- 纯展示，无新交互：不加点击定位、不加批量已读、不改状态来源 / 未读清除 / 持久化 / 侧栏窄模式。
- 测试：`tests/unit/conversation/folderStatusBadges.test.ts`（聚合规则 11 例）+ `workspaceCollapseBadges.dom.test.tsx`（插槽 5 例），16 例全绿。

## 侧栏恢复直接删除（与归档并列）（2026-10-12）

> 规格：`.omc/specs/deep-interview-restore-direct-delete.md`。

上游 `18e4fddd7`（PR #4126，archive-first）把侧栏会话菜单、项目菜单、批量工具条里的"删除"原地换成了"归档"，想删只能先归档、再去设置的归档页永久删除。现在三处都恢复直接删除，**归档原样保留**，两者并列；只做加法，不回退上游代码。

- `GroupedHistory/hooks/useConversationActions.ts`（marker）：新增 `handleDelete` / `handleBatchDelete` / `handleDeleteProject`，共用 `confirmDelete` + `deleteConversations`。走 `deleteConversationsWithFiles`（先解析本地数据 → `conversation.remove` → 只清理删成功的行），复用上游留下但无人调用的 `removeConversation`（发 `conversation.deleted`、释放 PTY、删当前会话回首页）。单条 remove 抛错时转成 `false`，不让一条失败拖垮整批的本地清理；部分失败提示"成功 N / 失败 M"，不误报全成功。
- 运行中会话：确认框追加"会中断任务"提示（generating 或等待确认都算）。**不在前端单独 cancel**：aioncore v0.2.2 `ConversationService::delete` 在删行前先跑 `OnConversationDelete` 钩子，`WorkerTaskManagerImpl` 会 kill 该会话的 agent 进程；前端 `conversation.stop` 需要 `activeTurnId`，没打开过的会话拿不到。
- 删除项目 = 删除该目录分组里的会话。分组只含未归档会话，所以**已归档会话保留**；侧栏项目分组只来自用户选定的 `custom_workspace`，后端只会清理 `<workspace_root>/conversations/**/*-temp-<会话id>` 自动临时目录，**项目目录不会被删**。
- `GroupedHistory/index.tsx`（marker）：项目菜单加"删除项目"、批量工具条加"批量删除"（独占一行，避免窄侧栏挤压文案）、把运行态判断传给 hook。`ConversationRow.tsx` / `types.ts`（marker）：行菜单"归档"后加"删除"（`onDelete`）。确认框统一用 Arco `Modal.confirm` + danger 按钮，不新增原生交互 HTML。
- 行菜单去掉 200px 高度上限：Arco 默认 `.arco-dropdown-menu { max-height: 200px; overflow: auto }`，行菜单 6–8 项时最后几项（归档 / 删除）藏在滚动条后面，看起来像"没有删除"。`<Menu className='sider-row-menu'>` + `styles/arco-override.css` 一条作用域规则，照搬 `explorer-context-menu` 的写法，其他下拉不受影响。
- 删除项用语义色 `text-danger`。注意 `text-[rgb(var(--danger-6))]` 这种任意值写法 UnoCSS **不生成规则**（开发版实测文字是黑的），仓库里另有 7 处同样写法未处理。
- i18n：复用已有 `deleteTitle` / `deleteConfirm` / `batchDelete*` / `deleteSuccess` / `deleteFailed` / `localFileDeleteFailed`；新增 `history.deleteIrreversibleHint` / `deleteRunningHint` / `deleteRunningCountHint` / `deletePartialFailed` / `deleteProject` / `deleteProjectConfirm`（13 语言）。
- 测试：`tests/unit/renderer/conversation/useConversationActionsDelete.dom.test.ts`（11 例：确认前不删、DB 优先再清理、删当前会话回首页、运行中提示、批量、项目只删分组行且不调归档、部分失败、全失败、本地文件清理失败提示）+ `ConversationRowCronMenu.dom.test.tsx` 补 1 例（删除项在归档之后）。
- 开发版实测（CDP 驱动真实侧栏，只操作脚本新建的 `DELTEST-*` 会话，结束自动清理）：行菜单取消不删 / 确认删除、批量删除后退出批量模式、项目删除只删 2 个未归档会话且归档会话与 `/private/tmp` 项目目录仍在，10/10 通过；行菜单删除项无需滚动可见、删除项为红色。运行中会话的中断未实测（需真实发消息起 agent），依据是上面的后端源码。

## AskUserQuestion 待答保活与卡住会话脱困（2026-10-12）

> 规格：`.omc/specs/deep-interview-askuserquestion-stuck.md`；共识计划：`计划/AionUi/AskUserQuestion待答保活与脱困/AskUserQuestion待答保活与脱困.md`（`.omc/plans/askuserquestion-keepalive-consensus-plan.md` 为同内容镜像）。

Claude（direct-CLI）会话里 agent 调 `AskUserQuestion` 后若 180 秒内没作答，aioncore v0.2.2 的孤儿回合看门狗（`background_stream.rs` `ORPHAN_TURN_IDLE_MS`）会把回合标记结束、侧栏等待标记消失；续开回合不推进 turn_gen、status 恒为 Finished，10 分钟后空闲扫描把进程杀掉，之后作答一律 404 "No active agent"，而问答卡片没有 catch，点击静默失败。2026-10-10 全天 8 次提问全部如此。

**后端（AionCore，非本仓库）**：`resources/bundled-aioncore/darwin-arm64/aioncore` 换成本地编译版（manifest `sourceType: local-build`，分支 `fix/pending-ask-keepalive`，基于 `v0.2.2`，commit `23093f23` + `a3fe93da` + `31421af2`）：`collect_idle` 对 `get_confirmations().len() > 0` 的 agent 豁免（`reason=PendingUserInput`）；`BackgroundStreamWatcher` 新增 `pending_probe`（Session agent 的 `Weak` 句柄）与 `orphan_idle`，超时时 pending > 0 则继续喂帧；`startup_recovery` 对未答的 AskUserQuestion 行返回 `KeepPendingUserPrompt` 不再结清（否则重启后派生卡片永远匹配不上），但其后已有用户消息时仍结清；`claude_conn` 在进程退出时清空 `pending_perms`（否则死任务会被空闲豁免永久保留）。`node scripts/prepareAioncore.js` 会用官方包覆盖这份二进制，上游 PR 合并前不要跑。

### 新增文件（纯新增，`renderer/ace/askRecovery/`）

- `useSendBoxSubmitListener.ts`：挂载时按会话登记（`hasSendBoxFor` / `registerSendBox`，替代全局 `listenerCount`），监听 `emitter` 的 `sendbox.submit`，按会话过滤，收到即 `ack()`，沿用 `onSendHandler` 的忙碌闸门（`!supportsMidturnDelivery && isBusy` → reject），经 `executeCommand` 走既有发送管线（含 `ensureCliResumeBeforeSend`、`markSend*`、team 路由）。
- `answerClock.ts`：`markAnswered` / `getLastAnsweredAt` / `onAnswered` / `resetAnswerClock`，记录每个会话最近一次成功作答时刻。
- `askFailureMemo.ts`：派生卡片重发失败时记住错误文案和失败的提交载荷；卡片因发送管线置忙而卸载、再派生时立即恢复错误行、两个按钮和已选答案，重试可直接重跑。
- `submitAskAnswer.ts`：提交策略——实时卡先 `answerAsk`；失败或历史卡则 `confirmation.list` 按题干文本匹配再 `answerAsk`；仍未命中时，**只有存在失败的 `answerAsk` 尝试**（答案可能已送达、仅响应丢失）才只读 `conversation.get` 的 `runtime.has_task`（**不得用 `ensureRuntime` 探活**），`true` 报错交给用户选「重试／作为消息发送」，`false` 才重发；历史卡没有过尝试（答案不可能已送达，且重开会话时 `runtime/ensure` 已拉起新进程令 `has_task` 恒为 true）则直接经 `sendbox.submit` 以普通消息重发（目标会话没有登记的发送框时直接报错；10 秒只等 `ack`）；`force: 'message'` 跳过以上判断；重发文案全部走 i18n（`buildResendMessage`）。
- `answeredAskRows.ts`：纯函数，`collectAnsweredAskRowIds` 找出“仍标记 running 但其后已有用户消息”的 AskUserQuestion 行，`settleAnsweredAskRow` 生成展示用的已完成副本（不改 store），让 View Steps 不再因这类行常驻转圈。
- `deriveStaleAsk.ts`：纯函数，从历史里尾部未答的 `tool_call{name:'AskUserQuestion', status:'work', content.status:'running'}` 派生 `type:'ask', source:'history'` 卡片；守卫 `hydrated / !isProcessing / !hideSendBox / type==='acp'`、作答后 5 秒窗口、其后无 `position:'right'`、无 `created_at>=q` 的 ask、无同 id 终态 `acp_tool_call`。
- 测试 `tests/unit/ace-ask-recovery/`：`AcpSendBoxSubmitEvent.dom.test.tsx`（7）、`submitAskAnswer.test.ts`（15）、`MessageQuestion.dom.test.tsx`（9）、`deriveStaleAsk.test.ts`（33，含 1e57be0e / 4ed3b3ce 真实行夹具与 N1 回归）、`MessageListStaleAsk.dom.test.tsx`（5，经真实消息 store）。

### marker 挂点（均有 `// ace:` marker）

- `renderer/utils/emitter.ts`：`EventTypes['sendbox.submit']`（`conversation_id / input / ack / resolve / reject`）。
- `packages/shared-scripts/src/prepare-aioncore.js`：`AIONUI_BACKEND_LOCAL_BUNDLE_DIR` 指向打包目标目录本身时直接报错（脚本会先清空目标目录再复制，指向自身会毁掉补丁二进制）；本地打包用法：`AIONUI_BACKEND_LOCAL_BUNDLE_DIR=/Users/wmm/wmm-code/ace-diy/aioncore-local-bundle/darwin-arm64 bun run build-mac:arm64`。
- `packages/shared-scripts/src/prepare-aioncore.js` + `scripts/prepareAioncore.js` 头注释：下载源改为 `AIONUI_BACKEND_OWNER` / `AIONUI_BACKEND_REPO` 环境变量，默认 `Simooonn/AionCore`（带补丁的 fork；fork 无 release，须配 `AIONUI_BACKEND_RUN_ID` 指向 fork 的 Manual Build 运行号，否则脚本直接失败而不是用官方包覆盖补丁二进制）。
- `renderer/pages/conversation/platforms/acp/AcpSendBox.tsx`：导入并在 `executeCommand` 定义后调用 `useSendBoxSubmitListener`。
- `common/chat/chatLib.ts`：`IMessageAsk.content.source?: 'live' | 'history'`。
- `renderer/pages/conversation/Messages/MessageQuestion.tsx` + `.module.css`：提交/拒答改走 `submitAskAnswer`，新增 `submitting` / `failure` / 重试 / 作为消息发送 / 已作为消息发送 / 历史卡顶部提示（testid `message-question-stale-hint|error|retry|resend`）。
- `renderer/pages/conversation/Messages/MessageList.tsx`：`tool_call` 入组前经 `settleAnsweredAskRow` 替换已答提问行的展示副本；`processedList` 末尾注入 `deriveStaleAsk` 结果；`useMemo` 依赖补 `hydrated / isProcessing / hideSendBox / type / lastAnsweredAt / answerClockTick`；订阅 `onAnswered` 并在 5 秒窗口内挂一次性定时器重算。

### i18n（`messages` 模块，13 语言）

`askResendBlocked`、`askStaleHint`、`askAnswerFailed`、`askRetry`、`askResendAsMessage`、`askResent`、`askResendUnconfirmed`、`askResendHeader`、`askResendLine`、`askResendSeparator`、`askResendDecline`。

### 已知边界

- 派生卡片只是显示层启发式；提交永远以后端 `confirmation.list` / `has_task` 为准。
- 派生卡片显示期间 `lastMessageId` 指向它（与实时问答卡一致），前一条文本上的分叉入口会暂时隐藏。
- 作答（重发）后该 AskUserQuestion 行在库里仍是 `work/running`；前端把“其后已有用户消息”的这类行视为已结清（`answeredAskRows.ts`），后端启动恢复也会在下次重启时把它结清，View Steps 不再常驻转圈。
- 规格验收 C 点名的两个存量会话后面已有用户消息，按规则不再出卡（用户已确认改为夹具单测）。

## 功能：上下文用量口径统一（HUD ctx% / tooltip）（2026-10-12）

> 共识计划：`.omc/plans/context-usage-correction-consensus-plan.md`；规格：`.omc/specs/deep-interview-context-usage-correction.md`。

发送框上的用量圆环和 sendbox 底部 OMC HUD 的 `ctx:` 段讲的是同一件事，口径却各自一套：HUD 的**分母**按模型 id 猜（文案里有 `[1m]` 才算 1M，否则一律 200K）、**分子**漏掉 output，拿不到本会话 transcript 时还会回放工作区 OMC 缓存里**另一个会话**的整行 HUD；圆环的阈值又是自己的 `>70` / `>90`。同一时刻两处能差出十几个百分点，甚至显示别人的用量。现在统一到 aioncore 的口径：

- **分母**：HUD 不再按模型 id 猜窗口，改用 agent 上报、圆环已经在用的那个 `messageState.context_limit`（`AcpChat.tsx` → `HudStatusBar` → `ace:hud-statusline` IPC 的 `contextLimit` 入参）。窗口未知时 HUD 剥掉 `ctx:` 段，与圆环"窗口未知就不画百分比"一致。
- **分子**：取 transcript 尾部最后一条主链 assistant 的 `input + cache_creation + cache_read + output` 四项之和（此前漏 output），与 aioncore 算 `used` 同式，并以 `used_percentage` 交给 OMC。
- **不回放缓存**：没有会话身份（`conversationId` 缺失 / transcript 定位失败）时 IPC 直接返回 `null`、整条 HUD 不显示，不再退回 `.omc/state/hud-stdin-cache.json`——那份缓存属于最后一个活跃会话，会把别人的用量画在当前会话下。
- **阈值**：圆环改为 `>=70` 警告、`>=85` 危险，对齐 OMC HUD 默认 `contextWarning 70` / `contextCritical 85`。两侧仍有半个百分点内的差异：OMC 比较 `Math.round` 后并 clamp 到 0–100 的值，圆环比较原始值且不 clamp（计划 0a 的知情默认）。
- i18n：不涉及（没有新文案）。
- 测试：`tests/unit/renderer/ContextUsageIndicator.dom.test.tsx` 新增 `AC5` 边界 `it.each`（`context_limit` 10 万，69_900 / 70_000 / 84_900 / 85_000 → primary / warning / warning / danger）。

### 现有文件挂载点（均有 `// ace:` marker）

| 文件                                                                         | 改动                                                         | 行                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------- |
| `packages/desktop/src/renderer/components/agent/ContextUsageIndicator.tsx`   | 圆环阈值 `pct >= 70` 警告 / `pct >= 85` 危险（对齐 OMC HUD） | ~65-73               |
| `packages/desktop/src/preload/main.ts`                                       | `hudStatusline` 入参增加 `contextLimit`                      | `electronAPI` 对象内 |
| `packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpChat.tsx` | 给 `HudStatusBar` 传 `messageState.context_limit`            | ~116                 |

> HUD 功能本身（`process/ace/hudStatusline.ts`、`renderer/.../hudStatusBar/`）的新增文件尚未在本清单登记，属既有缺口，不在本次范围内。

## 侧栏项目内会话分页 + 项目批量展开/收起（2026-10-13）

> 计划正本：`计划/AionUi/侧栏项目内会话分页计划/侧栏项目内会话分页计划.md`（评审态草案 `.omc/plans/sidebar-project-conversation-paging-consensus-plan.md`）；规格：`.omc/specs/deep-interview-sidebar-project-conversation-paging.md`。

"项目"与"置顶项目"分区里，每个项目文件夹展开后只渲染活跃时间降序的前 5 条会话，底部一行"更多（还有 N 条）"每点一次再显示 5 条，N 为 0 时消失；收起再展开回到 5 条。搜索弹层打开第 6 条以后的会话时，先把该项目的已加载条数推进到覆盖它（取 5 的整数倍）再滚动定位；Ctrl+Tab 的可见会话列表走同一份切片，不会跳到未渲染的行。"项目"分区标题行右侧、刷新按钮左边新增"展开全部项目 / 收起全部项目"两枚图标按钮，作用于全部项目（含置顶），分区自身被折叠时点"展开全部"也会重新打开分区。重启后所有项目默认收起：删除了首次自动全展开（#1156）和 `aionui_workspace_expansion` 的 localStorage 读写，展开状态与已加载条数只在本次运行内有效。

### 现有文件挂载点

| 文件                                                                                                  | 改动                                                                                                                                                                                                                 | 备注                |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `packages/desktop/src/renderer/pages/conversation/GroupedHistory/index.tsx`                           | `renderProjectGroup` 按 `loadedCounts` 切片（窄侧栏不切）+ 底部"更多"行（`role='button'`，`onPointerDown` 阻断置顶项目的拖拽 listeners）+ "项目"分区标题的两枚批量按钮；徽标与批量全选仍收全量 `group.conversations` | `// ace:` marker    |
| `packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversations.ts`           | 新增 `loadedCounts` state 与 `handleShowMoreConversations` / `handleExpandAllProjects` / `handleCollapseAllProjects`；reveal effect 同批推进条数并同时重开 `projects` + `pinned-projects` 分区；删自动全展开与持久化 | 整体改写，无 marker |
| `packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useWorkspaceExpansionState.ts` | 改为模块级 `WorkspaceViewSnapshot` store + `useSyncExternalStore`；不再读写 localStorage                                                                                                                             | 整体改写，无 marker |
| `packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds.ts`  | 透传 `loadedCounts` 给 `buildVisibleConversationIds`                                                                                                                                                                 |                     |
| `packages/desktop/src/renderer/pages/conversation/GroupedHistory/utils/visibleConversationOrder.ts`   | 分页原语 `PROJECT_PAGE_SIZE` / `getProjectLoadedCount` / `sliceLoadedConversations` / `loadedCountCovering`；`buildVisibleConversationIds` 按已加载条数截断                                                          |                     |
| `packages/desktop/src/renderer/services/i18n/locales/*/conversation.json`                             | `conversation.history.{showMore,expandAllProjects,collapseAllProjects}`（13 语言）                                                                                                                                   | JSON 无 marker      |

### 新增文件（纯新增）

`tests/unit/conversation/sidebar/`：`visibleConversationOrder.test.ts`（node，分页原语与可见 id 截断）、`useConversationsProjectPaging.dom.test.tsx`（hook：默认/+5/收起重置、reveal 推进、快照通道、冷启动全收起、批量展开收起）、`groupedHistoryProjectPaging.dom.test.tsx`（组件：更多行、批量按钮、徽标/全选不受切片影响、更多行 pointerdown 不触发拖拽）。源码侧零新增文件（`GroupedHistory/` 已满 10 个子项）。

### 已知边界（有意为之）

- "展开全部"会把已展开到 10/15 条的项目缩回 5 条（规格 AC6 字面要求，DOM 用例钉死）。
- 全部项目都置顶时"项目"分区标题不渲染，两枚批量按钮随之消失。
- 打开普通项目的会话也会展开被折叠的"置顶项目"分区（hook 拿不到置顶名单，无法区分）。
- 窄侧栏全量显示；切回宽侧栏时按 `loadedCounts` 收回。
- 老用户 localStorage 里残留的 `aionui_workspace_expansion` 无人读写，不做清理。
