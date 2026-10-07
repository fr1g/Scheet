# Scheet

<div align="center">
  <img src="logo-designs/concept-logo-v5.png" alt="Scheet" width="160">
  <p><strong>以周为单位，安排你的生活</strong></p>
</div>

Scheet 是一款本地优先的周课表应用：以 5 分钟为粒度编排一周的普通事务与休息，到点自动弹窗响铃提醒，右侧还有每日待办清单。所有数据都保存在你自己的电脑上。

## 功能特性

- **周课表编排**：5 分钟粒度，普通/休息事务，事务级颜色与文字深浅，多周表与轮换锚点，单日覆盖；冲突拒绝保存并红框标注
- **顺手的交互**：拖动换时/换天、边界调整、Shift 临时移动、复制粘贴（剪贴板预览 + 一键恢复原剪贴板）、当前时刻 cell 白环脉动标记
- **提醒系统**：开始/结束双铃声链（事务 → 类型 → 全局，继承来源可见），内置开始/结束默认铃，自定义铃声一次/循环，到点置顶弹窗（不抢焦点、实时时钟）+ 确认 snackbar，托盘驻留，手动提醒离线补发
- **每日待办**：右侧面板三态（常驻/隐藏/暂时展开），未完成项跨天自动继承
- **本地优先**：数据保存在用户文档目录（SQLite 三库），应用完全离线、不联网
- **可定制**：中英文界面、五套内置字体与字号档位、标题栏时钟、窗口控制按钮位置、应用图标变体、日志等级

## 如何构建

### 前提条件

- Node.js ≥ 20 与 pnpm ≥ 9（前端构建工具链）
- Rust stable（Windows 需 MSVC 工具链；Linux 需 `libasound2-dev`、`libwebkit2gtk-4.1-dev` 等 Tauri 依赖；macOS 需 Xcode Command Line Tools）
- Windows 10 及以上运行需 WebView2 Runtime（系统一般自带，缺失时应用会引导安装）

### 日常开发

```bash
pnpm install       # 安装前端依赖（首次）
pnpm tauri dev     # 启动开发实例，前端改动热更新
```

### 构建发布产物

```bash
pnpm build         # 前端类型检查 + 打包
pnpm tauri build   # 构建当前平台的发布产物（单文件，见下）
```

产物位置（三端均为单文件，绿色免安装）：

| 平台    | 产物                                                       |
| ------- | ---------------------------------------------------------- |
| Windows | `src-tauri/target/release/scheet.exe`                      |
| macOS   | `src-tauri/target/release/bundle/macos/Scheet.app`         |
| Linux   | `src-tauri/target/release/bundle/appimage/scheet.AppImage` |

### 测试

```bash
cd src-tauri
cargo test         # Rust 单元测试（含调度器/冲突检测/铃声链等）
```

更多的功能验收用例见 [docs/测试用例.md](docs/测试用例.md)，已知问题与平台注意事项见 [docs/problems.md](docs/problems.md)，项目规范见 [AGENTS.md](AGENTS.md)。

## AI Usage

- 本项目的初始框架由 AI 助手（ZCode，GLM 模型）依据人工需求生成，包括：
  - Tauri 2 工程结构与三端单文件构建配置（Windows 免打包单 exe / macOS `.app` / Linux `.AppImage`）；
  - 前端栈接入：Vite + React + React Router + Tailwind CSS v4 + Headless UI + TDesign Icons（pnpm 管理）；
  - SQLite 设置层：rusqlite（bundled）+ 惰性初始化 + 异步 IPC，数据库位于用户文档目录；
  - 自定义无边框窗口与跨平台窗口控制按钮组（位置可配置并持久化到 SQLite）；
  - Windows 便携版 WebView2 运行时检测与自动安装回退（`src-tauri/src/webview2.rs`）；
  - 提醒推送：置顶弹窗子窗口（静态页渲染、实时时钟、`WS_EX_NOACTIVATE` 防抢焦点，`src-tauri/src/popup.rs`）+ 确认 snackbar；系统通知模块保留备用（勿扰模式下不可见）；
  - 提示音/闹铃系统：alarms 目录 + rodio 播放（一次/循环、缺失回退、内置开始/结束/通用三套默认铃，`src-tauri/src/sound.rs`）；
  - 系统托盘驻留（左键回焦、菜单退出、关闭窗口隐藏到托盘，`src-tauri/src/tray.rs`）；
  - 本 README、AGENTS.md 项目规范与应用占位图标。
- 生成代码已通过 tsc 类型检查、vite 构建、cargo 编译、Rust 单元测试与实机冒烟验证。
- M1-M6 迭代（周课表网格/交互/冲突校验/提醒弹窗/snackbar/设置页/todo/剪贴板预览/内置字体/待办面板三态/剪贴板备份恢复）均由 AI 按里程碑实现并提交，验收点记录见 [current.md](current.md) 与 [plan.md](plan.md)。
- 后续迭代建议继续由 AI 按 [AGENTS.md](AGENTS.md) 的约定协作完成；人工负责需求定义、代码审阅与验收。
