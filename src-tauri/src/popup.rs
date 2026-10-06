//! 提醒弹窗子窗口（系统通知的替代方案）。
//!
//! 部分环境（勿扰模式、未注册 AUMID 等）下 WinRT 系统通知不可见，
//! 因此提醒改为在屏幕右下角弹出一个置顶小窗：展示事务信息与实时时钟，
//! 点击任意位置 → 停止响铃 + 关闭弹窗 + 聚焦主窗口；
//! 主窗口获得焦点时也会自动关闭弹窗。跨平台行为一致。

use serde::Serialize;
use tauri::{command, AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

pub const POPUP_LABEL: &str = "alarm-popup";
const POPUP_WIDTH: f64 = 360.0;
const POPUP_HEIGHT: f64 = 132.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlarmPopupData {
    title: String,
    /// 手动提醒的自定义内容（周课表提醒不传，文案由前端生成）。
    body: Option<String>,
    /// "start" | "end"（周课表提醒）。
    kind: Option<String>,
    /// "HH:MM"。
    time: Option<String>,
    mode: String,
    /// "normal" | "rest"（周课表提醒；手动提醒没有）。
    entry_type: Option<String>,
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 显示（或刷新）提醒弹窗。已存在时仅更新内容，不重建窗口。
#[allow(clippy::too_many_arguments)]
pub fn show(
    app: &AppHandle,
    title: &str,
    body: Option<&str>,
    kind: Option<&str>,
    time: Option<&str>,
    mode: &str,
    entry_type: Option<&str>,
) -> Result<(), String> {
    let data = AlarmPopupData {
        title: title.to_string(),
        body: body.map(|b| b.to_string()),
        kind: kind.map(|k| k.to_string()),
        time: time.map(|t| t.to_string()),
        mode: mode.to_string(),
        entry_type: entry_type.map(|e| e.to_string()),
    };
    let (x, y) = popup_position(app);
    if let Some(win) = app.get_webview_window(POPUP_LABEL) {
        // 从屏幕外移回角落（保持可见标志不变，无可见性过渡）
        let _ = win.set_position(LogicalPosition::new(x, y));
        return app
            .emit_to(POPUP_LABEL, "scheet://alarm-popup", data)
            .map_err(|e| format!("更新提醒弹窗失败: {e}"));
    }

    let mut query = format!("title={}&mode={}", urlencode(title), urlencode(mode));
    if let Some(b) = body {
        query.push_str(&format!("&body={}", urlencode(b)));
    }
    if let Some(k) = kind {
        query.push_str(&format!("&kind={}", urlencode(k)));
    }
    if let Some(t) = time {
        query.push_str(&format!("&time={}", urlencode(t)));
    }
    if let Some(et) = entry_type {
        query.push_str(&format!("&entryType={}", urlencode(et)));
    }
    let builder = WebviewWindowBuilder::new(
        app,
        POPUP_LABEL,
        WebviewUrl::App(format!("index.html#/alarm-popup?{query}").into()),
    )
    .title("Scheet 提醒")
    .decorations(false)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .focused(false)
    .inner_size(POPUP_WIDTH, POPUP_HEIGHT);

    let window = builder
        .position(x, y)
        .build()
        .map_err(|e| format!("创建提醒弹窗失败: {e}"))?;
    // 再以逻辑坐标精确微调一次（构建器 position 的坐标语义随平台而异）
    let _ = window.set_position(LogicalPosition::new(x, y));
    Ok(())
}

/// （显示/收起弹窗统一走 Window::show/hide —— tao 事件循环内重算样式，
///  SWP_NOACTIVATE | SWP_FRAMECHANGED，无激活且边框状态同步。）

/// 主显示器可用区域（预留任务栏空间）右下角的逻辑坐标。
/// 工作区给出的是物理像素，set_position 消费逻辑坐标——必须除以缩放因子，
/// 否则在非 100% 缩放的屏幕上弹窗会被定位到屏幕外（曾经"永远看不到弹窗"的原因）。
fn popup_position(app: &AppHandle) -> (f64, f64) {
    match app.primary_monitor() {
        Ok(Some(monitor)) => {
            let area = monitor.work_area();
            let scale = monitor.scale_factor();
            let x = (area.position.x as f64 + area.size.width as f64) / scale
                - POPUP_WIDTH
                - 16.0;
            let y = (area.position.y as f64 + area.size.height as f64) / scale
                - POPUP_HEIGHT
                - 48.0;
            (x, y)
        }
        _ => (0.0, 0.0),
    }
}

/// 关闭弹窗（不存在时为无害空操作）。
/// 收起提醒弹窗：移到屏幕外（保持可见标志不变——可见性过渡会触发
/// NCCALCSIZE(0) 重算，在无边框窗口上再生原生标题栏）。
/// 下一次提醒经 popup::show 移回屏幕角落。
pub fn dismiss(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(POPUP_LABEL) {
        // 正常关闭销毁（lib.rs 的 CloseRequested 拦截仅对 main 生效）
        let _ = window.close();
    }
}

/// 收起提醒弹窗并停止响铃（隐藏而非销毁——销毁 WebView 的时机已验证与
/// 堆损坏相关，且下一次提醒会经 show() 重新显示，无需反复销毁重建）。
#[command]
pub async fn close_alarm_popup(app: AppHandle) -> Result<(), String> {
    crate::sound::stop();
    dismiss(&app);
    Ok(())
}

/// 弹窗"打开主窗口"按钮回调：停止响铃、收起弹窗、聚焦主窗口。
#[command]
pub async fn dismiss_alarm_popup(app: AppHandle) -> Result<(), String> {
    crate::sound::stop();
    dismiss(&app);
    crate::focus_main_window(&app);
    Ok(())
}
