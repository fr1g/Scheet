//! 内置字体：随应用打包（gzip 压缩），启动时解压到数据目录的 fonts 子目录
//! （与 data.db 同级），前端通过 asset 协议 + @font-face 加载。
//!
//! 霞鹜文楷 Mono 为默认界面字体；其余内置字体与系统默认字体可在设置中选择。
//! 所有内置字体均为 Regular 单字重（粗体由系统合成），gzip 压缩控制包体体积。

use std::fs;
use std::io::Read;
use std::path::PathBuf;

use flate2::read::GzDecoder;
use tauri::command;

/// (解压后文件名, gzip 压缩内容)
const EMBEDDED_FONTS: &[(&str, &[u8])] = &[
    (
        "lxgw-wenkai-mono.ttf",
        include_bytes!("../assets/fonts/lxgw-wenkai-mono.ttf.gz"),
    ),
    (
        "lxgw-wenkai.ttf",
        include_bytes!("../assets/fonts/lxgw-wenkai.ttf.gz"),
    ),
    (
        "harmonyos-sans-sc.ttf",
        include_bytes!("../assets/fonts/harmonyos-sans-sc.ttf.gz"),
    ),
    (
        "oppo-sans.ttf",
        include_bytes!("../assets/fonts/oppo-sans.ttf.gz"),
    ),
    (
        "maple-mono-nf-cn.ttf",
        include_bytes!("../assets/fonts/maple-mono-nf-cn.ttf.gz"),
    ),
];

/// 字体目录：<数据目录>/fonts，与 data.db 同级。
pub fn fonts_dir() -> Result<PathBuf, String> {
    Ok(crate::db::data_dir()?.join("fonts"))
}

/// 解压所有内置字体；已存在的文件跳过（幂等）。
pub fn extract_bundled_fonts() -> Result<usize, String> {
    let dir = fonts_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建字体目录失败: {e}"))?;
    let mut extracted = 0;
    for (out_name, gz_bytes) in EMBEDDED_FONTS {
        let out_path = dir.join(out_name);
        if out_path.exists() {
            continue;
        }
        let mut decoder = GzDecoder::new(*gz_bytes);
        let mut buf = Vec::new();
        decoder
            .read_to_end(&mut buf)
            .map_err(|e| format!("解压字体失败({out_name}): {e}"))?;
        fs::write(&out_path, &buf).map_err(|e| format!("写入字体失败({out_name}): {e}"))?;
        extracted += 1;
    }
    Ok(extracted)
}

/// 启动时解压（在窗口创建前调用）；失败只记录日志，应用回退系统字体。
pub fn ensure_bundled_fonts() {
    match extract_bundled_fonts() {
        Ok(count) if count > 0 => {
            crate::logging::info(&format!("[fonts] Extracted {count} bundled fonts"));
        }
        Ok(_) => {}
        Err(e) => crate::logging::error(&format!(
            "[fonts] Font extraction failed (falling back to system fonts): {e}"
        )),
    }
}

/// 字体目录路径（前端经 asset 协议 + @font-face 加载）。
#[command]
pub fn get_fonts_dir() -> Result<String, String> {
    fonts_dir().map(|p| p.to_string_lossy().to_string())
}

