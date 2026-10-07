import { invoke } from "@tauri-apps/api/core";
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
