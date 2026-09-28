/**
 * 周表网格的纯函数工具：cell 模型构建、冲突计算、时间格式化。
 * 与 Rust 侧逻辑保持一致（保存的权威校验在 weeks.rs，这里用于即时渲染）。
 */

import type { Conflict, FullPlan, WeekEntry } from "../types/weeks";
import type { GlobalConfig } from "../types/global-config";

/** 像素/分钟的兜底值（窗口尺寸未测得时使用）。 */
export const PX_PER_MINUTE = 3.2;

/** cell 内嵌时间标签的最小高度（低于此值降级为 hover tooltip）。 */
export const TIME_LABEL_MIN_HEIGHT = 72;

/** 分钟数 → "HH:MM"（允许 24:00 表示溢出到次日）。 */
export function minuteToHHMM(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface DayCellModel {
  kind: "entry" | "unplanned";
  entry?: WeekEntry;
  startMinute: number;
  /** 渲染用结束分钟（溢出已钳制到当天结束）。 */
  endMinute: number;
  /** 真实结束分钟（时间标签/tooltip 显示用）。 */
  realEndMinute: number;
  heightPx: number;
  /** 结束时间超出当天结束时间（黄 outline 警告）。 */
  overflow: boolean;
}

/** 把某天的事务列表构建为顺排 cell 模型（含视觉隐藏的无安排空隙）。 */
export function buildDayCells(
  entries: WeekEntry[],
  weekday: number,
  dayStart: number,
  dayEnd: number,
  pxPerMinute: number,
): DayCellModel[] {
  const day = entries
    .filter((e) => e.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute);
  const cells: DayCellModel[] = [];
  let cursor = dayStart;

  for (const entry of day) {
    if (entry.startMinute > cursor) {
      cells.push({
        kind: "unplanned",
        startMinute: cursor,
        endMinute: entry.startMinute,
        realEndMinute: entry.startMinute,
        heightPx: (entry.startMinute - cursor) * pxPerMinute,
        overflow: false,
      });
    }
    const realEnd = entry.startMinute + entry.durationMinute;
    const clampedEnd = Math.min(realEnd, dayEnd);
    const overflow = realEnd > dayEnd;
    if (clampedEnd > entry.startMinute) {
      cells.push({
        kind: "entry",
        entry,
        startMinute: entry.startMinute,
        endMinute: clampedEnd,
        realEndMinute: realEnd,
        heightPx: (clampedEnd - entry.startMinute) * pxPerMinute,
        overflow,
      });
    }
    cursor = Math.max(cursor, clampedEnd);
  }

  if (cursor < dayEnd) {
    cells.push({
      kind: "unplanned",
      startMinute: cursor,
      endMinute: dayEnd,
      realEndMinute: dayEnd,
      heightPx: (dayEnd - cursor) * pxPerMinute,
      overflow: false,
    });
  }
  return cells;
}

/** 整张周表 7 天窗口的全局范围（用于统一纵向比例、跨列时间对齐）。 */
export function planGlobalWindow(
  plan: FullPlan,
  config: GlobalConfig,
): { start: number; end: number } {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (let d = 1; d <= 7; d++) {
    const w = resolveDayWindow(plan, d, config);
    start = Math.min(start, w.dayStart);
    end = Math.max(end, w.dayEnd);
  }
  return { start, end };
}

/** 解析某天的起止窗口：日覆盖 → 周表 → 全局（与 Rust resolve_day_window 一致）。 */
export function resolveDayWindow(
  plan: FullPlan,
  weekday: number,
  config: GlobalConfig,
): { dayStart: number; dayEnd: number } {
  const o = plan.overrides.find((o) => o.weekday === weekday);
  const dayStart =
    o?.dayStartMinute ?? plan.plan.dayStartMinute ?? config.dayStartMinute;
  const dayEnd =
    o?.dayEndMinute ?? plan.plan.dayEndMinute ?? config.dayEndMinute;
  return { dayStart, dayEnd };
}

/** 同一天内互相重叠的提醒事务（与 Rust find_conflicts 一致）。 */
export function findConflicts(entries: WeekEntry[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let day = 1; day <= 7; day++) {
    const list = entries
      .filter((e) => e.weekday === day)
      .sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 0; i < list.length; i++) {
      const aEnd = list[i].startMinute + list[i].durationMinute;
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].startMinute < aEnd) {
          conflicts.push({
            aId: list[i].id,
            bId: list[j].id,
            weekday: day,
          });
        } else {
          break;
        }
      }
    }
  }
  return conflicts;
}

/** ISO 周几的显示列顺序（1=周一..7=周日）。 */
export function orderedWeekdays(firstDayOfWeek: "mon" | "sun"): number[] {
  return firstDayOfWeek === "sun"
    ? [7, 1, 2, 3, 4, 5, 6]
    : [1, 2, 3, 4, 5, 6, 7];
}

/** 事务 cell 背景的默认透明度（用户自定义 hex 色也按此叠加）。 */
export const CELL_COLOR_ALPHA = 0.15;

/** #RRGGBB -> rgba(r, g, b, alpha)；非法输入返回 null。 */
export function hexWithAlpha(hex: string, alpha: number): string | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 事务 cell 的背景色：自定义颜色叠加透明度；
 * 未自定义时按类型取默认色（普通=蓝、休息=琥珀，与原型同色相的深色变体）。
 */
export function entryBackground(entry: WeekEntry): string {
  const custom = entry.color ? hexWithAlpha(entry.color, CELL_COLOR_ALPHA) : null;
  if (custom) return custom;
  return entry.entryType === "normal"
    ? "rgba(96, 165, 250, 0.15)" // blue-400
    : "rgba(251, 191, 36, 0.15)"; // amber-400
}

const WEEKDAY_LABELS: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? "";
}

/** 本地今天对应的 ISO 周几（1=周一..7=周日）。 */
export function todayWeekday(): number {
  const day = new Date().getDay(); // 0=周日
  return day === 0 ? 7 : day;
}

// ============ 事务剪贴板（ScheetPlan JSON） ============

/** 事务序列化为剪贴板 JSON；首键固定为 "objectType": "ScheetPlan"。 */
export function serializeEntryPlan(entry: WeekEntry): string {
  return JSON.stringify({
    objectType: "ScheetPlan",
    entryType: entry.entryType,
    title: entry.title,
    startMinute: entry.startMinute,
    durationMinute: entry.durationMinute,
    alarmFile: entry.alarmFile,
    alarmMode: entry.alarmMode,
    color: entry.color,
  });
}

/** 解析剪贴板文本为事务（不含 id/weekday，由粘贴方赋予）；不合法返回 null。 */
export function parseEntryPlan(raw: string): Omit<WeekEntry, "id" | "weekday"> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    if (keys.length === 0 || keys[0] !== "objectType" || parsed.objectType !== "ScheetPlan") {
      return null;
    }
    const entryType = parsed.entryType === "rest" ? "rest" : parsed.entryType === "normal" ? "normal" : null;
    const startMinute = parsed.startMinute;
    const durationMinute = parsed.durationMinute;
    if (
      entryType == null ||
      typeof startMinute !== "number" ||
      !Number.isInteger(startMinute) ||
      startMinute < 0 ||
      startMinute > 1435 ||
      startMinute % 5 !== 0 ||
      typeof durationMinute !== "number" ||
      !Number.isInteger(durationMinute) ||
      durationMinute <= 0 ||
      durationMinute % 5 !== 0
    ) {
      return null;
    }
    const alarmFile =
      parsed.alarmFile == null ? null : typeof parsed.alarmFile === "string" ? parsed.alarmFile : null;
    const alarmMode = parsed.alarmMode === "loop" ? "loop" : parsed.alarmMode === "once" ? "once" : null;
    const color = parsed.color == null ? null : typeof parsed.color === "string" ? parsed.color : null;
    return {
      entryType,
      title: typeof parsed.title === "string" ? parsed.title : "",
      startMinute,
      durationMinute,
      alarmFile,
      alarmMode,
      color,
    };
  } catch {
    return null;
  }
}

/** 分钟数 → time 输入框值 "HH:MM"；null → 空串（表示未设置/继承）。 */
export function minuteToTimeInput(minute: number | null): string {
  return minute == null ? "" : minuteToHHMM(minute);
}

/** time 输入框值 → 分钟数；空串 → null（未设置）；非法 → NaN。 */
export function timeInputToMinute(value: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN;
  return h * 60 + m;
}
