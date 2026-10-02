import { invoke } from "@tauri-apps/api/core";

/** 日志等级（与 GlobalConfig.logLevel 一致）；none=不输出不保存。 */
export type AppLogLevel = "none" | "verbose" | "info" | "warn" | "error" | "fatal";

const ORDER: Record<AppLogLevel, number> = {
  none: 0,
  verbose: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/** 前端侧阈值缓存：由 GlobalConfigContext 在配置加载/变更时同步。 */
let currentLevel: AppLogLevel | null = null;

/** 同步前端日志阈值（后端仍有兜底过滤，双端一致避免无谓 IPC）。 */
export function setFrontendLogLevel(level: AppLogLevel): void {
  currentLevel = level;
}

/** 记录一条前端日志（[R] 源）。消息一律使用英文文案。 */
export function appLog(
  level: Exclude<AppLogLevel, "none">,
  message: string,
): void {
  if (currentLevel !== null && ORDER[level] < ORDER[currentLevel]) return;
  void invoke("write_log", { level, message }).catch(() => undefined);
}
