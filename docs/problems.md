# 已知问题与平台待确认项

> 按"确定存在的坑 / 平台语义推断（需真机确认）/ 设计取舍（行为如此，非 bug）"分类。
> 每条附【验证方式】，对应 [测试用例.md](测试用例.md) 的编号处可勾选销项。
> 发现实际问题后：修复并把条目移到"已解决"，或补充细节。

## 一、确定存在的坑（已知、已接受或待修）

### P1 保存/编辑与提醒到期同秒时，结束铃可能被跳过
- **现象**：调度器按"时间窗"触发（只触发自上次轮询以来**新到期**的提醒）。若你编辑并保存时，某事务的开始/结束时间点恰好落在同一秒内已过去，该次响铃会被时间窗跳过（防止误响的代价）。
- **影响**：丢失一次响铃（该事务的下一次事件正常）。
- **验证**：BB-ALARM-08。构造极难，实际几乎不可感知。

### P2 手动提醒（reminders 表）与周课表提醒是两套并存机制
- **现状**：手动提醒（后端 reminders 表，含离线补发）目前**没有前端入口**，仅供未来功能使用；日常提醒全部走周课表事件（不补发）。
- **注意**：若将来开放手动提醒 UI，注意两者都会弹窗+响铃，需考虑去重或入口区分。

### P3 周表保存为"删除重建"，条目 id 会变化
- **现状**：保存周表时事务全部删除后重插，id 由数据库重新分配。工作副本里用负数临时 id 表示未保存的新条目，保存成功后由返回数据整体替换。
- **影响**：任何按 id 缓存的引用（选中态、剪贴板预览）在保存后以返回数据为准，已正确处理；但未来若引入"按 id 的撤销/重做"需改用内容寻址。

### P4 拖拽换天/重放在跨天窗口不同的周表里，clamp 取目标天窗口
- **现状**：拖动重放时位置钳制在目标天的显示窗口内；如果目标天的窗口比源天窄，事务可能被 clamp 到边界附近。
- **验证**：给不同天设置不同的起止覆盖后拖拽，确认行为符合直觉。

### P5 `elapsed`/轮换锚点在"每周第一天"设置变更后不重算历史
- **现状**：轮换锚点（rotationAnchorDate）是设置当周那天的"每周第一天"。之后修改"每周第一天"设置（如周一→周日），锚点日期仍是旧语义下的日期，可能造成轮换周数偏移 ±1 周。
- **缓解**：重新"设为当周"即可重置锚点。
- **验证**：BB-PLAN-03 变体：改设置后核对下一周轮换到的表。

### P6 循环响铃的 5 秒间隔内没有"正在响"反馈
- **现状**：循环响铃每轮之间静默 5 秒（看护线程续播），弹窗与 snackbar 持续显示，但间隔期无任何声音反馈，用户可能以为已停止。
- **缓解**：弹窗/snackbar 上有"正在循环响铃"文字标记。

### P7 alarms 目录里的 README.txt 不参与铃声列表
- **现状**：`list_alarm_sounds` 排除了 README.txt 和点开头的隐藏文件；用户若放入同名 README.txt 不会被当成铃声（合理但需知晓）。其他任意扩展名的文件会出现在列表中，解码失败时回退内置铃声。

### P25 Windows：开机自启注册项可能无端消失（上游 open issue，启动自愈兜底）
- **现状**：tauri-apps/plugins-workspace#771（2023 年起 open，根因未明）报告 Run 注册表项一次开机后被删除。本项目未复现，但采纳为真实风险。
- **缓解**：启动时自愈——release 下若配置为开则重跑 `autolaunch().enable()` 覆盖式重写注册项（含 exe 当前路径与 `--autostart` 参数），同时兜住绿色软件挪动 exe 后的路径漂移。dev 构建不做任何系统写入。
- **验证**：BB-STARTUP-02 开关后 `reg query HKCU\...\Run`；重启 OS 后注册项仍在（用户侧）。

### P28 WSL 本地构建 Linux 版：systemd 陷阱与 linuxdeploy PATH 崩溃（均已实证）
- **现状**：Windows 原生无法交叉编译 Linux 产物（GTK/WebKit 需目标平台 C 库），本机路线 = Kali WSL2 原生构建。官方构建脚本 `K:\wsl-build\scripts\build-linux.sh`，产物落 `K:\wsl-build\out\`，构建目录为 WSL ext4 副本 `/root/src/scheet`（DrvFS IO 慢数倍，勿用符号链接到 /mnt）。凭据见根目录 wsl-creds（gitignored）。
- **坑 1（systemd，险些报废发行版）**：apt 依赖升级会把 systemd 拉成"半配置"（postinst 在无 systemd 的 WSL 里必然失败）；此时若在 wsl.conf 开 `[boot] systemd=true`，发行版引导失败 → `Wsl/Service/E_UNEXPECTED` 完全起不来。救援法：借 docker-desktop 上下文 `wsl --mount --vhd <kali的ext4.vhdx>`（按 UUID 认盘；docker-desktop 的 automount 根是 `/mnt/host`，K 盘在 `/mnt/host/k`），删掉 /etc/wsl.conf 后正常启动，数据无损。之后给无法配置的包 postinst 打 `exit 0` 垫片（`/var/lib/dpkg/info/<pkg>.postinst`，原文件存 `.orig-bak`）使 dpkg 归一致——本机已对 systemd/selinux-utils/tpm-udev 打垫片，**systemd 永不运行（无害），但未来 systemd 升级会覆盖垫片，需重打**。
- **坑 2（linuxdeploy）**：linuxdeploy 打包时扫描 PATH，WSL 默认 PATH 混入 Windows 目录，对某些 Windows 目录（如 K:\etc\VMware\...）stat 返回 EIO → linuxdeploy 崩溃 `filesystem error: status: Input/output error`。构建必须用纯 Linux PATH（build-linux.sh 已内置洗涤）。
- **坑 3（小）**：Kali 的 librsvg2-dev 提供的 pkg-config 名是 `librsvg-2.0`（不是旧文档的 rsvg-2.0）。
- **验证**：BB-BUILD-01 Linux 变体：2026-10-26 实测产出 `Scheet_0.1.1_amd64.AppImage`（136MB，版本号随 package.json）。

## 二、平台语义推断（需 macOS / Linux 真机确认）

### P8 macOS：隐藏窗口后 Dock 图标是否留存
- **预期**：关闭按钮 = `prevent_close` + `window.hide()`（orderOut），应用继续运行、activation policy 保持 Regular → **Dock 图标应保留**，状态栏（菜单栏）托盘图标保留；点 Dock 图标经 `RunEvent::Reopen` 回焦窗口。
- **依据**：AppKit Regular 应用运行中图标持续显示；社区讨论（discussions#8506）里关窗后图标默认**不**消失（用户想去掉反而要显式 Accessory/setDockVisibility）。
- **风险**：个别 macOS 版本/场景下"全部窗口 orderOut"可能伴随图标行为差异。
- **验证**：BB-START-07（真机）：点关闭 → Dock 图标在、状态栏图标在 → 点 Dock 回焦 → 托盘"退出"才完全消失。

### P9 macOS：`RunEvent::Reopen` 字段形态
- **现状**：Reopen 用 `{ .. }` 宽松匹配，编译在 Windows 侧无法覆盖 macOS 分支（cfg 门控）。
- **风险**：若字段/变体名与 tauri 版本不匹配，macOS 构建会失败。
- **验证**：macOS 上执行一次 `cargo build` 即可确认。

### P10 macOS：通知权限探测路径已停用
- **现状**：提醒推送改走置顶弹窗后，`notify.rs`（含 macos_bootstrap 的权限探测）整体停用。首次启动不再请求系统通知权限——这是**有意行为**，但需真机确认没有任何系统通知权限弹窗残留出现。
- **验证**：macOS 首启观察。

### P11 Linux：托盘（AppIndicator）左键点击行为
- **现状**：`show_menu_on_left_click(false)` + 左键 Click 事件回焦窗口。部分 Linux 桌面（GNOME 的 AppIndicator 扩展）**不支持左键直接触发 Click 事件**，左键可能也弹菜单或无反应。
- **验证**：BB-START-04 的 Linux 变体：左键回焦 / 菜单可达即可。

### P12 Linux：构建需要 `libasound2-dev`
- **现状**：rodio/cpal 的 ALSA 后端需要 ALSA 头文件（构建机）；运行时无额外依赖。
- **验证**：Linux 构建冒烟。

### P13 三端产物签名与分发
- **现状**：Windows exe 无签名（SmartScreen 可能提示）；macOS .app 未签名/notarized（Gatekeeper 首启需右键打开或 `xattr -cr`）；均未配置自动更新。
- **验证**：分发前按需接入签名/公证流程（超出当前计划）。

### P26 macOS：LaunchAgent 自启模式下 `app.restart()` 失效
- **现状**：开机自启选 `MacosLauncher::LaunchAgent`（写 `~/Library/LaunchAgents` plist）。launchd 管理的进程内调用 `app.restart()`（"重启生效"类设置使用）会静默失败——新进程脱离 launchd 作业上下文，生态已知限制。
- **备选**：`MacosLauncher::AppleScript`（系统登录项）不受影响且原生出现在系统设置-登录项，但注册时需要弹"自动化-System Events"权限，且 auto-launch 在该模式只透传 `--hidden`/`--minimized` 参数（`--autostart` 恰好不在此列）。权衡后选 LaunchAgent + 文档记录。
- **验证**：macOS 真机：开启自启后到设置页切换 webview 开关点"立即重启"。
- **影响范围**：仅 macOS + 已开启自启 + 触发重启生效设置三者同时成立。

### P27 Linux：AppImage 自启为 best-effort
- **现状**：XDG autostart 走 `~/.config/autostart/<app>.desktop`，`Exec` 指向二进制绝对路径。AppImage 场景下 auto-launch 对 `$APPIMAGE` 环境变量的处理未逐行核实（0.6 文档未提及），可能需运行时自行处理 `--appimage-extract-and-run` 或工作目录。
- **验证**：Linux 真机 AppImage：开启自启 → 注销重登 → 静默驻托盘。

## 三、设计取舍（行为如此，非 bug）

### P14 关闭 = 隐藏到托盘，"退出"只有两个入口
- 托盘菜单"退出" 和 Shift+关闭按钮的确认模态。`ExitRequested` 防线保证窗口全关也不退出。

### P15 提醒推送不用系统通知
- WinRT Toast 在勿扰模式/未注册 AUMID 环境下不可见（用户实测），改为置顶弹窗子窗口；`notify.rs` 保留备用。

### P16 周课表提醒不补发
- 应用关闭期间到期的周课表提醒不补发（新一天首轮只推进水位线）；手动 reminders 表的提醒**会**补发。两套机制行为不同，是有意设计。

### P17 时间窗触发的"首轮标记"
- 应用启动/跨天/切换周表后的首次轮询只推进水位线。因此启动后 1 秒内恰好到期的提醒可能被静默（1 秒窗口，可感知性极低）。

### P18 剪贴板嗅探依赖窗口 focus 事件
- 粘贴目标与预览浮块在窗口聚焦时校验剪贴板。不聚焦应用就不会刷新（Ctrl+V 粘贴时实时再读一次剪贴板，不影响正确性）。

### P19 铃声"继承"链是静态快照
- 编辑模态里"未设置"显示的继承值是打开模态时的解析结果；若期间修改了设置页的全局铃声，需要重开编辑模态才会刷新显示。

### P20 设置页与网格页使用各自的配置快照
- 设置页保存后，网格页的天窗口等立即从上下文取新值（响应式）；但已打开的编辑模态内不会热更新继承提示（同 P19）。

### P21 内置字体包体与许可证
- **现状**：内置 4 字体 Regular 单字重（霞鹜文楷 Mono 24.4MB / 霞鹜文楷 25.6MB / HarmonyOS Sans SC 7.9MB / OPPO Sans R 9.7MB），gzip 压缩后约 36MB 进包体。Maple Mono NF CN 待网络恢复后补入（Maple Sans 本身尚未发布，仅 Maple Mono 系列）。
- **许可证**：霞鹜文楷与 Maple 为 OFL 1.1（允许打包/商用，衍生需保持 OFL）；HarmonyOS Sans 与 OPPO Sans 免费商用、嵌入式使用被普遍认可，正式商用分发前建议核对官方 EULA 最终版。
- **注意**：Regular 单字重，粗体由渲染器合成；字体文件解压到 `Documents/scheet/fonts/`，删除该目录文件后重启应用会重新解压。

### P22 WebView2 默认错误页无法拦截（仅影响开发模式）
- **现象**：页面导航失败（如 dev 模式下 vite 意外退出后刷新）时，WebView2 会绘制原生错误页，其上的默认右键菜单同样无法屏蔽——tauri/wry 未暴露对应 API（错误页由 WebView2 原生绘制，页面 JS 已不在场）。
- **缓解**：
  - release 产物的前端资源内嵌于二进制，主文档加载不会失败，此场景实际只在 dev 模式出现；
  - 应用自身的所有文档（首屏 splash、主界面、弹窗）已在 index.html 内联脚本与应用层双重屏蔽默认右键菜单；
  - `pnpm tauri dev` 会托管 vite 进程，vite 退出时 dev 实例随之退出，不会长时间停留在错误页。
- **补充（M4-part7 后）**：AppShell 已加渲染错误边界（ErrorBoundary）+ JS 错误转发 stderr（diagnostics::debug_log），渲染崩溃不再吞掉标题栏，会显示带"重试"的错误面板。

### P23 dev+HMR 切换查看瞬间整进程闪退（WebView2 宿主断言，已实证）
- **现象**：开发模式（pnpm tauri dev）前端 HMR 热替换落地、切回窗口查看的瞬间，整进程闪退。退出码 **0xC0000421（STATUS_ASSERTION_FAILURE，Chromium CHECK 签名）**；`pnpm debug:attach` 确认无任何异常事件、直接 EXIT（断言路径绕过异常分发与日志），真实退出码以父进程（tauri CLI）读数为准。
- **环境**：WebView2 154.0.4258.62；多 webview 存活（main / alarm-popup / close-notice）。2026-10-11 实证，与堆损坏（0xC0000374，已随 .48 钉住方案移除，见 git 历史）是不同签名。
- **性质**：WebView2 宿主层断言，非应用代码 panic、非堆损坏；release 构建无 HMR，不受影响。
- **缓解**：HMR 落地后再切回查看；重要操作前先保存；复现/取证用 `pnpm debug:attach`。
- **验证**：开发环境问题，不进功能用例。

### P24 托盘菜单"退出"静默退出，不警告未保存改动
- **现象**：周表有脏改动时，托盘右键菜单"退出 Scheet"直接 `app.exit(0)`，未保存改动静默丢失。
- **同脏状态下已有保护的路径**：标题栏设置入口（确认框）、Shift+关闭（退出确认框 messageDirty 文案）；**关进托盘本身不丢**（React 状态在内存存活）。
- **为什么暂缺**：托盘在 Rust 侧，感知不到前端的 dirty 状态；补齐需要 Rust→前端往返确认（主窗口隐藏时还得先亮出来），工程量与收益暂不匹配——脏状态时标题栏"未保存"琥珀徽章常驻可见。
- **待做方案**：托盘"退出"点击 → emit `scheet://exit-requested` → 前端有脏改动时 `focus_main_window` + 弹确认框 → 确认后调用真正的退出命令；前端超时未响应（如 webview 已死）则直接退出兜底。
- **验证**：脏状态下托盘退出，应出现确认框。

## 已解决（历史记录）

- ~~Windows 时间拨盘黑图标/白底~~ → `:root color-scheme: dark`。
- ~~保存周表后区间内时间点意外响铃~~ → 调度器改时间窗触发。
- ~~循环试听不循环~~ → 循环改看护线程驱动（+5 秒间隔）。
- ~~自动命名重号（两个 周表6）~~ → 按槽位号派发。
- ~~表格式布局的几像素滚动~~ → 表高显式像素化 + overflow 裁剪。
- ~~冲突时 cell 被推挤~~ → 绝对定位 + 泳道并排。
