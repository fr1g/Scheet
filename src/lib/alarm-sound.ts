import { invoke } from "@tauri-apps/api/core";
import type { AudioDeviceInfo } from "../types/audio";
import type { AlarmMode } from "../types/weeks";

/** 内置铃声类别：开始/结束事件各回退各自的默认铃，其余用通用铃。 */
export type BuiltinAlarm = "generic" | "start" | "end";

/** 播放提示音（空串 = 内置默认铃声，按 builtin 类别区分）。会替换当前正在播放的声音。 */
export function playAlarmSound(
  alarmFile: string,
  alarmMode: AlarmMode,
  builtin: BuiltinAlarm = "generic",
): Promise<void> {
  return invoke<void>("play_alarm_sound", { alarmFile, alarmMode, builtin });
}

/** 停止当前提示音。 */
export function stopAlarmSound(): Promise<void> {
  return invoke<void>("stop_alarm_sound");
}

/** 列出当前系统音频输出设备（默认设备排在最前）。 */
export function listAudioOutputDevices(): Promise<AudioDeviceInfo[]> {
  return invoke<AudioDeviceInfo[]>("list_audio_output_devices");
}

/** 把单一音频流立即切到指定设备；null=系统默认。不持久化配置。 */
export function switchAudioOutputDevice(device: string | null): Promise<void> {
  return invoke<void>("switch_audio_output_device", { device });
}
