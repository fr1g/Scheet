use std::{fs, path::PathBuf, sync::Mutex};

use rusqlite::Connection;

/// 惰性打开的 SQLite 数据库。
///
/// 连接在首次访问时才创建：打开文件、设置 WAL、执行各自的建表/迁移初始化，
/// 因此窗口显示与前端加载屏不会被任何数据库的磁盘 IO 阻塞。
/// 应用共三个库实例：data.db（设置+手动提醒）、weeks.db（周表）、todo-list.db（待办）。
pub struct LazyDb {
    filename: &'static str,
    init: fn(&Connection) -> Result<(), String>,
    conn: Mutex<Option<Connection>>,
}

impl LazyDb {
    pub fn new(filename: &'static str, init: fn(&Connection) -> Result<(), String>) -> Self {
        LazyDb {
            filename,
            init,
            conn: Mutex::new(None),
        }
    }

    /// 关闭并丢弃当前连接（若已打开），释放数据库文件锁。
    /// 供"清空数据"在删除目录前调用；之后 with_conn 会按需重新打开并重建。
    pub fn close(&self) -> Result<(), String> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| "数据库连接锁已中毒".to_string())?;
        if let Some(conn) = guard.take() {
            conn.close()
                .map_err(|(_, e)| format!("关闭数据库失败: {e}"))?;
        }
        Ok(())
    }

    /// 以串行方式执行一次数据库操作；首次调用负责打开连接并初始化 schema。
    pub fn with_conn<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| "数据库连接锁已中毒".to_string())?;
        if guard.is_none() {
            *guard = Some(self.open_and_init()?);
        }
        f(guard.as_ref().expect("数据库连接已在此前初始化"))
    }

    fn open_and_init(&self) -> Result<Connection, String> {
        let path = data_dir()?.join(self.filename);
        let conn = Connection::open(&path).map_err(|e| format!("打开数据库失败: {e}"))?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| format!("设置 journal_mode 失败: {e}"))?;
        (self.init)(&conn)?;
        Ok(conn)
    }
}

/// 三库的类型包装：Tauri 按 TypeId 解析 State，必须用不同类型区分三个库实例。
pub struct DataDb(pub LazyDb);
pub struct WeeksDb(pub LazyDb);
pub struct TodoDb(pub LazyDb);

impl std::ops::Deref for DataDb {
    type Target = LazyDb;
    fn deref(&self) -> &LazyDb {
        &self.0
    }
}
impl std::ops::Deref for WeeksDb {
    type Target = LazyDb;
    fn deref(&self) -> &LazyDb {
        &self.0
    }
}
impl std::ops::Deref for TodoDb {
    type Target = LazyDb;
    fn deref(&self) -> &LazyDb {
        &self.0
    }
}

/// 定位当前用户的"文档"目录，依次回退：
/// 系统文档目录 -> <主目录>/Documents -> 用户主目录。
fn documents_dir() -> Option<PathBuf> {
    dirs::document_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Documents")))
        .or_else(dirs::home_dir)
}

/// 应用数据目录：<文档目录>/scheet，不存在时递归创建。
pub fn data_dir() -> Result<PathBuf, String> {
    let base = documents_dir().ok_or_else(|| "无法定位用户的文档目录".to_string())?;
    let dir = base.join("scheet");
    fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
    Ok(dir)
}

/// 用户提示音目录：<数据目录>/alarms，与各 .db 文件同级。
pub fn alarms_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("alarms"))
}

const ALARMS_README: &str = "Scheet 提示音目录
==================

把你的提示音/闹铃文件（支持 MP3 / WAV / OGG / FLAC）放到本文件夹，
在创建提醒事件时通过文件名（不含路径）引用，例如：

    meeting.mp3

播放模式可选：
  - 播放一次：声音播完自动停止；
  - 循环播放：一直循环，直到被停止或被新的提示音替换。

若文件名留空、文件被移动或删除，Scheet 会改播内置默认提示音。
";

/// data.db 初始化：应用设置（app_settings）+ 手动提醒（reminders）。
pub(crate) fn init_data_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reminders (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL,
            body       TEXT NOT NULL DEFAULT '',
            fire_at    TEXT NOT NULL,
            status     TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'fired', 'cancelled')),
            alarm_file TEXT NOT NULL DEFAULT '',
            alarm_mode TEXT NOT NULL DEFAULT 'once'
                       CHECK (alarm_mode IN ('once', 'loop')),
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, fire_at);",
    )
    .map_err(|e| format!("初始化数据库表失败: {e}"))?;
    migrate(conn);
    init_alarms_dir();
    Ok(())
}

/// 轻量迁移：为旧版本的 reminders 表补充提示音列；列已存在时忽略报错。
fn migrate(conn: &Connection) {
    for (sql, label) in [
        (
            "ALTER TABLE reminders ADD COLUMN alarm_file TEXT NOT NULL DEFAULT ''",
            "reminders.alarm_file",
        ),
        (
            "ALTER TABLE reminders ADD COLUMN alarm_mode TEXT NOT NULL DEFAULT 'once'",
            "reminders.alarm_mode",
        ),
    ] {
        if let Err(e) = conn.execute(sql, []) {
            if !e.to_string().contains("duplicate column") {
                eprintln!("[db] 迁移 {label} 失败(已忽略): {e}");
            }
        }
    }
}

/// 初始化用户提示音目录（失败不致命：用户提示音不可用时回退默认提示音）。
fn init_alarms_dir() {
    let dir = match alarms_dir() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("[db] 定位 alarms 目录失败(用户提示音不可用): {e}");
            return;
        }
    };
    if let Err(e) = fs::create_dir_all(&dir) {
        eprintln!("[db] 创建 alarms 目录失败(用户提示音不可用): {e}");
        return;
    }
    let readme = dir.join("README.txt");
    if !readme.exists() {
        if let Err(e) = fs::write(&readme, ALARMS_README) {
            eprintln!("[db] 写入 alarms/README.txt 失败: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_data_schema_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        init_data_schema(&conn).unwrap();
        init_data_schema(&conn).unwrap();
    }

    #[test]
    fn old_reminders_table_gets_sound_columns() {
        let conn = Connection::open_in_memory().unwrap();
        // 模拟旧版本的表结构（无 alarm_file / alarm_mode 列）
        conn.execute_batch(
            "CREATE TABLE reminders (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL,
                body       TEXT NOT NULL DEFAULT '',
                fire_at    TEXT NOT NULL,
                status     TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();
        init_data_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO reminders (title, body, fire_at, status, created_at, alarm_file, alarm_mode)
             VALUES ('t', '', '2026-01-01T00:00:00Z', 'pending', '2026-01-01T00:00:00Z', 'x.mp3', 'loop')",
            [],
        )
        .unwrap();
    }
}
