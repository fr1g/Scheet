import { SaveIcon, SettingIcon, CopyIcon, PasteIcon, RollbackIcon } from "tdesign-icons-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { GlobalConfig } from "../../types/global-config";
import type { FullPlan, WeekEntry } from "../../types/weeks";
import {
  resolveEntryColors,
  type EntryColorScheme,
  findConflicts,
  layoutDayEntries,
  minuteToHHMM,
  orderedWeekdays,
  planGlobalWindow,
  PX_PER_MINUTE as PX_PER_MINUTE_FALLBACK,
  resolveDayWindow,
  TIME_LABEL_MIN_HEIGHT,
  type PositionedEntry,
} from "../../lib/weekgrid";
import { useTranslation } from "react-i18next";
import { useShiftHeld } from "../WindowControls";
import { useHumanizeMinutes } from "../../i18n";
import { useToday } from "../../state/dateState";

interface WeekGridProps {
  plan: FullPlan;
  config: GlobalConfig;
  /** 解析好的事务默认色方案（周表覆盖 → 全局）。 */
  colorScheme: EntryColorScheme;
  /** 选中周表的展示名（双表时为 单周/双周，键名已解析）。 */
  displayName: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** 右键表头：打开当天设置菜单。 */
  onDayMenu?: (e: React.MouseEvent, weekday: number) => void;
  /** 当前选中的事务（高亮 + 复制目标）。 */
  selectedEntryId: number | null;
  /** 按下事务 cell：选中。 */
  onSelectEntry: (entryId: number | null) => void;
  /** 左键点击表头：设定粘贴目标天（null = 无）。 */
  onPasteTarget: (weekday: number | null) => void;
  pasteTargetWeekday: number | null;
  /** 剪贴板是否持有合法事务 JSON（聚焦窗口嗅探）。 */
  clipboardHasPlan: boolean;
  /** 复制选中事务到剪贴板。 */
  onCopy: () => void;
  /** 把剪贴板事务粘贴到粘贴目标天。 */
  onPaste: () => void;
  /** 放弃未保存的更改（恢复到上次保存）。 */
  onRevert: () => void;
  /** 拖拽/调整导致的事务变更（写入工作副本，随主保存入库）。 */
  onChangeEntries: (updater: (entries: WeekEntry[]) => WeekEntry[]) => void;
  /** 双击事务：打开编辑模态。 */
  onEditEntry?: (entry: WeekEntry) => void;
  /** 双击无安排空白：在对应时段新建事务。 */
  onCreateAt?: (weekday: number, startMinute: number) => void;
}

const HEADER_ROW_PX = 32; // thead 行高（h-8，含边框）
const TD_PADDING_PX = 8; // tbody td 上下内边距合计（p-1）
const MAX_DURATION_MINUTE = 1440;

type DragState =
  /** 拖动 cell 顶部边缘：调整开始时间（结束不变）。 */
  | {
    mode: "resize-start";
    entryId: number;
    dayStart: number;
    startY: number;
    baseStart: number;
    baseEnd: number;
    start: number;
  }
  /** 拖动 cell 底部边缘：调整结束时间（开始不变）。 */
  | {
    mode: "resize-end";
    entryId: number;
    startY: number;
    baseStart: number;
    baseEnd: number;
    end: number;
  }
  /** 拖动 cell 本体：保持时长重放（垂直）+ 换天（水平）。 */
  | {
    mode: "move";
    entryId: number;
    sourceWeekday: number;
    startX: number;
    startY: number;
    baseStart: number;
    duration: number;
    shift: number;
    targetDay: number | null;
  }
  /** 按住 cell 左右边缘横向拖拽：复制安排到其他天的同一时段。 */
  | { mode: "copy"; entryId: number; sourceWeekday: number; targetDay: number | null };

function dayFromPoint(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y);
  const value = el?.closest("[data-day]")?.getAttribute("data-day");
  return value == null ? null : Number(value);
}

function snap5(deltaPx: number, pxPerMinute: number): number {
  return Math.round(deltaPx / pxPerMinute / 5) * 5;
}

/**
 * 周表网格：表占满窗口高度，事务 cell 绝对定位（top=时间偏移×比例），
 * 冲突事务按泳道并排。所有列共用同一比例（取 7 天窗口的全局范围）。
 */
export default function WeekGrid({
  plan,
  config,
  colorScheme,
  displayName,
  dirty,
  saving,
  onSave,
  onDayMenu,
  selectedEntryId,
  onSelectEntry,
  onPasteTarget,
  pasteTargetWeekday,
  clipboardHasPlan,
  onCopy,
  onPaste,
  onRevert,
  onChangeEntries,
  onEditEntry,
  onCreateAt,
}: WeekGridProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapHeight, setWrapHeight] = useState(0);
  const { weekday: today } = useToday();
  const [hoverTime, setHoverTime] = useState<
    { day: number; topPx: number; label: string } | null
  >(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // 按住 Shift：cell 任意位置（含功能边）拖动 = 移动事务（极矮 cell 摸不到非功能区时用）
  const shiftHeld = useShiftHeld();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWrapHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const days = orderedWeekdays(config.firstDayOfWeek);
  const conflictIds = new Set<number>();
  for (const c of findConflicts(plan.entries)) {
    conflictIds.add(c.aId);
    conflictIds.add(c.bId);
  }

  const { start: globalStart, end: globalEnd } = planGlobalWindow(plan, config);
  const spanMinutes = Math.max(1, globalEnd - globalStart);
  const availablePx = Math.max(
    120,
    wrapHeight > 0 ? wrapHeight - HEADER_ROW_PX - TD_PADDING_PX : 0,
  );
  const pxPerMinute =
    wrapHeight > 0 ? availablePx / spanMinutes : PX_PER_MINUTE_FALLBACK;
  const dragTargetDay = drag && "targetDay" in drag ? drag.targetDay : null;

  // ============ 拖拽状态机 ============

  const startMoveDrag = (e: React.PointerEvent, entry: WeekEntry) => {
    if (e.button !== 0) return;
    onSelectEntry(entry.id);
    setDrag({
      mode: "move",
      entryId: entry.id,
      sourceWeekday: entry.weekday,
      startX: e.clientX,
      startY: e.clientY,
      baseStart: entry.startMinute,
      duration: entry.durationMinute,
      shift: 0,
      targetDay: null,
    });
  };

  const startResizeDrag = (
    e: React.PointerEvent,
    entry: WeekEntry,
    which: "start" | "end",
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const { dayStart } = resolveDayWindow(plan, entry.weekday, config);
    if (which === "start") {
      setDrag({
        mode: "resize-start",
        entryId: entry.id,
        dayStart,
        startY: e.clientY,
        baseStart: entry.startMinute,
        baseEnd: entry.startMinute + entry.durationMinute,
        start: entry.startMinute,
      });
    } else {
      setDrag({
        mode: "resize-end",
        entryId: entry.id,
        startY: e.clientY,
        baseStart: entry.startMinute,
        baseEnd: entry.startMinute + entry.durationMinute,
        end: entry.startMinute + entry.durationMinute,
      });
    }
  };

  const startCopyDrag = (e: React.PointerEvent, entry: WeekEntry) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDrag({
      mode: "copy",
      entryId: entry.id,
      sourceWeekday: entry.weekday,
      targetDay: null,
    });
  };

  useEffect(() => {
    if (!drag) return;

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor =
      drag.mode === "resize-start" || drag.mode === "resize-end"
        ? "ns-resize"
        : drag.mode === "copy"
          ? "copy"
          : "grabbing";

    const onPointerMove = (e: PointerEvent) => {
      if (drag.mode === "resize-start") {
        // 拖顶部：改开始时间，结束不变；至少保留 5 分钟
        const start = Math.max(
          drag.dayStart,
          Math.min(
            drag.baseEnd - 5,
            drag.baseStart + snap5(e.clientY - drag.startY, pxPerMinute),
          ),
        );
        if (start !== drag.start) {
          setDrag({ ...drag, start });
          onChangeEntries((entries) =>
            entries.map((x) =>
              x.id === drag.entryId
                ? { ...x, startMinute: start, durationMinute: drag.baseEnd - start }
                : x,
            ),
          );
        }
        return;
      }
      if (drag.mode === "resize-end") {
        // 拖底部：改结束时间（允许溢出当天结束时间，最长一整天）
        const end = Math.min(
          drag.baseStart + MAX_DURATION_MINUTE,
          Math.max(
            drag.baseStart + 5,
            drag.baseEnd + snap5(e.clientY - drag.startY, pxPerMinute),
          ),
        );
        if (end !== drag.end) {
          setDrag({ ...drag, end });
          onChangeEntries((entries) =>
            entries.map((x) =>
              x.id === drag.entryId ? { ...x, durationMinute: end - drag.baseStart } : x,
            ),
          );
        }
        return;
      }
      if (drag.mode === "copy") {
        const targetDay = dayFromPoint(e.clientX, e.clientY);
        if (targetDay !== drag.targetDay) {
          setDrag({ ...drag, targetDay });
        }
        return;
      }
      // move：垂直=当天内重放（保持时长），水平=换天
      const shift = snap5(e.clientY - drag.startY, pxPerMinute);
      const targetDay = dayFromPoint(e.clientX, e.clientY);
      if (shift !== drag.shift || targetDay !== drag.targetDay) {
        setDrag({ ...drag, shift, targetDay });
        const day = targetDay ?? drag.sourceWeekday;
        const window = resolveDayWindow(plan, day, config);
        const start = Math.max(
          window.dayStart,
          Math.min(
            Math.max(window.dayStart, window.dayEnd - drag.duration),
            drag.baseStart + shift,
          ),
        );
        onChangeEntries((entries) =>
          entries.map((x) =>
            x.id === drag.entryId ? { ...x, startMinute: start, weekday: day } : x,
          ),
        );
      }
    };

    const onPointerUp = () => {
      if (
        drag.mode === "copy" &&
        drag.targetDay != null &&
        drag.targetDay !== drag.sourceWeekday
      ) {
        const source = plan.entries.find((x) => x.id === drag.entryId);
        if (source) {
          const copy: WeekEntry = {
            ...source,
            id: Math.min(0, ...plan.entries.map((x) => x.id)) - 1,
            weekday: drag.targetDay,
          };
          onChangeEntries((entries) => [...entries, copy]);
        }
      }
      setDrag(null);
    };

    const onPointerCancel = () => setDrag(null);

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      document.body.style.cursor = prevCursor;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };

  }, [drag, pxPerMinute, plan, config, onChangeEntries]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-600 px-3 py-1.5">
        <h1 className="text-sm text-zinc-100">{displayName}</h1>
        {dirty && (
          <>
            <span className="animate-pulse rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-300">
              {t("topbar.unsaved")}
            </span>
            <button
              type="button"
              onClick={onRevert}
              title={t("topbar.revertTitle")}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
            >
              <RollbackIcon size="13px" />
              {t("topbar.revert")}
            </button>
          </>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => navigate("/settings")}
          title={t("topbar.settings")}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          <SettingIcon size="15px" />
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={selectedEntryId == null}
          title={t("topbar.copyTitle")}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
        >
          <CopyIcon size="13px" />
          {t("topbar.copy")}
        </button>
        <button
          type="button"
          onClick={onPaste}
          disabled={pasteTargetWeekday == null || !clipboardHasPlan}
          title={t("topbar.pasteTitle")}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
        >
          <PasteIcon size="13px" />
          {t("topbar.paste")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
        >
          <SaveIcon size="13px" />
          {t("topbar.save")}
        </button>
      </div>

      <div
        ref={wrapRef}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <table
          className="h-full w-full min-w-[840px] table-fixed border-collapse"
          style={wrapHeight > 0 ? { height: wrapHeight } : undefined}
        >
          <thead>
            <tr>
              {days.map((d) => (
                <th
                  key={d}
                  onClick={() => {
                    if (!clipboardHasPlan) return;
                    onPasteTarget(pasteTargetWeekday === d ? null : d);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onDayMenu?.(e, d);
                  }}
                  title={
                    pasteTargetWeekday === d
                      ? t("grid.pasteTargetCancel")
                      : clipboardHasPlan
                        ? t("grid.headerReady")
                        : t("grid.headerEmpty")
                  }
                  className={`h-8 border border-zinc-600 px-2 text-left text-xs font-normal text-zinc-100 transition-colors ${pasteTargetWeekday === d || dragTargetDay === d
                    ? "bg-zinc-600/70"
                    : clipboardHasPlan
                      ? "cursor-pointer"
                      : "cursor-default"
                    }`}
                >
                  {t(`days.${d}`)}
                  {d === today && (
                    <span className="ml-1 text-[10px] text-blue-300">{t("grid.today")}</span>
                  )}
                  {pasteTargetWeekday === d && (
                    <span className="ml-1 text-[10px] text-emerald-300">
                      {t("grid.pasteTarget")}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {days.map((d) => {
                const { dayStart, dayEnd } = resolveDayWindow(plan, d, config);
                const positioned = layoutDayEntries(
                  plan.entries,
                  d,
                  dayStart,
                  dayEnd,
                  pxPerMinute,
                );
                return (
                  <td key={d} data-day={d} className="border border-zinc-600 align-top px-0.5">
                    <div
                      className="relative h-full overflow-hidden "
                      title={t("grid.newHere")}
                      onPointerMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const minute =
                          dayStart + (e.clientY - rect.top) / pxPerMinute;
                        const floored = Math.max(
                          dayStart,
                          Math.min(dayEnd, Math.floor(minute / 30) * 30),
                        );
                        setHoverTime({
                          day: d,
                          topPx: (floored - dayStart) * pxPerMinute,
                          label: minuteToHHMM(floored),
                        });
                      }}
                      onPointerLeave={() => setHoverTime(null)}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-entry]")) return;
                        onSelectEntry(null);
                      }}
                      onDoubleClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-entry]")) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const minute = Math.min(
                          dayEnd - 5,
                          Math.max(
                            dayStart,
                            dayStart +
                            Math.floor((e.clientY - rect.top) / pxPerMinute / 5) * 5,
                          ),
                        );
                        onCreateAt?.(d, minute);
                      }}
                    >
                      {/* 底层标记当天的开始/结束时间（无安排区域可见，被事务 cell 覆盖） */}
                      <span className="pointer-events-none absolute left-1 top-0.5 z-0 text-[10px] leading-3 text-zinc-500">
                        {minuteToHHMM(dayStart)}
                      </span>
                      <span className="pointer-events-none absolute bottom-0.5 left-1 z-0 text-[10px] leading-3 text-zinc-500">
                        {minuteToHHMM(dayEnd)}
                      </span>
                      {dayStart <= 720 && 720 < dayEnd && (
                        <div
                          className="pointer-events-none absolute inset-x-0 z-0 border-t border-dashed border-zinc-500/40"
                          style={{ top: (720 - dayStart) * pxPerMinute }}
                        >
                          <span className="absolute right-1 -top-2 text-[10px] leading-3 text-zinc-500">
                            12:00
                          </span>
                        </div>
                      )}
                      {hoverTime?.day === d && !drag && (
                        <div
                          className="pointer-events-none absolute inset-x-0 z-20 flex justify-end"
                          style={{ top: hoverTime.topPx }}
                        >
                          <span className="-translate-y-1/2 rounded bg-zinc-950/85 px-1 text-[10px] leading-4 text-zinc-100">
                            {hoverTime.label}
                          </span>
                        </div>
                      )}
                      {positioned.map((p) => (
                        <div
                          key={p.entry.id}
                          data-entry
                          className="absolute z-10 px-px py-px"
                          style={{
                            top: p.topPx,
                            height: p.heightPx,
                            left: `${(p.lane * 100) / p.lanes}%`,
                            width: `${100 / p.lanes}%`,
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            onEditEntry?.(p.entry);
                          }}
                        >
                          <EntryCell
                            p={p}
                            conflicted={conflictIds.has(p.entry.id)}
                            selected={selectedEntryId === p.entry.id}
                            dragging={drag?.entryId === p.entry.id}
                            colorScheme={colorScheme}
                            shiftHeld={shiftHeld}
                            onBodyPointerDown={(e) => startMoveDrag(e, p.entry)}
                            onCopyPointerDown={(e) => startCopyDrag(e, p.entry)}
                            onResizeStartDown={(e) =>
                              startResizeDrag(e, p.entry, "start")
                            }
                            onResizeEndDown={(e) =>
                              startResizeDrag(e, p.entry, "end")
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 事务 cell：主体=移动（重放/换天），上/下边缘=调开始/结束，左/右边缘=复制安排。 */
function EntryCell({
  p,
  conflicted,
  selected,
  dragging,
  colorScheme,
  shiftHeld,
  onBodyPointerDown,
  onCopyPointerDown,
  onResizeStartDown,
  onResizeEndDown,
}: {
  p: PositionedEntry;
  conflicted: boolean;
  selected: boolean;
  dragging: boolean;
  colorScheme: EntryColorScheme;
  /** 按住 Shift：功能边临时变为移动手柄。 */
  shiftHeld: boolean;
  onBodyPointerDown: (e: React.PointerEvent) => void;
  onCopyPointerDown: (e: React.PointerEvent) => void;
  onResizeStartDown: (e: React.PointerEvent) => void;
  onResizeEndDown: (e: React.PointerEvent) => void;
}) {
  const { t } = useTranslation();
  const humanize = useHumanizeMinutes();
  const entry = p.entry;
  const entryColors = resolveEntryColors(
    entry.entryType,
    entry.color,
    entry.textDark,
    colorScheme,
  );
  // 起止时间是次级信息：跟随标题的深浅，但带透明降一档层次
  const timeColor = entryColors.textDark ? "text-zinc-900/70" : "text-zinc-300";
  const showTimes = p.heightPx - 2 >= TIME_LABEL_MIN_HEIGHT;
  const outline = conflicted
    ? "outline outline-2 outline-red-500"
    : p.overflow
      ? "outline outline-2 outline-amber-400"
      : "";
  const selectionRing = selected ? "ring-2 ring-zinc-100/80" : "";
  const typeLabel = entry.entryType === "normal" ? t("grid.normal") : t("grid.rest");
  const realEnd = entry.startMinute + entry.durationMinute;
  const h = p.heightPx;
  // 极矮 cell（≤10px）：标题放不下，改横向显示起止时间区间，随高度等比缩放
  const compact = h <= 10;
  const compactScale = h / 16;
  // 偏矮 cell（<26px）：标题等比缩小（26px 处恢复原大）
  const titleScale = h < 26 ? h / 26 : 1;
  const content = compact
    ? `${minuteToHHMM(entry.startMinute)}~${minuteToHHMM(realEnd)}`
    : entry.title || typeLabel;
  const scale = compact ? compactScale : titleScale;
  const tooltip =
    t("grid.tooltip", {
      start: minuteToHHMM(entry.startMinute),
      end: minuteToHHMM(realEnd),
      duration: humanize(entry.durationMinute),
      title: entry.title || typeLabel,
    }) +
    (entry.entryType === "rest" ? ` (${typeLabel})` : "") +
    (p.overflow ? t("grid.overflow") : "");
  const handle =
    "absolute z-10 opacity-0 transition-colors group-hover:bg-zinc-100/25 group-hover:opacity-100";

  return (
    <div
      title={tooltip}
      style={{
        background: entryColors.background,
      }}
      onPointerDown={onBodyPointerDown}
      className={`group relative flex h-full w-full flex-col overflow-hidden rounded-xl px-2 text-xs text-zinc-100 ${outline} ${selectionRing} ${dragging ? "cursor-grabbing" : "cursor-move"
        }`}
    >
      <div
        onPointerDown={shiftHeld ? onBodyPointerDown : onResizeStartDown}
        title={`${tooltip}
${t("grid.resizeStart")}`}
        className={`inset-x-0 top-0 h-1.5 rounded-t-xl ${shiftHeld ? "cursor-move" : "cursor-ns-resize"} ${handle}`}
      />
      <div
        onPointerDown={shiftHeld ? onBodyPointerDown : onResizeEndDown}
        title={`${tooltip}
${t("grid.resizeEnd")}`}
        className={`inset-x-0 bottom-0 h-1.5 rounded-b-xl ${shiftHeld ? "cursor-move" : "cursor-ns-resize"} ${handle}`}
      />
      <div
        onPointerDown={shiftHeld ? onBodyPointerDown : onCopyPointerDown}
        title={`${tooltip}
${t("grid.copyEdge")}`}
        className={`inset-y-0 left-0 w-1.5 rounded-l-xl ${shiftHeld ? "cursor-move" : "cursor-ew-resize"} ${handle}`}
      />
      <div
        onPointerDown={shiftHeld ? onBodyPointerDown : onCopyPointerDown}
        title={`${tooltip}
${t("grid.copyEdge")}`}
        className={`inset-y-0 right-0 w-1.5 rounded-r-xl ${shiftHeld ? "cursor-move" : "cursor-ew-resize"} ${handle}`}
      />
      {entry.notes && (
        <span
          title={t("entry.notes")}
          className={`pointer-events-none absolute right-0.5 top-0.5 size-1.5 rounded-full ${
            entryColors.textDark ? "bg-zinc-900" : "bg-zinc-50"
          }`}
        />
      )}
      {entry.entryType === "rest" && (
        <span
          title={typeLabel}
          className={`pointer-events-none absolute bottom-0.5 left-1 size-1.5 rounded-full ${
            entryColors.textDark ? "bg-zinc-900" : "bg-zinc-50"
          }`}
        />
      )}
      {showTimes && (
        <span className={`text-left text-[9px] leading-3 ${timeColor}`}>
          {minuteToHHMM(entry.startMinute)}
        </span>
      )}
      <div className="grid min-h-0 grow place-items-center -translate-y-px">
        <span
          className={`text-center leading-tight ${entry.entryType === "normal" ? "font-semibold" : ""
            } ${entryColors.textDark
              ? "text-zinc-900"
              : "text-zinc-100"
            } ${compact ? "whitespace-nowrap" : ""}`}
          style={{ transform: `scale(${scale})` }}
        >
          {content}
        </span>
      </div>
      {showTimes && (
        <span className={`text-right text-[9px] leading-3 ${timeColor}`}>
          {minuteToHHMM(realEnd)}
        </span>
      )}
    </div>
  );
}
