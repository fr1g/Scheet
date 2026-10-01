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
    // 前端能否离开错误屏的判据（debug 构建输出，供冒烟验证）
    #[cfg(debug_assertions)]
    eprintln!("[web] 设置加载成功");
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

/// 用系统文件管理器打开应用数据文件夹（用户可自行复制备份）。
#[command]
pub fn open_app_data_dir() -> Result<(), String> {
    let dir = crate::db::data_dir()?;
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg(&dir).spawn();
    #[cfg(target_os = "linux")]
    let spawned = std::process::Command::new("xdg-open").arg(&dir).spawn();
    spawned
        .map(|_| ())
        .map_err(|e| format!("打开数据目录失败: {e}"))
}

/// 清空数据最终确认：写入清空标记后立即重启应用。
/// 下次启动时 db::clear_data_if_requested 在任何 DB/字体解压之前删除整个数据目录。
/// 重启成功则本命令不会返回（进程被替换）；返回即代表标记写入或重启出了问题。
#[command]
pub fn request_clear_data(app: tauri::AppHandle) -> Result<(), String> {
    let dir = crate::db::data_dir()?;
    std::fs::write(dir.join(crate::db::CLEAR_DATA_FLAG), b"clear")
        .map_err(|e| format!("写入清空标记失败: {e}"))?;
    eprintln!("用户确认清空数据：标记已写入，重启应用");
    app.restart();
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
