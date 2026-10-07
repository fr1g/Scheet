import { invoke } from "@tauri-apps/api/core";

/** 读取剪贴板纯文本（非文本/空返回空串）。 */
export function readClipboardText(): Promise<string> {
  return invoke<string>("read_clipboard_text");
}

/** 写入剪贴板纯文本。 */
export function writeClipboardText(text: string): Promise<void> {
  return invoke<void>("write_clipboard_text", { text });
}

/** 备份当前剪贴板（文本/图片）后写入事务文本；返回是否产生了可恢复的备份。 */
export function stashAndWriteText(text: string): Promise<boolean> {
  return invoke<boolean>("stash_and_write_text", { text });
}

/** 恢复最近一次复制前备份的剪贴板内容，并清空备份。 */
export function restoreStashedClipboard(): Promise<void> {
  return invoke<void>("restore_stashed_clipboard");
}

/** 枚举 alarms 目录下的提示音文件名。 */
export function listAlarmSounds(): Promise<string[]> {
  return invoke<string[]>("list_alarm_sounds");
}
