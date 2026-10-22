//! 提示音/闹铃播放（rodio）。
//!
//! - 用户提示音存放在数据目录下的 `alarms` 文件夹（随 data.db 一起初始化），
//!   提醒事件通过文件名引用其中的 MP3/WAV/OGG/FLAC 文件，可选用一次或循环播放。
//! - 未指定文件、文件名非法或文件不存在/无法解码时，回退为内置默认提示音
//!   （`assets/default-alarm.wav`，合成铃声，只播放一次）。
//! - 全局同一时刻只保留一个播放引擎：新播放会替换当前播放；
//!   循环播放由看护线程驱动——每轮播完后静默 5 秒再续播下一轮，
//!   直到被新播放替换、调用 `stop` 或应用退出。
//!
//! 输出流有两种模式（设置-高级）：
//! - **单一音频流（默认）**：进程内只保留一个 `MixerDeviceSink`，播放时只更换
//!   挂在混音器上的 `Player`。旧流切换设备后退役但不销毁（只保留引用，防止
//!   cpal/WASAPI 析构竞态导致堆损坏）。代价是系统默认设备变化不会自动跟随，
//!   设置页提供设备选择 + 试听作为兜底。
//! - **按次音频流**：每次播放重新打开系统默认设备流，能跟随系统默认设备切换；
//!   但会把上述 cpal/WASAPI 析构竞态重新暴露给用户（设置页会明确警示）。
//!
//! 硬性约定：播放失败（无音频设备、解码失败等）只记录日志并返回 Err，绝不 panic。

use std::fs::File;
use std::io::{BufReader, Cursor};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use rodio::cpal;
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::source::Source;
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player};
use serde::{Deserialize, Serialize};
use tauri::command;

/// 内置默认提示音（构建期嵌入，无外部文件依赖）。
const DEFAULT_ALARM_WAV: &[u8] = include_bytes!("../assets/default-alarm.wav");
/// 内置默认开始/结束铃（周课表事件未配置铃声时的回退，按事件类别区分）。
const DEFAULT_START_WAV: &[u8] = include_bytes!("../assets/default-alarm-start.wav");
const DEFAULT_END_WAV: &[u8] = include_bytes!("../assets/default-alarm-end.wav");

/// 内置铃声类别：周课表开始/结束事件各回退各自的默认铃；
/// 手动提醒与未指明类别的预览用通用铃。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BuiltinAlarm {
    Generic,
    Start,
    End,
}

impl BuiltinAlarm {
    fn wav(self) -> &'static [u8] {
        match self {
            BuiltinAlarm::Generic => DEFAULT_ALARM_WAV,
            BuiltinAlarm::Start => DEFAULT_START_WAV,
            BuiltinAlarm::End => DEFAULT_END_WAV,
        }
    }
}
/// 循环模式下两轮播放之间的静默间隔。
const LOOP_GAP: Duration = Duration::from_secs(5);
/// 循环看护线程的轮询间隔。
const LOOP_TICK: Duration = Duration::from_millis(200);

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

/// 播放输出配置：由 settings 模块在启动、保存时同步进来。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SoundConfig {
    /// true=单一音频流常驻；false=每次播放重新打开默认设备。
    pub single_stream: bool,
    /// 单一流模式的目标设备（cpal DeviceId 字符串）；None=系统默认。
    pub device: Option<String>,
}

impl Default for SoundConfig {
    fn default() -> Self {
        Self {
            single_stream: true,
            device: None,
        }
    }
}

static SOUND_CONFIG: Mutex<SoundConfig> = Mutex::new(SoundConfig {
    single_stream: true,
    device: None,
});

/// 当前播放引擎；None 表示没有在播放。
/// 世代号：每次 play/stop 递增，用于让旧的循环看护线程失效。
struct SoundEngine {
    player: Player,
    /// 按次流模式下持有本次播放的设备流；单一流模式为 None（设备流在 DEVICE_SINK）。
    _device: Option<MixerDeviceSink>,
}

static ENGINE: Mutex<Option<(u64, SoundEngine)>> = Mutex::new(None);
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// 单一流模式下当前活跃的设备流。`configured_device` 是用户/配置期望的设备，
/// `device_id` 是实际打开时的端点标识，仅用于日志和排障。
struct ActiveSink {
    sink: MixerDeviceSink,
    configured_device: Option<String>,
    device_id: String,
    device_name: String,
}

/// 单一流模式下只打开一次；切换设备时退役旧流，不销毁。
/// 反复创建/销毁 MixerDeviceSink 会在播放中途触发 cpal(WASAPI) 的析构竞态，
/// 观测为进程堆损坏（0xc0000374，崩溃点可能远晚于损坏点，例如退出或窗口 resize 时）。
static DEVICE_SINK: Mutex<Option<ActiveSink>> = Mutex::new(None);

/// 退役但永不 drop 的设备流。切换设备/关闭单一流模式时把旧流移到这里，
/// 保留其所有权，避免 cpal/WASAPI 析构路径；代价是旧流会一直存活到进程退出。
static RETIRED_SINKS: Mutex<Vec<MixerDeviceSink>> = Mutex::new(Vec::new());

/// 设置页展示的音频输出设备。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

fn normalize_device(device: Option<String>) -> Option<String> {
    device.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn config_snapshot() -> SoundConfig {
    match SOUND_CONFIG.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => {
            crate::logging::error(
                "[sound] Audio config lock poisoned; using default single-stream config",
            );
            SoundConfig::default()
        }
    }
}

/// 打开指定设备或系统默认设备。返回的流已经关闭 rodio 的 drop 日志，
/// 避免按次流模式下频繁启停刷屏。
fn open_active_sink(configured: Option<String>) -> Result<ActiveSink, String> {
    let configured = normalize_device(configured);
    let host = cpal::default_host();

    if let Some(requested) = configured.as_deref() {
        let parsed_id = requested
            .parse::<cpal::DeviceId>()
            .map_err(|e| format!("[sound] Invalid audio device id '{requested}': {e}"))?;
        let device = host
            .device_by_id(&parsed_id)
            .ok_or_else(|| format!("[sound] Audio device not found: {requested}"))?;
        let device_name = device
            .description()
            .map(|desc| desc.name().to_string())
            .unwrap_or_else(|_| requested.to_string());
        let mut sink = DeviceSinkBuilder::from_device(device)
            .map_err(|e| format!("[sound] Failed to prepare audio device '{device_name}': {e}"))?
            .open_stream()
            .map_err(|e| format!("[sound] Failed to open output stream on '{device_name}': {e}"))?;
        sink.log_on_drop(false);
        let device_id = requested.to_string();
        crate::logging::info(&format!(
            "[sound] Opened output stream on '{device_name}' ({device_id})"
        ));
        return Ok(ActiveSink {
            sink,
            configured_device: configured,
            device_id,
            device_name,
        });
    }

    let (device_id, device_name) = match host.default_output_device() {
        Some(device) => {
            let id = device.id().map(|id| id.to_string()).unwrap_or_default();
            let name = device
                .description()
                .map(|desc| desc.name().to_string())
                .unwrap_or_else(|_| "system default".to_string());
            (id, name)
        }
        None => (String::new(), "system default".to_string()),
    };
    let mut sink = DeviceSinkBuilder::open_default_sink()
        .map_err(|e| format!("[sound] Failed to open default output stream: {e}"))?;
    sink.log_on_drop(false);
    crate::logging::info(&format!(
        "[sound] Opened default output stream on '{device_name}' ({device_id})"
    ));
    Ok(ActiveSink {
        sink,
        configured_device: None,
        device_id,
        device_name,
    })
}

/// 把旧流移入退役列表，避免 drop 触发 cpal/WASAPI 析构竞态。
fn retire_sink(old: Option<ActiveSink>) {
    let Some(old) = old else {
        return;
    };
    match RETIRED_SINKS.lock() {
        Ok(mut retired) => {
            crate::logging::info(&format!(
                "[sound] Retired output stream on '{}' ({}) (kept alive to avoid WASAPI teardown race)",
                old.device_name, old.device_id
            ));
            retired.push(old.sink);
        }
        Err(_) => {
            crate::logging::error(
                "[sound] Retired sink lock poisoned; leaking old output stream instead of dropping it",
            );
            std::mem::forget(old.sink);
        }
    }
}

/// 单一流模式：确保设备流存在，并返回一个挂在其混音器上的 Player。
fn acquire_single_stream_player(configured: Option<String>) -> Result<Player, String> {
    let mut guard = DEVICE_SINK
        .lock()
        .map_err(|_| "[sound] Audio device lock poisoned".to_string())?;
    if guard.is_none() {
        match open_active_sink(configured) {
            Ok(active) => *guard = Some(active),
            Err(e) => {
                crate::logging::warn(&format!("{e}; retrying with system default output"));
                *guard = Some(open_active_sink(None)?);
            }
        }
    }
    let active = guard
        .as_ref()
        .ok_or_else(|| "[sound] Audio device unavailable".to_string())?;
    Ok(Player::connect_new(active.sink.mixer()))
}

/// 应用音频配置（启动时、保存设置时调用）。
///
/// 只有模式或目标设备真正变化时才停止当前播放并重建流；保存其他设置不会打断铃声。
pub fn configure(config: SoundConfig) -> Result<(), String> {
    let config = SoundConfig {
        single_stream: config.single_stream,
        device: normalize_device(config.device),
    };
    let changed = {
        let mut guard = SOUND_CONFIG
            .lock()
            .map_err(|_| "[sound] Audio config lock poisoned".to_string())?;
        let changed = *guard != config;
        *guard = config.clone();
        changed
    };
    if !changed {
        return Ok(());
    }

    crate::logging::info(&format!(
        "[sound] Applying audio config: single_stream={}, device={:?}",
        config.single_stream, config.device
    ));
    stop();

    if !config.single_stream {
        let old = DEVICE_SINK
            .lock()
            .map_err(|_| "[sound] Audio device lock poisoned".to_string())?
            .take();
        retire_sink(old);
        crate::logging::info(
            "[sound] Single-stream mode disabled; per-play output streams enabled",
        );
        return Ok(());
    }

    let old = {
        let mut guard = DEVICE_SINK
            .lock()
            .map_err(|_| "[sound] Audio device lock poisoned".to_string())?;
        let Some(active) = guard.as_ref() else {
            // 懒加载：第一次播放时再打开，避免启动即占用音频设备。
            return Ok(());
        };
        if active.configured_device == config.device {
            return Ok(());
        }
        match open_active_sink(config.device.clone()) {
            Ok(new_active) => guard.replace(new_active),
            Err(e) => {
                crate::logging::warn(&format!(
                    "[sound] Failed to switch to configured device: {e}; trying system default"
                ));
                match open_active_sink(None) {
                    Ok(new_active) => guard.replace(new_active),
                    Err(e2) => {
                        crate::logging::error(&format!(
                            "[sound] Failed to reopen audio stream; keeping previous stream: {e2}"
                        ));
                        return Err(e2);
                    }
                }
            }
        }
    };
    retire_sink(old);
    Ok(())
}

/// 设置页“试听”：把单一流切到指定设备（None=系统默认）并停止当前铃声。
/// 不持久化配置；持久化由 set_global_config 完成。
fn switch_output_device(device: Option<String>) -> Result<(), String> {
    let config = config_snapshot();
    if !config.single_stream {
        return Err(
            "[sound] Single audio stream is disabled; choose a device after enabling it"
                .to_string(),
        );
    }
    let device = normalize_device(device);
    if device.is_some() {
        let guard = DEVICE_SINK
            .lock()
            .map_err(|_| "[sound] Audio device lock poisoned".to_string())?;
        if guard
            .as_ref()
            .map(|active| active.configured_device.as_deref() == device.as_deref())
            == Some(true)
        {
            return Ok(());
        }
    }
    crate::logging::info(&format!("[sound] Switching output device to {device:?}"));
    stop();
    let old = {
        let mut guard = DEVICE_SINK
            .lock()
            .map_err(|_| "[sound] Audio device lock poisoned".to_string())?;
        let new_active = open_active_sink(device)?;
        guard.replace(new_active)
    };
    retire_sink(old);
    Ok(())
}

fn list_output_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_id = host
        .default_output_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let devices = host
        .output_devices()
        .map_err(|e| format!("[sound] Failed to enumerate output devices: {e}"))?;
    let mut result = Vec::new();
    for device in devices {
        let id = match device.id() {
            Ok(id) => id.to_string(),
            Err(e) => {
                crate::logging::warn(&format!("[sound] Skipping output device without id: {e}"));
                continue;
            }
        };
        let name = device
            .description()
            .map(|desc| desc.name().to_string())
            .unwrap_or_else(|_| id.clone());
        let is_default = default_id.as_deref() == Some(id.as_str());
        result.push(AudioDeviceInfo {
            id,
            name,
            is_default,
        });
    }
    result.sort_by(|a, b| {
        b.is_default
            .cmp(&a.is_default)
            .then_with(|| a.name.cmp(&b.name))
    });
    crate::logging::info(&format!(
        "[sound] Enumerated {} output device(s)",
        result.len()
    ));
    Ok(result)
}

/// 播放提示音（会替换当前正在播放的声音）。
pub fn play(alarm_file: &str, mode: AlarmMode, builtin: BuiltinAlarm) -> Result<(), String> {
    stop();
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let config = config_snapshot();

    let (player, device) = if config.single_stream {
        let player = acquire_single_stream_player(config.device).map_err(|e| {
            crate::logging::error(&format!("[sound] Playback aborted: {e}"));
            e
        })?;
        (player, None)
    } else {
        let mut sink = DeviceSinkBuilder::open_default_sink().map_err(|e| {
            let msg = format!("[sound] Failed to open per-play output stream: {e}");
            crate::logging::error(&msg);
            msg
        })?;
        sink.log_on_drop(false);
        let player = Player::connect_new(sink.mixer());
        (player, Some(sink))
    };

    let source = load_source(alarm_file, builtin)?;
    player.append(source);
    let mut engine = ENGINE
        .lock()
        .map_err(|_| "[sound] Audio engine lock poisoned".to_string())?;
    *engine = Some((
        generation,
        SoundEngine {
            player,
            _device: device,
        },
    ));
    if mode == AlarmMode::Loop {
        spawn_loop_watcher(generation, alarm_file.trim().to_string(), builtin);
    }
    Ok(())
}

/// 停止当前播放（没有在播放时为无害空操作）。
pub fn stop() {
    match ENGINE.lock() {
        Ok(mut engine) => {
            if engine.take().is_some() {
                // 世代号递增使可能存在的循环看护线程失效
                GENERATION.fetch_add(1, Ordering::SeqCst);
            }
        }
        Err(_) => crate::logging::error("[sound] Audio engine lock poisoned, cannot stop playback"),
    }
}

/// 按文件名解析 alarms 目录下的音频文件路径（含防目录穿越校验）。
fn resolve_alarm_path(name: &str) -> Result<PathBuf, String> {
    validate_alarm_file_name(name)?;
    Ok(crate::db::alarms_dir()?.join(name.trim()))
}

/// 加载待播放音源：用户文件优先，任何失败回退内置默认提示音。
/// 循环由看护线程驱动，因此这里恒定只加载"一轮"。
fn load_source(alarm_file: &str, builtin: BuiltinAlarm) -> Result<Box<dyn Source + Send>, String> {
    if !alarm_file.trim().is_empty() {
        match resolve_alarm_path(alarm_file) {
            Ok(path) => {
                if !path.is_file() {
                    crate::logging::warn(&format!(
                        "[sound] Alarm file not found ({}), falling back to built-in sound",
                        path.display()
                    ));
                } else {
                    match File::open(&path) {
                        Ok(file) => match Decoder::new(BufReader::new(file)) {
                            Ok(decoder) => return Ok(Box::new(decoder)),
                            Err(e) => {
                                crate::logging::warn(&format!(
                                    "[sound] Decode failed ({e}), falling back to built-in sound"
                                ));
                            }
                        },
                        Err(e) => {
                            crate::logging::warn(&format!(
                                "[sound] Failed to open alarm file ({e}), falling back to built-in sound"
                            ));
                        }
                    }
                }
            }
            Err(e) => crate::logging::warn(&format!("[sound] {e}, falling back to built-in sound")),
        }
    }
    let decoder = Decoder::new(Cursor::new(builtin.wav()))
        .map_err(|e| format!("内置默认提示音解码失败: {e}"))?;
    Ok(Box::new(decoder))
}

/// 循环看护线程：当前一轮播完后静默 [`LOOP_GAP`] 再续播下一轮，
/// 直到引擎被替换（世代号变化）或停止。
fn spawn_loop_watcher(generation: u64, alarm_file: String, builtin: BuiltinAlarm) {
    let spawned = std::thread::Builder::new()
        .name("alarm-loop".into())
        .spawn(move || loop {
            std::thread::sleep(LOOP_TICK);
            {
                let guard = match ENGINE.lock() {
                    Ok(guard) => guard,
                    Err(_) => return,
                };
                match guard.as_ref() {
                    Some((g, engine)) if *g == generation => {
                        if !engine.player.empty() {
                            continue; // 仍在播放
                        }
                    }
                    _ => return, // 已被替换或停止
                }
            }
            // 一轮结束：静默间隔后续播
            std::thread::sleep(LOOP_GAP);
            let mut guard = match ENGINE.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            match guard.as_mut() {
                Some((g, engine)) if *g == generation => match load_source(&alarm_file, builtin) {
                    Ok(source) => engine.player.append(source),
                    Err(e) => {
                        crate::logging::error(&format!(
                            "[sound] Loop replay failed (stopped): {e}"
                        ));
                        return;
                    }
                },
                _ => return,
            }
        });
    if let Err(e) = spawned {
        crate::logging::warn(&format!(
            "[sound] Loop watcher thread failed to spawn (playing once only): {e}"
        ));
    }
}

#[command]
pub async fn play_alarm_sound(
    alarm_file: Option<String>,
    alarm_mode: Option<AlarmMode>,
    builtin: Option<BuiltinAlarm>,
) -> Result<(), String> {
    let file = alarm_file.unwrap_or_default();
    let mode = alarm_mode.unwrap_or(AlarmMode::Once);
    let builtin = builtin.unwrap_or(BuiltinAlarm::Generic);
    let result = tauri::async_runtime::spawn_blocking(move || play(&file, mode, builtin))
        .await
        .map_err(|e| {
            let msg = format!("[sound] play_alarm_sound task failed: {e}");
            crate::logging::error(&msg);
            msg
        })?;
    if let Err(e) = &result {
        crate::logging::error(&format!("[sound] play_alarm_sound failed: {e}"));
    }
    result
}

#[command]
pub async fn stop_alarm_sound() -> Result<(), String> {
    Ok(tauri::async_runtime::spawn_blocking(stop)
        .await
        .map_err(|e| {
            let msg = format!("[sound] stop_alarm_sound task failed: {e}");
            crate::logging::error(&msg);
            msg
        })?)
}

/// 设置页设备下拉：列出当前系统的音频输出设备（默认设备排在最前）。
#[command]
pub async fn list_audio_output_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let result = tauri::async_runtime::spawn_blocking(list_output_devices)
        .await
        .map_err(|e| {
            let msg = format!("[sound] list_audio_output_devices task failed: {e}");
            crate::logging::error(&msg);
            msg
        })?;
    if let Err(e) = &result {
        crate::logging::error(&format!("[sound] list_audio_output_devices failed: {e}"));
    }
    result
}

/// 设置页“试听”前调用：立即把单一流切到指定设备；None=系统默认。
/// 只改运行时流，不写配置；持久化由 set_global_config 负责。
#[command]
pub async fn switch_audio_output_device(device: Option<String>) -> Result<(), String> {
    let device = normalize_device(device);
    let result = tauri::async_runtime::spawn_blocking(move || switch_output_device(device))
        .await
        .map_err(|e| {
            let msg = format!("[sound] switch_audio_output_device task failed: {e}");
            crate::logging::error(&msg);
            msg
        })?;
    if let Err(e) = &result {
        crate::logging::error(&format!("[sound] switch_audio_output_device failed: {e}"));
    }
    result
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
    fn sound_config_defaults_to_single_stream() {
        let config = SoundConfig::default();
        assert!(config.single_stream);
        assert_eq!(config.device, None);
    }

    #[test]
    fn audio_device_ids_roundtrip_when_available() {
        let host = cpal::default_host();
        let Ok(devices) = host.output_devices() else {
            return;
        };
        for device in devices {
            let Ok(id) = device.id() else {
                continue;
            };
            let text = id.to_string();
            let parsed = text
                .parse::<cpal::DeviceId>()
                .expect("cpal DeviceId Display must roundtrip through FromStr");
            assert_eq!(id, parsed);
            assert!(host.device_by_id(&parsed).is_some());
        }
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

    #[test]
    fn default_start_end_assets_are_wavs() {
        for wav in [DEFAULT_START_WAV, DEFAULT_END_WAV] {
            assert_eq!(&wav[..4], b"RIFF");
            assert_eq!(&wav[8..12], b"WAVE");
        }
        // 三个内置铃必须是三份不同的资产
        assert!(!std::ptr::eq(
            DEFAULT_START_WAV.as_ptr(),
            DEFAULT_END_WAV.as_ptr()
        ));
    }
}
