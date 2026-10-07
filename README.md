# Scheet

<div style="display: flex; flex-direction: column;">
  <img src="logo-designs/concept-logo-v5.png" alt="Scheet" style="margin: auto" width="160">
  <p style="text-align: center"><strong>以周为单位，安排你的生活</strong></p>
</div>

Scheet 是一款本地优先的周课表应用：以 5 分钟为粒度编排一周的普通事务与休息，到点自动弹窗响铃提醒，右侧还有每日待办清单。所有数据都保存在你自己的电脑上。支持Windows/macOS/Linux。

Scheet：读音同原单词“Sheet”，取“表格”义，但是有种“School”的感觉——它是一个更灵活的“课程表”，希望它可以在番茄钟、TODO之外给你一个更规律也不失灵活的选择。

Proudly built with **Vibrative Fellows**.

## 警告

此App没有在所有平台和系统上完成完整的功能性测试。目前在开发机上运行基本正常，HMR过程中可能出现`STATUS_HEAP_CORRUPTION`导致的闪退，根因暂时未知。开发机系统信息如下：

-   WebView2：154.0.4258.37
-   Windows：11 Pro 25H2 26200.9550
-   HW：R5-7600X RTX-2080Ti(启用了chromium硬件加速)

可能存在在开发机上未体现的性能问题。

## 功能特性

- **周课表编排**：5 分钟粒度，普通/休息事务，事务级颜色与文字深浅，多周表与轮换锚点，单日覆盖；冲突拒绝保存并红框标注
- **顺手的交互**：拖动换时/换天、边界调整、Shift 临时移动、复制粘贴（剪贴板预览 + 一键恢复原剪贴板）、当前时刻 cell 白环脉动标记
- **提醒系统**：开始/结束双铃声链（事务 → 类型 → 全局，继承来源可见），内置开始/结束默认铃，自定义铃声一次/循环，到点置顶弹窗（不抢焦点、实时时钟）+ 确认 snackbar，托盘驻留，手动提醒离线补发
- **每日待办**：右侧面板三态（常驻/隐藏/暂时展开），未完成项跨天自动继承
- **本地优先**：数据保存在用户文档目录（SQLite 三库），应用完全离线、不联网
- **可定制**：中英文界面、五套内置字体与字号档位、标题栏时钟、窗口控制按钮位置、应用图标变体、日志等级

## Scheet解决了什么？

-   提供一套根据设定循环的表格（最多六张周表）来安排规律的日程
-   可以自己设定Scheet管理的每天时间——如果你想的话，Scheet只管理每天的某八个小时也没问题
-   自动继承前一天没办完的TODO——但是请别忘了总有一天要完成
-   如果番茄钟直接出现在每日的细节安排，应该不会忘记某个时段要做什么了吧？

## 背后的故事

刚毕业这两个月过得浑浑噩噩——缺失了课表，也没有工作，想安排自己做什么一定要自觉——但是懒得自觉。有天刚躺床上打转，忽然意识到：我以前的生活和未来的生活作息都是基于一套循环的固定事务，那么想要生活重新规律起来的话，是不是得整个课表？——那如果是纯WebApp的话，感觉倒是完全能自己搓出来，但是很担心我自己会分心到莫名其妙的地方，最终让此项目变成像Kuolie那样的究极史山（呃我现在也不会写那种无法维护的代码了倒是，但还是担心）刚好之前Z.ai捅了个众所周知的篓子，临近假期他们刚好在发每天一个亿的免费鸡蛋，不然去用试用和免费鸡蛋来搓一个Tauri App顺便试试Harness？——写好了数百字的初始prompt塞给plan mode，然后经过了大概70轮对话逐步调整+我自行进行的视觉调整，终于有了Scheet——并且我也确实开始跟随Kimi协助制定的计划来过每一天。

### 铃声

铃声最开始是GLM用python做的一段，但是听起来很像门铃，于是我用了几分钟在GarageBand按合成器+简单Loop出来两个铃声，一个是默认开始铃一个是默认结束铃。可以在`default-ringtones`看到。为什么不要求GLM进一步生成midi音频？说实话，既然AI做的像抽卡，我不如自己手搓来得快，反正按键盘比Rust容易得多，我能做就做了。

### 图标

参见`logo-designs`，v1~v5全是原型设计。

-   v1：本来考虑到跨平台是可以做一个外形比较独特的图标，所以用了看着像ACDSee之眼的一个叶片状，最开始想像手机日历app那样给日历的那个写星期的顶部也画出来，但是效果与这个外形非常不搭于是放弃。然后搓了五条日程轨道，放了一些有标志性的特点（具有灵活性的事务安排Cell），还挺满意，结果裁切出来后发现这玩意在桌面图标上看完全糊成一坨，算了，砍掉两条轨道吧，于是就有了——
-   v2：结果也糊，还丑，那不然换个思路。
-   v3：把两个代表事务的“卡”叠在一起，两侧配上体现事务安排灵活性的两列。我其实觉得这版不错的，然后母上大人路过——“你在做啥？”
-   v4：我把想法和思路解释了一下。于是有了这一版。她说，不然让两张卡片对在一起，然后边框拼成一个S？——因为我明确说了希望正中心有一个S。但是我觉得这样很丑，她也提出了另外一个想法——
-   v5：“要不横着排卡片，然后竖着排。”她比划了一下，“这样拼成一个S？”——最开始我只是用grid拼了两部分的S，然后加了skew，加了scale-x，加了颜色区分，问她这样是不是更好，她看起来很满意。我觉得也确实挺不错的，这下彻底简约了。

然后我问GLM：工作区有个文件夹logo-designs，你去看看五个样稿哪个你觉得最好看。GLM思考了两分钟告诉我它选v5，总之吹得天花乱坠，然后把v1、v5之外的所有版本都踩了一遍。Logo中两个颜色——其中鲑鱼粉来自`#fecac0de`叠加`zinc-800?`，另外那个紫色我忘记具体颜色码了，反正是闪闪喜欢的颜色之一。不过说来奇怪，我和GLM都觉得v2不咋样，但是当时给闪闪看的时候，她还觉得v2最好看（。？可能作为一个badge戳到她某些喜好了吧）

### ZCode免费鸡蛋

我反正是不在意z.ai遇到的舆论风波的，有免费鸡蛋用为什么不用呢，更何况我这种小项目。而且GLM干活确实可以，不过平日干活都开最高思考强度、GLM5.3Flash，恐怕我自己掏钱养是做不到这样大手大脚了。何谓“由奢入俭难”啊，以后如果掏钱的话，得它和Kimi Code混着用了吧。

## 相关技术和语言

Tauri, Vite, React, TailwindCSS, TS, Rust, SQLite

*我只能说这里面我实际掌握的部分也就看起来多，实际上实体、架构设计和后端部分完全交给GLM了。*

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

前端调试时如需使用DevTools，前往设置-高级，按住shift然后点击【打开DevTools】

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
