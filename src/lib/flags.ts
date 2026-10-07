import { invoke } from "@tauri-apps/api/core";

/** 一次性应用标记（data.db 的 flags 表）：首启提示等"是否出现过"的小状态。 */
export function getAppFlag(key: string): Promise<string | null> {
  return invoke<string | null>("get_app_flag", { key });
}

export function setAppFlag(key: string, value: string): Promise<void> {
  return invoke<void>("set_app_flag", { key, value });
}
