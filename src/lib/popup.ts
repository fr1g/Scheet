import { invoke } from "@tauri-apps/api/core";

/** 停止响铃、关闭提醒弹窗并聚焦主窗口（弹窗"打开主窗口"按钮）。 */
export function dismissAlarmPopup(): Promise<void> {
  return invoke<void>("dismiss_alarm_popup");
}

/** 停止响铃并关闭提醒弹窗（不聚焦主窗口；弹窗本体点击）。 */
export function closeAlarmPopup(): Promise<void> {
  return invoke<void>("close_alarm_popup");
}
