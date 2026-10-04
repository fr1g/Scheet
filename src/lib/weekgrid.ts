/**
 * 周表网格的纯函数工具：cell 模型构建、冲突计算、时间格式化。
 * 与 Rust 侧逻辑保持一致（保存的权威校验在 weeks.rs，这里用于即时渲染）。
 */

import { useTranslation } from "react-i18next";
import type { AlarmMode, Conflict, EntryType, FullPlan, WeekEntry } from "../types/weeks";
import type { GlobalConfig } from "../types/global-config";

/** 像素/分钟的兜底值（窗口尺寸未测得时使用）。 */
export const PX_PER_MINUTE = 3.2;

/** cell 内嵌时间标签的最小高度（低于此值降级为 hover tooltip）。 */
export const TIME_LABEL_MIN_HEIGHT = 32;

/** 分钟数 → "HH:MM"（允许 24:00 表示溢出到次日）。 */
export function minuteToHHMM(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

export interface ResolvedAlarmDisplay {
  /** "builtin" | "none" | alarms 文件名。 */
  file: "builtin" | "none" | string;
  fileSource: string;
  mode: AlarmMode;
  modeSource: string;
}

export interface PositionedEntry {
  entry: WeekEntry;
  /** 相对当天列顶部的像素偏移（已钳制到当天窗口）。 */
  topPx: number;
  /** 渲染高度（溢出已钳制到当天结束）。 */
  heightPx: number;
  /** 结束时间超出当天结束时间（黄 outline 警告）。 */
  overflow: boolean;
  /** 冲突泳道号（0 起）。 */
  lane: number;
  /** 所在冲突簇的泳道总数（1 = 独占整列宽度）。 */
  lanes: number;
}

/**
 * 把某天的事务布局为绝对定位模型：
 * - 区间按当天窗口钳制，完全在窗口外的事务不渲染；
 * - 泳道分配：按开始排序后 first-fit（区间图着色，色数=最大并发数）；
 * - 连通簇（互相链式重叠）共享泳道总数，非重叠事务仍独占整列宽度。
 */
export function layoutDayEntries(
  entries: WeekEntry[],
  weekday: number,
  dayStart: number,
  dayEnd: number,
  pxPerMinute: number,
): PositionedEntry[] {
  const day = entries
    .filter((e) => e.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute || a.id - b.id);

  const spans = day.map((entry) => {
    const realEnd = entry.startMinute + entry.durationMinute;
    const renderStart = Math.max(entry.startMinute, dayStart);
    const renderEnd = Math.min(realEnd, dayEnd);
    return { entry, renderStart, renderEnd, overflow: realEnd > dayEnd };
  });

  // 泳道 first-fit
  const laneEnds: number[] = [];
  const laneOf: number[] = [];
  for (const s of spans) {
    let lane = laneEnds.findIndex((end) => end <= s.renderStart);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.renderEnd);
    } else {
      laneEnds[lane] = s.renderEnd;
    }
    laneOf.push(lane);
  }

  // 连通簇划分：renderStart >= 当前簇尾 → 新簇
  const clusterOf: number[] = [];
  let cluster = 0;
  let clusterEnd = Number.NEGATIVE_INFINITY;
  spans.forEach((s, i) => {
    if (s.renderStart >= clusterEnd) {
      cluster++;
      clusterEnd = s.renderEnd;
    } else {
      clusterEnd = Math.max(clusterEnd, s.renderEnd);
    }
    clusterOf[i] = cluster;
  });
  const clusterLanes = new Map<number, number>();
  spans.forEach((_, i) => {
    clusterLanes.set(
      clusterOf[i],
      Math.max(clusterLanes.get(clusterOf[i]) ?? 0, laneOf[i] + 1),
    );
  });

  const positioned: PositionedEntry[] = [];
  spans.forEach((s, i) => {
    const topPx = (s.renderStart - dayStart) * pxPerMinute;
    const heightPx = (s.renderEnd - s.renderStart) * pxPerMinute;
    if (heightPx <= 0) return; // 完全在窗口外
    positioned.push({
      entry: s.entry,
      topPx,
      heightPx,
      overflow: s.overflow,
      lane: laneOf[i],
      lanes: clusterLanes.get(clusterOf[i]) ?? 1,
    });
  });
  return positioned;
}

/** 铃声解析链（类型默认 → 全局默认 → 内置），供编辑模态展示继承值。 */
export function resolveAlarmDisplay(
  entryType: EntryType,
  config: GlobalConfig,
): ResolvedAlarmDisplay {
  const typeFile =
    entryType === "normal" ? config.alarmNormalFile : config.alarmRestFile;
  const typeMode =
    entryType === "normal" ? config.alarmNormalMode : config.alarmRestMode;
  const file = typeFile ?? config.alarmAllFile ?? "builtin";
  const fileSource = typeFile
    ? "类型默认"
    : config.alarmAllFile
      ? "全局默认"
      : "内置";
  const mode = typeMode ?? config.alarmAllMode ?? "once";
  const modeSource = typeMode
    ? "类型默认"
    : config.alarmAllMode
      ? "全局默认"
      : "内置";
  return { file, fileSource, mode, modeSource };
}

/** 系统生成的周表名（键）形态，如 weeks.w3。 */
export const PLAN_NAME_KEY_RE = /^weeks\.w[1-6]$/;

/** 是否为系统生成的周表键名（weeks.wN）。 */
export function isPlanNameKey(raw: string): boolean {
  return PLAN_NAME_KEY_RE.test(raw);
}

/** 键名 → 友好名称（i18n）；用户自定义名原样返回。组件内使用。 */
export function usePlanName(): (raw: string) => string {
  const { t } = useTranslation();
  return (raw: string) => (PLAN_NAME_KEY_RE.test(raw) ? t(raw) : raw);
}

/**
 * 周表显示名的统一规则（所有用户可见处共用）：
 * - 自定义名（非 weeks.wN 键）永远原样优先；
 * - 默认键名按周表数量标记：1 个 → 本周；2 个 → 单周/双周（按列表位次）；更多 → 解析键名。
 * plans 为当前周表列表，index 为目标周表在列表中的位次（展示态以调用时的列表为准）。
 */
export function planDisplayName(
  plans: { name: string }[],
  index: number,
  resolveName: (raw: string) => string,
  t: (key: string) => string,
): string {
  const raw = plans[index]?.name ?? "";
  if (!isPlanNameKey(raw)) return resolveName(raw);
  if (plans.length === 1) return t("tabs.thisWeek");
  if (plans.length === 2) {
    return t(index === 0 ? "titlebar.single" : "titlebar.double");
  }
  return resolveName(raw);
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
export const NORMAL_BG_ALPHA = 0.88; // 有色版图标的 indigo alpha
export const REST_BG_ALPHA = 0.87; // 有色版图标的 salmon alpha

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
/** 事务默认色解析链的汇总视图（周表覆盖 → 全局默认）。 */
export interface EntryColorScheme {
  normalColor: string;
  restColor: string;
  normalTextDark: boolean;
  restTextDark: boolean;
}

type SchemePlanMeta = {
  normalColor: string | null;
  restColor: string | null;
  normalTextDark: boolean | null;
  restTextDark: boolean | null;
};

/** 周表覆盖 → 全局默认（plan 传 null 时仅全局）。 */
export function entryColorScheme(
  plan: SchemePlanMeta | null | undefined,
  config:
    | {
        entryNormalColor: string;
        entryRestColor: string;
        entryNormalTextDark: boolean;
        entryRestTextDark: boolean;
      }
    | null
    | undefined,
): EntryColorScheme {
  return {
    normalColor: plan?.normalColor ?? config?.entryNormalColor ?? "#615ea8",
    restColor: plan?.restColor ?? config?.entryRestColor ?? "#fecac0",
    normalTextDark: plan?.normalTextDark ?? config?.entryNormalTextDark ?? false,
    restTextDark: plan?.restTextDark ?? config?.entryRestTextDark ?? true,
  };
}

/** 事务背景与标题文字深浅：单条 color 最优先，其次 scheme 默认。 */
export function resolveEntryColors(
  entryType: EntryType,
  color: string | null,
  scheme: EntryColorScheme,
): { background: string; textDark: boolean } {
  const [alpha, textDark] =
    entryType === "normal"
      ? [NORMAL_BG_ALPHA, scheme.normalTextDark]
      : [REST_BG_ALPHA, scheme.restTextDark];
  return {
    background:
      hexWithAlpha(
        color ?? (entryType === "normal" ? scheme.normalColor : scheme.restColor),
        alpha,
      ) ?? "transparent",
    textDark,
  };
}

/** 本地今天对应的 ISO 周几（1=周一..7=周日）。 */
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
    endAlarmFile: entry.endAlarmFile,
    endAlarmMode: entry.endAlarmMode,
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
    const optionalString = (v: unknown): string | null =>
      v == null || typeof v !== "string" ? null : v;
    const optionalMode = (v: unknown): AlarmMode | null =>
      v === "loop" ? "loop" : v === "once" ? "once" : null;
    return {
      entryType,
      title: typeof parsed.title === "string" ? parsed.title : "",
      startMinute,
      durationMinute,
      alarmFile: optionalString(parsed.alarmFile),
      alarmMode: optionalMode(parsed.alarmMode),
      endAlarmFile: optionalString(parsed.endAlarmFile),
      endAlarmMode: optionalMode(parsed.endAlarmMode),
      color: optionalString(parsed.color),
    };
  } catch {
    return null;
  }
}

export interface ResolvedAlarmChain {
  file: "builtin" | "none" | string;
  fileSource: string;
  mode: AlarmMode;
  modeSource: string;
}

/**
 * 铃声解析链的前端镜像（与 Rust resolve_alarm 一致）。
 * 开始铃：事务 → 类型默认 → 全局默认 → 内置；
 * 结束铃：事务结束 → 事务开始 → 类型结束 → 类型 → 全局结束 → 全局 → 内置。
 */
export function resolveAlarmChain(
  kind: "start" | "end",
  entryType: EntryType,
  config: GlobalConfig,
): ResolvedAlarmChain {
  const typeFile =
    entryType === "normal" ? config.alarmNormalFile : config.alarmRestFile;
  const typeMode =
    entryType === "normal" ? config.alarmNormalMode : config.alarmRestMode;
  const typeEndFile =
    entryType === "normal" ? config.alarmNormalEndFile : config.alarmRestEndFile;
  const typeEndMode =
    entryType === "normal" ? config.alarmNormalEndMode : config.alarmRestEndMode;

  if (kind === "start") {
    const file = typeFile ?? config.alarmAllFile ?? "builtin";
    const fileSource = typeFile
      ? "sourceType"
      : config.alarmAllFile
        ? "sourceGlobal"
        : "sourceBuiltin";
    const mode = typeMode ?? config.alarmAllMode ?? "once";
    const modeSource = typeMode
      ? "sourceType"
      : config.alarmAllMode
        ? "sourceGlobal"
        : "sourceBuiltin";
    return { file, fileSource, mode, modeSource };
  }
  const file =
    typeEndFile ?? typeFile ?? config.alarmAllEndFile ?? config.alarmAllFile ?? "builtin";
  const fileSource = typeEndFile
    ? "sourceTypeEnd"
    : typeFile
      ? "sourceType"
      : config.alarmAllEndFile
        ? "sourceGlobalEnd"
        : config.alarmAllFile
          ? "sourceGlobal"
          : "sourceBuiltin";
  const mode =
    typeEndMode ?? typeMode ?? config.alarmAllEndMode ?? config.alarmAllMode ?? "once";
  const modeSource = typeEndMode
    ? "sourceTypeEnd"
    : typeMode
      ? "sourceType"
      : config.alarmAllEndMode
        ? "sourceGlobalEnd"
        : config.alarmAllMode
          ? "sourceGlobal"
          : "sourceBuiltin";
  return { file, fileSource, mode, modeSource };
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
