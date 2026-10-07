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

/// data.db 初始化：应用设置（app_settings）+ 一次性标记（flags）+ 手动提醒（reminders）。
pub(crate) fn init_data_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS flags (
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
                crate::logging::warn(&format!("[db] Migration {label} failed (ignored): {e}"));
            }
        }
    }
}

/// 数据目录根 README（中英双语，纯文本排版）。
/// 告知用户：三个 .db 是核心数据；fonts 无需备份、alarms 可选备份、logs 仅诊断。
const DATA_README: &str = "\u{FEFF}Scheet 应用数据说明 / About Your Scheet Data
==================================================

本文件夹存放 Scheet 的全部数据。三个 .db 文件是核心，
备份它们就等于备份了你的所有内容：

  data.db        应用设置与手动提醒
  weeks.db       周课表（周表、事务、当天覆盖）
  todo-list.db   每日待办

  fonts/         界面字体，随应用内置，无需备份
  alarms/        你放入的提示音文件，可选备份
                 （留空时应用使用内置铃声）
  logs/          运行日志，按天滚动，仅用于排查问题，无需备份

备份方法：退出应用后，把三个 .db 文件复制到别处即可。
恢复方法：把备份的 .db 文件放回本文件夹，再启动应用。

This folder holds all of your Scheet data. The three .db
files are the core: backing them up backs up everything.

  data.db        App settings and manual reminders
  weeks.db       Weekly plans (plans, entries, day overrides)
  todo-list.db   Daily to-dos

  fonts/         Bundled UI fonts. No backup needed.
  alarms/        Your alarm sound files. Optional to back up
                 (the built-in sound plays when it is empty).
  logs/          Runtime logs, rotated daily, for troubleshooting.
                 No backup needed.

To back up: quit the app, then copy the three .db files
somewhere safe. To restore: put them back into this folder
and start the app.
";

/// 启动时确保数据目录根的 README.txt 与内置模板一致：
/// 缺失、为空或内容过时都会重写（本文件由应用管理，用户无需改动它）。
/// 写入失败只记录日志，不影响应用运行。
pub fn ensure_data_readme() {
    let dir = match data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            crate::logging::warn(&format!("[db] Failed to locate data dir (README not written): {e}"));
            return;
        }
    };
    let readme = dir.join("README.txt");
    let needs_write = match fs::read_to_string(&readme) {
        Ok(content) => content != DATA_README,
        Err(_) => true,
    };
    if !needs_write {
        return;
    }
    if let Err(e) = fs::write(&readme, DATA_README) {
        crate::logging::error(&format!("[db] Failed to write data dir README.txt: {e}"));
    }
}

/// 初始化用户提示音目录（失败不致命：用户提示音不可用时回退默认提示音）。
fn init_alarms_dir() {
    let dir = match alarms_dir() {
        Ok(dir) => dir,
        Err(e) => {
            crate::logging::warn(&format!(
                "[db] Failed to locate alarms dir (user ringtones unavailable): {e}"
            ));
            return;
        }
    };
    if let Err(e) = fs::create_dir_all(&dir) {
        crate::logging::warn(&format!(
            "[db] Failed to create alarms dir (user ringtones unavailable): {e}"
        ));
        return;
    }
    let readme = dir.join("README.txt");
    if !readme.exists() {
        if let Err(e) = fs::write(&readme, ALARMS_README) {
            crate::logging::warn(&format!("[db] Failed to write alarms/README.txt: {e}"));
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
