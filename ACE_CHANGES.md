# ACE_CHANGES — fork 改动清单

本仓库 fork 自上游 AionUi。为降低同步上游时的合并冲突，所有 fork 新增逻辑放在各进程下的 `ace/` 子目录；对**现有文件**的改动一律用 `// ace:start` … `// ace:end` marker 包裹，并登记在本清单。

> 同步上游后：`git grep -n "ace:start"` 复核每个挂载点是否仍然成立。
>
> 想适配新的 CLI 后端（Gemini CLI / opencode 等）：需求模板见 [docs/ace/cli-adapter-requirements-template.md](docs/ace/cli-adapter-requirements-template.md)。

## 功能：导入 Claude Code / Codex CLI 会话（幂等，仅元数据，只读）

### 新增文件（纯新增，不与上游冲突）

| 文件                                                            | 作用                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/desktop/src/common/ace/types.ts`                      | CLI 会话导入相关类型                                                         |
| `packages/desktop/src/process/ace/parsers/sessionTitle.ts`      | Claude/Codex 共用的标题提取（跳过系统注入前缀）                              |
| `packages/desktop/src/process/ace/parsers/claudeParser.ts`      | 解析 `~/.claude/projects/**/*.jsonl` → 会话元数据                            |
| `packages/desktop/src/process/ace/parsers/codexParser.ts`       | 解析 `~/.codex/{sessions,archived_sessions}/**/rollout-*.jsonl` → 会话元数据 |
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
- **展示通道（jsonl replace-sync）**：点开会话时按 jsonl **重建**该会话全部 `cli-` 行（aioncore 写的 live 行不动；jsonl 已删除则跳过、保留既有导入），终端侧 `claude --resume` 聊的历史也会出现；跨通道排重用"内容键(position+规范化文本) + 10 分钟时间窗"双因子。**噪音过滤**：harness 注入记录不入库——Claude 侧跳过 `isMeta` 记录、`<local-command-*>`/`<task-notification>`/"Caveat:"/`[Assistant Rules]`/`[Request interrupted…]` 记录，剥离内嵌 `<system-reminder>` 块与 `[Image #N]` 附件占位（真图另行落盘展示），斜杠命令帧压缩为 `/cmd args` 一行；Codex 侧跳过 `<environment_context>`/`<turn_aborted>`/`<user_instructions>`/`# AGENTS.md instructions`/`# Files mentioned by the user`/`<image>` 帧用户记录。**压缩摘要折叠**：`isCompactSummary` 记录不丢弃，导成 `thinking` 行（content 带 `aceCompactSummary:true`、`status:'done'`）→ `MessageThinking` 的 ace 变体渲染为一行"会话已压缩"说明（i18n `conversation.ace.compactSummary`），默认折叠，展开为 MarkdownView（包一层 `whitespace-normal` + 紧凑块边距——`.body` 的 `pre-wrap` 会让 markdown 渲染间距翻倍）；普通导入 thinking 行也补 `status:'done'`（否则组件按"进行中"显示转圈计时）。**字面 marker 防御**：CLI 文本里字面出现的 `[[AION_FILES]]`（比如聊"本应用"的会话）会被 MessageText 当附件分隔符、把后文渲染成乱码文件卡——导入时用零宽空格隐形断开（`escapeFilesMarker`，仅 text 行）。**工具调用行**：Claude `tool_use`/`tool_result`（跨记录按 id 配对）与 Codex `function_call`/`function_call_output`（按 call_id 配对、退出码判 failed）导成 `acp_tool_call` 行，content 与 aioncore live 持久化形状逐字段一致（`update.tool_call_id/title/kind/status/raw_input/raw_output/content` + Claude 侧 `_meta.claudeCode.toolName`）→ 现成紧凑工具行/分组 UI 直接渲染（"已执行"形态）；与 live 行按 `tool_call_id` 精确排重；`raw_output` 截断 8000 字符、超大 `raw_input` 丢弃（标题已含要点）。replace-sync 同时自愈旧版已入库的噪音行与 Codex 位置型 id 因过滤产生的位移。**图片可预览**：两侧 jsonl 都把附件图片内联成 base64（Claude `image/source.data`、Codex `input_image` data URL），导入时解码落盘到 `<getDataPath()>/ace-cli-images/<sessionId>/<sha1>.<ext>`（内容寻址、幂等），消息正文追加 `[[AION_FILES]]` 标记挂路径——复用现成 MessageText→FilePreview→Arco Image 渲染链，点击可放大预览；纯图片轮次合成一条附件行（`cli-<msgId>-img`）。删除会话/项目时缓存目录随 CLI 文件一并清理（`unlinkSessionFiles` 白名单新增 `ace-cli-images` 根，目录递归删除）。
- **解锁**：`readonly.ts` 不再把 `cli_session_id` 当只读触发器，导入会话直接走 `<AcpChat>` 可聊。

### 新增文件（纯新增）

| 文件                                                             | 作用                                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/ace/aioncoreSchema.ts`             | **耦合 schema 单一事实源**（acp_session/messages 所需列清单 + PRAGMA 校验）                                                                                          |
| `packages/desktop/src/process/ace/sessionResume.ts`              | resume 接线：schema 防御→jsonl 检查→warmup 建行→驱逐 idle agent（SIGTERM→宽限→SIGKILL，进程组级）→幂等 UPDATE→重生复查                                               |
| `packages/desktop/src/process/ace/messageParser.ts`              | 解析单个 CLI 会话消息历史（text/thinking/image/compact-summary/tool）+ harness 注入噪音过滤；导出 `findSessionFile`/`parseSessionFile`                               |
| `packages/desktop/src/process/ace/messageImporter.ts`            | 映射 + 直写 `messages` 表；按会话 replace-sync `cli-` 行（幂等、自愈）+ 跨通道双因子排重                                                                             |
| `packages/desktop/src/renderer/ace/ensureCliMessagesImported.ts` | 渲染层统一入口 `ensureCliConversationReady` / `ensureCliResumeBeforeSend` + 降级可见提示（i18n `conversation.ace.cliResumeUnavailable`，瞬态失败连续 ≥3 次升级提示） |
| `tests/unit/ace-cli-resume.test.ts`                              | schema 防御 / 双因子排重 / 幂等 UPDATE 语义单测                                                                                                                      |

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

| 文件                                                                                              | 改动                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/ace/aceBridge.ts`                                                   | 加 `ace:resolve-conversation-files` / `ace:unlink-session-files` / `ace:check-workspaces-exist` 三 handler    |
| `packages/desktop/src/preload/main.ts`                                                            | 暴露 `resolveConversationFiles` / `unlinkSessionFiles` / `checkWorkspacesExist`                               |
| `packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions.ts` | 三个删除 onOk（单删/批量/删项目）改走 `deleteConversationsWithFiles`，失败弹一次 `localFileDeleteFailed` 警告 |
| `packages/desktop/src/renderer/pages/conversation/GroupedHistory/index.tsx`                       | 项目区 displayName 在 workspace 目录不存在时灰显（`text-t-disabled`，仅样式）                                 |
| `packages/desktop/src/renderer/services/i18n/locales/*/conversation.json`                         | 加 `history.localFileDeleteFailed`（9 语言）                                                                  |

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
