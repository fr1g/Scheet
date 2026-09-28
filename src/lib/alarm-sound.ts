import { invoke } from "@tauri-apps/api/core";
import type { AlarmMode } from "../types/weeks";

/** 播放提示音（空串 = 内置默认铃声）。会替换当前正在播放的声音。 */
export function playAlarmSound(
  alarmFile: string,
  alarmMode: AlarmMode,
): Promise<void> {
  return invoke<void>("play_alarm_sound", { alarmFile, alarmMode });
}

/** 停止当前提示音。 */
export function stopAlarmSound(): Promise<void> {
  return invoke<void>("stop_alarm_sound");
}
