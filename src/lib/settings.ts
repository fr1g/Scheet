import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, WindowControlsPosition } from "../types/settings";

export function loadAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_app_settings");
}

export function saveWindowControlsPosition(
  position: WindowControlsPosition,
): Promise<AppSettings> {
  return invoke<AppSettings>("set_window_controls_position", { position });
}
