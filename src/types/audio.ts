/** 系统音频输出设备（与 src-tauri/src/sound.rs 的 AudioDeviceInfo 保持同步）。 */
export interface AudioDeviceInfo {
  /** cpal DeviceId 文本（host:device），用于持久化与重新打开。 */
  id: string;
  /** 展示名（系统设备描述名）。 */
  name: string;
  /** 枚举时是否为系统默认输出设备。 */
  isDefault: boolean;
}
