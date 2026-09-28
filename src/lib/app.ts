import { invoke } from "@tauri-apps/api/core";

/** 直接退出应用（等同托盘菜单"退出"，用于 Shift+关闭 的确认退出路径）。 */
export function exitApplication(): Promise<void> {
  return invoke<void>("exit_application");
}
