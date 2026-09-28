import { invoke } from "@tauri-apps/api/core";
import type { GlobalConfig } from "../types/global-config";

export function getGlobalConfig(): Promise<GlobalConfig> {
  return invoke<GlobalConfig>("get_global_config");
}

export function setGlobalConfig(config: GlobalConfig): Promise<GlobalConfig> {
  return invoke<GlobalConfig>("set_global_config", { config });
}
