//! 定时提醒：模型、持久化与后台调度。
//!
//! 提醒是应用数据，持久化在 SQLite 的 reminders 表；`start_scheduler`
//! 启动的后台线程每 500ms 检查一次到期提醒并发送系统通知。
//! 应用关闭期间到期的提醒会在下次启动后立即补发（fire_at 已过即视为到期）。

use std::sync::Arc;

use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{command, State};

use crate::clock;
use crate::db::DataDb;
use crate::sound::AlarmMode;

pub const STATUS_PENDING: &str = "pending";
const STATUS_FIRED: &str = "fired";
const STATUS_CANCELLED: &str = "cancelled";

/// 一条定时提醒。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: i64,
    pub title: String,
    pub body: String,
    /// 触发时间，统一以 RFC3339 UTC 存储。
    pub fire_at: String,
    /// pending | fired | cancelled
    pub status: String,
    /// 提示音文件名（alarms 目录下的裸文件名）；空串表示使用默认提示音。
    pub alarm_file: String,
    /// 提示音播放模式（默认提示音恒为播放一次）。
    pub alarm_mode: AlarmMode,
    pub created_at: String,
}

fn format_utc(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn row_to_reminder(row: &rusqlite::Row<'_>) -> rusqlite::Result<Reminder> {
    let alarm_mode: String = row.get("alarm_mode")?;
    Ok(Reminder {
        id: row.get("id")?,
        title: row.get("title")?,
        body: row.get("body")?,
        fire_at: row.get("fire_at")?,
        status: row.get("status")?,
        alarm_file: row.get("alarm_file")?,
        alarm_mode: AlarmMode::from_db(&alarm_mode),
        created_at: row.get("created_at")?,
    })
}

/// 写入一条提醒；fire_at 统一转为 UTC 存储。
pub fn insert_reminder(
    conn: &rusqlite::Connection,
    title: &str,
    body: &str,
    fire_at: DateTime<Utc>,
    alarm_file: &str,
    alarm_mode: AlarmMode,
) -> Result<Reminder, String> {
    let created_at = clock::now_utc_string();
    conn.execute(
        "INSERT INTO reminders (title, body, fire_at, status, alarm_file, alarm_mode, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            title,
            body,
            format_utc(fire_at),
            STATUS_PENDING,
            alarm_file,
            alarm_mode.as_db(),
            created_at
        ],
    )
    .map_err(|e| format!("写入提醒失败: {e}"))?;
    Ok(Reminder {
        id: conn.last_insert_rowid(),
        title: title.to_string(),
        body: body.to_string(),
        fire_at: format_utc(fire_at),
        status: STATUS_PENDING.to_string(),
        alarm_file: alarm_file.to_string(),
        alarm_mode,
        created_at,
    })
}

/// 查询所有已到期（fire_at <= 当前系统时间）的 pending 提醒。
pub fn take_due(conn: &rusqlite::Connection) -> Result<Vec<Reminder>, String> {
    let now = Utc::now();
    let mut stmt = conn
        .prepare(
            "SELECT id, title, body, fire_at, status, alarm_file, alarm_mode, created_at
             FROM reminders WHERE status = ?1 ORDER BY fire_at",
        )
        .map_err(|e| format!("查询提醒失败: {e}"))?;
    let rows = stmt
        .query_map([STATUS_PENDING], row_to_reminder)
        .map_err(|e| format!("读取提醒失败: {e}"))?;
    let mut due = Vec::new();
    for row in rows {
        let reminder = row.map_err(|e| format!("读取提醒失败: {e}"))?;
        let fire_at = DateTime::parse_from_rfc3339(&reminder.fire_at)
            .map_err(|e| format!("提醒 {} 的 fire_at 无法解析: {e}", reminder.id))?
            .with_timezone(&Utc);
        if fire_at <= now {
            due.push(reminder);
        }
    }
    Ok(due)
}

/// 标记为已发送。
pub fn mark_fired(conn: &rusqlite::Connection, id: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE reminders SET status = ?1 WHERE id = ?2",
        params![STATUS_FIRED, id],
    )
    .map_err(|e| format!("更新提醒状态失败: {e}"))?;
    Ok(())
}

/// 取消一条 pending 提醒；返回是否确有记录被取消。
pub fn cancel_pending(conn: &rusqlite::Connection, id: i64) -> Result<bool, String> {
    let affected = conn
        .execute(
            "UPDATE reminders SET status = ?1 WHERE id = ?2 AND status = ?3",
            params![STATUS_CANCELLED, id, STATUS_PENDING],
        )
        .map_err(|e| format!("取消提醒失败: {e}"))?;
    Ok(affected > 0)
}

/// 列出全部提醒（按触发时间排序）。
pub fn list(conn: &rusqlite::Connection) -> Result<Vec<Reminder>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, body, fire_at, status, alarm_file, alarm_mode, created_at
             FROM reminders ORDER BY fire_at",
        )
        .map_err(|e| format!("查询提醒失败: {e}"))?;
    let rows = stmt
        .query_map([], row_to_reminder)
        .map_err(|e| format!("读取提醒失败: {e}"))?;
    let mut reminders = Vec::new();
    for row in rows {
        reminders.push(row.map_err(|e| format!("读取提醒失败: {e}"))?);
    }
    Ok(reminders)
}

#[command]
pub async fn create_reminder(
    title: String,
    body: String,
    fire_at: String,
    alarm_file: Option<String>,
    alarm_mode: Option<AlarmMode>,
    db: State<'_, Arc<DataDb>>,
) -> Result<Reminder, String> {
    if title.trim().is_empty() {
        return Err("title 不能为空".to_string());
    }
    let fire_at = DateTime::parse_from_rfc3339(&fire_at)
        .map_err(|e| {
            format!("fire_at 必须是 RFC3339 时间（如 2026-09-27T15:00:00+08:00）: {e}")
        })?
        .with_timezone(&Utc);
    let alarm_file = alarm_file.unwrap_or_default();
    if !alarm_file.trim().is_empty() {
        crate::sound::validate_alarm_file_name(&alarm_file)?;
    }
    let alarm_mode = alarm_mode.unwrap_or(AlarmMode::Once);
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| {
                insert_reminder(
                    conn,
                    &title,
                    &body,
                    fire_at,
                    alarm_file.trim(),
                    alarm_mode,
                )
            })
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn cancel_reminder(id: i64, db: State<'_, Arc<DataDb>>) -> Result<bool, String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| cancel_pending(conn, id))
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn list_reminders(db: State<'_, Arc<DataDb>>) -> Result<Vec<Reminder>, String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || db.with_conn(list))
            .await
            .map_err(|e| e.to_string())??,
    )
}

/// 调度线程的一次手动提醒轮询（由 scheduler.rs 调用）。
/// 通知/铃声失败只记录日志；无论成败都标记 fired，避免反复轰炸。
pub(crate) fn poll_due(app: &tauri::AppHandle, db: &DataDb) -> Result<(), String> {
    let due = db.with_conn(take_due)?;
    for reminder in due {
        // 系统通知不可靠，统一走置顶弹窗；标题/正文是用户内容，原样展示
        let mode_text = match reminder.alarm_mode {
            crate::sound::AlarmMode::Loop => "loop",
            crate::sound::AlarmMode::Once => "once",
        };
        if let Err(e) = crate::popup::show(
            app,
            &reminder.title,
            Some(&reminder.body),
            None,
            None,
            mode_text,
        ) {
            eprintln!("[reminders] 提醒弹窗失败(已忽略, id={}): {e}", reminder.id);
        }
        if let Err(e) = crate::sound::play(&reminder.alarm_file, reminder.alarm_mode) {
            eprintln!(
                "[reminders] 提示音播放失败(已忽略, id={}): {e}",
                reminder.id
            );
        }
        if let Err(e) = db.with_conn(|conn| mark_fired(conn, reminder.id)) {
            eprintln!(
                "[reminders] 更新提醒状态失败(已忽略, id={}): {e}",
                reminder.id
            );
        }
    }
    Ok(())
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
    fn due_reminders_are_returned_and_marked() {
        let conn = test_conn();
        let past = Utc::now() - chrono::Duration::seconds(1);
        let future = Utc::now() + chrono::Duration::hours(1);
        let due_one =
            insert_reminder(&conn, "到期", "正文", past, "", AlarmMode::Once).unwrap();
        insert_reminder(&conn, "未到期", "正文", future, "", AlarmMode::Once).unwrap();

        let due = take_due(&conn).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, due_one.id);

        mark_fired(&conn, due_one.id).unwrap();
        assert!(take_due(&conn).unwrap().is_empty());
        let all = list(&conn).unwrap();
        assert_eq!(all.len(), 2);
        assert!(all.iter().any(|r| r.status == STATUS_FIRED));
    }

    #[test]
    fn alarm_fields_roundtrip() {
        let conn = test_conn();
        let reminder = insert_reminder(
            &conn,
            "带铃声",
            "",
            Utc::now(),
            "ding.mp3",
            AlarmMode::Loop,
        )
        .unwrap();
        let loaded = &list(&conn).unwrap()[0];
        assert_eq!(loaded.alarm_file, "ding.mp3");
        assert_eq!(loaded.alarm_mode, AlarmMode::Loop);
        assert_eq!(loaded.id, reminder.id);
    }

    #[test]
    fn fire_at_is_normalized_to_utc() {
        let conn = test_conn();
        // +08:00 的 15:00 == UTC 07:00
        let reminder = insert_reminder(
            &conn,
            "时区",
            "",
            "2026-09-27T15:00:00+08:00".parse().unwrap(),
            "",
            AlarmMode::Once,
        )
        .unwrap();
        assert!(reminder.fire_at.starts_with("2026-09-27T07:00:00"));
    }

    #[test]
    fn cancel_only_affects_pending() {
        let conn = test_conn();
        let r = insert_reminder(&conn, "待取消", "", Utc::now(), "", AlarmMode::Once)
            .unwrap();
        assert!(cancel_pending(&conn, r.id).unwrap());
        assert!(!cancel_pending(&conn, r.id).unwrap());
        assert_eq!(list(&conn).unwrap()[0].status, STATUS_CANCELLED);
    }

    #[test]
    fn serde_uses_camel_case_keys() {
        let json = serde_json::to_string(&Reminder {
            id: 1,
            title: "t".into(),
            body: String::new(),
            fire_at: "2026-01-01T00:00:00Z".into(),
            status: STATUS_PENDING.into(),
            alarm_file: String::new(),
            alarm_mode: AlarmMode::Once,
            created_at: "2026-01-01T00:00:00Z".into(),
        })
        .unwrap();
        assert!(json.contains("\"fireAt\""));
        assert!(json.contains("\"createdAt\""));
        assert!(json.contains("\"alarmFile\""));
        assert!(json.contains("\"alarmMode\":\"once\""));
    }
}
