# 新 CLI 后端适配 — 需求模板（fork 专属）

> 用途：以后想让本应用适配新的本地 CLI 代理（如 Gemini CLI、opencode、Aider 等）时，
> 把下面的"需求模板"整段复制给 AI（`/deep-interview` 或 `/oh-my-claudecode:plan`），
> 替换 `<CLI 名称>` 即可。所有既有实现的注册表见根目录 [ACE_CHANGES.md](../../ACE_CHANGES.md)，
> 代码在 `packages/desktop/src/process/ace/` 与 `packages/desktop/src/renderer/ace/`。

## 需求模板（复制以下整段）

参照现有 Claude Code / Codex 的适配方式（见 `ACE_CHANGES.md` 和 `process/ace/`、`renderer/ace/`），
为 **<CLI 名称>** 增加同等支持，五条管线对齐：

1. **导入**：扫描它的本地会话存储目录，导入侧栏，幂等不重复（幂等键沿用
   `extra.cli_session_id`），带来源图标、标题、原 workspace 和真实活跃时间。

2. **历史展示**：点开会话能看到完整历史，沿用 replace-sync 管线（每次打开按
   会话文件重建 `cli-` 行，自愈旧数据）；它的 harness 注入噪音要过滤；图片还原
   落盘可点击预览；思考过程 / 压缩摘要用现成折叠行渲染，工具执行用现成
   `acp_tool_call` 紧凑行渲染（与 live 行按 tool_call_id 排重）。

3. **真 resume**：如果 aioncore 有这个后端的 ACP 适配器，点开后继续聊天必须是
   CLI 层面的真接续（写回原会话文件，不新建会话）；终端侧 resume 聊过的内容
   回到应用也要能看到。**如果 aioncore 不支持这个后端，先明确告诉我，降级为
   只读导入也可以接受。**

4. **删除联动**：删会话 / 删项目时一并删它的本地会话文件和图片缓存
   （`ace-cli-images/<sessionId>/`），`unlinkSessionFiles` 的路径白名单要加它的
   存储根目录；项目目录失效置灰等侧栏行为自动继承，无需新做。

5. **既有约束不变**：fork 隔离纪律（新逻辑放 `ace/` 子目录、动上游文件一律
   `// ace:` 标记包裹、登记 `ACE_CHANGES.md`）、单测覆盖、用我本机真实会话
   文件实证验证解析结果。

## 动手前必查的四件事（每个 CLI 的全部差异点）

| 待查项                           | Claude Code 的答案（参照）                                                              | Codex 的答案（参照）                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 会话文件在哪、什么格式           | `~/.claude/projects/<proj>/<uuid>.jsonl`                                                | `~/.codex/{sessions,archived_sessions}/**/rollout-*.jsonl`                                   |
| 稳定的会话 id 是什么             | jsonl 文件名 uuid（= `claude --resume` 的 id）                                          | rollout 文件名内 uuid                                                                        |
| aioncore 是否捆绑它的 ACP 适配器 | 有（`claude-agent-acp`）→ 能真 resume                                                   | 有（`codex-acp`，注意版本钉死见 ACE_CHANGES TODO）                                           |
| 噪音 / 图片 / 工具记录长什么样   | `isMeta`、`<command-*>`、`<system-reminder>`、base64 image 块、`tool_use`/`tool_result` | `<environment_context>`、`<turn_aborted>`、`input_image` data URL、`function_call`/`_output` |

第 3 项是分水岭：**没有 ACP 适配器就没有真 resume**（只能走导入 + 展示 + 删除
联动，或先给 [iOfficeAI/AionCore](https://github.com/iOfficeAI/AionCore) 上游提 PR）。
在需求里提前确认，避免做到一半才发现。

## 一句话版本

> 参照 `ACE_CHANGES.md` 里 Claude/Codex 的五条管线，适配 <CLI 名称>，
> 先调研 `docs/ace/cli-adapter-requirements-template.md` 里的四件事再出方案。
