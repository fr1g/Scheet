/** 全局配置——与 src-tauri/src/settings.rs 的 GlobalConfig（serde camelCase）保持同步。 */

export type FirstDayOfWeek = "mon" | "sun";

import type { AlarmMode } from "./weeks";
export type { AlarmMode };

/**
 * 铃声解析链（事务 → 类型 → 全部）各级取值：
 * null=未设置/继承；"builtin"=内置铃声；"none"=不提醒；其他=alarms 文件名。
 */
export type AlarmFileValue = "builtin" | "none" | (string & {});

export interface GlobalConfig {
  dayStartMinute: number;
  dayEndMinute: number;
  firstDayOfWeek: FirstDayOfWeek;
  alarmAllFile: string | null;
  alarmAllMode: AlarmMode | null;
  alarmNormalFile: string | null;
  alarmNormalMode: AlarmMode | null;
  alarmRestFile: string | null;
  alarmRestMode: AlarmMode | null;
  /** 结束铃声链（未设置时回落到对应的开始铃声链）。 */
  alarmAllEndFile: string | null;
  alarmAllEndMode: AlarmMode | null;
  alarmNormalEndFile: string | null;
  alarmNormalEndMode: AlarmMode | null;
  alarmRestEndFile: string | null;
  alarmRestEndMode: AlarmMode | null;
  /** 界面语言：auto=跟随系统。 */
  uiLanguage: "auto" | "zh" | "en";
  /** 界面字体：system=系统默认；其余为内置字体 id。 */
  uiFont: string;
  /** 界面字号：sm / base / lg。 */
  uiFontSize: "sm" | "base" | "lg";
  /** WebView2 硬件加速（默认开；修改后重启应用生效）。 */
  webviewHwAccel: boolean;
  /** WebView2 平滑滚动（默认关；修改后重启应用生效）。 */
  webviewSmoothScrolling: boolean;
  /** 日志等级：none=不输出不保存；保存后立即生效。 */
  logLevel: "none" | "verbose" | "info" | "warn" | "error" | "fatal";
  /** 应用图标变体（Windows/Linux 运行时生效；macOS 图标需在 Finder 手动替换）。 */
  iconVariant: "color" | "grayscale" | "zinc50";
  /** 普通事务默认背景色（#RRGGBB）。 */
  entryNormalColor: string;
  /** 休息事务默认背景色（#RRGGBB）。 */
  entryRestColor: string;
  /** 普通事务标题文字用深色。 */
  entryNormalTextDark: boolean;
  /** 休息事务标题文字用深色。 */
  entryRestTextDark: boolean;
  /** 标题栏显示系统时间（默认关）。 */
  titlebarClock: boolean;
  /** 标题栏时钟显示秒（默认关）。 */
  titlebarClockSeconds: boolean;
  /** 右侧待办面板显示模式：pinned=常驻，hidden=隐藏（可暂时展开）。 */
  todoPanelMode: "pinned" | "hidden";
}

