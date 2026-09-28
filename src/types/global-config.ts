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
}

