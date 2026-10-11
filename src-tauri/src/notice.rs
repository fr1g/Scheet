//! 首次"关闭→收进托盘"说明小窗（复用提醒弹窗的形态：右下角置顶小窗）。
//!
//! 触发：lib.rs 的 CloseRequested 主窗口首次分支——覆盖应用内按钮、任务栏
//! 关闭、Alt+F4、Linux 标题栏等一切关闭入口；已读标记由触发方写入 flags。
//! 内容为静态 notice.html（独立 Vite 入口，文案内建中英按系统语言选择）；
//! 点击任意处或"知道了"按钮经 finish 命令隐藏本窗。

use tauri::{command, AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::popup::POPUP_HEIGHT;

pub const NOTICE_LABEL: &str = "close-notice";
const NOTICE_WIDTH: f64 = 420.0;
const NOTICE_HEIGHT: f64 = 280.0;

/// 弹出（或复显）说明小窗；叠在提醒弹窗槽位上方，两者同现时不重叠。
pub fn show(app: &AppHandle) -> Result<(), String> {
    let (x, y) = crate::popup::bottom_right_position(
        app,
        NOTICE_WIDTH,
        NOTICE_HEIGHT,
        POPUP_HEIGHT + 12.0,
    );
    if let Some(win) = app.get_webview_window(NOTICE_LABEL) {
        let _ = win.set_position(LogicalPosition::new(x, y));
        let _ = win.show();
        return Ok(());
    }
    let _window = WebviewWindowBuilder::new(
        app,
        NOTICE_LABEL,
        WebviewUrl::App("notice.html".into()),
    )
    .title("Scheet")
    .decorations(false)
    .inner_size(NOTICE_WIDTH, NOTICE_HEIGHT)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    // 与提醒弹窗同款防抢焦点组合：focused(false) 管创建首秀，
    // focusable(false)（WS_EX_NOACTIVATE）免疫复显激活。
    .focused(false)
    .focusable(false)
    .position(x, y)
    .build()
    .map_err(|e| format!("创建说明小窗失败: {e}"))?;
    Ok(())
}

/// 隐藏说明小窗。
pub fn dismiss(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(NOTICE_LABEL) {
        let _ = win.hide();
    }
}

/// 前端"知道了"回调：隐藏说明小窗。
#[command]
pub fn finish_close_notice(app: AppHandle) -> Result<(), String> {
    dismiss(&app);
    Ok(())
}
