/** 周表域类型——与 src-tauri/src/weeks.rs 的 serde camelCase 输出保持同步。 */

export type EntryType = "normal" | "rest";

export type AlarmMode = "once" | "loop";

/** 周表元信息。 */
export interface WeekPlan {
  id: number;
  /** 槽位 1..=6，决定轮换顺序与 tab 显示顺序。 */
  slot: number;
  name: string;
  dayStartMinute: number | null;
  dayEndMinute: number | null;
}

/** 周表内的一条事务；新条目用负数临时 id（仅用于冲突配对回显）。 */
export interface WeekEntry {
  id: number;
  /** ISO 周几：1=周一 .. 7=周日。 */
  weekday: number;
  startMinute: number;
  durationMinute: number;
  entryType: EntryType;
  title: string;
  /** null=继承下一级；"builtin"=内置铃声；"none"=不提醒；其他=alarms 文件名。 */
  alarmFile: string | null;
  alarmMode: AlarmMode | null;
  /** 结束铃声（null 时回落到开始铃声链）；格式同 alarmFile。 */
  endAlarmFile: string | null;
  endAlarmMode: AlarmMode | null;
  /** 自定义颜色 #RRGGBB；null 时按类型使用默认色（普通=蓝、休息=琥珀）。 */
  color: string | null;
}

/** 某周表某天的起止时间覆盖。 */
export interface DayOverride {
  weekday: number;
  dayStartMinute: number | null;
  dayEndMinute: number | null;
}

/** 完整周表。 */
export interface FullPlan {
  plan: WeekPlan;
  entries: WeekEntry[];
  overrides: DayOverride[];
}

/** 一对互相冲突（时间重叠）的提醒事务。 */
export interface Conflict {
  aId: number;
  bId: number;
  weekday: number;
}

/** 保存结果：冲突时拒绝写入并回显冲突对。 */
export interface SaveOutcome {
  saved: boolean;
  plan: FullPlan | null;
  conflicts: Conflict[];
}

export interface SavePlanPayload {
  id: number;
  name: string;
  dayStartMinute: number | null;
  dayEndMinute: number | null;
  entries: WeekEntry[];
  overrides: DayOverride[];
}
