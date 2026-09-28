//! 提示音/闹铃播放（rodio）。
//!
//! - 用户提示音存放在数据目录下的 `alarms` 文件夹（随 data.db 一起初始化），
//!   提醒事件通过文件名引用其中的 MP3/WAV/OGG/FLAC 文件，可选用一次或循环播放。
//! - 未指定文件、文件名非法或文件不存在/无法解码时，回退为内置默认提示音
//!   （`assets/default-alarm.wav`，合成铃声，只播放一次）。
//! - 全局同一时刻只保留一个播放引擎：新播放会替换当前播放；
//!   循环播放会一直持续，直到被新播放替换、调用 `stop` 或应用退出。
//!
//! 硬性约定：播放失败（无音频设备、解码失败等）只记录日志并返回 Err，绝不 panic。

use std::fs::File;
use std::io::{BufReader, Cursor};
use std::path::PathBuf;
use std::sync::Mutex;

use rodio::source::Source;
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player};
use serde::{Deserialize, Serialize};
use tauri::command;

/// 内置默认提示音（构建期嵌入，无外部文件依赖）。
const DEFAULT_ALARM_WAV: &[u8] = include_bytes!("../assets/default-alarm.wav");

/// 提示音播放模式。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AlarmMode {
    /// 播放一次。
    Once,
    /// 循环播放，直到被替换或停止。
    Loop,
}

impl AlarmMode {
    pub fn as_db(self) -> &'static str {
        match self {
            AlarmMode::Once => "once",
            AlarmMode::Loop => "loop",
        }
    }

    /// 库中的非法值一律回退为 Once（容错优先）。
    pub fn from_db(raw: &str) -> Self {
        match raw {
            "loop" => AlarmMode::Loop,
            _ => AlarmMode::Once,
        }
    }
}

/// 校验用户提供的提示音文件名：只允许 alarms 目录下的裸文件名。
pub fn validate_alarm_file_name(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("音频文件名不能为空".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!("音频文件名不能包含路径分隔符或 '..': {name:?}"));
    }
    if name.starts_with('.') {
        return Err("音频文件名不能以 '.' 开头".to_string());
    }
    Ok(())
}

/// 当前播放引擎；None 表示没有在播放。
/// Player 先于 _device 析构，避免设备句柄先行关闭。
struct SoundEngine {
    player: Player,
    _device: MixerDeviceSink,
}

static ENGINE: Mutex<Option<SoundEngine>> = Mutex::new(None);

/// 播放提示音（会替换当前正在播放的声音）。
pub fn play(alarm_file: &str, mode: AlarmMode) -> Result<(), String> {
    stop();
    let device = DeviceSinkBuilder::open_default_sink()
        .map_err(|e| format!("[sound] 打开音频设备失败(本次播放跳过): {e}"))?;
    let player = Player::connect_new(&device.mixer());
    let source = load_source(alarm_file, mode)?;
    player.append(source);
    let mut engine = ENGINE.lock().map_err(|_| "[sound] 音频引擎锁已中毒")?;
    *engine = Some(SoundEngine {
        player,
        _device: device,
    });
    Ok(())
}

/// 停止当前播放（没有在播放时为无害空操作）。
pub fn stop() {
    match ENGINE.lock() {
        Ok(mut engine) => {
            if let Some(current) = engine.take() {
                current.player.stop();
            }
        }
        Err(_) => eprintln!("[sound] 音频引擎锁已中毒，无法停止播放"),
    }
}

/// 按文件名解析 alarms 目录下的音频文件路径（含防目录穿越校验）。
fn resolve_alarm_path(name: &str) -> Result<PathBuf, String> {
    validate_alarm_file_name(name)?;
    Ok(crate::db::alarms_dir()?.join(name.trim()))
}

/// 加载待播放音源：用户文件优先，任何失败回退内置默认提示音。
/// 默认提示音恒定只播放一次，与请求的 mode 无关。
fn load_source(alarm_file: &str, mode: AlarmMode) -> Result<Box<dyn Source + Send>, String> {
    if !alarm_file.trim().is_empty() {
        match resolve_alarm_path(alarm_file) {
            Ok(path) => {
                if !path.is_file() {
                    eprintln!("[sound] 音频文件不存在({}), 回退默认提示音", path.display());
                } else {
                    match File::open(&path) {
                        Ok(file) => match Decoder::new(BufReader::new(file)) {
                            Ok(decoder) => {
                                return Ok(match mode {
                                    AlarmMode::Loop => {
                                        Box::new(decoder.repeat_infinite())
                                    }
                                    AlarmMode::Once => Box::new(decoder),
                                });
                            }
                            Err(e) => {
                                eprintln!("[sound] 解码失败({e}), 回退默认提示音");
                            }
                        },
                        Err(e) => {
                            eprintln!("[sound] 打开音频文件失败({e}), 回退默认提示音");
                        }
                    }
                }
            }
            Err(e) => eprintln!("[sound] {e}, 回退默认提示音"),
        }
    }
    let decoder = Decoder::new(Cursor::new(DEFAULT_ALARM_WAV))
        .map_err(|e| format!("内置默认提示音解码失败: {e}"))?;
    Ok(Box::new(decoder))
}

#[command]
pub async fn play_alarm_sound(
    alarm_file: Option<String>,
    alarm_mode: Option<AlarmMode>,
) -> Result<(), String> {
    let file = alarm_file.unwrap_or_default();
    let mode = alarm_mode.unwrap_or(AlarmMode::Once);
    Ok(
        tauri::async_runtime::spawn_blocking(move || play(&file, mode))
            .await
            .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn stop_alarm_sound() -> Result<(), String> {
    Ok(
        tauri::async_runtime::spawn_blocking(stop)
            .await
            .map_err(|e| e.to_string())?,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alarm_mode_db_roundtrip() {
        assert_eq!(AlarmMode::Once.as_db(), "once");
        assert_eq!(AlarmMode::Loop.as_db(), "loop");
        assert_eq!(AlarmMode::from_db("loop"), AlarmMode::Loop);
        assert_eq!(AlarmMode::from_db("once"), AlarmMode::Once);
        assert_eq!(AlarmMode::from_db("garbage"), AlarmMode::Once);
    }

    #[test]
    fn alarm_mode_serde_uses_lowercase() {
        assert_eq!(serde_json::to_string(&AlarmMode::Loop).unwrap(), "\"loop\"");
        assert_eq!(serde_json::to_string(&AlarmMode::Once).unwrap(), "\"once\"");
    }

    #[test]
    fn file_name_validation_rejects_paths() {
        assert!(validate_alarm_file_name("ding.mp3").is_ok());
        assert!(validate_alarm_file_name("我的铃声.mp3").is_ok());
        assert!(validate_alarm_file_name("").is_err());
        assert!(validate_alarm_file_name("a/b.mp3").is_err());
        assert!(validate_alarm_file_name("a\\b.mp3").is_err());
        assert!(validate_alarm_file_name("..".to_string().as_str()).is_err());
        assert!(validate_alarm_file_name(".hidden.mp3").is_err());
    }

    #[test]
    fn default_alarm_asset_is_a_wav() {
        // RIFF....WAVE 魔数
        assert_eq!(&DEFAULT_ALARM_WAV[..4], b"RIFF");
        assert_eq!(&DEFAULT_ALARM_WAV[8..12], b"WAVE");
    }
}
