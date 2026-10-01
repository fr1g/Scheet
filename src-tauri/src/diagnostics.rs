//! 开发诊断：把前端错误转发到 stderr（dev 运行时可在控制台看到）。

use tauri::command;

#[command]
pub fn debug_log(msg: String) -> Result<(), String> {
    eprintln!("[web] {msg}");
    Ok(())
}
