//! 一次性应用标记（data.db 的 flags 表）：首启提示等"只需记住是否出现过"的小状态。
//! 不放 app_settings——那是 GlobalConfig 的键空间，flags 里的键不参与配置加载/保存。

use std::sync::Arc;

use rusqlite::params;
use tauri::{command, State};

use crate::db::DataDb;

/// 读取应用标记（None = 未设置）。
#[command]
pub async fn get_app_flag(
    key: String,
    db: State<'_, Arc<DataDb>>,
) -> Result<Option<String>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.with_conn(|conn| {
            conn.query_row(
                "SELECT value FROM flags WHERE key = ?1",
                params![key],
                |r| r.get(0),
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(format!("读取标记失败: {other}")),
            })
        })
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
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO flags (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map(|_| ())
            .map_err(|e| format!("写入标记失败: {e}"))
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
