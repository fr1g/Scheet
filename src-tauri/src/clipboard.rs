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
