# WebView2 运行时问题调查与修复记录

> 2026-10-09。调查对象：debug 启动 panic "Could not find the webview runtime"（日志 `_temps/last-log.log`）。
> 结论与方案已经用户确认，实际改动见 `current.md` 与 git 历史。

## 根因（证据链已在当事机器逐项验证）

1. **残留的用户级环境变量**：10/1 应急方案在 `HKCU\Environment` 写入
   `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = C:\Program Files (x86)\Microsoft\EdgeWebView\Application\154.0.4258.37`，
   对所有新进程永久生效。
2. **自动更新删掉了 .37**：`Application\` 下只剩 `154.0.4258.62`（HKLM WOW6432Node 注册表 pv=154.0.4258.62，运行时文件完整）。
3. **WebView2 加载器优先读环境变量**：wry 0.57 `webview_version()` →
   `GetAvailableCoreWebView2BrowserVersionString(null)`，folder 为 null 时加载器回退环境变量
   → 指向已删除的 .37 目录 → `HRESULT 0x80070002`（ERROR_FILE_NOT_FOUND）。
   Tauri 创建 WebView2 环境时同样失败 → app setup panic。

### 原有检查为何双双失效

- `pin_runtime_if_broken()`（旧 webview2.rs:120）：**见到环境变量已设置就直接 return**，
  从不校验目标目录存在性——兜底逻辑被自己的旧残留毒化。
- `runtime_installed()`（旧 webview2.rs:24）：**只查注册表 pv 非空**。pv=.62 非空 → 判定已安装
  → 跳过引导安装流程 → 随后 Tauri 照样崩。注册表结论与加载器实际可加载性脱节，即"依赖检查无效"。

## 修复方案（已实施）

- **P0 清理**：删除 `pin_runtime_if_broken` 及 `BROKEN_RUNTIME_VERSION`/`FALLBACK_RUNTIME_FOLDER`
  常量与相关 todo 注释；删除 `scripts/dev-safe.ps1` 与 `package.json` 的 `dev:safe`（其唯一用途即钉 .37，目录已被更新器删除）。
- **检查诚实化**：`ensure_runtime()` 以 `tauri::webview_version()`（加载器视角）为权威检测——
  成功则记录版本返回；失败才进入"缺失→弹窗引导安装"流程。注册表探测函数 `runtime_installed()` 随之退役。
- **防复发**：启动时校验 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER`——已设置但目标目录缺失 `msedge.dll`
  时进程内 `remove_var` 并 WARN 留痕，加载器自动回退注册表解析。
- 环境变量一切操作均在创建任何 WebView 之前（lib.rs 启动最早期），且只动进程级，不再写用户级。
- 一次性清理（用户手工执行）：`reg delete "HKCU\Environment" /v WEBVIEW2_BROWSER_EXECUTABLE_FOLDER /f`。

## 已知风险与后续观察项

- **.62 是否修复 154.0.4258.48 的宿主堆损坏缺陷（0xc0000374）无法公开查证**（当时 .48 缺陷为实测定案）。
  本次以系统 .62 实跑观察；若复现崩溃，挂 `pnpm debug:attach` 取证。
- 若未来再遇"坏版本自动更新"场景，正确姿势不是钉 Evergreen 目录（旧版本注定被删），而是
  微软 **Fixed Version** 私有运行时（官方独立包，存应用数据目录，仅进程级环境变量指向），
  详见调查结论；届时再立项。不存在可依赖的"WV2 版本管理插件"，机制就是环境变量 + Fixed Version 包
  （tauri 2.12 内置 `webviewInstallMode: fixedRuntime` 本质也是设同一环境变量）。

## 参考：微软文档机制

- 运行时查找顺序：`WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` 环境变量 → 注册表（HKCU/HKLM/WOW6432Node EdgeUpdate Clients pv）
- Fixed Version 分发：<https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution>
