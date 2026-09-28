import { invoke } from "@tauri-apps/api/core";

/** 读取剪贴板纯文本（非文本/空返回空串）。 */
export function readClipboardText(): Promise<string> {
  return invoke<string>("read_clipboard_text");
}

/** 写入剪贴板纯文本。 */
export function writeClipboardText(text: string): Promise<void> {
  return invoke<void>("write_clipboard_text", { text });
}

/** 枚举 alarms 目录下的提示音文件名。 */
export function listAlarmSounds(): Promise<string[]> {
  return invoke<string[]>("list_alarm_sounds");
}
