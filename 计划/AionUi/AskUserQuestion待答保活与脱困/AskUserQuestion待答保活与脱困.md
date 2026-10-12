# AskUserQuestion 待答保活与卡住会话脱困 —— 共识计划

> 2026-10-12　状态：**已完成**（ralph 会话 20acf854：9 个故事全部通过，architect 复核 APPROVED，去冗余后全量门禁通过；后端 3 个提交在 AionCore `fix/pending-ask-keepalive`，前端已本地提交、未推送、未提上游 PR）　执行人：ralph
> 本文结构：顶部是执行待办；下面全部是附录。
> 来源规格：`.omc/specs/deep-interview-askuserquestion-stuck.md`（模糊度 13%）
> 副本：`计划/AionUi/AskUserQuestion待答保活与脱困/AskUserQuestion待答保活与脱困.md`（按全局计划规范的正本）与 `.omc/plans/askuserquestion-keepalive-consensus-plan.md`（OMC 工具链读取的镜像）内容相同；执行中改状态时两处同步。

## 计划 / 待办清单

**0. 用户确认项（2026-10-12 已全部确认）**

- [x] 0a.（2026-10-12 用户确认：接受替代方案）**规格验收 C 改写** —— 规格点名的 `1e57be0e` / `4ed3b3ce` 两个会话，其待答提问之后都已有用户消息（分别 5 / 16 条），按"尾部未答"规则不会再出卡片。拟改为：用这两行真实 DB 数据做派生规则的单测夹具（附录三 测试 6），端到端存量验证并入 B（在待答时重启）。
- [x] 0b.（2026-10-12 用户确认：答完就消失）**规格验收 B 的"显示为已答、不再可点"** —— 拟改为"作答后派生卡片不再出现，下方可见用户自己的回答消息"（View Steps 里的 tool_call 记录保留）。
- [x] 0c.（2026-10-12 用户确认：放 ace/ 目录，接受 11 个子项）**目录规模豁免** —— 新模块放 `packages/desktop/src/renderer/ace/askRecovery/`（ACE 规范要求 fork 逻辑进 `ace/`），`renderer/ace/` 从 10 个直接子项变 11 个；新测试目录 `tests/unit/ace-ask-recovery/` 让 `tests/unit/` 从 52 变 53。备选：源码放 `renderer/pages/conversation/Messages/acp/askRecovery/`（不违反目录规模，但违反 ACE 规范）。推荐前者。

**后端 AionCore（基于 `v0.2.2` tag 打补丁；先交付 I1 止血，再交付 B2）**

- [x] 1.（2026-10-12 完成）**建补丁分支** —— `git -C /Users/wmm/wmm-code/ace-diy/AionCore checkout -b fix/pending-ask-keepalive v0.2.2`（tag 已在本地）。
- [x] 2.（2026-10-12 完成）**I1 空闲扫描豁免（承重修复）** —— `crates/aionui-ai-agent/src/task_manager.rs::collect_idle`：在 `live_background_tasks` 守卫之后、`active_leases` 之前加 `agent.get_confirmations().len() > 0 → return None`，`reason=PendingUserInput`，debug 级。不新增 trait 方法。见附录一 A2。
- [x] 3.（2026-10-12 完成）**B2 看门狗探针** —— `crates/aionui-conversation/src/background_stream.rs`：`BackgroundStreamWatcher` 新增 `pending_probe: Option<Arc<dyn Fn() -> usize + Send + Sync>>` 与 `orphan_idle: Duration`；`run_orphan_turn` 超时分支改为 `Err(_) if probe() > 0 => continue`。`service.rs::ensure_background_watcher` 用 `Arc::downgrade(task)` 构造探针（Session 分支），ACP 分支传 `None`。见附录一 A1。
- [x] 4.（2026-10-12 完成）**后端单测** —— 扩展 `rig_with_opts` 签名为 `(title_only, pending_started_ttl, orphan_idle, pending_probe)` 并补 Rig 字面量两个字段；沿用现有真实短时长模式（`multi_thread` + 50ms，`background_stream.rs:983-985` 先例），不用 `start_paused`。用例见附录三 1-5。
- [x] 5.（2026-10-12 完成）**本地重编与交付** —— `cargo build --release --bin aioncore` → 先 `rm` 再 `cp` 到 `resources/bundled-aioncore/darwin-arm64/aioncore` → 新二进制 `prepare-managed-resources`（绝对路径）→ `manifest.json` 标 `sourceType: local-build` + branch/commit → 上游 PR（无 AI 签名）。见附录一 A3。

**前端 AionUi（全部新增文件进 `renderer/ace/askRecovery/`，改现有文件包 `// ace:start … // ace:end`）**

- [x] 6.（2026-10-12 完成）**派生规则纯函数** —— 新文件 `renderer/ace/askRecovery/deriveStaleAsk.ts`：`deriveStaleAsk(list, { hydrated, isProcessing, hideSendBox, conversationType, lastAnsweredAt, now })`。规则见附录一 B2（含 `content.status === 'running'` 与"作答后 5 秒内不派生"）。
- [x] 7.（2026-10-12 完成）**MessageList 注入派生卡片** —— `Messages/MessageList.tsx` `processedList` 末尾调用 `deriveStaleAsk`，`useMemo` 依赖加 `hydrated`、`isProcessing`、`conversationContext?.hideSendBox`、`conversationContext?.type`、`lastAnsweredAt`；作答后 5 秒窗口内挂一个一次性定时器触发重算；`chatLib.ts` `IMessageAsk.content` 加 `source?: 'live' | 'history'`。
- [x] 8.（2026-10-12 完成）**发送管线事件** —— `renderer/utils/emitter.ts` `EventTypes` 新增 `'sendbox.submit'`（含 `ack`）；`AcpSendBox.tsx` 用 `useAddEventListener(..., [conversation_id, executeCommand, supportsMidturnDelivery, isBusy, t])` 监听，收到即 `ack()`，再经 `executeCommand` 走既有队列；闸门与 `onSendHandler` 一致（`!supportsMidturnDelivery && isBusy → reject`）。见附录一 B3。
- [x] 9.（2026-10-12 完成）**提交策略 + 失败反馈** —— 新文件 `renderer/ace/askRecovery/submitAskAnswer.ts` 与 `answerClock.ts`：`answerAsk` → 失败/历史卡则 `confirmation.list` 按题干文本匹配 → 命中走 `answerAsk`；未命中则只读取会话详情 `runtime.has_task`，`false` 才经 `sendbox.submit` 自动重发，`true` 只给按钮（emit 前检查 `listenerCount`，10 秒只等 `ack`）。`MessageQuestion.tsx` 加 try/catch、`submitting`、错误行 + 「重试」「作为消息发送」。见附录一 B1。
- [x] 10.（2026-10-12 完成）**i18n** —— `messages` 模块新增 11 个 key（含重发文案模板与插值），13 种语言 `locales/*/messages.json` 全补；跑 `bun run i18n:types` + `node scripts/check-i18n.js`。见附录一 B4。
- [x] 11.（2026-10-12 完成）**前端测试** —— 新目录 `tests/unit/ace-ask-recovery/`：`deriveStaleAsk.test.ts`（含两行真实 DB 夹具与 N1 回归）、`submitAskAnswer.test.ts`、`MessageQuestion.dom.test.tsx`、`MessageListStaleAsk.dom.test.tsx`（经真实消息 store 注入）、`AcpSendBoxSubmitEvent.dom.test.tsx`。见附录三 6-10。
- [x] 12.（2026-10-12 完成）**登记 ACE_CHANGES.md** —— 新增"功能：AskUserQuestion 待答脱困"一节：新增文件表 + 挂载点表（`MessageList.tsx`、`MessageQuestion.tsx`、`chatLib.ts`、`AcpSendBox.tsx`、`emitter.ts`、`locales/*/messages.json`）。
- [x] 13.（2026-10-12 完成，见附录三末尾实测记录）**验证与收尾** —— 附录三 A（含基线复现）/ B / D 端到端 + 日志证据；`bunx tsc --noEmit`、`bun run test`、`bun run lint:fix`（后 `git status` 还原越界改动）、`bun run format`。不 push，commit 无 AI 签名。
- [x] 14.（2026-10-12 执行中发现并完成）**B3 启动恢复保留未答提问** —— aioncore v0.2.2 `startup_recovery` 每次启动把残留 `tool_call` 行结清为 finish/canceled，会让场景 B 的派生卡片永远匹配不上；补丁 `KeepPendingUserPrompt`（AskUserQuestion 且 content.status 非终态的行不改写），commit `31421af2`，3 个单测，二进制已重编替换。见附录三实测记录。

---

# 附录一：方案是什么

## 根因拆解（决定优先级）

- **用户发起的回合不受影响。** 用户 send 走 `crates/aionui-conversation/src/service.rs:4033 spawn_user_turn` → `turn_orchestrator.rs:283 StreamRelay::new`，这条 relay 没有空闲超时；期间 `runtime.set_status(Running)`（`session_agent.rs:2854`，turn_gen 前进时），空闲扫描跳过。
- **出事的是用户回合 Finish 之后 claude 自己续开的回合**（后台 subagent / 后台 bash 完成通知触发续跑，或 claude 的 follow-up turn）。这种回合由 `background_stream.rs:387 run_orphan_turn` 中继（日志 "background stream: CLI-initiated turn started"），不推进 turn_gen，status 一直是 `Finished`，runtime summary 因而是 `Idle`（`runtime_state.rs:507-520`）。10-10 全部 8 个案例的 AskUserQuestion 都落在这种回合里。
- **两层后果**：
  1. 非致命：`run_orphan_turn` 的 `tokio::time::timeout(ORPHAN_TURN_IDLE_MS=180_000, rx.recv())`（`:429-456`）超时 → `drop(feed_tx)` → relay `RecvError::Closed` → `ChannelClosed`，回合被标记结束，前端 `turn_completed_applied` / `sidebar_generating_off`，等待标记消失。claude 进程还在，180s~10min 内作答仍成功（4ed3b3ce 17:12:04、caa43239 17:25:15 实证）。
  2. **致命**：`task_manager.rs:301 collect_idle` 只看 `status ∈ {None, Finished}` + `idle_ms > 600s`，把正在等用户的进程当空闲杀掉（4ed3b3ce 18:25:08 `Idle kill … idle_class=Finished`）。之后 `/asks/{id}/answer` 404 `No active agent`。
- 因此 **I1（空闲扫描豁免）是承重修复，先单独交付即可止血**；B2 让回合在等待期间保持"进行中"（等待标记不消失）。

## A. 后端（AionCore v0.2.2 补丁）

### A1 B2 看门狗探针（`crates/aionui-conversation/src/background_stream.rs`）

现状（`git show v0.2.2:…`）：

- `:46` `const ORPHAN_TURN_IDLE_MS: u64 = 180_000;`；`:61` `PENDING_STARTED_TTL` 已是可注入字段先例（`:76-77` `pending_started_ttl`）。
- `:63-77` 结构体字段：`conversation_id / user_id / repo / broadcaster / persistence / runtime_state / title_only / pending_started_ttl`，无 agent 句柄。
- `:427` 首帧 `feed_tx.send(first)` 不经 `Ok(Ok(ev))` 分支；`:429-456` 超时与源关闭合并在 `Ok(Err(Closed)) | Err(_)` 分支。
- 构造点 `crates/aionui-conversation/src/service.rs:691-725 ensure_background_watcher(&self, user_id, conversation_id, agent: &AgentInstance)`：`AgentInstance::Session(task)` 是 `Arc<SessionAgentTask>`（`agent_task.rs:200`），与 watcher **同一 crate**；另一个构造点只有测试 Rig（`background_stream.rs:566`）。
- `crates/aionui-ai-agent/src/agent_task.rs:339 AgentInstance::get_confirmations()` 对所有变体给出 pending 列表；`SessionAgentTask::get_confirmations` 是公开固有方法（`session_agent.rs:706`）；`service.rs:824` runtime summary 已把它当权威来源（`runtime_state.rs:510` pending>0 → `WaitingConfirmation`）。
- 1s 心跳：`session_agent.rs:2806-2837` 只要有后台任务卡片打开，每秒经 `runtime.tx` 发 `WorkflowProgress` 帧——v1 的"本地标志"方案因此不成立。

改法：

1. 结构体加两个字段：`pub pending_probe: Option<Arc<dyn Fn() -> usize + Send + Sync>>`、`pub orphan_idle: std::time::Duration`（生产构造传 `Duration::from_millis(ORPHAN_TURN_IDLE_MS)`）。
2. `run_orphan_turn` 超时分支拆为：
   ```rust
   Err(_elapsed) => {
       let pending = self.pending_probe.as_ref().map(|p| p()).unwrap_or(0);
       if pending > 0 {
           debug!(conversation_id = %self.conversation_id, turn_id = %turn_id, pending,
                  "background stream: orphan turn idle but agent awaits user input; keep feeding");
           continue;
       }
       drop(feed_tx);
       break relay_task.await;
   }
   Ok(Err(broadcast::error::RecvError::Closed)) => { drop(feed_tx); break relay_task.await; }
   ```
   只在超时时调用探针，无逐帧开销；外部用户回合接管的检查仍在 `Ok(Ok(ev))` 分支（每个新帧先查）。
3. `ensure_background_watcher`（`service.rs:710-719`）：
   ```rust
   let pending_probe: Option<Arc<dyn Fn() -> usize + Send + Sync>> = match agent {
       AgentInstance::Session(task) => {
           let weak = Arc::downgrade(task);
           Some(Arc::new(move || weak.upgrade().map(|t| t.get_confirmations().len()).unwrap_or(0)))
       }
       _ => None,
   };
   ```
   必须用 `Weak`：watcher 持强引用会让 `runtime.tx` 永不 drop，watcher 永不退出。
4. 进程退出的收口不依赖探针：`session_agent.rs:4308-4345` `SessionEvent::Detached` 发 `Error` / `Finish` 帧，relay 正常终止；作答后 `claude_conn.rs` `answer_ask`（`:1162-1172`）从 `pending_perms` 移除该项，探针归零，下一次超时照常收口。
5. `ORPHAN_TURN_IDLE_MS` 注释补一句：等待用户作答（pending confirmations > 0）的回合不受此限。

### A2 I1 空闲扫描豁免（`crates/aionui-ai-agent/src/task_manager.rs`）

现状：`:301-363 collect_idle`，`agent` 来自 `entry.value().get()?.agent`，类型 `AgentInstance`（`ManagedAgentTask.agent`，`:82-95`）。已有两个豁免——`agent.live_background_tasks() > 0`（info，`reason=LiveBackgroundTask`，`:323-335`）和 `self.active_leases.active_until(id)`（debug，`reason=ActiveLease`，`:339-348`；lease TTL 90s 只覆盖前端正在查看的会话——4ed3b3ce 最后一次 lease 18:23:24，18:25:08 被杀）。`idle_scanner.rs:11` solo 600s、`:14` team 1800s。

改法：在 `live_background_tasks` 守卫之后加

```rust
let pending_user_input = agent.get_confirmations().len();
if pending_user_input > 0 {
    debug!(conversation_id = %entry.key(), ?status, idle_ms, pending_user_input,
           reason = %"PendingUserInput", "Idle scan: pending user input protects idle agent");
    return None;
}
```

- Session 变体：`session_agent.rs:706` → `claude_conn.rs:3532 pending_permission_requests()`：std Mutex 下同步遍历一个 map，无 await，开销可忽略；DashMap 遍历内调用无反向加锁。
- **副作用（已写入 ADR Consequences）**：`get_confirmations()` 对 ACP manager 与 Aionrs 实例同样有效，它们有未决提示时也不会被空闲扫描回收——符合原则 1，属期望行为。
- 测试桩：`task_manager.rs:455-490` `MockAgent`（`impl IMockAgent for MockAgent {}`）加 `with_confirmations(n)`，`get_confirmations` 返回 n 个占位 `Confirmation`。
- 不改默认阈值、不改 `agent_health_policy`、不改 CLI-initiated turn 的 status 语义。

### A3 交付

- 二进制现状：`resources/bundled-aioncore/darwin-arm64/manifest.json` `version: v0.2.2`，`sourceType: "download"`。
- 步骤：`cargo build --release --bin aioncore` → `rm …/aioncore && cp target/release/aioncore …/aioncore`（原地覆盖同 inode 会被 macOS SIGKILL）→ `./aioncore --data-dir <绝对路径> prepare-managed-resources --bundle-out <绝对路径>` → manifest 改 `sourceType: "local-build"` 并记 branch/commit → 重启 AionUi。
- `node scripts/prepareAioncore.js` 会用官方包覆盖，验证期间不要跑。
- 交付顺序：I1 单独编一版先验证（止血），再加 B2 编第二版。上游 PR = I1 + B2 + 单测；提交信息无 AI 签名。

## B. 前端（AionUi `packages/desktop/src/`）

### B1 提交策略与失败反馈

现状：`renderer/pages/conversation/Messages/MessageQuestion.tsx` `:64-77 handleSubmit` 直接 `await conversation.answerAsk.invoke(...)` 后 `setSubmitted('answered')`，无 try/catch；`:79-86 handleDecline` 同；`:170-187` 按钮区；`:188-198` 成功态 feedback。失败时 Promise reject、按钮仍可点、无反馈。后端 404 不只代表 "No active agent"：`crates/aionui-conversation/src/routes.rs:26-39` 把 `NotFound` / `MessageNotFound` / `ActiveAgentNotFound`（"No active agent for this conversation"）等都映射为 404，**不能凭 code 分支**。
进程是否还在的只读信号：`GET /api/conversations/{id}`（后端 `ConversationService::get`，`service.rs:2183` 附带 `runtime: runtime_summary_for(id)`）→ 前端 `TChatConversation.runtime.has_task`（`common/config/storage.ts:146/176`）。**不得用 `ensureRuntime`（`ipcBridge.ts:342`，POST runtime/ensure 会拉起新进程）当探测。** CLI-initiated 回合里 runtime `state` 一直是 `idle`，所以 `state` 不能当"进程还在"的信号（Architect r3 / Critic r3 一致指出）。

改法（新文件 `renderer/ace/askRecovery/submitAskAnswer.ts`、`answerClock.ts` + `MessageQuestion.tsx` 挂载点包 ace 标记）：

1. `answerClock.ts`：模块级 `Map<conversation_id, number>`，`markAnswered(id)` / `getLastAnsweredAt(id)`；`answerAsk` 成功时 `markAnswered`。
2. `submitAskAnswer({ conversation_id, request_id, questions, answers | decline, source, force?: 'message' })`：
   - `source !== 'history'`：先 `conversation.answerAsk.invoke`；成功 → `markAnswered` → `{ via: 'ask' }`。
   - 失败或 `source === 'history'`：`ipcBridge.conversation.confirmation.list.invoke({ conversation_id })`，在 `questions` 非空的 pending 项里**按题干文本匹配**（每道 `questions[i].question` 相等）→ 命中则用其 `call_id` 走 `answerAsk`（覆盖 request_id 不一致的恢复卡）。
   - 未命中：只读取会话详情（`GET /api/conversations/{id}` 的 httpGet 桥），`runtime.has_task === false`（进程确实不在）→ 自动格式化为普通消息，`emitter.emit('sendbox.submit', …)`；`has_task === true`（可能是"服务端已成功、响应丢失"）→ 抛 `askAnswerFailed`，由卡片给「重试」「作为消息发送」。`force === 'message'` 跳过此判断。
   - emit 前 `emitter.listenerCount('sendbox.submit') === 0` → reject（`askResendBlocked`）；emit 后 10 秒未收到监听器 `ack()` → reject（`askResendUnconfirmed`，文案提醒先看消息列表再决定是否重发）；收到 `ack` 后不再限时，等待 `resolve/reject`。
   - 成功 → `{ via: 'message' }`；任何一步抛错 → 向上抛。
3. `MessageQuestion`：新增 `submitting` 与 `failure: string | null`；提交中禁用按钮；失败时 `styles.feedback` 错误样式显示 `t('messages.askAnswerFailed', { reason })` + Arco `Button`「重试」（重跑同一策略）与「作为消息发送」（`force: 'message'`）。成功按 `via` 显示 `askAnswered` / `askResent`。
4. `source === 'history'` 的卡片顶部显示 `t('messages.askStaleHint')`。
5. Round 2 用户选"自动唤醒并重发"：无 pending 且进程不在时不再二次询问。

### B2 历史派生卡片

现状：

- `Messages/MessageList.tsx:357-460 processedList`：`tool_call` 一律 `pushToolList`；`:297` `ask` → `MessageQuestion`；`:346` 已取 `const { isProcessing } = useConversationRuntimeView(...)`，同 hook 返回 `hydrated`（`runtime/conversationRuntimeViewStore.ts:162-168`，初值 `isProcessing:false, hydrated:false`）；`:339` 已取 `conversationContext`（`hooks/context/ConversationContext.tsx` 提供 `type: 'acp'|'codex'|'aionrs'` 与 `hideSendBox`）。
- 历史 `tool_call` 落库形态：消息级 `status='work'`（`chatLib.ts:105`）；`content={call_id,name,args:{questions},status:'running'|'completed'|'error'}`（`:215-227`）。DB 对应：work↔running 8 条、finish↔completed 21 条、error↔error 2 条（无例外）。
- **N1 路径**：实时 `tool_call` 帧转换（`chatLib.ts:778-787`）不带消息级 status；合并（`:1026-1031`）`{ ...msg, content: { ...msg.content, ...message.content } }` 只更新 `content`，消息级 `status` 保留 DB 的 `'work'`。作答后 ask 卡被 `removePermissionMessage` 移除、runtime 回 Idle，若只看消息级 status 会误派生。
- CLI 导入会同步出同 id 的 `acp_tool_call` 行（4ed3b3ce `toolu_01UzQ1nWqVZcuoPMaH1rjq9i` 同时有 `tool_call/work` 与 `acp_tool_call/finish`）。
- 实时/恢复卡 `request_id` 是 claude control UUID，派生卡是 `toolu_…`，**不能按 id 去重**；`usePendingConfirmationsRecovery.ts:83-95` 恢复是异步 `.then`。

改法（新文件 `renderer/ace/askRecovery/deriveStaleAsk.ts`，纯函数）：
`deriveStaleAsk(list, { hydrated, isProcessing, hideSendBox, conversationType, lastAnsweredAt, now }): IMessageAsk | null`

1. `!hydrated || isProcessing || hideSendBox || conversationType !== 'acp'` → null。（team 主会话不排除：重发经 `executeCommand` 自动走 `teamSendMessage`；team 子代理 `hideSendBox=true` 排除。）
2. 取**最后一个** `type==='tool_call' && content.name==='AskUserQuestion' && status==='work' && content.status==='running' && questions 非空` 的消息 `q`；无 → null。（这是挡住 N1 的主规则：完成帧合并后 `content.status` 变 `completed`。）
3. `lastAnsweredAt != null && now - lastAnsweredAt < 5000` → null（作答后、完成帧到达前的瞬时窗口；锚点是**作答时刻**，不是提问时刻）。`MessageList` 在该窗口内挂一次性 `setTimeout` 触发重算，避免"挡住一次后列表不变就永不重算"。
4. 其后存在任何 `position==='right'` 消息 → null。
5. 存在 `type==='ask'` 且 `created_at >= q.created_at` → null。
6. 存在同 id 的终态 `acp_tool_call`（`msg_id === q.msg_id || content.update?.tool_call_id === q.content.call_id`，`status ∈ {finish,error}`）→ null。
7. 跳过类型与 `processedList` 一致：`hidden`、`available_commands`、`plan`、`thinking`、`tips`。
8. 返回 `{ id:'stale-ask:'+call_id, msg_id 同, type:'ask', position:'left', conversation_id, created_at: q.created_at, content:{ session_id, request_id: call_id, questions, source:'history' } }`。

`MessageList.tsx` 挂载（ace 标记内）：`processedList` 末尾 `const stale = deriveStaleAsk(list, { hydrated, isProcessing, hideSendBox: conversationContext?.hideSendBox ?? false, conversationType: conversationContext?.type, lastAnsweredAt: getLastAnsweredAt(conversation_id), now: Date.now() })` → `result.push(stale)`；`useMemo` 依赖加 `hydrated`、`isProcessing`、`conversationContext?.hideSendBox`、`conversationContext?.type`、`lastAnsweredAt`（经 state/tick 变化）。

作答后：用户消息落在尾部 → 规则 4 不再成立 → 卡片不再出现（待办 0b）。

### B3 重发走既有发送管线

现状：`platforms/acp/AcpSendBox.tsx:319-349 executeCommand` 每次发送前做：`ensureCliResumeBeforeSend`（`:325-327` ace 标记块）、`markSendStarted/Accepted/Failed`、busy 分类、team 路由（`teamSendMessage`）；`:482-490 onSendHandler` 的闸门是 `!supportsMidturnDelivery && isBusy` 才拦（claude 支持中途投递，忙时也放行）。`utils/emitter.ts:77-85 useAddEventListener(event, fn, deps?)`，`deps` 默认 `[]`。eventemitter3 5.0.4 提供 `listenerCount`。

改法：

1. `emitter.ts` `EventTypes`（ace 标记）新增 `'sendbox.submit': [{ conversation_id: string; input: string; ack: () => void; resolve: () => void; reject: (error: unknown) => void }]`。
2. `AcpSendBox.tsx`（ace 标记）：
   ```ts
   useAddEventListener(
     'sendbox.submit',
     ({ conversation_id: target, input, ack, resolve, reject }) => {
       if (target !== conversation_id) return;
       ack();
       if (!supportsMidturnDelivery && isBusy) {
         reject(new Error(t('messages.askResendBlocked')));
         return;
       }
       executeCommand({ input, files: [], sessions: undefined }).then(resolve, reject);
     },
     [conversation_id, executeCommand, supportsMidturnDelivery, isBusy, t]
   );
   ```
3. 重发文案由 `submitAskAnswer.ts` 生成，全部走 i18n（B4）：头 `askResendHeader`；每题一行 `askResendLine`（`{{question}}` 取 `header ?? question`，`{{answer}}` 用 `askResendSeparator` 连接 labels，"其他"自由输入原样作为 label）；拒答 `askResendDecline`。
4. 发送路径自带 runtime ensure；claude 恢复会话时给悬空 tool_use 补 "[Tool call interrupted…]" 再读这条消息（4ed3b3ce 10-10 23:36 实证）。

### B4 i18n（`renderer/services/i18n/locales/*/messages.json`，13 种语言）

| key                    | 用途                                                    |
| ---------------------- | ------------------------------------------------------- |
| `askStaleHint`         | 派生卡顶部提示：原进程已退出，提交后将作为消息发送      |
| `askAnswerFailed`      | 失败行，插值 `{{reason}}`                               |
| `askRetry`             | 「重试」按钮                                            |
| `askResendAsMessage`   | 「作为消息发送」按钮                                    |
| `askResent`            | 成功态：已作为消息发送                                  |
| `askResendBlocked`     | 无法重发（发送框不可用 / 无监听者）                     |
| `askResendUnconfirmed` | 10 秒内未收到发送确认；提醒先检查消息列表再决定是否重发 |
| `askResendHeader`      | 重发消息首行                                            |
| `askResendLine`        | 重发每题行，插值 `{{question}}` `{{answer}}`            |
| `askResendSeparator`   | 多选 label 分隔符                                       |
| `askResendDecline`     | 拒答重发文案                                            |

按 i18n skill：先改 `zh-CN` 与 `en-US`，其余语言补齐；`bun run i18n:types`、`node scripts/check-i18n.js` 必须通过。

### B5 已自动覆盖、无需改动

- 侧栏等待标记：`GroupedHistory/hooks/useConversationListSync.ts:133-172` 已把 `ask` 计入等待；B2 后端生效后回合不再提前结束，标记自然保持。
- 通知：`hooks/system/notification/browserNotificationCore.ts:95` 已含 `ask`。
- 回合中晚到的 `ask` 帧：`platforms/acp/useAcpMessage.ts:560-566` default 分支照常 `mergeLiveMessage`。

---

# 附录二：依据与证据

## RALPLAN-DR 摘要

**Principles（原则）**

1. 等用户作答不是空闲：所有"无事件即超时/空闲"的判定必须读同一个真实来源——后端的 pending confirmations。
2. 修在根因所在层：进程回收与回合提前结束在 aioncore，就改 aioncore；前端只做前端能做的恢复与反馈。
3. 不新增持久化契约：脱困卡片从已落库的 `tool_call` 行派生，不加新的 `ask` 落库和新接口。
4. 失败必须可见且有下一步：任何用户动作失败都要有反馈和可点的动作，不允许静默，也不允许无限挂起。
5. 最小 diff、沿用既有模式与 fork 规范：后端豁免照 `live_background_tasks` / `active_leases` 写法；前端复用 `MessageQuestion` 与发送管线；新增逻辑进 `ace/`，改动点打 ace 标记。

**Decision Drivers（决策驱动）**

1. 用户选择"待答期间永不回收"（访谈 Round 3），资源代价已接受。
2. 用户选择"自动唤醒并重发"而非手动（Round 2）；新进程接不回旧 control request 是硬约束。
3. 当前二进制是官方 v0.2.2 下载版，后端补丁必须可独立重编、可上游化。

**Viable Options（后端看门狗）**

- **B2 pending 探针（选中）**：watcher 加 `Option<Arc<dyn Fn() -> usize>>`，构造点 `service.rs:691` 同 crate 且手里就有 `AgentInstance`，用 `Weak` 避免引用环；只在超时时调用。优点：与 I1 读同一真实来源；不受 1s 心跳/非内容帧影响；首帧为 Ask 也成立。缺点：多一个字段与一个弱引用闭包；测试 Rig 需扩签名。
- **B1 watcher 本地标志（v1，否决）**：`session_agent.rs:2806-2837` 的 1s `WorkflowProgress` 心跳和任何非内容帧都会清掉标志；首帧经 `feed_tx.send(first)` 不走标志逻辑；与 I1 来源不一致违反原则 1。
- **B3 claimed 回合直接取消超时（否决）**：丢掉该常量存在的理由（"stray content frame with no terminal" 时 watcher 永久卡死），上游不会接受。

**Viable Options（空闲扫描）**

- **I1 `get_confirmations().len()` 守卫（选中）**：零新 API，与 `live_background_tasks` 同构，来源与 runtime summary 一致。
- **I1' 新增 trait 方法（v1，否决）**：重复 `get_confirmations` 的职责。
- **I2 续 `active_lease`（否决）**：TTL 90s 只对前端正在查看的会话生效，用户切走即失效。
- **I3 续开回合也置 `Running`（否决）**：改变 #758 后台续跑的运行态语义，影响面远超本问题。

**Viable Options（脱困卡片）**

- **S1 前端从历史派生 + 提交时先问后端（选中）**：显示用启发式（尾部未答、`content.status==='running'`、作答后 5 秒外、无后续用户消息），提交用后端真相（`confirmation.list` 命中则 `answerAsk`，否则按 `has_task` 决定重发或提示）。
- **S2 后端把 `ask` 帧落库（否决）**：违反规格约束，存量会话无数据。

**Viable Options（重发通道）**

- **R1 经 `sendbox.submit` 事件走 `executeCommand`（选中）**：覆盖 `ensureCliResumeBeforeSend`、`markSend*`、busy 分类、team 路由；配 `listenerCount` 检查、`ack` 超时，避免无监听者时挂起。
- **R1' 把 `executeCommand` 抽成 context 由卡片直接 await（备选，未采用）**：更显式，但 `AcpSendBox` 改动与 ace 挂载点更多；若 R1 的事件通道在实现中暴露更多问题，可切换。
- **R2 直接 `ipcBridge.acpConversation.sendMessage.invoke`（v1，否决）**：CLI 导入会话会 resume 到空 session，UI 运行态不同步，可重复发送。
- **R3 `sendbox.fill` 预填由用户手动发送（否决）**：与 Round 2 "自动"选择相悖。

## 根因证据（2026-10-10 日志 + `~/.aionui/aionui-backend.db`）

| 会话     | AskUserQuestion 落库 | 作答          | ChannelClosed       | 间隔  |
| -------- | -------------------- | ------------- | ------------------- | ----- |
| 4ed3b3ce | 17:06:34             | 17:12:04 成功 | 17:09:34            | +180s |
| 4ed3b3ce | 18:05:28             | 未答          | 18:08:29            | +181s |
| 1e57be0e | 18:10:34             | 未答（截图）  | 18:13:34            | +180s |
| caa43239 | 17:18:43             | 17:25:15 成功 | 17:21:43            | +180s |
| e06e6a3c | 17:28:11 / 17:50:40  | 未答          | 17:31:11 / 17:53:40 | +180s |

- 全天 `turn finished`：ChannelClosed 9 次 vs Finish 1 次；所有 ask 都在 "CLI-initiated turn" 里。
- 4ed3b3ce 18:25:08 `Idle kill … idle_class=Finished idle_ms=1179362`（自 18:05:28 起算；最后一次 active-lease 18:23:24）；23:34:22–34 作答 7 次全部 404 `No active agent for this conversation`。
- 存量：全库 8 条 work 态 AskUserQuestion，其后均已有用户消息（1e57be0e `toolu_01Cg62…` 后 5 条、4ed3b3ce `toolu_01UzQ1…` 后 16 条）→ 待办 0a。
- 所有受影响会话 `acp_session.agent_id=2d23ff1c`，日志 `routing conversation through the direct-CLI SessionAgentTask (not AcpAgentManager) backend=claude`。

---

# 附录三：风险 / 验证 / ADR

## 风险与缓解

| 风险                                                                               | 缓解（可验证）                                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 探针返回 >0 但 claude 进程已死，回合永不收口                                       | 进程退出 → `SessionEvent::Detached`（`session_agent.rs:4308-4345`）发 `Error`/`Finish` 帧 → relay 终止，与探针无关；单测 4 覆盖。                                                    |
| 多个会话同时待答，每个占一个 claude 进程                                           | 用户已接受（Round 3）；`collect_idle` debug 日志 `reason=PendingUserInput` 可观测。                                                                                                  |
| **N1：作答后派生假卡片**（ask 卡被移除、runtime 回 Idle、消息级 status 仍 `work`） | 规则 2 要求 `content.status==='running'`（完成帧合并后变 `completed`）；规则 3 以**作答时刻**为锚的 5 秒窗口 + 一次性重算定时器覆盖完成帧到达前的瞬时窗口；单测 6(g)(h)、9(b) 覆盖。 |
| 派生卡在 runtime view 尚未 hydrate 时闪现                                          | 规则 1 `!hydrated → null`；`useMemo` 依赖含 `hydrated`。                                                                                                                             |
| 派生卡与实时/恢复卡重复（id 体系不同）                                             | 规则 1 `isProcessing`（后端 pending>0 即 true）+ 规则 5（任何 `created_at ≥ q` 的 `ask` 存在即不派生）。                                                                             |
| `sendbox.submit` 无监听者（`hideSendBox` / 非 acp 平台）→ 永远挂起                 | 规则 1 已排除 `hideSendBox` 与非 acp；`submitAskAnswer` 仍做 `listenerCount===0 → reject` + 10 秒 `ack` 超时兜底。单测 7 覆盖。                                                      |
| `ack` 超时后 `executeCommand` 其实已成功，用户再点造成重复                         | 超时文案 `askResendUnconfirmed` 提醒先看消息列表；收到 `ack` 后不再限时。                                                                                                            |
| 监听器捕获过期闭包                                                                 | `useAddEventListener` deps 显式传 `[conversation_id, executeCommand, supportsMidturnDelivery, isBusy, t]`；单测 10 覆盖。                                                            |
| 闸门过严导致死路（runtime 仍显示 waiting_confirmation）                            | 闸门与 `onSendHandler` 一致：仅 `!supportsMidturnDelivery && isBusy` 拦；claude 支持中途投递。                                                                                       |
| "服务端已成功、响应丢失"时重复作答                                                 | 未命中 pending 时以只读会话详情的 `runtime.has_task` 为准：`true` 不自动重发，只给按钮（runtime `state` 在 CLI-initiated 回合里恒为 idle，不可作信号）。                             |
| CLI 导入会话重发落进空 session                                                     | R1 走 `executeCommand`，`ensureCliResumeBeforeSend` 每次发送前执行（`AcpSendBox.tsx:325-327`）。                                                                                     |
| 404 不等于"进程已死"                                                               | 不按 code 分支；失败后以 `confirmation.list` + `has_task` 为准。                                                                                                                     |
| 重发文案 claude 理解偏差                                                           | 模板含题干与所选 label；验收 B 以"agent 回复引用所选 label"为通过标准。                                                                                                              |
| `prepareAioncore.js` 覆盖本地编译二进制                                            | manifest 标 `local-build`；验证期不跑。                                                                                                                                              |
| `bun run lint:fix` 越界改写无关文件                                                | 跑完 `git status` 核对并还原。                                                                                                                                                       |
| 目录规模（`renderer/ace/` 11、`tests/unit/` 53）                                   | 待办 0c 用户确认；备选目录已给出。                                                                                                                                                   |

## 验证步骤

**后端单测**（`cargo test -p aionui-conversation background_stream`、`cargo test -p aionui-ai-agent task_manager`；沿用 `#[tokio::test(flavor = "multi_thread", worker_threads = 2)]` + 真实短时长，`rig_with_opts(title_only, pending_started_ttl, orphan_idle=50ms, pending_probe)`）

1. 首帧 `Ask`，probe 恒 1 → 等 300ms → relay 未终止、feed 未关；probe 改 0 → 下一次超时 `ChannelClosed`。
2. `Text` → `Ask` → 5 次 `WorkflowProgress`（间隔 20ms）→ 静默 300ms，probe=1 → 不关。
3. probe=0（或 `None`）：`Text` 后静默 → 超时 `ChannelClosed`（既有行为不变）。
4. probe=1：`Ask` → `Finish` → `RelayTerminal::Finish`。
5. `collect_idle`：`MockAgent::with_confirmations(1)`、status Finished、idle>threshold → 不在列表；`with_confirmations(0)` → 在列表；既有 `live_background_tasks` 用例不变。

**前端单测**（`bun run test`，目录 `tests/unit/ace-ask-recovery/`）6. `deriveStaleAsk.test.ts`：(a) 尾部 work/running 态 AskUserQuestion、hydrated、!isProcessing、无 lastAnsweredAt → 派生；(b) 其后有 `position:'right'` → null（1e57be0e `toolu_01Cg62…` 真实行 + 其后 5 条用户消息夹具）；(c) 同 id 终态 `acp_tool_call` → null（4ed3b3ce `toolu_01UzQ1…` 两行夹具）；(d) 存在 `created_at ≥ q` 的 `ask` → null；(e) `!hydrated` / `isProcessing` / `hideSendBox` / `type!=='acp'` → null；(f) 尾部 thinking/tips 后是该 tool_call → 派生；(g) **N1 回归**：消息级 `status:'work'` 但 `content.status:'completed'` → null；(h) `now - lastAnsweredAt < 5000` → null，`>= 5000` → 派生。7. `submitAskAnswer.test.ts`：live 卡 `answerAsk` 成功 → `via:'ask'` 且 `markAnswered` 被调用；失败且 `confirmation.list` 按题干命中 → 二次 `answerAsk` 用命中的 `call_id`（多个 pending 时选题干匹配的那个）；失败、无 pending、`has_task=false` → 发 `sendbox.submit` 且 input 为 i18n 模板渲染结果；失败、无 pending、`has_task=true` → 抛错不重发；`force:'message'` 跳过 `has_task` 判断；`listenerCount===0` → reject；监听者不 `ack` → 10 秒 reject（`askResendUnconfirmed`）；`ack` 后 `executeCommand` 慢于 10 秒仍 resolve；history 卡直接查 list；探测用的是只读会话详情而非 `ensureRuntime`。8. `MessageQuestion.dom.test.tsx`：成功显示 `askAnswered`；经消息成功显示 `askResent`；失败显示 `askAnswerFailed` + 「重试」「作为消息发送」；提交中按钮 disabled；history 卡显示 `askStaleHint`；断言未直接调用 `acpConversation.sendMessage.invoke`。9. `MessageListStaleAsk.dom.test.tsx`（经真实消息 store 注入）：(a) 同 msg_id 的 `tool_call` 与 `acp_tool_call` 两行并存时 store 不合并、不派生；(b) 恢复卡被移除 + `isProcessing=false` + tool_call 已合并为 `completed` → 不出卡；(c) 正常派生时 `message-question` 出现在该 tool_call 的 View Steps 之后，`isProcessing` 翻 true 时消失；(d) `markAnswered` 后 5 秒内不出卡、定时器到期后重算出卡（若其他条件仍成立）。10. `AcpSendBoxSubmitEvent.dom.test.tsx`：emit `sendbox.submit` → `ack` 先于 `executeCommand` 被调用且 resolve；`!supportsMidturnDelivery && isBusy` → reject；不同 `conversation_id` 不响应；props 变化后监听器用新值。

**端到端验收**（对应规格 A/B/D，C 见待办 0a）11. **A 基线复现（官方 v0.2.2）**：在 Claude 会话发："先用 run_in_background 跑 `sleep 30` 并结束本回合；后台任务完成后，用 AskUserQuestion 问我一个单选问题。" 回合结束后**切到别的会话**（让 active-lease 过期）。日志必须依次出现 `background stream: CLI-initiated turn started`（记下 turn_id）→ 该 ask 的 tool_call 落库 → +180s `turn finished … terminal=ChannelClosed` 同 turn_id → renderer `turn_completed_applied` / `sidebar_generating_off`。有效性前置：ask 落库时间在 `CLI-initiated turn started` 之后、该 turn_id 的 `turn_terminal` 之前；否则本次不算。12. **A 补丁验证（I1 版，再 I1+B2 版）**：同样步骤，等 15 分钟（仍停留在别的会话）。通过标准：该 turn_id 无 `ChannelClosed`、无 `turn_completed_applied` / `sidebar_generating_off`（B2 版）；该会话无 `Idle kill`（I1 版即应满足）；侧栏等待标记仍在；回到会话点选 → `POST …/asks/<id>/answer status=200`，期间无 `Conversation runtime recovered` / `session spawn env`；agent 继续回复；DB 该 tool_call `status=finish`；**作答后不出现派生卡片**（N1）。13. **B 重启脱困**：按 11 的方式再触发一次提问，待答时完全退出 AionUi → 重启 → 打开会话：派生卡出现（标题/多题/其他输入与实时卡一致，顶部有 `askStaleHint`）→ 点选 → 日志出现 send 的 `runtime_ensure` 与新用户消息；DB 新增 `position=right` 消息且内容为 i18n 模板渲染结果；agent 回复引用所选 label；派生卡不再出现（待办 0b）。对 CLI 导入会话（如 4ed3b3ce）重复一次，确认 `ensureCliResumeBeforeSend` 的 resume re-wire 先于发送。14. **D 失败反馈**：用一个进程已死（`has_task=false`）且 `confirmation.list` 为空的场景（13 的前半段）确认自动走消息；关闭 aioncore 模拟网络错误，确认卡片显示错误 + 两个按钮，且连点不会重复提交。

**静态检查**：`bunx tsc --noEmit`、`bun run i18n:types`、`node scripts/check-i18n.js`、`bun run lint:fix`（后 `git status`）、`bun run format`。

### 实测记录（2026-10-12，Dev 应用 ~/.aionui-dev，CDP 驱动）

- **11 A 基线（官方 v0.2.2，`AIONUI_BACKEND_BIN` 指向临时下载包）** 已验证：会话 0101c494，09:25:07 `CLI-initiated turn started turn_b31d9ce8` + AskUserQuestion 落库 + `event="Ask"`；09:28:07.721 `turn finished … terminal=ChannelClosed`（+180.4s）；`sidebar_generating_off source=turnCompleted`；09:35:13 `Idle kill … reason=IdleTimeout`；之后 `has_task:false`、`/confirmations` 为空。
- **12 A 补丁（I1+B2，仅合并版）** 已验证：会话 8a1dc9d2，09:50:06 提问；停留在其他页面 14 分 35 秒；期间无 ChannelClosed / turn_completed_applied / sidebar_generating_off / Idle kill；看门狗每 3 分钟 `orphan turn idle but agent awaits user input; keep feeding`，空闲扫描每分钟 `Idle scan: pending user input protects idle agent`（idle_ms 657s→837s）；10:04:41 UI 点选 → `POST …/asks/1fe1247b…/answer 200` → `AskResolved` → 10:05:01 回复"已收到：选择 A 继续" → `terminal=Finish`；`runtime/ensure` 返回 already active（无 spawn）。未单独做 I1-only 版本。
- **13 B 重启脱困** 已验证：会话 d3d29fe3，待答时杀掉 Electron（aioncore/claude 随之退出）→ 行保持 `work/running` → 重启后 `startup recovery kept a pending user prompt … KeepPendingUserPrompt`（待办 14）→ 重开出现派生卡（`message-question-stale-hint`）→ 点选 → 10:15:48 `runtime/ensure` 拉起新进程 → 10:15:49 `POST /messages 202` → DB 新增 right 消息"对上一个问题的回答：\n「下一步」：A 继续"→ 回复"已选择「A 继续」…"→ 卡片不再出现。CLI 导入会话未重复实测（dev 无导入会话；顺序由 `executeCommand` 内的 `ensureCliResumeBeforeSend` 保证）。
- **14 D 失败反馈** 已验证：会话 d7fb16ad，Playwright 拦截 `/asks/*/answer` 与 `/confirmations` 模拟断网 → 卡片显示"回答提交失败：Failed to fetch (127.0.0.1:50904)"+「重试」「作为消息发送」；解除后点重试 → 后端仅 1 次 `POST … 200` → 回复"你选择了「A 继续」…"→ 作答后无派生卡。"进程已死自动走消息"即 13 的路径。
- 已知副作用：作答后派生卡消失，但该 AskUserQuestion 行按设计保持 `work/running`，View Steps 分组会一直显示运行中图标（后续可在前端对"已有后续用户消息的 AskUserQuestion 行"视为已结清）。
- 单测/静态：`cargo test` task_manager 7、background_stream 18、startup_recovery 8 全部通过；`tests/unit/ace-ask-recovery` 5 文件 69 用例；`omc ralph verify` 全量 vitest 545 文件 5403 用例通过；tsc / i18n / format:check 通过。

## ADR

- **Decision**：后端两处豁免（I1 空闲扫描读 `get_confirmations()`、B2 看门狗读同源的 `pending_probe`）让"等用户作答"的 claude 进程与回合永不被回收；前端从历史 `tool_call` 派生待答卡片，提交时先问后端（`confirmation.list` → `answerAsk`），进程确实不在（`has_task=false`）才把答案经既有发送管线（`sendbox.submit` → `executeCommand`）作为普通消息重发；所有失败可见、可重试、可改为手动重发。
- **Drivers**：Round 3 "待答期间永不回收"；Round 2 "自动唤醒并重发"且新进程接不回旧 control request；二进制为官方 v0.2.2，补丁须可重编、可上游化。
- **Alternatives considered**：B1 本地标志（被 1s 心跳清零）、B3 取消超时（丢失孤儿保护）、I1' 新 trait 方法（重复职责）、I2 续 lease（切走即失效）、I3 续开回合置 Running（改变 #758 语义）、S2 后端落库 ask（违反规格）、R2 直调 IPC（绕过 resume/闸门）、R3 预填手动发送（违背 Round 2）、R1' context 直 await（备选）。
- **Why chosen**：B2 + I1 读同一真实来源（原则 1），改动沿用既有豁免模式（原则 5），探针只在超时时调用无逐帧开销；S1 + R1 不新增契约（原则 3）、复用发送管线保证 CLI 导入会话的 resume re-wire；显示用启发式、提交用后端真相，把误判限制在"多显示一张卡"而非"错答/重复答"。
- **Consequences**：
  - 待答中的会话各占一个 claude 进程，直到作答/拒答/应用退出（用户已接受）。
  - `get_confirmations()` 对 ACP manager / Aionrs 实例同样生效：它们有未决提示时也不会被空闲扫描回收（期望行为）。
  - 捆绑二进制在上游合并前为本地编译版（manifest `local-build`），`prepareAioncore.js` 会覆盖。
  - 规格验收 B/C 的表述按 0a/0b 调整；目录规模按 0c 豁免。
  - 派生卡片在"作答后 5 秒内"与"hydrate 前"主动不显示，可能有不到 1 秒的空白，不会出现误答。
- **Follow-ups**：（评审建议，未实施）B3 可改为仅当该行之后没有 `position='right'` 消息时才保留，与前端规则 4 对齐并让 View Steps 图标在下次重启自愈；`claude_conn` 在 stdout EOF 处未清空 `pending_perms`，叠加 I1 后异常退出的 agent 条目不会被空闲回收（进程已死，仅残留任务项），上游 PR 时一并处理；派生卡重发时 `markSendStarted` 令 `isProcessing=true` 会卸载卡片，发送失败后重挂载时 `failure` 状态丢失，只剩 SendBox 自身提示；`emitter.listenerCount('sendbox.submit')` 是全局计数，多个 SendBox 同时挂载时快速失败退化为等满 10 秒；（新增）B3 已随本次交付（commit 31421af2），上游 PR 需一并提交；View Steps 对保留的 `work/running` AskUserQuestion 行持续显示运行图标，可在前端将“已有后续用户消息”的该类行视为已结清；上游 PR（I1 + B2 + 单测）合并后回归官方 release；若 R1 事件通道在实现中暴露更多问题，切换 R1'；后续可考虑在后端持久化 `ask` 帧以取代前端派生（当前规格 Non-Goal）；验收 A 的基线复现脚本可沉淀为回归用例。

## 变更记录

- v1（2026-10-12）：Planner 草稿。
- v2（2026-10-12）：吸收 Architect r1 + Critic r1（路径更正、B1→B2、I1 改 `get_confirmations`、B3 走发送管线、验收 A/C 重写、ace 规范、i18n）。
- v3（2026-10-12）：吸收 Architect r2 + Critic r2（N1 派生假卡片、`isTeam`→`hideSendBox`+`type`、监听器 deps/闸门/`listenerCount`/超时、题干匹配、`rig_with_opts` 扩签名、真实 store 测试、引用修正）。
- v4（2026-10-12，共识）：吸收 Architect r3（APPROVE_WITH_CHANGES）+ Critic r3（APPROVED）：规则 3 锚点改为作答时刻（`answerClock.ts` + 一次性重算定时器）；自动重发条件改为只读会话详情的 `runtime.has_task === false`（禁用 `ensureRuntime` 探测，runtime `state` 不可作信号）；`sendbox.submit` 增加 `ack`，10 秒只等接收确认，新增 `askResendUnconfirmed` 文案；引用补 `aionui-conversation/src/routes.rs:26-39`、`service.rs:2183`、`storage.ts:146/176`；ADR 定稿；增加 `计划/AionUi/` 正本副本说明。
