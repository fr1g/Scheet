//! 跨平台系统通知分发。
//!
//! - Windows: `tauri-winrt-notification`（WinRT Toast），点击横幅触发
//!   `on_activated` 回调 → 聚焦主窗口。
//! - macOS: `notify-rust`（NSUserNotification 封装）。启动时把通知归属到应用
//!   本体，点击横幅由系统默认行为激活应用；通知权限通过"首次启动投递一条
//!   探测通知"触发系统弹窗获取，探测结果持久化，只做一次。
//! - Linux: `notify-rust`（FreeDesktop D-Bus），注册 `default` 动作，
//!   点击横幅 → 聚焦主窗口。
//!
//! 硬性约定：任何失败（无通知服务、无 WinRT、权限被禁等）只记录日志，
//! 绝不 panic —— 通知能力缺失时应用其余功能照常运行。

use tauri::AppHandle;

/// 发送一条系统通知。
/// Windows 为异步投递（错误仅记录日志，恒返回 Ok）；
/// macOS/Linux 同步返回投递结果。
pub fn send(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    return windows::send(app, title, body);
    #[cfg(target_os = "macos")]
    return macos::send(title, body);
    #[cfg(all(unix, not(target_os = "macos")))]
    return linux::send(app, title, body);
}

#[cfg(target_os = "windows")]
mod windows {
    use tauri::AppHandle;

    pub fn send(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
        use tauri_winrt_notification::Toast;

        // Toast 不是 Send，只能在同一线程内构建并展示，因此把文本移入子线程
        let title = title.to_string();
        let body = body.to_string();
        let app_handle = app.clone();
        // 注册了回调的 show() 会等待通知生命周期结束，放到独立线程投递，
        // 失败只记录日志（如无 WinRT 的旧系统）
        std::thread::spawn(move || {
            let mut toast = Toast::new("Scheet").title(&title);
            if !body.trim().is_empty() {
                toast = toast.text1(&body);
            }
            let result = toast
                .on_activated(move |_action| {
                    crate::focus_main_window(&app_handle);
                    Ok(())
                })
                .show();
            if let Err(e) = result {
                crate::logging::error(&format!("[notify] Windows toast show failed: {e}"));
            }
        });
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use notify_rust::Notification;

    pub fn send(title: &str, body: &str) -> Result<(), String> {
        let mut notification = Notification::new().summary(title);
        if !body.trim().is_empty() {
            notification = notification.body(body);
        }
        notification
            .show()
            .map(|_| ())
            .map_err(|e| format!("macOS 通知发送失败（权限可能被拒绝）: {e}"))
    }

    /// 把通知归属到应用本体，点击横幅时系统才能激活 Scheet；
    /// 开发模式下归属到终端（与官方 tauri 通知插件的做法一致）。
    pub fn set_application_identifier(dev: bool, identifier: &str) {
        let target = if dev { "com.apple.Terminal" } else { identifier };
        if let Err(e) = notify_rust::set_application(target) {
            crate::logging::warn(&format!("[notify] set_application failed: {e}"));
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod linux {
    use tauri::AppHandle;

    pub fn send(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
        let mut notification =
            notify_rust::Notification::new().summary(title).appname("Scheet");
        if !body.trim().is_empty() {
            notification = notification.body(body);
        }
        // 大多数桌面环境把"点击横幅本体"映射为 default 动作
        let handle = notification
            .action("default", "打开 Scheet")
            .show()
            .map_err(|e| format!("Linux 通知发送失败（无通知服务？）: {e}"))?;
        let app_handle = app.clone();
        // wait_for_action 阻塞到横幅消失，放到独立线程等待点击
        std::thread::spawn(move || {
            handle.wait_for_action(|action| {
                if action == "default" {
                    crate::focus_main_window(&app_handle);
                }
            });
        });
        Ok(())
    }
}

/// macOS 启动引导：设置通知归属，并在首次启动时投递探测通知以触发
/// 系统权限弹窗（结果记入 app_settings，只探测一次）。
#[cfg(target_os = "macos")]
pub fn macos_bootstrap(
    app: &AppHandle,
    identifier: &str,
    db: &std::sync::Arc<crate::db::DataDb>,
) {
    macos::set_application_identifier(tauri::is_dev(), identifier);

    let probed = db
        .with_conn(|conn| crate::settings::get_flag(conn, "macNotificationsProbed"))
        .unwrap_or(true);
    if probed {
        return;
    }
    match send(app, "Scheet", "通知权限探测：看到这条通知即代表通知已开启。") {
        Ok(()) => {
            if let Err(e) =
                db.with_conn(|conn| crate::settings::set_flag(conn, "macNotificationsProbed"))
            {
                crate::logging::warn(&format!(
                "[notify] Failed to persist notification permission probe flag: {e}"
            ));
            }
        }
        Err(e) => crate::logging::warn(&format!(
            "[notify] macOS notification permission probe failed (will retry next launch, app unaffected): {e}"
        )),
    }
}
