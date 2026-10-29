# codex 生成图片显示计划

> 2026-10-28　状态：已完成（dev 验收通过，正式版待下次升级生效）　执行人：AI
> 本文结构：顶部是执行待办；下面全部是附录。需求基线见 `.omc/specs/deep-interview-codex-image-display.md`。

## 计划 / 待办清单

**A. aioncore（fork `~/wmm-code/ace-diy/AionCore`，分支 `fix/pending-ask-keepalive`）**

- [x] 1. **给 `ToolCallEventData` 加可选 `image` 字段** —— `{ path, mime_type }`，为空时不序列化；补齐所有构造点（见附录一 §A1）
- [x] 2. **codex 生图结果标上图片类型** —— `codex_conn.rs` 生成 `FilePath` 时按扩展名填 `mime`（附录一 §A2）
- [x] 3. **ToolResult 映射时带出图片** —— `session_agent.rs` 只取 `mime` 为 `image/*` 的 `FilePath` 填 `image`；`output` 不变（附录一 §A3）
- [x] 4. **aioncore 测试** —— 映射、序列化、入库合并三组用例，`cargo test` 相关 crate 通过（附录一 §A4）
- [x] 5. **本地提交 + 编译 + 只替换 dev 用的两处二进制** —— 不 push、不碰 `/Applications`（附录一 §A5）。2026-10-28：commit `77fdeb09`，二进制 sha `854c33d1`

**B. AionUi 实时显示**

- [x] 6. **类型与归一化** —— `IMessageToolCall.content` 加 `image?`；`normalizeToolCall` 读 `content.image.path` 填 `imagePath`（附录一 §B1）
- [x] 7. **图片移到折叠区外** —— `MessageToolGroupSummary` 在 View Steps 下方、`showMore` 条件之外渲染这一组的图片；`ToolItemDetail` 不再重复画图（附录一 §B2）
- [x] 8. **图片卡片：放大 / 下载 / 读不到就不显示** —— 用 Arco `Image` 而不是 `LocalImageView`，复用现有 i18n 键（附录一 §B3）

**C. 旧数据回退（库里没有图片信息的已完成生图行）**

- [x] 9. **主进程只读 IPC `ace:find-codex-image`** —— 用完整 call id 在 `~/.codex/generated_images/*/` 下找 `<callId>.<ext>`；校验 id、只在该目录内查、未命中不缓存（附录一 §C1）
- [x] 10. **渲染端按需调用** —— 只对 `name === 'imageGeneration'`、已完成、无 `image` 的 `tool_call` 行调用；结果只用于显示，不写库（附录一 §C2）

**D. 导入历史**

- [x] 11. **`parseCodex` 识别完成的生图事件** —— 匹配 `payload.type=item_completed` 且 `payload.item.kind=image_gen.generation`，取 `savedPath`（附录一 §D1）
- [x] 12. **导入成工具行并带上图片路径** —— 走现有 `tool` 条目 → `acp_tool_call` 行，`raw_output.image` 引用原文件、不复制；渲染沿用现有 `getAcpImagePath`（附录一 §D2）

**E. 测试与验收**

- [x] 13. **AionUi 单元测试** —— 用例清单见附录一 §E1；文件放 `tests/unit/` 下，DOM 测试用 `*.dom.test.tsx`
- [x] 14. **全量检查** —— `bunx tsc --noEmit`、`bun run lint:fix`（之后按附录三还原越界改动）、`bun run format`、`bun run test`
- [x] 15. **dev 真实生图验收** —— 必须真生成一张，mock 不能代替；步骤见附录二 §1。403 时停下报告，不转正式版
- [x] 16. **dev 旧行回退与导入验收** —— 附录二 §2、§3
- [x] 17. **收尾** —— 更新 memory / `ACE_CHANGES.md`（2026-10-28）。本轮测试图 `01a17ec5-…/exec-cc161ca3-….png` 暂留，见附录五

---

# 附录一：方案是什么

## 数据流（修好之后）

```text
实时：codex savedPath
  → codex_conn: FilePath{ path, mime:image/png }          (步骤 2)
  → session_agent: ToolCallEventData.image                (步骤 1、3)
  → stream_persistence 写 tool_call 行 content.image       (aioncore 原有 upsert + json_patch，无需改)
  → WebSocket / 历史 API 原样带 content
  → normalizeToolCall: imagePath                           (步骤 6)
  → MessageToolGroupSummary 折叠区外的图片卡片              (步骤 7、8)

旧行（库里无 image，例如正式版小狗那行）
  → 渲染端调 ace:find-codex-image(callId)                  (步骤 9、10)
  → 同一个图片卡片

导入：rollout item_completed.savedPath
  → parseCodex 产出 tool 条目(imagePath)                   (步骤 11)
  → mapRows 写 acp_tool_call 行 raw_output.image           (步骤 12)
  → 现有 normalizeAcpToolCall/getAcpImagePath → 同一个图片卡片
```

不新增数据库列、不加迁移：aioncore 的 `tool_call` 行内容就是 `ToolCallEventData` 的 JSON，字段跟着结构体走。

## A. aioncore

### §A1 `ToolCallEventData.image`

文件：`crates/aionui-ai-agent/src/protocol/events/tool_call.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolCallImage {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}

// in ToolCallEventData
/// Generated image produced by this call (codex imageGeneration).
/// Skipped when `None`: storage merges frames with RFC 7396 merge-patch,
/// so a null would DELETE the image recorded by the completed frame.
#[serde(default, skip_serializing_if = "Option::is_none")]
pub image: Option<ToolCallImage>,
```

- `skip_serializing_if` 必须加：入库用 `json_patch`（`crates/aionui-db/src/repository/sqlite_conversation.rs:135-145`），后续收尾帧若写 `"image": null` 会把已存的图片删掉。同文件 `name`/`args` 字段的注释是同一个原因。
- 构造点：非测试代码约 34 处字面量（`session_agent.rs` 7、`stream_relay.rs` 12、`background_stream.rs` 4、`events/mod.rs` 3、`translate.rs` 2、`backend_output_sink.rs` 2 等）。逐个补 `image: None`。若数量让 diff 过大，可给结构体派生 `Default`，但 `ToolCallStatus` 没有默认值，需要一并处理——执行时选改动更小的那个，在提交说明里写明。
- 测试代码里的字面量同样要补，否则编译不过。

### §A2 codex 生图标图片类型

文件：`crates/aionui-session/src/backend/codex_conn.rs:3245-3253`

现在 `imageGeneration` 的 `FilePath` 是 `mime: None`。改为按扩展名推断：`png→image/png`、`jpg/jpeg→image/jpeg`、`webp→image/webp`、`gif→image/gif`，其他扩展名保持 `None`。只改 `imageGeneration` 分支，`fileChange` 的 `FilePath` 不动。

### §A3 映射带出图片

文件：`crates/aionui-ai-agent/src/session_agent.rs:4256-4279`（`SessionEvent::ToolResult` 分支）

- 新增一个小函数 `tool_result_image(&content) -> Option<ToolCallImage>`：取第一个 `mime` 以 `image/` 开头的 `FilePath`。
- `output` 仍由 `tool_result_text` 生成，不变。
- 只认 `mime` 是图片的 `FilePath`：`fileChange`、ACP diff/locations 产生的 `FilePath` 都是 `mime: None`（`acp_conn.rs:2206`、`:2226`），不会被误判成图片。

### §A4 aioncore 测试

1. `session_agent`：`ToolResult` 含 `FilePath{mime:image/png}` → `image == Some(path)`；含 `mime: None` 的 `FilePath` → `image == None`；只有 `Text` → `image == None`、`output` 不变。
2. 序列化：`image: None` 时 JSON 里没有 `image` 键。
3. 入库合并：参照 `stream_relay.rs:2610-2672` 的 `run_tool_call_persists_message`，running 帧无 `image`、completed 帧带 `image`、再来一个无 `image` 的收尾帧，断言最终 content 里 `image.path` 仍在。
4. `codex_conn`：扩展现有 `codex_imagegeneration_saved_path_reaches_file_path`（`:9490`），断言 `mime == Some("image/png")`。

命令：`cargo test -p aionui-session -p aionui-ai-agent -p aionui-conversation`。

### §A5 提交与安装

- 本地 commit 到 `fix/pending-ask-keepalive`，提交信息不加 AI 署名（沿用该分支惯例）。不 push，不提 PR。
- `cargo build --release --bin aioncore`。
- dev 版加载的是 `AionUi/resources/bundled-aioncore/darwin-arm64/aioncore`（`binaryResolver.ts:93` 的 dev 回退，`electron-vite dev` 不把 `resourcesPath` 指到仓库）。替换它，并同步 `.local/aioncore-bundle/darwin-arm64/aioncore`（打包用的副本，保持一致）。两处都不在版本控制里。
- **先 `rm` 再 `cp`**：原地覆盖同一 inode 会被 macOS SIGKILL。
- 替换前把两处旧二进制（sha `3e09b1c2`）备份到 `.local/aioncore-bundle/darwin-arm64.bak-7e17abcb/`。
- 更新 `.local/aioncore-bundle/darwin-arm64/manifest.json` 的 `source.commit` 和 `patch` 说明。
- `/Applications/AionUi.app` 和 `target/release` 以外的任何位置都不碰。
- 替换后 dev 版要完全退出再启动，后端是常驻进程。

## B. AionUi 实时显示

### §B1 类型与归一化

- `packages/desktop/src/common/chat/chatLib.ts:215` `IMessageToolCall.content` 加 `image?: { path: string; mime_type?: string }`。
- `packages/desktop/src/common/chat/normalizeToolCall.ts:202` `normalizeToolCall` 返回 `imagePath: content.image?.path`。`NormalizedToolCall.imagePath` 已存在（`:16`）。
- 实时帧合并：`chatLib.ts:1030-1036` 是浅合并 `{...msg.content, ...message.content}`，后续帧不带 `image` 键时会保留，无需改。

### §B2 图片移到折叠区外

文件：`packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.tsx`

- 现状：`ToolItemDetail` 整个在 `showMore &&` 里（`:164`），所以图片会被折叠隐藏。
- 改法：
  - `MessageToolGroupSummary` 从 `tools` 收集有 `imagePath` 的项，在 `tool-group-summary__body` 之后、`showMore` 条件之外渲染图片卡片列表。
  - `ToolItemDetail` 删掉现有的图片块（`:121-138`），只保留"有图片"这个可展开标记，避免展开后重复显示。
  - 同时作用于 `acp_tool_call` 的图片（已有的 ACP 生图），行为从"展开才看到"变成"直接看到"——这是本需求要的效果。现有测试 `tests/unit/chat/MessageToolGroupSummary.dom.test.tsx:53` "renders generated image preview when an ACP image tool call is expanded" 要相应改断言。
- 旧行回退（§C2）得到的路径也进同一个列表。

### §B3 图片卡片

- 组件放在 `MessageToolGroupSummary.tsx` 同文件内（`components/` 目录已有 20 项，不再新增文件）。
- 读图：`ipcBridge.fs.getImageBase64.invoke({ path })`；拿到 data URL 后用 Arco `<Image>` 显示（自带点击放大；`MessageList.tsx:794` 的 `Image.PreviewGroup` 让同一会话的图可左右切换）。
- 下载：复用现有 `handleDownloadImage` 逻辑和 `acp.image.download / download_aria / download_success / download_error` 键。
- 读不到（返回空、抛错、或返回占位图）就不渲染这张卡片，不打 `console.error`。占位图判断复用 `FilePreview.tsx:20` 的 `IMAGE_NOT_FOUND_B64_MARKER` 思路：把该常量挪到共享位置或在本组件内同值定义，二选一以改动小为准。
- 不新增 i18n 键；`alt` 用文件名，取不到时用 `acp.image.generated_alt`。
- 不用 `LocalImageView`：它返回裸 `<img>`，没有放大预览，失败时还保留原路径并打错误日志。

## C. 旧数据回退

### §C1 主进程 IPC

- 处理函数放 `packages/desktop/src/process/ace/sessionFiles.ts`（只读文件查询已集中在这里，如 `checkWorkspacesExist`），`aceBridge.ts` 只加一行 `ipcMain.handle('ace:find-codex-image', ...)`。`process/ace/` 已有 11 项，不新增文件。
- preload `packages/desktop/src/preload/main.ts` 的 ace 段加 `findCodexImage: (callId: string) => ipcRenderer.invoke('ace:find-codex-image', callId)`。
- 逻辑：
  1. 校验 `callId` 匹配 `^[A-Za-z0-9_-]{1,128}$`，否则返回 `null`（防止拼出 `../`）。
  2. 根目录 `join(homedir(), '.codex', 'generated_images')`；不存在返回 `null`。
  3. 遍历一层子目录，找 `<callId>.png|jpg|jpeg|webp|gif`（文件名**就是 call id**：实测 `exec-2bbf91fd-….png`，不要再加 `exec-` 前缀）。
  4. 对结果做 `realpath`，确认仍在根目录内（拒绝符号链接逃逸）。
  5. 命中结果缓存在内存 `Map`；**未命中不缓存**（文件可能稍后才出现）。
- 测试：用临时目录作为根，函数接收可选根参数供测试注入。

### §C2 渲染端调用

- 位置：`MessageToolGroupSummary` 内一个小 hook（同文件），对满足条件的项调用一次 `window.electronAPI.findCodexImage`：`type === 'tool_call'`、`name === 'imageGeneration'`、状态已完成、`imagePath` 为空。
- 没有 `electronAPI`（WebUI 模式）就跳过，不报错。参照 `renderer/ace/useConversationMessageCount.ts:13` 的可选 API 写法。
- 结果只用于显示，不写回数据库。
- 注意：实时行的 id 是否等于生图文件名，以第一次 dev 真实生图抓到的数据为准（正式版小狗那行 id `exec-2bbf91fd-…` 与文件名一致，但 dev 里 codex 命令行的 id 是 `call_*`）。若不一致，本回退只对历史数据生效，新数据靠 aioncore 带出的 `image`，在附录二 §1 里记录结论。

## D. 导入历史

### §D1 `parseCodex` 识别生图事件

文件：`packages/desktop/src/process/ace/messageParser.ts:360-437`

真实记录（两份 rollout 实测）：

```json
{
  "type": "event_msg",
  "payload": {
    "type": "item_completed",
    "item": {
      "type": "Extension",
      "kind": "image_gen.generation",
      "id": "exec-ad328acb-…",
      "status": "completed",
      "result": "<base64，数 MB>",
      "savedPath": "/Users/…/.codex/generated_images/<thread>/exec-ad328acb-….png"
    }
  }
}
```

- 在现有 `function_call` 分支之前加一个分支：`payload.type === 'item_completed'`、`payload.item.kind === 'image_gen.generation'`、`item.status === 'completed'`、`savedPath` 是字符串 → 产出一个 `tool` 条目：`callId = item.id`、`name = 'imageGeneration'`、`title` 用 `toolTitle('imageGeneration', …)`、`toolKind: 'other'`、`imagePath = savedPath`。
- 不读 `result`（base64），也不处理 `custom_tool_call` / `custom_tool_call_output`：后者里的 `input_image` 与 Extension 是同一张图，处理会重复。
- `ParsedCliItem` 的 `tool` 分支（`packages/desktop/src/common/ace/types.ts:104`）加 `imagePath?: string`。

### §D2 导入成工具行

文件：`packages/desktop/src/process/ace/messageImporter.ts`

- `toolCallContent`（`:104`）在 `t.imagePath` 存在时写 `raw_output: { image: { path, mime_type, source: 'codex_image_generation' } }`。
- 渲染沿用现有链路：`normalizeAcpToolCall` → `getAcpImagePath`（`acpToolCallOutput.ts:69`）读 `raw_output.image.path` → §B2 折叠区外的卡片。
- 不经过 `materializeCliImages`（它只处理 `kind: 'image'` 的 base64 条目），不复制文件。
- 去重：`mapRows` 已按 `liveToolIds` 跳过实时写过的工具行（`:223`），但该集合只查 `type = 'acp_tool_call'`（`:333`）。实时生图行是 `tool_call` 类型，同一会话既有实时行又被导入时会重复显示一张图。把 `:333` 的查询扩到 `type IN ('acp_tool_call','tool_call')`。

## E. 测试

### §E1 AionUi 单元测试（`tests/unit/` 下）

| 文件                                                                        | 用例                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/chat/normalizeToolCall.test.ts`（已有，追加）                   | `tool_call` 带 `content.image.path` → `imagePath`；不带 → `undefined`                                                                                                                                             |
| `tests/unit/chat/MessageToolGroupSummary.dom.test.tsx`（已有，修改+追加）   | View Steps 折叠时图片仍可见；展开后不重复；读图返回空时不渲染卡片、无 `console.error`；旧行触发一次 `findCodexImage` 并显示；非图片工具不触发查找                                                                 |
| `tests/unit/ace-cli-resume.test.ts`（已有，追加到 tool-call extraction 段） | Extension 完成事件 → `tool` 条目带 `imagePath`；无 `savedPath` 或 `status != completed` → 不产出；`toolCallContent` 写 `raw_output.image`；`mapRows` 不调用 `materialize`；实时 `tool_call` 行存在时导入跳过同 id |
| `tests/unit/ace-delete-files.test.ts`（已有，追加 describe）                | `findCodexImage`：命中返回路径；未命中返回 `null` 且下次重新查；非法 id（含 `/`、`..`）返回 `null`；符号链接指向根目录外返回 `null`                                                                               |

不新建测试文件；`tests/unit/` 已有 54 项。

---

# 附录二：验收

全部在 dev 版做（`bun run dev`，数据目录 `~/.aionui-dev` → `~/Library/Application Support/AionUi-Dev/aionui`，数据库 `aionui-backend.db`）。工作目录 `~/.aionui/live-verify/`。正式版和它的数据不碰。

## §1 实时真实生图（spec 验收 1、2、3）

1. 替换二进制后完全退出 dev 版再启动；`ps` 确认后端进程路径是 `resources/bundled-aioncore/...`、启动时间是新的。
2. 新建 codex 会话，工作目录 `~/.aionui/live-verify/`，发"生成一张小狗图片"。
3. 记下这次的 call id 和图片路径（下面的 SQL 取得），写进本节结果。
4. 生成结束：图片在正文、View Steps 折叠状态下可见；点击可放大；悬停可下载。
5. 切到别的会话再切回、完全退出再启动 dev 版：图片仍在。
6. 查库（只跑 select；不用 `-readonly`，WAL 库在该模式下打不开），证明 aioncore 那一半生效：
   ```bash
   sqlite3 ~/.aionui-dev/aionui-backend.db \
     "select id, json_extract(content,'$.name'), json_extract(content,'$.image.path')
      from messages where type='tool_call' and json_extract(content,'$.image.path') is not null
      order by created_at desc limit 1"
   ```
   必须返回这次生成的路径。
7. 对比 `id` 与图片文件名是否一致，结论写入附录一 §C2。

**403 处理**：若 codex 被中转拒绝（见 memory `codex-acetoken-403`），停下并报告，不转正式版、不用 mock 宣称通过。可以先完成 §2、§3。

## §2 旧行回退（spec 验收 4）

在 dev 库对**本次 §1 生成的那一行**做副本，副本去掉 `image`，模拟老数据：

```sql
insert into messages (id, conversation_id, msg_id, type, content, position, status, hidden, created_at)
select id || '-legacy', conversation_id, msg_id || '-legacy', type,
       json_remove(content, '$.image'), position, status, hidden, created_at + 1
from messages where id = '<§1 的 call id>';
```

- 副本的 `call_id` 仍是原 id，回退应按它找到同一张图并显示。
- 再插一条 `call_id` 不存在的副本：不显示图、无报错。
- 验收后删除这两条副本（按 `id like '%-legacy'` 且 `conversation_id` 为本次会话）。

## §3 导入历史（spec 验收 5）

1. 在 dev 版点"导入 CLI 会话"，打开小猫那个会话（codex session `01a1573e-588e-70b1-bd64-6f3e949e8dab`）。
2. 小猫图在正文可见，可放大、可下载。
3. 只读查库，导入行引用原文件：
   ```bash
   sqlite3 ~/.aionui-dev/aionui-backend.db \
     "select json_extract(content,'$.update.raw_output.image.path') from messages
      where id like 'cli-%' and json_extract(content,'$.update.raw_output.image.path') is not null"
   ```
   路径在 `~/.codex/generated_images/01a1573e-…/` 下。
4. `~/.aionui-dev/ace-cli-images/01a1573e-588e-70b1-bd64-6f3e949e8dab/` 不存在或没有新文件。

## §4 兼容与收尾（spec 验收 6、7、8）

- 打开 dev 里一个含 Bash/Read/Edit 工具调用的会话：View Steps 展开、折叠、内容与改动前一致，无图片卡片，无新错误日志。
- 已有 ACP 生图的会话（若 dev 里有）：图片现在直接可见。
- 收尾：
  - 只删 §1 记录的那一张图片，以及它所在、且只含这张图的线程目录。删除前 `ls` 确认。
  - 小猫 `01a1573e-…`、小狗 `01a17b55-…` 两个目录一律不碰。
  - dev 测试会话保留，方便复现。

---

# 附录三：依据与证据

## 为什么两边都改（用户 Round 1 选择）

- 丢失点在 aioncore：`crates/aionui-ai-agent/src/session_agent.rs:4263` `output = tool_result_text(&content)`，`tool_result_text`（`:4579-4590`）只收 `Text`，`codex_conn.rs:3245` 已产出的 `FilePath` 被丢弃。上游 `upstream/main` 同样如此。
- 入库也在 aioncore：`crates/aionui-conversation/src/stream_persistence.rs:448-483` 把 `ToolCallEventData` 序列化成 content 直接 upsert。AionUi 主进程收不到这条事件（WebSocket 只在渲染进程连接），所以"主进程补写"不可行。
- 只改 AionUi 的回退方案不能覆盖：实时行 id 与文件名不一定一致（见 §C2 注意），而 aioncore 带出的路径是 codex 自己报告的准确路径。

## 第 2 版计划被否掉的设计及原因

| 第 2 版设计                                   | 问题                                                                                     | 本版                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| `messages` 加 `image_path` 列 + 迁移          | aioncore 的消息行固定 10 列，API 只透传 `content`，新列到不了前端；AionUi 也没有迁移目录 | 用 content JSON 里的可选 `image`  |
| 主进程收到 completed 后补写                   | 不存在 `messageHandler.ts`；主进程收不到流事件                                           | aioncore 直接带出                 |
| 只改 `normalizeToolCall`，Summary 不动        | 图片在 `showMore` 条件内，折叠时看不到                                                   | 图片移到折叠区外                  |
| 查找 `exec-${callId}.<ext>`                   | call id 本身就是 `exec-…`，会拼成 `exec-exec-…`                                          | 直接用 `<callId>.<ext>`           |
| 解析 `msg.content.Extension.event`            | 真实结构是 `payload.item.kind`，两份 rollout 都匹配不上                                  | 按真实结构解析                    |
| 测试放 `packages/desktop/src/...`             | vitest 只收 `tests/**`（`vitest.config.ts:31`、`:47`）                                   | 放 `tests/unit/`                  |
| 403 时转正式版或用 mock 通过                  | 违反"不动正式版""真生图验收"                                                             | 停下报告                          |
| 数据库路径 `~/.aionui/AionUi-Dev/aioncore.db` | 不存在                                                                                   | `~/.aionui-dev/aionui-backend.db` |

## 实测数据

- 两份 rollout 的生图完成事件：小猫 第 22 行、小狗 第 20 行，结构都是 `event_msg / item_completed / Extension / image_gen.generation`，`savedPath` 文件名 = `item.id` + `.png`，文件存在。
- 正式版数据库小狗那行：`id = exec-2bbf91fd-…`，`type = tool_call`，`args.status = in_progress`，`result = ""`，没有 `output`。
- dev 后端二进制与 `.local` 副本 sha 都是 `3e09b1c2`，对应 fork commit `7e17abcb`。
- 读图接口 `/api/fs/image-base64` 的允许根目录含家目录（`crates/aionui-app/src/router/state.rs:154`），`~/.codex/` 读得到。

---

# 附录四：风险 / 其他

- **codex 403**：dev 拉起的 codex 可能被中转拒绝（memory `codex-acetoken-403`）。10-27 正式版用同样的 originator 生成成功过，先实测；失败按附录二 §1 处理。
- **aioncore 构造点多**：约 34 处非测试字面量要补字段，编译器会逐个报出，漏不掉；风险只在 diff 体积。
- **lint:fix 越界**：memory `lint-fix-rewrites-unrelated-files`。跑之前 `git status --porcelain > /tmp/before.txt`，跑完对比；不在本计划文件清单里的改动一律 `git restore`。本计划改动的 AionUi 文件：`chatLib.ts`、`normalizeToolCall.ts`、`MessageToolGroupSummary.tsx`、`sessionFiles.ts`、`aceBridge.ts`、`preload/main.ts`、`messageParser.ts`、`messageImporter.ts`、`common/ace/types.ts`、上述 4 个测试文件。
- **正式版暂不生效**：正式版要等下次重装 aioncore 和 AionUi。本次不碰。
- **fork 补丁叠加**：分支上已有 keepalive、new-api `/v1`、lark_intl 三组补丁，这是第四组。升级 aioncore 时要一起 rebase，在 `ACE_CHANGES.md` 和 memory `aioncore-local-fork` 里记上。
- **目录规模**：本计划不新增源码文件；`process/ace/`（11）、`Messages/components/`（20）已超 10，按 ratchet 规则不清理也不加重。
- **AionUi 不提交、不 push**，除非另行要求。

---

# 附录五：执行记录（2026-10-28）

- aioncore：fork `fix/pending-ask-keepalive` commit `77fdeb09`（未 push）。`cargo test -p aionui-session -p aionui-ai-agent -p aionui-conversation` 全部通过。字段补齐实际为 39 处字面量（含测试）。
- 合并测试放在 `crates/aionui-conversation/tests/stream_relay_tool_call.rs`（用真实 SQLite 仓库验证 json_patch 保留 image），不在 `stream_relay.rs` 的模块内测试里。
- dev 二进制：`resources/bundled-aioncore/darwin-arm64/aioncore` 与 `.local/aioncore-bundle/darwin-arm64/aioncore` 均为 sha `854c33d1`；旧版 `3e09b1c2` 备份于 `.local/aioncore-bundle/darwin-arm64.bak-3e09b1c2/`；两处 manifest `source.commit` 改为 `77fdeb09`。
- AionUi：`bunx tsc --noEmit` 通过；`bun run test` 5841 通过（新增 9 条）。lint:fix 越界改写 `aioncoreSchema.ts`、`aceImportDedupe.test.ts`、`verifyElectronSidebar.mjs`，已还原。
- §1 实时验收：dev 真实生图，库里查到 `exec-cc161ca3-4e5e-4c45-b42a-14dde5d71a70` → `content.image.path = ~/.codex/generated_images/01a17ec5-980f-7a02-879d-17d3ae8b88cd/exec-cc161ca3-….png`。实时行 id 与图片文件名一致，附录一 §C2 的疑问解除：按 id 回退对新老数据都成立。
- §1–§4 其余项：用户在 dev 中逐项验证通过（正文直接显示、切换与重启后仍在、放大、下载、导入小猫、非图片工具无变化）。
- 未清理：本轮测试图暂留，删除需用户确认（`rm -r ~/.codex/generated_images/01a17ec5-980f-7a02-879d-17d3ae8b88cd`）。
- 正式版：仍是旧二进制 `3e09b1c2`，下次重装 AionUi 与 aioncore 后生效。
