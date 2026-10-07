//! 剪贴板访问与提示音文件枚举。
//!
//! 剪贴板走 Rust 侧 arboard（无需前端 webview 权限）；
//! 事务 JSON 的序列化约定：首键固定为 `"objectType": "ScheetPlan"`。

use tauri::command;

/// 读取剪贴板纯文本；剪贴板为空或非文本时返回空串。
#[command]
pub async fn read_clipboard_text() -> Result<String, String> {
    Ok(
        tauri::async_runtime::spawn_blocking(|| {
            let mut clipboard =
                arboard::Clipboard::new().map_err(|e| format!("打开剪贴板失败: {e}"))?;
            match clipboard.get_text() {
                Ok(text) => Ok(text),
                Err(arboard::Error::ContentNotAvailable) => Ok(String::new()),
                Err(e) => Err(format!("读取剪贴板失败: {e}")),
            }
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

/// 写入剪贴板纯文本。
#[command]
pub async fn write_clipboard_text(text: String) -> Result<(), String> {
    Ok(
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let mut clipboard =
                arboard::Clipboard::new().map_err(|e| format!("打开剪贴板失败: {e}"))?;
            clipboard
                .set_text(&text)
                .map_err(|e| format!("写入剪贴板失败: {e}"))?;
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

/// 枚举 alarms 目录下的提示音文件名（排除隐藏文件与 README）。
#[command]
pub async fn list_alarm_sounds() -> Result<Vec<String>, String> {
    Ok(
        tauri::async_runtime::spawn_blocking(|| {
            let dir = crate::db::alarms_dir()?;
            let mut names = Vec::new();
            let entries = match std::fs::read_dir(&dir) {
                Ok(entries) => entries,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(names),
                Err(e) => return Err(format!("读取提示音目录失败: {e}")),
            };
            for entry in entries.flatten() {
                if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || name.eq_ignore_ascii_case("readme.txt") {
                    continue;
                }
                names.push(name);
            }
            names.sort();
            Ok(names)
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

/// 复制前剪贴板快照（内存单槽、会话级、不落盘——剪贴板内容写盘未加密不合适）。
/// 未来支持文件恢复时在此枚举追加 File 变体。
enum StashedClipboard {
    Text(String),
    Image {
        width: usize,
        height: usize,
        rgba: Vec<u8>,
    },
}

/// 备份槽：original = 最初一次复制前的用户剪贴板；last_written = 我们最后一次写入的
/// 文本，用于识别"剪贴板仍是上次复制的内容"——连续事务复制时不覆盖最初备份。
struct ClipboardBackup {
    original: Option<StashedClipboard>,
    last_written: Option<String>,
}

static BACKUP: std::sync::Mutex<ClipboardBackup> = std::sync::Mutex::new(ClipboardBackup {
    original: None,
    last_written: None,
});

/// 备份当前剪贴板内容（文本/图片；空或读取受限时不备份），随后把事务 JSON 写入剪贴板。
/// 返回是否存在可恢复的备份。连续事务复制时（剪贴板仍是上次写入的内容）保留最初备份；
/// 剪贴板已被外部改动才重新快照。
#[command]
pub async fn stash_and_write_text(text: String) -> Result<bool, String> {
    Ok(
        tauri::async_runtime::spawn_blocking(move || -> Result<bool, String> {
            let mut clipboard =
                arboard::Clipboard::new().map_err(|e| format!("打开剪贴板失败: {e}"))?;
            let mut backup = match std::sync::Mutex::lock(&BACKUP) {
                Ok(guard) => guard,
                Err(_) => return Err("剪贴板备份锁已中毒".to_string()),
            };
            let current_text = clipboard.get_text().ok();
            if backup.last_written.is_some() && backup.last_written == current_text {
                // 连续事务复制：最初备份保持不动
            } else {
                backup.original = match current_text {
                    Some(t) => Some(StashedClipboard::Text(t)),
                    None => clipboard.get_image().ok().map(|img| {
                        StashedClipboard::Image {
                            width: img.width,
                            height: img.height,
                            rgba: img.bytes.into_owned(),
                        }
                    }),
                };
            }
            backup.last_written = Some(text.clone());
            clipboard
                .set_text(&text)
                .map_err(|e| format!("写入剪贴板失败: {e}"))?;
            Ok(backup.original.is_some())
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

/// 恢复最近一次复制备份的剪贴板内容（文本或图片），并清空备份槽。
#[command]
pub async fn restore_stashed_clipboard() -> Result<(), String> {
    Ok(
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let stashed = match std::sync::Mutex::lock(&BACKUP) {
                Ok(mut guard) => {
                    guard.last_written = None;
                    guard.original.take()
                }
                Err(_) => return Err("剪贴板备份锁已中毒".to_string()),
            };
            let Some(stashed) = stashed else {
                return Err("没有可恢复的剪贴板备份".to_string());
            };
            let mut clipboard =
                arboard::Clipboard::new().map_err(|e| format!("打开剪贴板失败: {e}"))?;
            match stashed {
                StashedClipboard::Text(t) => clipboard
                    .set_text(&t)
                    .map_err(|e| format!("恢复剪贴板文本失败: {e}")),
                StashedClipboard::Image {
                    width,
                    height,
                    rgba,
                } => clipboard
                    .set_image(arboard::ImageData {
                        width,
                        height,
                        bytes: std::borrow::Cow::Owned(rgba),
                    })
                    .map_err(|e| format!("恢复剪贴板图片失败: {e}")),
            }
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}
