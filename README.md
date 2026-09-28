# Scheet

（内容待补充）

### AI Usage

- 本项目的初始框架由 AI 助手（ZCode，GLM 模型）依据人工需求生成，包括：
  - Tauri 2 工程结构与三端单文件构建配置（Windows 免打包单 exe / macOS `.app` / Linux `.AppImage`）；
  - 前端栈接入：Vite + React + React Router + Tailwind CSS v4 + Headless UI + TDesign Icons（pnpm 管理）；
  - SQLite 设置层：rusqlite（bundled）+ 惰性初始化 + 异步 IPC，数据库位于用户文档目录；
  - 自定义无边框窗口与跨平台窗口控制按钮组（位置可配置并持久化到 SQLite）；
  - Windows 便携版 WebView2 运行时检测与自动安装回退（`src-tauri/src/webview2.rs`）；
  - 定时提醒调度器与跨平台系统通知（点击横幅回焦窗口、macOS 权限探测、失败不崩溃，`src-tauri/src/{reminders,notify}.rs`）；
  - 提示音/闹铃系统：alarms 目录 + rodio 播放（一次/循环、缺失回退、合成默认铃声，`src-tauri/src/sound.rs`）；
  - 系统托盘驻留（左键回焦、菜单退出、关闭窗口隐藏到托盘，`src-tauri/src/tray.rs`）；
  - 本 README、AGENTS.md 项目规范与应用占位图标。
- 生成代码已通过 tsc 类型检查、vite 构建、cargo 编译、Rust 单元测试与实机冒烟验证。
- M1-M5 迭代（周课表网格/交互/冲突校验/提醒弹窗/snackbar/设置页/todo/剪贴板预览）均由 AI 按里程碑实现并提交，验收点记录见 [current.md](current.md) 与 [plan.md](plan.md)。
- 后续迭代建议继续由 AI 按 [AGENTS.md](AGENTS.md) 的约定协作完成；人工负责需求定义、代码审阅与验收。
