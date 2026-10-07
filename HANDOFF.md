# HANDOFF — 面向下一位 AI 协作者的交接快照

> 规范与架构约定在 [AGENTS.md](AGENTS.md)（**必读**，本文不重复）。
> 本文只记录"当前状态、环境陷阱、协作节奏"，写于 2026-10-07（M6 验收后）。
> 用户可能经不同 harness（ZCode / OpenCode 等）接入：**以仓库文件为准，不要假设会话历史延续**。

## 必读顺序

1. [AGENTS.md](AGENTS.md) — 架构、UI 规范、SQLite 时间存储约定、启动流程约定（硬性）
2. [plan.md](plan.md) / [current.md](current.md) — 计划与逐笔日志；**current.md 是跨会话的持久状态**，新条目追加在文件末尾，接手前先读末尾 20 行
3. docs/ — 需求原文（fn-req.md）、黑白盒验收用例（测试用例.md）、已知问题（problems.md）、专题方案（滚动条悬浮方案.md）

## 当前进度（截至 2026-10-07）

- **M1–M6 全部完成并经用户验收**。M6 = 待办面板三态（`todoPanelMode` 持久化 + 竖轨/暂时展开/图钉）、剪贴板预览独立锚定窗口右下（文字深浅走 resolve 链）、首用剪贴板提示弹窗（data.db `flags` 表）、复制前剪贴板备份与【恢复剪贴板】（连续事务复制保留最初备份，`clipboard.rs` 的 `StashedClipboard` 已预留 File 变体）。
- 测试基线：`cargo test` 38 绿；`pnpm build` = eslint + tsc + vite（**提交前必跑**）。
- 仓库已做过目录整理：历史文档在 docs/，素材与临时产物在 _temps/（不入库）。

## 进行中 / 待办池（用户拍板后才动手）

- 用户正在自调 EntryCell 垂直居中（WeekGrid.tsx 可能有未提交改动——**勿动、勿提交、勿恢复**，等用户发话）。
- 备用方向：剪贴板恢复 L3 文件支持、滚动条悬浮 A/B 方案抉择（见 docs/滚动条悬浮方案.md）、docs/测试用例.md 的 M6 用例补录勾选。

## 环境陷阱（Windows + Git Bash）

- 构建限 4 核：`cargo -j 4`。
- **WebView2 154.0.4258.48 有宿主堆损坏缺陷**（0xc0000374，fastfastfail 绕过 WER——无事件日志、无转储）：开发用 `pnpm dev:safe`（钉住 .37），生产应用内 `pin_runtime_if_broken()` 自动兜底；崩溃复现用 `pnpm debug:attach`（Python ctypes 调试器，打印二次机会异常与出错模块）。
- PowerShell 5.1 会把 UTF-8 无 BOM 的 .ps1 按 GBK 误读——脚本文件必须带 BOM；Bash heredoc 有截断风险，追加文件后必须 `tail` 验证。
- 往 .gitignore 等无末尾换行的文件追加内容会粘连（踩过），先确认换行。
- HMR 瞬间疑似有崩溃案例——复现时先挂 `pnpm debug:attach` 再操作。

## 协作节奏（用户已确认的偏好）

- **每批修改完成即单独 conventional commit**（用户 2026-10-07 拍板，不再等验收才提交）；current.md 同步记一行。
- 用户会自己动手改文件——提交前 `git status` 逐项核对归属，**显式路径 add，绝不 `git add -A`**。
- UI 改动先复述理解再动手；评估/风险类回答诚实给代价，不用"零风险"式断言。
- 修 bug 先挖根因再动手（近期案例：tao 复显抢焦点、rem/px 混用裁切、部分读取/插入破坏区域不变量——静态检查优于记忆与注释）。

## 记名墙

-   GLM-5.3-Flash
