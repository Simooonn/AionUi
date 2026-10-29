# Lark（国际版）渠道后端恢复计划

> 2026-10-27　状态：已完成　执行人：Claude
> 本文结构：顶部是执行待办；下面全部是附录。

## 计划 / 待办清单

- [x] 1. **把 lark_intl 补丁搬到当前后端分支**（2026-10-27）：在 AionCore `fix/pending-ask-keepalive` 上执行 `git cherry-pick 01415c88`，得到 commit `7e17abcb`。冲突只有 `formatter.rs` 一处。
- [x] 2. **编译并跑测试**（2026-10-27）：release 编译耗时 1 分 31 秒，新二进制 sha 前缀 `3e09b1c2`。`cargo test -p aionui-channel` 共 326 个用例，全部通过。
- [x] 3. **在独立后端上验证**（2026-10-27）：同一个请求，旧二进制下 `lark_intl` 返回 400，新二进制下返回 200，`lark` 两次都是 200。PUT 助手和 PUT 默认模型都返回 200，能读回；`lark` 的设置没有被改到。
- [x] 4. **备份旧二进制**（2026-10-27）：旧版 `18dcb956` 和 manifest 已放到 `.local/aioncore-bundle/darwin-arm64.bak-411c2701/`。
- [x] 5. **替换四处二进制**（2026-10-27）：四处的哈希都是 `3e09b1c2`。/Applications 已重新签名；不加 `--deep` 的签名校验结果是 valid。`--deep` 报的错是 node 符号链接早已失效导致的，和这次无关，见附录三。`.local` 的 manifest 已更新为 `7e17abcb`。
- [x] 6. **重启正式版并验收**（2026-10-27）：正式版后端已在 15:16 重启，跑的是 `3e09b1c2`。重启后日志里 `GET settings/lark_intl` 有 3 次，全部返回 200，新的 `Invalid platform` 为 0 条。下拉框的界面效果我没有截图确认。
- [x] 7. **更新记录**（2026-10-27）：`ACE_CHANGES.md` 的 lark_intl 一节和记忆 `aioncore-local-fork` 都已更新。fork 没有推送。

前端不需要改。这次不做上一版计划里的错误提示和重试按钮，原因见附录二。

---

# 附录一：方案是什么

## 第 1 步：cherry-pick 和冲突处理

```bash
cd /Users/wmm/wmm-code/ace-diy/AionCore
git checkout fix/pending-ask-keepalive     # HEAD 411c2701，本地领先 origin 1 个提交，未推送
git cherry-pick 01415c88
```

`crates/aionui-channel/src/formatter.rs` 会冲突。处理方式：

- 保留 HEAD 的版本。它是 v0.2.2 的写法，新增了 Slack / Discord 分支，并且去掉了 `_` 兜底分支。
- 只在 Lark 那一行补上 LarkIntl：

```rust
PluginType::Lark | PluginType::LarkIntl | PluginType::Dingtalk => html_to_markdown(text),
```

v0.2.2 的 match 没有 `_` 兜底，漏写这个分支会直接编译失败，不会悄悄走错分支。其余 7 个文件都能自动合并（附录二有实测结果）。提交信息沿用原 commit 的，不加 AI 署名，与这个分支的惯例一致。

## 第 3 步：独立后端验证

```bash
mkdir -p ~/.aionui/live-verify/lark-intl
target/release/aioncore --local --port 25999 --data-dir ~/.aionui/live-verify/lark-intl &
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:25999/api/channel/settings/lark_intl   # 期望 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:25999/api/channel/settings/lark        # 期望 200
kill %1
```

如果 `--local` 模式下这两个路由需要鉴权，就按 [[live-verify-workspace-convention]] 的做法先拿 token 再请求。

## 第 5 步：替换（顺序很重要）

```bash
NEW=/Users/wmm/wmm-code/ace-diy/AionCore/target/release/aioncore
for d in /Users/wmm/wmm-code/ace-diy/AionUi/resources/bundled-aioncore/darwin-arm64 \
         /Users/wmm/wmm-code/ace-diy/AionUi/.local/aioncore-bundle/darwin-arm64 \
         /Applications/AionUi.app/Contents/Resources/bundled-aioncore/darwin-arm64; do
  rm "$d/aioncore" && cp "$NEW" "$d/aioncore"      # 同一个 inode 直接覆盖会被 macOS SIGKILL
done
codesign --force --deep --sign - /Applications/AionUi.app
shasum -a 256 "$NEW" /Users/wmm/wmm-code/ace-diy/AionUi/resources/bundled-aioncore/darwin-arm64/aioncore \
  /Users/wmm/wmm-code/ace-diy/AionUi/.local/aioncore-bundle/darwin-arm64/aioncore \
  /Applications/AionUi.app/Contents/Resources/bundled-aioncore/darwin-arm64/aioncore
strings "$NEW" | grep -c lark_intl                  # 期望 > 0
```

把 `.local/aioncore-bundle/darwin-arm64/manifest.json` 里的 `source.commit` 改成新的 commit。

## 第 6 步：验收标准

- 执行 `ps -axo pid,lstart,command | grep "aioncore --port 0"`，看到的进程启动时间应该晚于替换时间。
- Lark（国际版）卡片：助手显示 `Aion CLI`，下拉列表与 Lark 卡片相同；对话模型显示「选择模型」，下拉里能看到 Ace-Token 供应商的模型。
- 在国际版上改一次助手或模型，关闭设置再打开，改动仍在（`setAssistantSetting` 和 `setDefaultModelSetting` 走的也是 lark_intl 路由）。
- `~/Library/Logs/AionUi/2026/10/27/2026-10-27.aioncore.log` 里，重启之后没有新的 `Invalid platform: lark_intl`。

---

# 附录二：依据与证据

**为什么前端不用改**

- 两张卡片用的是同一个组件 `LarkConfigForm.tsx`，只是 `platform` 参数不同，`ChannelModalContent.tsx:903` 传入的是 `platform='lark_intl'`。前端的 lark_intl 接线（配置 key、配对、enable/test、logo、i18n）早在 2026-06-12 就已经做完。
- `LarkConfigForm.tsx:158-177` 用 `Promise.all` 同时请求助手列表和 `getPlatformSettings({ platform })`。后端返回 400 后整个 `Promise.all` 走进 catch，`selectedAssistant` 一直是 null，于是：
  - 助手位置显示默认文字「助手」；
  - 模型位置因为 `isAionrsAssistant(null)` 为 false，退化成纯文本「自动跟随CLI运行时的模型」。
- 后端返回 200 之后，这段逻辑和 Lark 卡片完全一样。
- 上一版计划里的错误提示和重试按钮属于额外的防御代码，Lark 卡片本身也没有，这次去掉。

**为什么后端坏了**

- 正式版日志 2026-10-27 02:42 有 `GET /api/channel/settings/lark_intl → 400 Invalid platform: lark_intl`，当天共 4 条。
- 四处 aioncore 的 sha 前缀都是 `18dcb956`，也就是 fork 分支 411c2701 的构建。这个分支是从 v0.2.2 拉出来的，没有带上 lark_intl 补丁。
- 补丁只在旧分支 `feature/lark-intl-v0.1.41` 上（commit `01415c88`，2026-07-03）。升级到 v0.2.2 时没有搬过来。

**合并可行性（已实测，不改工作区）**

- `git merge-tree --write-tree --name-only --messages HEAD 01415c88`：
  - 8 个文件里有 7 个自动合并；
  - 只有 `formatter.rs` 出现 `CONFLICT (content)`；
  - `01415c88^` 和 HEAD 的合并基都是 `c0b50baf`，补丁的父提交就在当前分支的历史里。
- 合并后的树中：
  - `api.rs` 里同时有 `FEISHU_DOMAIN` 和 `LARK_INTL_DOMAIN`；
  - `plugin.rs:83` 有 `platform: PluginType::LarkIntl`；
  - `routes.rs` 里 `"lark" | "lark_intl"` 和 builtin_names 都带上了。
- `stream_relay.rs` 的 throttle 有 `_` 兜底，国际版会和 Lark 一样用 500ms。

---

# 附录三：风险 / 其他

- **正式版要重启并重新签名**：后端是常驻进程，必须完全退出再打开。重新签名后 cdhash 会变，macOS 可能重新弹权限。
- **`codesign --verify --deep` 报错，与本次无关**：报的是 `No such file or directory`。原因是 `managed-resources/node/.../bin/{npm,npx,corepack}` 是绝对路径符号链接，指向已经被搬走的 `ace-diy/aioncore-local-bundle/`。这个问题从 2026-10-22 装进去时就存在。不加 `--deep` 时签名校验是 valid，内嵌的 aioncore 单独校验也是 valid。这次不处理；如果要修，重新打包或者把这三个链接改成相对路径即可。
- **真实连通性没有验证**：这次只验收配置界面和设置读写。国际版机器人能否真正连上 open.larksuite.com，需要国际版的 App ID / Secret 点「测试并连接」才能确认。没有凭据就记为未验证。
- **以后升级 aioncore 时**：fork 分支现在同时带着 keepalive、new-api /v1、lark_intl 三组补丁，升级时都要一起 rebase。这一点写进 `ACE_CHANGES.md` 和记忆。
- **wecom**：之前的探索提到 `/settings/wecom` 也返回 400。这次没有核实，也不在本次范围内。
- **回滚**：把第 4 步备份的 `18dcb956` 二进制按同样的 rm/cp 方法放回四处，重新签名，再重启。
- **上一版计划作废**：之前的 18 步计划（后端 + 前端错误提示 + 重试）已被本计划替代。`.omc/specs/deep-interview-lark-intl-config-ui.md` 只作为历史记录保留。
