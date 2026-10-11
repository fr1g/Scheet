//! 一次性应用标记（data.db 的 flags 表）：首启提示等"只需记住是否出现过"的小状态。
//! 不放 app_settings——那是 GlobalConfig 的键空间，flags 里的键不参与配置加载/保存。

use std::sync::Arc;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::{command, State};

use crate::db::DataDb;

/// 首次"关闭→收进托盘"说明小窗的已读标记。
pub const CLOSE_TO_TRAY_FLAG: &str = "closeToTrayNoticeShown";

/// conn 级读取（供事件循环等同步上下文使用）；None = 未设置。
pub(crate) fn get_flag_sync(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM flags WHERE key = ?1", params![key], |r| {
        r.get(0)
    })
    .optional()
    .ok()
    .flatten()
}

/// conn 级写入（存在则覆盖）。
pub(crate) fn set_flag_sync(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO flags (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map(|_| ())
    .map_err(|e| format!("写入标记失败: {e}"))
}

/// 读取应用标记（None = 未设置）。
#[command]
pub async fn get_app_flag(
    key: String,
    db: State<'_, Arc<DataDb>>,
) -> Result<Option<String>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.with_conn(|conn| Ok(get_flag_sync(conn, &key)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 写入应用标记（存在则覆盖）。
#[command]
pub async fn set_app_flag(
    key: String,
    value: String,
    db: State<'_, Arc<DataDb>>,
) -> Result<(), String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.with_conn(|conn| set_flag_sync(conn, &key, &value))
    })
    .await
    .map_err(|e| e.to_string())?
}
