mod clipboard;
mod clock;
mod db;
mod fonts;
mod logging;
// 系统通知实现保留备用（当前提醒推送改用 popup.rs 的置顶弹窗方案）
#[allow(dead_code)]
mod notify;
mod popup;
mod reminders;
mod scheduler;
mod settings;
mod sound;
mod timetable;
mod todo;
mod tray;
#[cfg(windows)]
mod webview2;
mod weeks;

use std::sync::Arc;

use tauri::Manager;

/// 显示并聚焦主窗口（托盘点击、通知点击、macOS Dock 点击共用）。
pub(crate) fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 日志等级须最先初始化（之后的日志才受阈值过滤）；[T] 桥接 tauri/log 框架日志
    logging::init_from_db();
    logging::attach_tauri_logger();

    // WebView2 开关（硬件加速/平滑滚动）须在创建任何 WebView2 环境前写入环境变量；
    // 独立于 LazyDb 做一次轻量读取，失败按默认值跳过。
    settings::apply_webview_flags();

    // 便携单文件 exe 不经过安装器，须在创建窗口前自行保证 WebView2 可用
    #[cfg(windows)]
    webview2::ensure_runtime();

    // 首启解压内置字体到数据目录（同步执行，一次性开销）
    fonts::ensure_bundled_fonts();

    // 数据目录根 README：不存在或为空时创建（说明备份方式，双语纯文本）
    db::ensure_data_readme();

    tauri::Builder::default()
        .manage(Arc::new(db::DataDb(db::LazyDb::new(
            "data.db",
            db::init_data_schema,
        ))))
        .manage(Arc::new(db::WeeksDb(db::LazyDb::new(
            "weeks.db",
            weeks::init_weeks_schema,
        ))))
        .manage(Arc::new(db::TodoDb(db::LazyDb::new(
            "todo-list.db",
            todo::init_todo_schema,
        ))))
        .setup(|app| {
            // macOS：设置通知归属并在首次启动时请求通知权限
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle().clone();
                let identifier = app.config().identifier.clone();
                let data = app.state::<Arc<db::DataDb>>().inner().clone();
                std::thread::spawn(move || {
                    notify::macos_bootstrap(&handle, &identifier, &data);
                });
            }

            tray::create(app)?;

            // 启动时应用已保存的图标变体（默认 color 与 exe 内嵌图标一致，重复应用无害）
            {
                let data = app.state::<Arc<db::DataDb>>().inner().clone();
                let icon_variant = data
                    .with_conn(settings::load_global_config)
                    .map(|c| c.icon_variant)
                    .unwrap_or_else(|_| "color".to_string());
                settings::apply_icon_variant(app.handle(), &icon_variant);
            }

            let handle = app.handle().clone();
            let data = app.state::<Arc<db::DataDb>>().inner().clone();
            let weeks = app.state::<Arc<db::WeeksDb>>().inner().clone();
            let todo_db = app.state::<Arc<db::TodoDb>>().inner().clone();
            scheduler::start(handle, data, weeks, todo_db);

            Ok(())
        })
        .on_window_event(|window, event| {
            // 托盘驻留：点关闭只是隐藏窗口，真正退出走托盘菜单的"退出"
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 仅主窗口驻留托盘（关闭=隐藏）；其他窗口（提醒弹窗等）正常关闭销毁，
                // 否则 dismiss 的 close 被拦成 hide，弹窗隐形残留、后续提醒全部不可见
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            // 主窗口获得焦点时自动关闭提醒弹窗
            if let tauri::WindowEvent::Focused(true) = event {
                if window.label() == "main" {
                    popup::dismiss(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_app_settings,
            settings::set_window_controls_position,
            settings::get_global_config,
            settings::set_global_config,
            settings::open_app_data_dir,
            settings::open_fonts_dir,
            settings::open_alarms_dir,
            settings::get_startup_webview_flags,
            settings::open_devtools,
            settings::restart_application,
            settings::request_clear_data,
            reminders::create_reminder,
            reminders::cancel_reminder,
            reminders::list_reminders,
            weeks::list_week_plans,
            weeks::create_week_plan,
            weeks::rename_week_plan,
            weeks::delete_week_plan,
            weeks::get_week_plan,
            weeks::save_week_plan,
            weeks::get_current_week_plan,
            weeks::set_active_week_plan,
            todo::list_todos_for_today,
            todo::add_todo_for_today,
            todo::set_todo_done_command,
            todo::delete_todo_command,
            sound::play_alarm_sound,
            sound::stop_alarm_sound,
            clipboard::read_clipboard_text,
            clipboard::write_clipboard_text,
            clipboard::list_alarm_sounds,
            popup::dismiss_alarm_popup,
            tray::exit_application,
            fonts::get_fonts_dir,
            logging::write_log,
        ])
        .build(tauri::generate_context!())
        .expect("Scheet 初始化失败")
        .run(|_app, _event| {
            // macOS：点击 Dock 图标重新打开/聚焦窗口
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                focus_main_window(_app);
            }
            // 托盘驻留兜底：所有窗口被真实关闭/销毁时也不退出
            // （code=None 为自发性退出；app.exit(0) 的 code=Some(0) 不受影响，托盘"退出"仍有效）
            if let tauri::RunEvent::ExitRequested { code, api, .. } = _event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
