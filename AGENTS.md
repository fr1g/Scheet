# AGENTS.md — Scheet

本文件是给 AI 助手/协作者的项目记忆与规范，修改代码前务必先阅读。

## 项目概览

- Tauri 2 桌面应用（Windows / macOS / Linux），应用名 **Scheet**。
- 前端：Vite + React + TypeScript + React Router + Tailwind CSS v4 + Headless UI + TDesign Icons。
- 后端：Rust + rusqlite（`bundled` 特性，SQLite 编译进二进制，无系统依赖）。
- 包管理器：**pnpm**（不要使用 npm/yarn）。

## 常用命令

```bash
pnpm install            # 安装前端依赖
pnpm tauri dev          # 开发模式（自动启动 vite + tauri）
pnpm tauri build        # 构建发布产物
cargo test              # 在 src-tauri/ 下运行 Rust 单元测试
pnpm exec tauri icon <png>  # 重新生成 src-tauri/icons/（源图 1024x1024）
```

### 单文件构建产物

`tauri.conf.json` 已按平台配置 bundle，三端产物均为**绿色软件**形式（即点即用、
运行时不解压任何应用文件——前端资源编译期嵌入二进制，由 Tauri 在内存中通过协议服务）：

- **Windows**：`tauri.windows.conf.json` 设置 `bundle.active: false`，产物就是
  `src-tauri/target/release/scheet.exe`（WebView2 为系统组件，由下面的运行时兜底保证）。
- **macOS**：`tauri.macos.conf.json` 设置 `targets: ["app"]`，产物为单个 `.app` 包。
- **Linux**：`tauri.linux.conf.json` 设置 `targets: ["appimage"]`，产物为单文件 `.AppImage`。

### WebView2 兜底（Windows 专属）

- Tauri 的 `webviewInstallMode` 只对安装包生效，便携 exe 不经过安装器，因此
  `src-tauri/src/webview2.rs` 在创建窗口前自行检测 WebView2 运行时
  （微软官方注册表方式：HKCU/HKLM/WOW6432Node 下
  `SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-…}` 的 `pv` 值非空）。
- 缺失时弹原生消息框询问：同意则用 `curl.exe`（回退 PowerShell）下载微软官方
  Evergreen Bootstrapper 到临时目录并 `/silent /install` 静默安装，随后轮询注册表确认；
  拒绝或安装失败则打开官方下载页后退出。
- macOS（WKWebView 系统自带）与 Linux（AppImage 捆绑 webkit2gtk）无需此逻辑，模块已 `#[cfg(windows)]` 门控。

## UI 设计规范（必须遵守）

- **应用仅存在深色模式**，永远不要实现、假设或添加浅色模式/主题切换。
- 所有颜色基于 Tailwind 调色板。
- 页面/应用背景统一使用 `bg-zinc-700`（全局已在 `src/index.css` 设置）。
- 文字颜色统一使用 `text-zinc-100`；次要文字可用 `text-zinc-300/400`，hover 层可用 `zinc-600/500`。
- 唯一例外：窗口关闭按钮 hover 使用 `bg-red-500`（操作系统惯例，危险色）。

## 架构要点

### SQLite

- 数据库文件在应用**首次启动**时初始化到当前用户的文档目录：
  - Windows: `C:\Users\<user>\Documents\scheet\data.db`
  - macOS: `~/Documents/scheet/data.db`
  - Linux: `~/Documents/scheet/data.db`（遵循 XDG 用户目录配置）
  - 目录不存在则递归创建；文档目录定位失败时回退到用户主目录。
- 三库分工（同目录）：`data.db`（app_settings/flags + 手动 reminders 表）、`weeks.db`（week_plans/week_entries/week_day_overrides 周表数据）、`todo-list.db`（todos + todo_meta）。
- 设置存于 data.db 的 `app_settings` 表（`key TEXT PRIMARY KEY, value TEXT(JSON)`）。
- todo 跨天规则：新一天首次被处理时，把上次处理日以来所有未完成 todo 复制到今天（todo.rs，调度线程日切时执行）。
- WAL 日志模式。

### 应用设置

- Rust 类型定义在 `src-tauri/src/settings.rs` 的 `AppSettings`（serde camelCase，带 `default`，旧数据缺字段自动补默认值）；前端镜像类型在 `src/types/settings.ts`，两端字段需保持同步。
- 现有设置：`windowControls.position`，取值 `"left" | "right" | "hidden"`。

### 启动流程（不可破坏的约定）

- 前端必须**先同步渲染加载屏**（`LoadingScreen`），设置通过异步 IPC `get_app_settings` 加载，加载完成才进入主界面；失败显示 `ErrorScreen`（可重试）。
- 后端**不做启动时 DB 初始化**：`Db::with_conn` 惰性打开连接，命令为 async + `spawn_blocking`，保证窗口显示和加载屏不被磁盘 IO/建表阻塞。

### 自定义窗口

- `decorations: false`（无边框），窗口背景色 `#3F3F46`（zinc-700）防白闪。
- 标题栏为 `src/components/TitleBar.tsx`：`data-tauri-drag-region` 拖拽区域 + `WindowControls` 按钮组（最小化、关闭）。
- 按钮组位置由设置驱动：`left`（关闭、最小化）/ `right`（最小化、关闭，默认）/ `hidden`（隐藏）。
- 修改位置必须调用后端命令 `set_window_controls_position` 持久化到 SQLite，命令返回保存后的完整 `AppSettings`。
- 涉及的 Tauri 权限在 `src-tauri/capabilities/default.json`（minimize / close / start-dragging）。

### 提醒与通知弹窗

- Rust 模块 `reminders.rs`：提醒模型 + SQLite `reminders` 表（title/body/fire_at/status/created_at，
  fire_at 统一 RFC3339 UTC 存储，status ∈ pending/fired/cancelled）。命令：`create_reminder`（fire_at 接受带时区的 RFC3339）、
  `cancel_reminder`、`list_reminders`。
- 调度线程（`start_scheduler`，scheduler.rs）每 1000ms 轮询：到期 pending 提醒、
  当前周表的今日提醒事件（开始/结束铃，按"时间窗"触发——只触发自上次轮询以来新到期的提醒，
  因此保存/编辑周表不会让区间内的时间点意外响铃；新一天首轮只推进水位线不触发）；
  日期切换时重置水位线 + todo 日切滚动 + emit `scheet://date-changed` 供前端刷新日期 UI；
  应用关闭期间到期的手动提醒会在下次启动后补发（周课表事件不补发）。
- 提醒"推送"形态：**置顶弹窗子窗口**（`popup.rs`，label=alarm-popup），**不用系统通知**——
  部分 Windows 环境（勿扰模式等）系统通知不可见。弹窗展示事务信息+实时秒表时钟，
  点击弹窗 = 停止响铃 + 关闭弹窗 + 聚焦主窗口；主窗口获得焦点时弹窗自动关闭。
  旧实现 `notify.rs`（WinRT Toast/notify-rust）保留备用但已停用。
- Rust 模块 `notify.rs`（已停用，保留备用）：WinRT Toast / notify-rust 系统通知，
  **任何通知失败只记录日志绝不 panic**。
- 任何铃声播放失败只记录日志绝不 panic（无音频设备时应用照常运行）；
  发送/播放无论成败均标记 reminders 为 fired，避免重复轰炸。

### 托盘驻留

- Rust 模块 `tray.rs`：托盘图标（用默认应用图标），左键点击 → 显示并聚焦主窗口；右键菜单"显示主窗口 / 退出 Scheet"。
- **窗口关闭按钮只是隐藏窗口**（CloseRequested → prevent_close + hide），托盘菜单"退出"是唯一退出路径（`app.exit(0)`）。
- macOS 额外处理 `RunEvent::Reopen`（点击 Dock 图标回焦窗口）。
- 相关的窗口回焦统一走 `lib.rs::focus_main_window`（show + unminimize + set_focus）。
- tauri 依赖启用了 `tray-icon` feature；托盘与通知均为 Rust 侧实现，无需前端 capability。

### 提示音 / 闹铃（alarms 目录）

- 数据目录下随 data.db 一起自动创建 `alarms/` 文件夹（附 README.txt 说明），
  用户自行放入提示音文件（MP3/WAV/OGG/FLAC，rodio + symphonia 解码）。
- reminders 表含 `alarm_file`（alarms 下的裸文件名，空 = 默认提示音）与
  `alarm_mode`（`once` 播放一次 / `loop` 循环播放）；旧库由 `db.rs::migrate` 自动补列。
- 播放逻辑在 `sound.rs`：**未指定文件、文件名非法、文件不存在或解码失败时，
  一律回退为内置默认提示音**；内置铃按类别区分——
  `default-alarm.wav`（通用，手动提醒与未指明类别的预览）、
  `default-alarm-start.wav` / `default-alarm-end.wav`（周课表开始/结束事件回退，
  均恒播放一次）；任何播放失败只记录日志绝不 panic（无音频设备时应用照常运行）。
- 全局同时只有一个播放引擎：新播放替换当前播放；`loop` 会一直循环，
  直到被新播放替换、调用 `stop_alarm_sound` 命令或应用退出（未来 UI 应在用户确认提醒时调用它）。
- 命令：`play_alarm_sound(alarm_file?, alarm_mode?, builtin?)`（预览，builtin 取
  generic/start/end 决定回退哪个内置铃）、`stop_alarm_sound()`。
- 文件名只允许裸文件名（拒绝路径分隔符与 `..`，防目录穿越）。
- Linux 构建机需要 `libasound2-dev`（ALSA 头文件）；运行时无需额外依赖。

### 时间存储约定（SQLite 无原生日期类型，必须遵守）

SQLite 中一切时间按三类存储，**不得混用**（约定实现见 `src-tauri/src/clock.rs`）：

1. **时间点**（created_at / updated_at / reminders.fire_at 等元数据与提醒时刻）：
   RFC3339 UTC 文本（`…Z`）。输入若带时区偏移，解析时先转 UTC 再落库（时刻无损）。
   统一用 `clock::now_utc_string()` 生成。
2. **一天之内的时间**（事务 start_minute / duration_minute / 各级日覆盖）：
   当日分钟数（0–1439）整数，纯"仅时间"，无时区概念。
3. **日历日**（todo 的 date、周表轮换锚点 rotationAnchorDate）：
   本地日期文本 "YYYY-MM-DD"——"一天"的边界按用户本地时间定义，属刻意选择；
   统一用 `clock::today_local_string()` / `clock::date_string()` 生成。

调度线程的"今天/当前分钟"一律 `Local::now()` 推导，与日历日本地语义一致。

## 约定

- 路由使用 `HashRouter`（桌面环境最稳定）。
- Rust 命令统一返回 `Result<T, String>`；新增耗时 DB 操作一律 async 命令 + `spawn_blocking`。
- 前端调用后端的封装放在 `src/lib/`，全局状态放 `src/state/`（titleState/dateState 为 useSyncExternalStore 外部存储）。
- 周课表页（WeekGridPage）：左侧周表 tab 列、中央绝对定位网格（冲突泳道并排）、右侧当日待办面板 + 剪贴板事务预览浮块。
- 测试用例库见 `docs/测试用例.md`（黑白盒，按里程碑验收勾选）；已知问题与平台注意事项见 `docs/problems.md`。
- 根目录下的`_temps`为临时文件存放，目录下所有内容都不会也不应被git追踪。
