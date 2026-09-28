//! 待办事项（todo-list.db）：按日期分天存储。
//!
//! 日切规则（对应 fn-req.md）：新的一天开始时，把"上一次处理日以来、
//! 今天之前的所有未完成 todo"复制到今天——应用每天运行时等价于
//! "复制昨天的未完成"，连续多天未运行时也不会丢待办。

use std::sync::Arc;

use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

use crate::clock;
use crate::db::TodoDb;

/// 待办事项。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: i64,
    /// 本地日期 YYYY-MM-DD。
    pub date: String,
    pub content: String,
    pub done: bool,
    pub created_at: String,
}

fn today_str() -> String {
    clock::today_local_string()
}

pub(crate) fn init_todo_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS todos (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            date       TEXT NOT NULL,
            content    TEXT NOT NULL,
            done       INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
        CREATE TABLE IF NOT EXISTS todo_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("初始化 todo-list.db 失败: {e}"))
}

fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM todo_meta WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("读取 todo 元数据失败: {e}"))
}

fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO todo_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("写入 todo 元数据失败: {e}"))?;
    Ok(())
}

/// 日切滚动：把上次处理日以来（含昨天）、今天之前的所有未完成 todo 复制到今天。
/// 应用每天运行时等价于"复制昨天的未完成"；连续多天未运行也不会丢待办。
/// 返回是否发生了滚动（今天首次被处理）。
pub fn ensure_rollover(conn: &Connection) -> Result<bool, String> {
    ensure_rollover_for(conn, Local::now().date_naive())
}

pub(crate) fn ensure_rollover_for(
    conn: &Connection,
    today: NaiveDate,
) -> Result<bool, String> {
    let today_str = today.format("%Y-%m-%d").to_string();
    if get_meta(conn, "lastProcessedDate")?.as_deref() == Some(today_str.as_str()) {
        return Ok(false);
    }
    // 上次处理日为空（首次运行）时不复制历史
    if let Some(last) = get_meta(conn, "lastProcessedDate")? {
    let yesterday = clock::date_string(today - Duration::days(1));
        // 字符串比较对 YYYY-MM-DD 等价于日期比较；min 防止异常未来日期扩大窗口
        let since = last.min(yesterday);
        conn.execute(
            "INSERT INTO todos (date, content, done, created_at)
             SELECT ?1, content, 0, ?2 FROM todos
             WHERE date >= ?3 AND date < ?1 AND done = 0",
            params![today_str, now_str(), since],
        )
        .map_err(|e| format!("复制未完成待办失败: {e}"))?;
    }
    set_meta(conn, "lastProcessedDate", &today_str)?;
    Ok(true)
}

fn now_str() -> String {
    clock::now_utc_string()
}

fn row_to_todo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Todo> {
    Ok(Todo {
        id: row.get("id")?,
        date: row.get("date")?,
        content: row.get("content")?,
        done: row.get::<_, i64>("done")? != 0,
        created_at: row.get("created_at")?,
    })
}

pub fn list_todos(conn: &Connection, date: &str) -> Result<Vec<Todo>, String> {
    let mut stmt = conn
        .prepare("SELECT id, date, content, done, created_at FROM todos WHERE date = ?1 ORDER BY id")
        .map_err(|e| format!("读取待办失败: {e}"))?;
    let rows = stmt
        .query_map([date], row_to_todo)
        .map_err(|e| format!("读取待办失败: {e}"))?;
    let mut todos = Vec::new();
    for row in rows {
        todos.push(row.map_err(|e| format!("读取待办失败: {e}"))?);
    }
    Ok(todos)
}

pub fn add_todo(conn: &Connection, date: &str, content: &str) -> Result<Todo, String> {
    let content = content.trim();
    if content.is_empty() {
        return Err("待办内容不能为空".to_string());
    }
    conn.execute(
        "INSERT INTO todos (date, content, done, created_at) VALUES (?1, ?2, 0, ?3)",
        params![date, content, now_str()],
    )
    .map_err(|e| format!("写入待办失败: {e}"))?;
    Ok(Todo {
        id: conn.last_insert_rowid(),
        date: date.to_string(),
        content: content.to_string(),
        done: false,
        created_at: now_str(),
    })
}

pub fn set_todo_done(conn: &Connection, id: i64, done: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE todos SET done = ?1 WHERE id = ?2",
        params![done as i64, id],
    )
    .map_err(|e| format!("更新待办失败: {e}"))?;
    Ok(())
}

pub fn delete_todo(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM todos WHERE id = ?1", [id])
        .map_err(|e| format!("删除待办失败: {e}"))?;
    Ok(())
}

#[command]
pub async fn list_todos_for_today(db: State<'_, Arc<TodoDb>>) -> Result<Vec<Todo>, String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| {
                ensure_rollover(conn)?;
                list_todos(conn, &today_str())
            })
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn add_todo_for_today(
    content: String,
    db: State<'_, Arc<TodoDb>>,
) -> Result<Todo, String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| add_todo(conn, &today_str(), &content))
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn set_todo_done_command(
    id: i64,
    done: bool,
    db: State<'_, Arc<TodoDb>>,
) -> Result<(), String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| set_todo_done(conn, id, done))
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn delete_todo_command(id: i64, db: State<'_, Arc<TodoDb>>) -> Result<(), String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| delete_todo(conn, id))
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init_todo_schema(&c).unwrap();
        c
    }

    fn date(offset_days: i64) -> String {
        (Local::now().date_naive() + Duration::days(offset_days))
            .format("%Y-%m-%d")
            .to_string()
    }

    fn as_date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn rollover_copies_unfinished_since_last_processed() {
        let c = conn();
        add_todo(&c, &date(-2), "两天前未完成").unwrap();
        let done = add_todo(&c, &date(-2), "两天前已完成").unwrap();
        set_todo_done(&c, done.id, true).unwrap();
        add_todo(&c, &date(-1), "昨天未完成").unwrap();

        // 上次处理到昨天：滚动今天 → 只复制昨天的未完成
        set_meta(&c, "lastProcessedDate", &date(-1)).unwrap();
        assert!(ensure_rollover_for(&c, as_date(&date(0))).unwrap());
        let contents: Vec<String> = list_todos(&c, &date(0))
            .unwrap()
            .into_iter()
            .map(|t| t.content)
            .collect();
        assert_eq!(contents, vec!["昨天未完成"]);

        // 同一天内重复调用不再复制
        assert!(!ensure_rollover_for(&c, as_date(&date(0))).unwrap());
        assert_eq!(list_todos(&c, &date(0)).unwrap().len(), 1);
    }

    #[test]
    fn rollover_catches_up_after_missing_days() {
        let c = conn();
        add_todo(&c, &date(-2), "两天前未完成").unwrap();
        let done = add_todo(&c, &date(-2), "两天前已完成").unwrap();
        set_todo_done(&c, done.id, true).unwrap();
        add_todo(&c, &date(-1), "昨天未完成").unwrap();

        // 上次处理停在三天前：滚动今天 → 补齐期间所有未完成（不含已完成）
        set_meta(&c, "lastProcessedDate", &date(-3)).unwrap();
        ensure_rollover_for(&c, as_date(&date(0))).unwrap();
        let mut contents: Vec<String> = list_todos(&c, &date(0))
            .unwrap()
            .into_iter()
            .map(|t| t.content)
            .collect();
        contents.sort();
        assert_eq!(contents, vec!["两天前未完成", "昨天未完成"]);
    }

    #[test]
    fn rollover_does_not_recopy_old_items_next_day() {
        let c = conn();
        add_todo(&c, &date(-1), "原始未完成").unwrap();
        set_meta(&c, "lastProcessedDate", &date(-1)).unwrap();
        // 今天：复制昨天的
        ensure_rollover_for(&c, as_date(&date(0))).unwrap();
        assert_eq!(list_todos(&c, &date(0)).unwrap().len(), 1);
        // 今天新增一条
        add_todo(&c, &date(0), "今天新增").unwrap();
        // 明天滚动：只复制 [今天, 明天) 的两条，不重复复制更早的原始条目
        ensure_rollover_for(&c, as_date(&date(1))).unwrap();
        let tomorrow = list_todos(&c, &date(1)).unwrap();
        assert_eq!(tomorrow.len(), 2);
        assert!(tomorrow.iter().all(|t| !t.done));
    }

    #[test]
    fn add_rejects_blank_content() {
        let c = conn();
        assert!(add_todo(&c, &today_str(), "   ").is_err());
    }
}
