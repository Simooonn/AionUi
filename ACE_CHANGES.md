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
