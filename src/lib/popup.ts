import { invoke } from "@tauri-apps/api/core";

/** 停止响铃、关闭提醒弹窗并聚焦主窗口（由提醒弹窗页面调用）。 */
export function dismissAlarmPopup(): Promise<void> {
  return invoke<void>("dismiss_alarm_popup");
}
