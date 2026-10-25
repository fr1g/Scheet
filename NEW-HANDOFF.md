# NEW-HANDOFF — 跨 harness 冷启动交接（写于 2026-10-25，取代 HANDOFF.md）

> 硬性规范与架构约定在 [AGENTS.md](AGENTS.md)（**必读**，本文不重复）。
> 用户会经不同 harness 接入：**一切以仓库文件为准，不要假设会话历史延续**。
> 本文目标：读完后"一见如故"——知道项目到哪了、怎么干活、哪里有坑、什么能动手什么要等拍板。

## 必读顺序

1. [AGENTS.md](AGENTS.md) — 架构、UI 规范（仅深色）、SQLite 时间存储约定、启动流程约定
2. [plan.md](plan.md)（已全部勾完）/ [current.md](current.md) — 逐笔日志，**接手前先读末尾 30 行**，新条目追加在文件末尾
3. docs/ — 需求原文（fn-req.md）、黑白盒用例（测试用例.md）、已知问题（problems.md）、滚动条专题（滚动条悬浮方案.md）
4. [promo-b/README.md](promo-b/README.md) — 宣传片工作目录（gitignored，仅本地存在）

## 当前进度（截至 2026-10-25）

- **M1–M6 全部完成并经用户验收**（plan.md 全勾）。M6 = 待办面板三态（`todoPanelMode` 持久化 +
  竖轨暂时展开 + 图钉）、剪贴板预览独立锚定窗口右下、首用剪贴板提示弹窗（data.db `flags` 表）、
  复制前备份与【恢复剪贴板】。
- 测试基线：`cargo test` **46 绿**；`pnpm build` = eslint + tsc + vite，**提交前必跑**。
- 验收后的增补（均已入库）：
  - 音频输出模式：设置-高级"单一音频流"（`singleAudioStream`/`singleStreamDevice`），
    设备枚举/切换/内置铃试听，来自 DeepSeek 的 253cc9e（+785 行全栈）。
  - 关于页协作者墙：GLM-5.3-Flash (Z.ai) 主力，Kimi＝翻译协助，
    **DeepSeek-V4.1-Flash＝维护助理**（2026-10-25 由"资料检索协助"升格）。
  - 首次点关闭 = 收进托盘的说明采用 **popup 小窗**形态（模态方案被用户否决，勿回退）。
- 宣传片 **promo-b**：五幕剧 canvas 动画（每日安排/到点提醒/便捷操作/周表循环/待办清单 →
  "那么 Scheet 帮你。" → 能力清单 → 截图块化为图标），**总长 53.4 秒**，时间轴表见 promo-b/README.md。
  经用户逐轮像素级反馈修订到位；`promo/` 与 `promo-b/` 均 gitignored——**改动只本地生效，不入库**。

## 进行中 / 待办池（用户拍板后才动手）

- **P24** 托盘菜单"退出"不警告脏改动——方案已写在 docs/problems.md P24，用户拍板暂缓。
- **滚动条悬浮**：路线 A（WebView2 msOverlayScrollbarWinStyle）/ 路线 B（自绘悬浮条）抉择未定，
  档案在 docs/滚动条悬浮方案.md。
- **promo-b 结尾 screenshot.png** 由用户提供（放入 promo-b/ 即自动替换占位框）。
- **工作区遗留**：package.json 版本 0.1.0→0.1.1 未提交（用户侧手改，**勿动、勿提交、勿恢复**，
  等用户发话；旁有两个 vim 备份文件 .package.json.un~ / package.json~，无害）。

## 协作节奏（踩实了的硬约定）

- **每批完成即单独 conventional commit + current.md 逐笔日志**；commit message 用中文描述，
  显式路径 `git add`（工作区常有用户手改文件，严禁 `git add -A`）。
- **任何 Edit 前重读实际文件**：用户会手改；python 脚本写过的文件 Edit 工具会拒，须重新 Read。
- UI/交互改动：**先向用户复述理解再动手**；收到反馈先修根因，再顺手清理连带问题。
- 诚实风险评估：不用"零风险"式断言，权衡类建议逐项给真实代价，生态事实先核实。
- 包管理**只用 pnpm**（npm/yarn 被明确拒绝）。
- i18n：en 同步 = 键树对齐 + 缺失键翻译；用户手调的 zh 文案不做考古、不回改。
- 用户反馈风格：像素级、2–4 条一批、直说"哪里坏了"；对动画时长敏感（本宣传片时长被砍过四轮）。

## 环境陷阱（Windows + Git Bash）

- 构建限 4 核：`cargo -j 4` 或等价环境变量。
- **WebView2**：旧"钉 .37"方案已废弃。现状 = `src-tauri/src/webview2.rs::ensure_runtime()` 在
  创建窗口前以 `tauri::webview_version()` 权威探测，失败则弹原生框显性安装微软 Evergreen
  Bootstrapper。scripts/dev-safe.ps1（手动钉 .37）仅留作崩溃复现的手动备选。
  证据链：根目录 wv2-runtime-investigation.md。
- **HMR 瞬间闪退已实证**（docs/problems.md P23，0xC0000421）：复现/取证用
  `pnpm debug:attach`；release 构建无 HMR 不受影响。
- PowerShell 5.1 会把无 BOM 的 .ps1 按 GBK 误读——脚本文件必须带 BOM。
- Git Bash **heredoc 超过约 10KB 有截断风险**：大段写入拆段执行，追加后 `tail` 验证。
- Node 由 Chocolatey 管理（K: 盘根）；`choco list` 会假报新版，以 `node -v` 为准。
- **promo/serve.py**（端口 8766）带 no-store + Range：Chromium 启发式缓存曾连天供应旧脚本——
  脚本改动后 URL 加版本参数（`?v=…`）双保险。
- **受控浏览器探针**：标签页在后台时 rAF 冻结，"seek + 截帧"失效——改用
  `window.scheetFilmB.renderAt(t)` 同步渲染后立即采样（同一任务内，无竞争）。
  像素采样注意：色块中心的白色标题文字会稀释颜色占比；canvas 内 `translate` 后必须画原点。
- **宣传片重写高危**：帮助函数（fade/FONT/rounded/bell）曾在全量重写中**两次**丢失，症状是
  分镜静默 ReferenceError + 黑屏。重写后必做：`node --check` + 各幕 renderAt 抽检 + 状态栏
  `__filmError` 检查（渲染循环每帧清错已改为帧首清错，分镜报错可上浮）。

## 已知限制速览

- 见 docs/problems.md（P23 HMR 闪退、P24 托盘退出不警告——方案已写待拍板）。
- 见 docs/测试用例.md 末尾"已知限制"：周课表事件不补发（手动提醒补发）、与提醒同秒的保存可能
  被时间窗机制跳过、系统通知停用（提醒统一走置顶弹窗）。
- 应用仅深色模式，永远不要提议浅色/主题切换（AGENTS.md 规范）。
