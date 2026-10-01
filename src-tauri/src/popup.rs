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
) -> Result<(), String> {
    let data = AlarmPopupData {
        title: title.to_string(),
        body: body.map(|b| b.to_string()),
        kind: kind.map(|k| k.to_string()),
        time: time.map(|t| t.to_string()),
        mode: mode.to_string(),
    };
    if app.get_webview_window(POPUP_LABEL).is_some() {
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
    .visible(false)
    .inner_size(POPUP_WIDTH, POPUP_HEIGHT);

    let (x, y) = popup_position(app);
    let window = builder
        .position(x, y)
        .build()
        .map_err(|e| format!("创建提醒弹窗失败: {e}"))?;
    // 再以逻辑坐标精确微调一次（构建器 position 的坐标语义随平台而异）
    let _ = window.set_position(LogicalPosition::new(x, y));
    let _ = window.show();
    Ok(())
}

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
                - 12.0;
            let y = (area.position.y as f64 + area.size.height as f64) / scale
                - POPUP_HEIGHT
                - 48.0;
            (x, y)
        }
        _ => (0.0, 0.0),
    }
}

/// 关闭弹窗（不存在时为无害空操作）。
pub fn dismiss(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(POPUP_LABEL) {
        let _ = window.close();
    }
}

/// 弹窗点击回调（由弹窗页面调用）：停止响铃、关闭弹窗、聚焦主窗口。
#[command]
pub async fn dismiss_alarm_popup(app: AppHandle) -> Result<(), String> {
    crate::sound::stop();
    dismiss(&app);
    crate::focus_main_window(&app);
    Ok(())
}
