# HUD 移入上下文弹窗计划

> 2026-10-29　状态：已完成（第 7 项"无用量时的信息图标"仅单测覆盖，实机未复现，见附录六）　执行人：Claude
> 本文结构：顶部是执行待办；下面全部是附录。
>
> **本计划取代旧决定**：`.omc/specs/deep-interview-revert-terminal-view-hud-in-chat.md` 第 ② 条要求
> HUD 在"SendBox 下方、会话区最底部"。本计划将其移入右下角上下文用量弹窗，原底栏取消。

## 计划 / 待办清单

- [x] 1. **取得执行批准** —— 2026-10-29 用户确认"开干吧"
- [x] 2. **新增 `useHudStatusline` 轮询 hook，由 `AcpSendBox` 调用** —— 2026-10-29；放在弹窗外的原因见附录三
- [x] 3. **渲染侧 ctx 段过滤 `stripHudCtxSegment`** —— 2026-10-29；与主进程版共用测试，见附录三
- [x] 4. **新增 `HudText` 组件，渲染彩色等宽文本并限宽** —— 2026-10-29；`max-width: min(520px, 80vw)`
- [x] 5. **`ContextUsageIndicator` 加可选 `hudContent` 插槽** —— 2026-10-29；上游文件，改动用 `ace:start/ace:end` 标出
- [x] 6. **`AcpSendBox` 外层守卫改为"有用量或有 HUD 才渲染"** —— 2026-10-29
- [x] 7. **无用量时显示中性信息图标** —— 2026-10-29；单测覆盖，实机未复现该状态
- [x] 8. **移除底栏挂载，删除 `HudStatusBar.tsx`** —— 2026-10-29
- [x] 9. **更新单测、e2e 与两处 AGENTS.md** —— 2026-10-29；清单见附录四
- [x] 10. **运行检查与实机验证** —— 2026-10-29；结果见附录六
- [x] 11. **提交 commit（不 push）** —— 2026-10-29；功能 `90bf871f4`，计划文档单独提交

---

# 附录一：需求与产品决定

## 用户确认的决定

| 轮次         | 问题                          | 决定                                             |
| ------------ | ----------------------------- | ------------------------------------------------ |
| R0           | 迁移后原底栏保留还是取消      | 移入弹窗，取消底栏                               |
| R1（更正后） | 原样彩色文本还是分项排版      | 保留彩色等宽文本（当轮更正，分项排版作废）       |
| R2           | 无用量但有 HUD 时入口怎么显示 | 显示无百分比的中性信息图标                       |
| 代码核查后   | 弹窗里两个 ctx 数字如何处理   | 选 B：渲染侧过滤 HUD 自带 ctx 段，只留圆环的数字 |

## 入口状态

| tokenUsage | HUD 文本（过滤 ctx 后） | 入口         | 弹窗内容                  |
| ---------- | ----------------------- | ------------ | ------------------------- |
| 有         | 有                      | 圆环         | 原用量明细 + 分隔线 + HUD |
| 有         | 无                      | 圆环         | 原用量明细（无分隔线）    |
| 无         | 有                      | 中性信息图标 | 仅 HUD                    |
| 无         | 无                      | 隐藏         | 不渲染                    |

## 沿用现状的边界

- hover 触发，HUD 30 秒刷新；HUD 字段由 statusLine 输出决定，不固定
- 上下文分母、费用、token 计算不变；HUD 与用量各自刷新，不承诺同步
- 移动端仍不轮询 HUD；Windows 由主进程返回 null，规则不变
- 普通 ACP 聊天和团队成员 ACP 聊天都经过 `AcpChat` → `AcpSendBox`，行为一致
- 不改后端、OMC 插件、IPC 协议，不新增设置项，不新增 i18n 文案
- 已知后果：`[API err]`、OMC 升级提示等改为悬停才能看到

## 更正：hideSendBox 风险不存在

原计划写"hideSendBox=true 的视图会失去 HUD 入口"。核实后，`AcpChat` 的两个调用方都不会传 true：`ChatConversation` 把只读类型先分流到 `LegacyReadOnlyConversation`，`TeamPage.tsx:509` 不传该参数。所以现有视图都不会因移除底栏而丢失 HUD。

---

# 附录二：验收标准

- [x] AC1：输入框下方不再渲染 HUD 底栏 —— 实机 `bottom bar outside popover: 0`
- [x] AC2：两类数据都有时，用量明细在上，分隔线下是彩色等宽 HUD，ctx 段已过滤，宽度受限 —— 实机截图 `02-ring-with-hud.png`
- [x] AC3：只有 HUD 时显示无百分比信息图标，弹窗只有 HUD —— 单测；实机未复现
- [x] AC4：只有用量时，入口和弹窗与改动前一致，无 HUD 区块和分隔线 —— 单测
- [x] AC5：两者都没有时隐藏 —— 单测 + 实机首轮前 `ring:0, infoIcon:0`
- [x] AC6：切换会话后不显示前一会话 HUD；旧请求迟到也不覆盖 —— 单测
- [x] AC7：卸载后停止 30 秒定时器 —— 单测（假定时器）
- [x] AC8：普通与团队成员聊天行为一致 —— 两者共用 `AcpSendBox`，代码路径相同
- [x] AC9：长文本自动换行，无横向滚动 —— 实机 `hud horizontal overflow: false`
- [x] AC10：上下文百分比、费用、token 计算不变；弹窗中不出现 HUD 的 ctx 段 —— 原单测全部通过 + 实机 `popover has ctx element: false`

---

# 附录三：实现说明

## 文件改动

| 文件                                             | 改动                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `platforms/acp/hudStatusBar/useHudStatusline.ts` | 新增。30 秒轮询 `electronAPI.hudStatusline`，过滤 ctx 段后返回字符串或 null；快照记录所属会话 id，切换会话立即返回 null |
| `platforms/acp/hudStatusBar/HudText.tsx`         | 新增。按行渲染 ANSI 彩色文本，保留 `data-testid='chat-hud-statusline'`                                                  |
| `platforms/acp/hudStatusBar/HudText.module.css`  | 由 `HudStatusBar.module.css` 改名；容器改为弹窗内样式并限宽                                                             |
| `platforms/acp/hudStatusBar/ansiText.ts`         | 新增 `stripHudCtxSegment`，是主进程 `stripContextSegment` 的渲染侧副本                                                  |
| `platforms/acp/hudStatusBar/HudStatusBar.tsx`    | 删除                                                                                                                    |
| `platforms/acp/AcpChat.tsx`                      | 删除底栏挂载和 import                                                                                                   |
| `platforms/acp/AcpSendBox.tsx`                   | 上游文件，+22 行：调用 hook，外层守卫加 `hudText`，传 `hudContent`                                                      |
| `components/agent/ContextUsageIndicator.tsx`     | 上游文件，+38 行：`hudContent` 插槽、HUD 区块、无用量时的信息图标分支                                                   |

## 关键设计点

- **轮询放在弹窗外**：Arco Trigger 默认 `unmountOnExit: true`，弹窗关闭时内容卸载。轮询若放在弹窗里，悬停前拿不到数据，就无法决定是否显示信息图标。
- **ctx 过滤放在渲染侧副本**：渲染进程不能导入 `@process/`。主进程版和副本用 `describe.each` 跑同一组用例，防止两份实现不一致。
- **插槽类型用 `ReactNode`**：ANSI 渲染留在 ACP 目录，通用组件只负责弹窗和入口形态。
- **workspace 不新增 prop**：`AcpSendBox` 从 `conversationContext?.workspace` 读取；模型复用 `AcpSendBox` 已有的 `useAcpConfigOptions` 结果。
- **信息图标**：`@icon-park/react` 的 `Info`，颜色 `text-t-secondary`；testid `context-usage-hud-icon`，class 与圆环的 `.context-usage-indicator` 不同，避免 `antigravity/basic-flow.e2e.ts:124` 误判。
- **不新增 i18n 键**：信息图标和原圆环一样不带文字。

---

# 附录四：测试改动

| 测试文件                                                   | 改动                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/conversation/hudStatusBar.dom.test.tsx`        | ctx 过滤用例改为主进程版与渲染侧版共用；旧 `HudStatusBar` 组件用例换成 `useHudStatusline`（13 条）和 `HudText` 用例 |
| `tests/unit/renderer/ContextUsageIndicator.dom.test.tsx`   | 新增：只有 HUD 显示信息图标、两者都有时 HUD 在用量之后、无 HUD 时无分隔区块                                         |
| `tests/unit/renderer/conversation/AcpSendBox.dom.test.tsx` | mock HUD hook；新增：只有 HUD 显示图标、两者都有保留圆环、hook 参数取自会话 Context 且移动端关闭                    |
| `tests/e2e/specs/hud-status-bar.e2e.ts`                    | 第 2 例改为悬停入口后在弹窗内找 HUD，并断言无 ctx 段、底栏不存在                                                    |

---

# 附录五：架构约束（已遵守）

- 上游文件 `ContextUsageIndicator.tsx`、`AcpSendBox.tsx` 只做小改动，均用 `ace:start/ace:end` 或 `// ace:` 标出
- `components/agent/` 不新增文件；HUD 逻辑全部在 `platforms/acp/hudStatusBar/`
- 渲染进程不导入 `@process/`；不改 preload、IPC、主进程
- 颜色用 Uno 已定义的语义类（`text-t-secondary`、`border-arco-2`）；DOM 测试命名为 `*.dom.test.tsx`

---

# 附录六：执行结果（2026-10-29）

## 检查命令

| 命令                                                                   | 结果                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `bunx tsc --noEmit`                                                    | 通过，退出码 0                                                                                                                 |
| `bun run lint:fix`                                                     | 0 errors（969 条既有 warnings）；越界改写的 `aioncoreSchema.ts`、`aceImportDedupe.test.ts`、`verifyElectronSidebar.mjs` 已还原 |
| `bun run format:check`                                                 | 通过                                                                                                                           |
| `bun run i18n:types` + `node scripts/check-i18n.js`                    | 通过                                                                                                                           |
| `bun run test`                                                         | 560 个文件通过、1 个跳过；5867 条用例通过、6 条跳过                                                                            |
| `E2E_DEV=1 bunx playwright test tests/e2e/specs/hud-status-bar.e2e.ts` | 第 1 例通过；第 2 例跳过（隔离的 E2E 用户目录里没有 claude agent），由下方实机脚本覆盖                                         |

## 测试有效性抽查

逐一破坏关键逻辑后，对应用例确实失败；检查后已恢复源码：

| 破坏方式                             | 失败用例                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------ |
| 去掉会话 id 校验                     | `hides the previous conversation text immediately on switch`             |
| 不做 ctx 过滤                        | 2 条 ctx 相关用例                                                        |
| 不清理定时器                         | `polls every 30s and stops after unmount`                                |
| `AcpSendBox` 守卫退回只看 tokenUsage | `shows the HUD info icon when there is HUD text but no usage report yet` |
| 关闭信息图标分支                     | `ContextUsageIndicator` 与 `AcpSendBox` 各 1 条                          |

## 实机验证

脚本：`verifyHudPopover.mjs`（本目录）。在 dev 版 `~/.aionui/live-verify/` 新建一个 `DELTEST-HUD` claude 会话，发送一条消息，检查后删除该会话（DELETE 返回 200）。

| 检查项                   | 结果                                                        |
| ------------------------ | ----------------------------------------------------------- |
| 底栏是否还在弹窗外渲染   | 0 个节点                                                    |
| 首轮前入口               | 圆环 0、图标 0（两者都没有，隐藏）                          |
| 用量上报后               | 显示圆环，信息图标 0                                        |
| 弹窗内 HUD 文本          | `[OMC#5.6.2L] \| Model: Default (recommen... \| session:0m` |
| 弹窗 / HUD 是否含 ctx 段 | 都不含                                                      |
| HUD 横向溢出             | 无                                                          |
| 彩色渲染                 | 3 种文字颜色                                                |
| 弹窗关闭后 HUD 节点      | 0（内容随弹窗卸载，轮询在弹窗外继续）                       |

截图：`02-ring-with-hud.png`（本目录）。

## 未验证项

- **只有 HUD、没有用量时的信息图标**：实机首轮中用量上报早于 HUD 首次取到数据，没有出现这个中间状态。要复现，需要一个已有会话记录、但 aioncore 还没上报用量的会话（例如刚导入的 CLI 会话）。目前只有单测覆盖。
- **e2e 第 2 例**：隔离的 E2E 用户目录里没有 claude agent，测试按设计跳过。

## 遗留风险

- `stripHudCtxSegment` 是主进程版的副本。OMC 若改变 ctx 段的输出格式，两份都要改；共用测试只能保证两份一致，不能保证跟得上 OMC。
