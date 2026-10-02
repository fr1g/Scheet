use std::sync::Arc;

use chrono::Datelike;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

use crate::db::DataDb;
use crate::sound::AlarmMode;

/// 窗口控制按钮组的位置。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowControlsPosition {
    /// 左侧：关闭、最小化。
    Left,
    /// 右侧：最小化、关闭。
    Right,
    /// 隐藏按钮组。
    Hidden,
}

/// 窗口控制按钮组设置。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowControls {
    pub position: WindowControlsPosition,
}

impl Default for WindowControls {
    fn default() -> Self {
        Self {
            position: WindowControlsPosition::Right,
        }
    }
}

/// 应用基本设置。
///
/// 持久化在 SQLite 的 app_settings 表中（key/value JSON），
/// 后续新增设置项时在此结构体上加字段即可（旧数据自动用默认值补齐）。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub window_controls: WindowControls,
}

const WINDOW_CONTROLS_KEY: &str = "windowControls";

// ============ 全局配置（周课表/铃声链等，存于 app_settings） ============

pub const DEFAULT_DAY_START_MINUTE: i64 = 360; // 06:00
pub const DEFAULT_DAY_END_MINUTE: i64 = 1439; // 23:59

/// 通用键值读取。
pub(crate) fn get_setting(
    conn: &Connection,
    key: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("读取设置失败: {e}"))
}

/// 通用键值写入（upsert）。
pub(crate) fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("写入设置失败: {e}"))?;
    Ok(())
}

/// 界面语言。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UiLanguage {
    Auto,
    Zh,
    En,
}

impl UiLanguage {
    pub fn as_db(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Zh => "zh",
            Self::En => "en",
        }
    }

    pub fn from_db(raw: &str) -> Self {
        match raw {
            "zh" => Self::Zh,
            "en" => Self::En,
            _ => Self::Auto,
        }
    }
}

/// 允许的界面字体 id（system = 系统默认字体）。
pub const UI_FONT_IDS: &[&str] = &[
    "system",
    "lxgw-wenkai-mono",
    "lxgw-wenkai",
    "maple-mono-nf-cn",
    "harmonyos-sans-sc",
    "oppo-sans",
];

/// 允许的界面字号档位。
pub const UI_FONT_SIZES: &[&str] = &["sm", "base", "lg"];

/// 当前进程启动时读取到的 WebView2 开关（硬件加速, 平滑滚动）。
/// 前端用它判断"已保存的改动是否还在等重启生效"。
static STARTUP_WEBVIEW_FLAGS: std::sync::OnceLock<(bool, bool)> = std::sync::OnceLock::new();

/// 启动最早期应用 WebView2 相关开关（须在创建任何 WebView2 环境之前写入环境变量）。
/// 独立于 LazyDb 做一次轻量读取：缺库/缺表/缺键按默认值处理，失败静默跳过。
pub fn apply_webview_flags() {
    let flags = (|| -> Option<(bool, bool)> {
        let dir = crate::db::data_dir().ok()?;
        let conn = Connection::open(dir.join("data.db")).ok()?;
        let read = |key: &str| -> Option<bool> {
            conn.query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                [key],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|s| s.parse::<bool>().ok())
        };
        Some((
            read("webviewHwAccel").unwrap_or(true),
            read("webviewSmoothScrolling").unwrap_or(false),
        ))
    })();
    let (hw_accel, smooth_scrolling) = flags.unwrap_or((true, false));
    let _ = STARTUP_WEBVIEW_FLAGS.set((hw_accel, smooth_scrolling));
    let mut args = String::new();
    if !hw_accel {
        args.push_str("--disable-gpu ");
    }
    if smooth_scrolling {
        args.push_str("--enable-features=SmoothScrolling");
    }
    let args = args.trim();
    if !args.is_empty() {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", args);
        crate::logging::info(&format!("[startup] WebView2 extra args: {args}"));
    }
}

/// 当前进程启动时生效的 WebView2 开关。
#[command]
pub fn get_startup_webview_flags() -> (bool, bool) {
    *STARTUP_WEBVIEW_FLAGS.get().unwrap_or(&(true, false))
}

/// 立即完整重启应用（供"重启后生效"的设置项使用）。
#[command]
pub fn restart_application(app: tauri::AppHandle) -> Result<(), String> {
    crate::logging::info("User requested app restart");
    app.restart();
}

/// 每周第一天。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FirstDayOfWeek {
    Mon,
    Sun,
}

impl FirstDayOfWeek {
    pub fn as_db(self) -> &'static str {
        match self {
            Self::Mon => "mon",
            Self::Sun => "sun",
        }
    }

    pub fn from_db(raw: &str) -> Self {
        match raw {
            "sun" => Self::Sun,
            _ => Self::Mon,
        }
    }

    /// 本周第一天（按设置）的日期。
    pub fn week_start(self, today: chrono::NaiveDate) -> chrono::NaiveDate {
        let days = match self {
            Self::Mon => today.weekday().num_days_from_monday(),
            Self::Sun => today.weekday().num_days_from_sunday(),
        };
        today - chrono::Duration::days(days as i64)
    }
}

/// 全局配置（设置页展示/编辑的整体对象）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GlobalConfig {
    pub day_start_minute: i64,
    pub day_end_minute: i64,
    pub first_day_of_week: FirstDayOfWeek,
    /// 铃声解析链（取值：None=未设置/继承，"builtin"，"none"，文件名）。
    pub alarm_all_file: Option<String>,
    pub alarm_all_mode: Option<AlarmMode>,
    pub alarm_normal_file: Option<String>,
    pub alarm_normal_mode: Option<AlarmMode>,
    pub alarm_rest_file: Option<String>,
    pub alarm_rest_mode: Option<AlarmMode>,
    /// 结束铃声链（未设置时回落到对应的开始铃声链）。
    pub alarm_all_end_file: Option<String>,
    pub alarm_all_end_mode: Option<AlarmMode>,
    pub alarm_normal_end_file: Option<String>,
    pub alarm_normal_end_mode: Option<AlarmMode>,
    pub alarm_rest_end_file: Option<String>,
    pub alarm_rest_end_mode: Option<AlarmMode>,
    /// 界面语言：auto=跟随系统。
    pub ui_language: UiLanguage,
    /// 界面字体：system=系统默认；其余为内置字体 id（默认 lxgw-wenkai-mono）。
    pub ui_font: String,
    /// 界面字号：sm / base / lg（默认 base）。
    pub ui_font_size: String,
    /// WebView2 硬件加速（默认开；修改后重启应用生效）。
    pub webview_hw_accel: bool,
    /// WebView2 平滑滚动（默认关，与 WebView2 原生默认一致；修改后重启生效）。
    pub webview_smooth_scrolling: bool,
    /// 日志等级：none/verbose/info/warn/error/fatal（默认 error；保存后立即生效）。
    pub log_level: String,
}

impl Default for GlobalConfig {
    fn default() -> Self {
        Self {
            day_start_minute: DEFAULT_DAY_START_MINUTE,
            day_end_minute: DEFAULT_DAY_END_MINUTE,
            first_day_of_week: FirstDayOfWeek::Mon,
            alarm_all_file: None,
            alarm_all_mode: None,
            alarm_normal_file: None,
            alarm_normal_mode: None,
            alarm_rest_file: None,
            alarm_rest_mode: None,
            alarm_all_end_file: None,
            alarm_all_end_mode: None,
            alarm_normal_end_file: None,
            alarm_normal_end_mode: None,
            alarm_rest_end_file: None,
            alarm_rest_end_mode: None,
            ui_language: UiLanguage::Auto,
            ui_font: "lxgw-wenkai-mono".to_string(),
            ui_font_size: "base".to_string(),
            webview_hw_accel: true,
            webview_smooth_scrolling: false,
            log_level: "error".to_string(),
        }
    }
}

/// 从 data.db 读取全局配置；缺失的键回退默认值。
pub(crate) fn load_global_config(conn: &Connection) -> Result<GlobalConfig, String> {
    let mode = |key: &str| -> Result<Option<AlarmMode>, String> {
        Ok(get_setting(conn, key)?.map(|s| AlarmMode::from_db(&s)))
    };
    Ok(GlobalConfig {
        day_start_minute: get_setting(conn, "dayStartMinute")?
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_DAY_START_MINUTE),
        day_end_minute: get_setting(conn, "dayEndMinute")?
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_DAY_END_MINUTE),
        first_day_of_week: get_setting(conn, "firstDayOfWeek")?
            .map(|s| FirstDayOfWeek::from_db(&s))
            .unwrap_or(FirstDayOfWeek::Mon),
        alarm_all_file: get_setting(conn, "alarmAllFile")?,
        alarm_all_mode: mode("alarmAllMode")?,
        alarm_normal_file: get_setting(conn, "alarmNormalFile")?,
        alarm_normal_mode: mode("alarmNormalMode")?,
        alarm_rest_file: get_setting(conn, "alarmRestFile")?,
        alarm_rest_mode: mode("alarmRestMode")?,
        alarm_all_end_file: get_setting(conn, "alarmAllEndFile")?,
        alarm_all_end_mode: mode("alarmAllEndMode")?,
        alarm_normal_end_file: get_setting(conn, "alarmNormalEndFile")?,
        alarm_normal_end_mode: mode("alarmNormalEndMode")?,
        alarm_rest_end_file: get_setting(conn, "alarmRestEndFile")?,
        alarm_rest_end_mode: mode("alarmRestEndMode")?,
        ui_language: get_setting(conn, "uiLanguage")?
            .map(|s| UiLanguage::from_db(&s))
            .unwrap_or(UiLanguage::Auto),
        ui_font: get_setting(conn, "uiFont")?
            .filter(|s| UI_FONT_IDS.contains(&s.as_str()))
            .unwrap_or_else(|| "lxgw-wenkai-mono".to_string()),
        ui_font_size: get_setting(conn, "uiFontSize")?
            .filter(|s| UI_FONT_SIZES.contains(&s.as_str()))
            .unwrap_or_else(|| "base".to_string()),
        webview_hw_accel: get_setting(conn, "webviewHwAccel")?
            .and_then(|s| s.parse().ok())
            .unwrap_or(true),
        webview_smooth_scrolling: get_setting(conn, "webviewSmoothScrolling")?
            .and_then(|s| s.parse().ok())
            .unwrap_or(false),
        log_level: get_setting(conn, "logLevel")?
            .filter(|s| crate::logging::LOG_LEVELS.contains(&s.as_str()))
            .unwrap_or_else(|| "error".to_string()),
    })
}

/// 校验铃声取值：None / builtin / none / 合法文件名。
fn validate_alarm_file_value(value: &Option<String>) -> Result<(), String> {
    match value {
        None => Ok(()),
        Some(v) if v == "builtin" || v == "none" => Ok(()),
        Some(file) => crate::sound::validate_alarm_file_name(file),
    }
}

fn persist_global_config(conn: &Connection, cfg: &GlobalConfig) -> Result<(), String> {
    set_setting(conn, "dayStartMinute", &cfg.day_start_minute.to_string())?;
    set_setting(conn, "dayEndMinute", &cfg.day_end_minute.to_string())?;
    set_setting(conn, "firstDayOfWeek", cfg.first_day_of_week.as_db())?;
    // (键, 值) 统一写入；None 表示清除该键（回退默认）
    let file_entries = [
        ("alarmAllFile", &cfg.alarm_all_file),
        ("alarmNormalFile", &cfg.alarm_normal_file),
        ("alarmRestFile", &cfg.alarm_rest_file),
        ("alarmAllEndFile", &cfg.alarm_all_end_file),
        ("alarmNormalEndFile", &cfg.alarm_normal_end_file),
        ("alarmRestEndFile", &cfg.alarm_rest_end_file),
    ];
    for (key, value) in file_entries {
        match value {
            Some(v) => set_setting(conn, key, v)?,
            None => {
                conn.execute("DELETE FROM app_settings WHERE key = ?1", [key])
                    .map_err(|e| format!("写入设置失败: {e}"))?;
            }
        }
    }
    let mode_entries = [
        ("alarmAllMode", cfg.alarm_all_mode),
        ("alarmNormalMode", cfg.alarm_normal_mode),
        ("alarmRestMode", cfg.alarm_rest_mode),
        ("alarmAllEndMode", cfg.alarm_all_end_mode),
        ("alarmNormalEndMode", cfg.alarm_normal_end_mode),
        ("alarmRestEndMode", cfg.alarm_rest_end_mode),
    ];
    set_setting(conn, "uiLanguage", cfg.ui_language.as_db())?;
    set_setting(conn, "uiFont", &cfg.ui_font)?;
    set_setting(conn, "uiFontSize", &cfg.ui_font_size)?;
    set_setting(conn, "webviewHwAccel", &cfg.webview_hw_accel.to_string())?;
    set_setting(
        conn,
        "webviewSmoothScrolling",
        &cfg.webview_smooth_scrolling.to_string(),
    )?;
    set_setting(conn, "logLevel", &cfg.log_level)?;
    for (key, value) in mode_entries {
        match value {
            Some(m) => set_setting(conn, key, m.as_db())?,
            None => {
                conn.execute("DELETE FROM app_settings WHERE key = ?1", [key])
                    .map_err(|e| format!("写入设置失败: {e}"))?;
            }
        }
    }
    Ok(())
}

#[command]
pub async fn get_global_config(db: State<'_, Arc<DataDb>>) -> Result<GlobalConfig, String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || db.with_conn(load_global_config))
            .await
            .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn set_global_config(
    config: GlobalConfig,
    db: State<'_, Arc<DataDb>>,
) -> Result<GlobalConfig, String> {
    if !(0..=1439).contains(&config.day_start_minute)
        || !(0..=1439).contains(&config.day_end_minute)
    {
        return Err("一天起止时间必须在 0:00–23:59 之间".to_string());
    }
    if config.day_start_minute >= config.day_end_minute {
        return Err("一天开始时间必须早于结束时间".to_string());
    }
    for value in [
        &config.alarm_all_file,
        &config.alarm_normal_file,
        &config.alarm_rest_file,
    ] {
        validate_alarm_file_value(value)?;
    }
    let config_clone = config.clone();
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| persist_global_config(conn, &config_clone))?;
            // 日志等级保存后立即生效（运行时更新阈值，无需重启）
            crate::logging::set_level_u8(crate::logging::level_to_u8(&config.log_level));
            db.with_conn(load_global_config)
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

/// 读取布尔型标志位（value == "true"）；键不存在视为 false。
// 供 macOS 通知权限探测使用（其余平台暂无调用方）
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn get_flag(conn: &rusqlite::Connection, key: &str) -> Result<bool, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("读取标志位失败: {e}"))?;
    Ok(raw.as_deref() == Some("true"))
}

/// 写入布尔型标志位。
// 供 macOS 通知权限探测使用（其余平台暂无调用方）
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn set_flag(conn: &rusqlite::Connection, key: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'",
        [key],
    )
    .map_err(|e| format!("写入标志位失败: {e}"))?;
    Ok(())
}

/// 从连接中加载全部应用设置；缺失的键回退到默认值。
pub fn load(conn: &rusqlite::Connection) -> Result<AppSettings, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [WINDOW_CONTROLS_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("读取设置失败: {e}"))?;
    let window_controls = raw
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default();
    Ok(AppSettings { window_controls })
}

/// 保存窗口控制按钮组位置。
pub fn save_window_controls(
    conn: &rusqlite::Connection,
    position: WindowControlsPosition,
) -> Result<(), String> {
    let json =
        serde_json::to_string(&WindowControls { position }).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [WINDOW_CONTROLS_KEY, &json],
    )
    .map_err(|e| format!("保存设置失败: {e}"))?;
    Ok(())
}

#[command]
pub async fn get_app_settings(db: State<'_, Arc<DataDb>>) -> Result<AppSettings, String> {
    let db = db.inner().clone();
    let settings =
        tauri::async_runtime::spawn_blocking(move || db.with_conn(|conn| load(conn)))
            .await
            .map_err(|e| e.to_string())??;
    // 前端能否离开错误屏的判据（verbose 级别，默认 error 阈值下不会落盘）
    crate::logging::verbose("[web] App settings loaded");
    Ok(settings)
}

#[command]
pub async fn set_window_controls_position(
    position: WindowControlsPosition,
    db: State<'_, Arc<DataDb>>,
) -> Result<AppSettings, String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| {
                save_window_controls(conn, position)?;
                load(conn)
            })
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

/// 用系统文件管理器打开目录（仅接受本应用自己的固定目录，不接受任意路径）。
fn spawn_open_dir(dir: std::path::PathBuf, label: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg(&dir).spawn();
    #[cfg(target_os = "linux")]
    let spawned = std::process::Command::new("xdg-open").arg(&dir).spawn();
    spawned
        .map(|_| ())
        .map_err(|e| format!("打开{label}失败: {e}"))
}

/// 打开应用数据文件夹（用户可自行复制备份）。
#[command]
pub fn open_app_data_dir() -> Result<(), String> {
    spawn_open_dir(crate::db::data_dir()?, "数据目录")
}

/// 打开界面字体文件夹（fonts，内置字体解压位置）。
#[command]
pub fn open_fonts_dir() -> Result<(), String> {
    let dir = crate::db::data_dir()?.join("fonts");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建字体目录失败: {e}"))?;
    spawn_open_dir(dir, "字体目录")
}

/// 打开用户提示音文件夹（alarms）。
#[command]
pub fn open_alarms_dir() -> Result<(), String> {
    spawn_open_dir(crate::db::alarms_dir()?, "铃声目录")
}

/// 删除用户数据文件：三个数据库（含 WAL/SHM）+ alarms 目录（用户提示音）+ logs 目录（运行日志）。
/// 不动 fonts/ ——字体是随应用打包的内置资源而非用户数据，且 WebView2 可能正持有
/// 这些文件的资源句柄，在活着的 webview 脚下删除它们会引发原生层异常。
fn clear_data_files(dir: &std::path::Path) -> Result<(), String> {
    for name in [
        "data.db",
        "data.db-wal",
        "data.db-shm",
        "weeks.db",
        "weeks.db-wal",
        "weeks.db-shm",
        "todo-list.db",
        "todo-list.db-wal",
        "todo-list.db-shm",
    ] {
        let path = dir.join(name);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| format!("删除 {name} 失败: {e}"))?;
        }
    }
    for dir_name in ["alarms", "logs"] {
        let sub = dir.join(dir_name);
        if sub.exists() {
            std::fs::remove_dir_all(&sub)
                .map_err(|e| format!("删除 {dir_name} 失败: {e}"))?;
        }
    }
    // 兼容清理：旧版"标记文件"机制可能留下的残留
    let flag = dir.join("CLEAR_DATA.flag");
    if flag.exists() {
        let _ = std::fs::remove_file(&flag);
    }
    Ok(())
}

/// 清空数据最终确认：暂停调度线程 → 关闭三个数据库连接 → 删除用户数据文件
/// （数据库 + 用户提示音）→ 重建骨架目录。返回后前端整页 reload，即呈现全新状态。
/// 等效于重启，但避免进程重启时新旧 WebView2/开发服务器交接导致的渲染异常
/// （dev 下 tauri CLI 会随应用进程退出并杀掉 vite，重启出的实例将无法加载页面）。
#[command]
pub async fn request_clear_data(
    data: State<'_, Arc<crate::db::DataDb>>,
    weeks: State<'_, Arc<crate::db::WeeksDb>>,
    todo: State<'_, Arc<crate::db::TodoDb>>,
) -> Result<(), String> {
    let data = data.inner().clone();
    let weeks = weeks.inner().clone();
    let todo = todo.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::scheduler::set_paused(true);
        let result = (|| -> Result<(), String> {
            let mut last_err = String::new();
            for _ in 0..20 {
                data.0.close()?;
                weeks.0.close()?;
                todo.0.close()?;
                let dir = crate::db::data_dir()?;
                match clear_data_files(&dir) {
                    Ok(()) => return Ok(()),
                    Err(e) => {
                        // 暂停标志生效前已在途的最后一次轮询可能重新打开了连接，稍后重试即可
                        last_err = e;
                        std::thread::sleep(std::time::Duration::from_millis(200));
                    }
                }
            }
            Err(last_err)
        })();
        crate::scheduler::set_paused(false);
        result?;
        // 重建骨架目录（alarms 也会由惰性建表补齐，这里先建好以便用户立刻放入提示音）
        let dir = crate::db::data_dir()?;
        std::fs::create_dir_all(dir.join("alarms"))
            .map_err(|e| format!("重建 alarms 目录失败: {e}"))?;
        crate::logging::info("User data cleared, frontend will reload");
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_data_schema;

    fn test_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_data_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn missing_settings_fall_back_to_defaults() {
        let conn = test_conn();
        let settings = load(&conn).unwrap();
        assert_eq!(
            settings.window_controls.position,
            WindowControlsPosition::Right
        );
    }

    #[test]
    fn window_controls_position_roundtrips() {
        let conn = test_conn();
        save_window_controls(&conn, WindowControlsPosition::Left).unwrap();
        assert_eq!(
            load(&conn).unwrap().window_controls.position,
            WindowControlsPosition::Left
        );
        save_window_controls(&conn, WindowControlsPosition::Hidden).unwrap();
        assert_eq!(
            load(&conn).unwrap().window_controls.position,
            WindowControlsPosition::Hidden
        );
    }

    #[test]
    fn serde_uses_camel_case_keys() {
        let json = serde_json::to_string(&AppSettings::default()).unwrap();
        assert!(json.contains("\"windowControls\""));
        assert!(json.contains("\"position\":\"right\""));

        let parsed: AppSettings =
            serde_json::from_str(r#"{"windowControls":{"position":"hidden"}}"#).unwrap();
        assert_eq!(
            parsed.window_controls.position,
            WindowControlsPosition::Hidden
        );
    }
}
