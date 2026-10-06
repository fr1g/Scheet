//! 提醒弹窗子窗口（系统通知的替代方案）。
//!
//! 部分环境（勿扰模式、未注册 AUMID 等）下 WinRT 系统通知不可见，
//! 因此提醒改为在屏幕右下角弹出一个置顶小窗：展示事务信息与实时时钟。
//! 弹窗内容为静态 popup.html（独立 Vite 入口，无 React、无加载态）：
//! 页面加载后经 IPC 从本模块的载荷仓库取数渲染，复用时经事件更新。
//!
//! 交互约定：点击弹窗本体 = 停止响铃 + 收起（隐藏，不聚焦主窗口）；
//! 点击"打开主窗口"按钮 = 停止响铃 + 收起 + 聚焦主窗口；
//! 主窗口获得焦点时自动收起。收起 = 隐藏而非销毁（无可见性过渡，
//! 下一次提醒经 set_visible(true) 复显，无标题栏再生风险）。

use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

pub const POPUP_LABEL: &str = "alarm-popup";
const POPUP_WIDTH: f64 = 360.0;
const POPUP_HEIGHT: f64 = 132.0;

/// 弹窗渲染所需的全部数据（静态页经 IPC 取用；serde camelCase 与前端接口一致）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmPopupPayload {
    /// UI 语言：配置原值 "auto" | "zh" | "en"（auto 由静态页按 navigator.language 解析）。
    pub lang: String,
    /// 提醒标题；空 = 静态页按 entry_type 回退显示类型名。
    pub title: String,
    /// 手动提醒的自定义内容（周课表提醒没有）。
    pub body: Option<String>,
    /// "start" | "end"（周课表提醒；手动提醒没有）。
    pub kind: Option<String>,
    /// "HH:MM" 开始时间（周课表提醒）。
    pub time_start: Option<String>,
    /// "HH:MM" 结束时间（周课表提醒；手动提醒没有）。
    pub time_end: Option<String>,
    /// "once" | "loop"。
    pub mode: String,
    /// "normal" | "rest"（周课表提醒；手动提醒没有）。
    pub entry_type: Option<String>,
}

/// 最近一次提醒的载荷仓库：静态页加载时经 IPC 取用。
static PAYLOAD: std::sync::Mutex<Option<AlarmPopupPayload>> = std::sync::Mutex::new(None);

fn store_payload(payload: &AlarmPopupPayload) {
    if let Ok(mut guard) = PAYLOAD.lock() {
        *guard = Some(payload.clone());
    }
}

/// 静态弹窗页加载时取回最近一次提醒的载荷。
#[command]
pub fn get_last_alarm_payload() -> Result<Option<AlarmPopupPayload>, String> {
    PAYLOAD
        .lock()
        .map_err(|_| "弹窗载荷锁已中毒".to_string())
        .map(|g| g.clone())
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
                - 16.0;
            let y = (area.position.y as f64 + area.size.height as f64) / scale
                - POPUP_HEIGHT
                - 48.0;
            (x, y)
        }
        _ => (0.0, 0.0),
    }
}

/// 显示（或刷新）提醒弹窗：载荷入仓库 → 窗口已存在则移回屏幕角落 +
/// set_visible(true) + 事件更新；否则在角落创建（创建即可见，无显示过渡）。
pub fn show(app: &AppHandle, payload: AlarmPopupPayload) -> Result<(), String> {
    store_payload(&payload);
    let (x, y) = popup_position(app);
    if let Some(win) = app.get_webview_window(POPUP_LABEL) {
        let _ = win.set_position(LogicalPosition::new(x, y));
        let _ = win.show();
        return app
            .emit_to(POPUP_LABEL, "scheet://alarm-popup", payload)
            .map_err(|e| format!("更新提醒弹窗失败: {e}"));
    }

    let _window = WebviewWindowBuilder::new(
        app,
        POPUP_LABEL,
        WebviewUrl::App("popup.html".into()),
    )
    .title("Scheet 提醒")
    .decorations(false)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .focused(false)
    .position(x, y)
    .build()
    .map_err(|e| format!("创建提醒弹窗失败: {e}"))?;
    Ok(())
}

/// 收起提醒弹窗：隐藏而非销毁（走 tao 标志系统，无 NCCALCSIZE 重算、
/// 无原生标题栏再生）；下一次提醒经 set_visible(true) 复显。
pub fn dismiss(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(POPUP_LABEL) {
        let _ = window.hide();
    }
}

/// 弹窗本体点击回调：停止响铃 + 收起弹窗（不聚焦主窗口）。
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
