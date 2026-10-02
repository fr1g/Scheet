//! 统一日志系统。
//!
//! - 落盘位置：`<数据目录>/logs/daily--YYYY-MM-DD.scheet.log`，按本地日期滚动；
//! - 行格式：`[SRC] YYYY-MM-DD HH:MM:SS [LEVEL] message`，消息一律英文；
//! - 源标签：`[R]`=react 前端，`[WV]`=WebView2 运行时，`[RS]`=rust 内部，`[T]`=tauri 框架；
//! - 等级：none < verbose < info < warn < error < fatal，阈值由设置 logLevel 驱动
//!   （默认 error）；`none` 时不输出、不落盘、连日志目录与文件都不创建；
//! - 写入失败静默忽略（日志永不影响应用运行）。

use std::fs;
use std::io::Write as _;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};

use chrono::Local;
use rusqlite::Connection;
use tauri::command;

/// 关闭（不输出也不落盘）。存为 u8::MAX 使任何消息级别都无法通过阈值过滤。
pub const LEVEL_NONE: u8 = u8::MAX;
pub const LEVEL_VERBOSE: u8 = 1;
pub const LEVEL_INFO: u8 = 2;
pub const LEVEL_WARN: u8 = 3;
pub const LEVEL_ERROR: u8 = 4;
pub const LEVEL_FATAL: u8 = 5;

/// 允许的日志等级取值（与前端 LogLevel 联合类型一致）。
pub const LOG_LEVELS: &[&str] = &["none", "verbose", "info", "warn", "error", "fatal"];

/// 等级字符串 → 阈值数值；非法值按默认 error 处理。
pub fn level_to_u8(raw: &str) -> u8 {
    match raw {
        "none" => LEVEL_NONE,
        "verbose" => LEVEL_VERBOSE,
        "info" => LEVEL_INFO,
        "warn" => LEVEL_WARN,
        "fatal" => LEVEL_FATAL,
        _ => LEVEL_ERROR,
    }
}

static THRESHOLD: AtomicU8 = AtomicU8::new(LEVEL_ERROR);

pub fn set_level_u8(level: u8) {
    THRESHOLD.store(level, Ordering::SeqCst);
}

/// 当前进程启动最早期从 data.db 读取 logLevel（独立于 LazyDb 的轻量读取；
/// 缺库/缺表/缺键按默认 error）。须在任何日志产生之前调用。
pub fn init_from_db() {
    let level = crate::db::data_dir().ok().and_then(|dir| {
        let conn = Connection::open(dir.join("data.db")).ok()?;
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = 'logLevel'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok()
    });
    set_level_u8(level.as_deref().map(level_to_u8).unwrap_or(LEVEL_ERROR));
}

/// 当日日志文件路径；data_dir 定位失败返回 None（本次消息丢弃）。
fn log_file_path() -> Option<PathBuf> {
    let dir = crate::db::data_dir().ok()?;
    Some(dir.join("logs").join(format!(
        "daily--{}.scheet.log",
        Local::now().format("%Y-%m-%d")
    )))
}

/// 核心写入：阈值过滤 → 逐日文件追加 → stderr 镜像。
/// `none`（阈值 u8::MAX）时任何消息都无法通过，目录与文件永不创建。
pub fn log(level_num: u8, level_name: &str, source: &str, message: &str) {
    if level_num < THRESHOLD.load(Ordering::SeqCst) {
        return;
    }
    let Some(path) = log_file_path() else {
        return;
    };
    if let Some(dir) = path.parent() {
        if fs::create_dir_all(dir).is_err() {
            return;
        }
    }
    let line = format!(
        "{source} {} [{level_name}] {message}\n",
        Local::now().format("%Y-%m-%d %H:%M:%S")
    );
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = file.write_all(line.as_bytes());
    }
    eprint!("{line}");
}

/// [RS] rust 内部日志便捷入口。
pub fn verbose(message: &str) {
    log(LEVEL_VERBOSE, "VERBOSE", "[RS]", message);
}
pub fn info(message: &str) {
    log(LEVEL_INFO, "INFO", "[RS]", message);
}
pub fn warn(message: &str) {
    log(LEVEL_WARN, "WARN", "[RS]", message);
}
pub fn error(message: &str) {
    log(LEVEL_ERROR, "ERROR", "[RS]", message);
}

/// [T] 桥接 tauri/log 框架日志（tauri 内部经由 `log` crate 的输出）。
/// wry/tao 部分底层输出仍直写 stderr，不经此通道。
struct TauriLogBridge;

impl log::Log for TauriLogBridge {
    fn enabled(&self, _metadata: &log::Metadata) -> bool {
        true
    }
    fn log(&self, record: &log::Record) {
        let (num, name) = match record.level() {
            log::Level::Error => (LEVEL_ERROR, "ERROR"),
            log::Level::Warn => (LEVEL_WARN, "WARN"),
            log::Level::Info => (LEVEL_INFO, "INFO"),
            _ => (LEVEL_VERBOSE, "VERBOSE"),
        };
        log(
            num,
            name,
            "[T]",
            &format!("{} (target: {})", record.args(), record.target()),
        );
    }
    fn flush(&self) {}
}

/// 挂接 [T] 框架日志（全局只可挂一次，重复挂接失败静默）。
pub fn attach_tauri_logger() {
    let _ = log::set_boxed_logger(Box::new(TauriLogBridge));
    log::set_max_level(log::LevelFilter::Trace);
}

/// 前端日志入口（[R] 源）。前端已按等级预过滤，这里再做一次兜底过滤。
#[command]
pub fn write_log(level: String, message: String) -> Result<(), String> {
    let (num, name) = match level.as_str() {
        "verbose" => (LEVEL_VERBOSE, "VERBOSE"),
        "info" => (LEVEL_INFO, "INFO"),
        "warn" => (LEVEL_WARN, "WARN"),
        "fatal" => (LEVEL_FATAL, "FATAL"),
        _ => (LEVEL_ERROR, "ERROR"),
    };
    log(num, name, "[R]", &message);
    Ok(())
}
