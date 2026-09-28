//! 系统托盘（Windows 托盘 / macOS 状态栏 / Linux AppIndicator）。
//!
//! 左键点击托盘图标 → 显示并聚焦主窗口；右键（或系统默认方式）弹出菜单，
//! 菜单提供"显示主窗口"与"退出"。退出是唯一的应用退出路径——
//! 窗口关闭按钮只是隐藏窗口（见 lib.rs 的 CloseRequested 处理）。

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const ITEM_SHOW: &str = "show";
const ITEM_QUIT: &str = "quit";

pub fn create(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, ITEM_SHOW, "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, ITEM_QUIT, "退出 Scheet", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("scheet-tray")
        .icon(app.default_window_icon().expect("应用图标缺失").clone())
        .tooltip("Scheet")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            ITEM_SHOW => crate::focus_main_window(app),
            ITEM_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::focus_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
