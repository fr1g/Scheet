import { SaveIcon, SettingIcon, CopyIcon, PasteIcon } from "tdesign-icons-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { GlobalConfig } from "../../types/global-config";
import type { FullPlan, WeekEntry } from "../../types/weeks";
import {
  buildDayCells,
  entryBackground,
  findConflicts,
  humanizeMinutes,
  minuteToHHMM,
  orderedWeekdays,
  planGlobalWindow,
  PX_PER_MINUTE as PX_PER_MINUTE_FALLBACK,
  resolveDayWindow,
  TIME_LABEL_MIN_HEIGHT,
  weekdayLabel,
  type DayCellModel,
} from "../../lib/weekgrid";
import { useToday } from "../../state/dateState";

interface WeekGridProps {
  plan: FullPlan;
  config: GlobalConfig;
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
  /** 拖拽/调整导致的事务变更（写入工作副本，随主保存入库）。 */
  onChangeEntries: (updater: (entries: WeekEntry[]) => WeekEntry[]) => void;
  /** 双击事务：打开编辑模态。 */
  onEditEntry?: (entry: WeekEntry) => void;
  /** 双击无安排区域：在该时段新建事务。 */
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
  /** 拖动 cell 本体：保持时长在当天任意时段重放（垂直）+ 换天（水平）。 */
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
 * 周表网格：表占满窗口高度，cell 高度按 窗口高度/全天分钟数 动态比例。
 * 所有列共用同一比例（取 7 天窗口的全局范围），保证跨列时间对齐；
 * 个别天窗口不同时以首尾透明垫片补齐。
 */
export default function WeekGrid({
  plan,
  config,
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
  onChangeEntries,
  onEditEntry,
  onCreateAt,
}: WeekGridProps) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapHeight, setWrapHeight] = useState(0);
  const { weekday: today } = useToday();
  const [drag, setDrag] = useState<DragState | null>(null);

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
    dragMovedReset();
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
          Math.min(drag.baseEnd - 5, drag.baseStart + snap5(e.clientY - drag.startY, pxPerMinute)),
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
          Math.max(drag.baseStart + 5, drag.baseEnd + snap5(e.clientY - drag.startY, pxPerMinute)),
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
            x.id === drag.entryId
              ? { ...x, startMinute: start, weekday: day }
              : x,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, pxPerMinute, plan, config, onChangeEntries]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-600 px-3 py-1.5">
        <h1 className="text-sm text-zinc-100">{plan.plan.name}</h1>
        {dirty && (
          <span className="animate-pulse rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-300">
            未保存更改 ●
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => navigate("/settings")}
          title="设置"
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          <SettingIcon size="15px" />
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={selectedEntryId == null}
          title="复制选中事务 (Ctrl+C)"
          className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
        >
          <CopyIcon size="13px" />
          复制
        </button>
        <button
          type="button"
          onClick={onPaste}
          disabled={pasteTargetWeekday == null || !clipboardHasPlan}
          title="粘贴到粘贴目标天 (Ctrl+V)"
          className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
        >
          <PasteIcon size="13px" />
          粘贴
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
        >
          <SaveIcon size="13px" />
          保存
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
                      ? "粘贴目标（点击取消）"
                      : clipboardHasPlan
                        ? "左键设为粘贴目标，右键打开当天设置"
                        : "剪贴板中没有事务内容，聚焦窗口后自动检测"
                  }
                  className={`h-8 border border-zinc-600 px-2 text-left text-xs font-normal text-zinc-100 transition-colors ${
                    pasteTargetWeekday === d || dragTargetDay === d
                      ? "bg-zinc-600/70"
                      : clipboardHasPlan
                        ? "cursor-pointer"
                        : "cursor-default"
                  }`}
                >
                  {weekdayLabel(d)}
                  {d === today && (
                    <span className="ml-1 text-[10px] text-blue-300">今天</span>
                  )}
                  {pasteTargetWeekday === d && (
                    <span className="ml-1 text-[10px] text-emerald-300">
                      粘贴目标
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
                const cells = buildDayCells(
                  plan.entries,
                  d,
                  dayStart,
                  dayEnd,
                  pxPerMinute,
                );
                const leading = (dayStart - globalStart) * pxPerMinute;
                const trailing = (globalEnd - dayEnd) * pxPerMinute;
                return (
                  <td key={d} data-day={d} className="border border-zinc-600 p-1 align-top">
                    <div className="relative flex h-full flex-col overflow-hidden">
                      {/* 底层标记当天的开始/结束时间（无安排区域可见，被事务 cell 覆盖） */}
                      <span className="pointer-events-none absolute left-1 top-0.5 z-0 text-[10px] leading-3 text-zinc-500">
                        {minuteToHHMM(dayStart)}
                      </span>
                      <span className="pointer-events-none absolute bottom-0.5 left-1 z-0 text-[10px] leading-3 text-zinc-500">
                        {minuteToHHMM(dayEnd)}
                      </span>
                      {leading > 0 && (
                        <div className="shrink-0 py-px" style={{ height: leading }} />
                      )}
                      {cells.map((cell, i) =>
                        cell.kind === "unplanned" ? (
                          <div
                            key={i}
                            className="shrink-0 py-px"
                            style={{ height: cell.heightPx }}
                            onClick={() => onSelectEntry(null)}
                            onDoubleClick={() => onCreateAt?.(d, cell.startMinute)}
                            title="双击在此新建事务"
                          >
                            <div className="h-full rounded-xl opacity-0" />
                          </div>
                        ) : (
                          <div
                            key={i}
                            className="relative z-10 shrink-0 py-px"
                            style={{ height: cell.heightPx }}
                            onDoubleClick={() => onEditEntry?.(cell.entry!)}
                          >
                            <EntryCell
                              cell={cell}
                              conflicted={conflictIds.has(cell.entry!.id)}
                              selected={selectedEntryId === cell.entry!.id}
                              dragging={drag?.entryId === cell.entry!.id}
                              onBodyPointerDown={(e) => startMoveDrag(e, cell.entry!)}
                              onCopyPointerDown={(e) => startCopyDrag(e, cell.entry!)}
                              onResizeStartDown={(e) =>
                                startResizeDrag(e, cell.entry!, "start")
                              }
                              onResizeEndDown={(e) =>
                                startResizeDrag(e, cell.entry!, "end")
                              }
                            />
                          </div>
                        ),
                      )}
                      {trailing > 0 && (
                        <div className="shrink-0 py-px" style={{ height: trailing }} />
                      )}
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

function dragMovedReset(): void {
  /* 预留：如需在 resize 后抑制双击可在此扩展 */
}

/** 事务 cell：主体=移动（重放/换天），四边=调整（上开始/下结束）或复制（左右）。 */
function EntryCell({
  cell,
  conflicted,
  selected,
  dragging,
  onBodyPointerDown,
  onCopyPointerDown,
  onResizeStartDown,
  onResizeEndDown,
}: {
  cell: DayCellModel;
  conflicted: boolean;
  selected: boolean;
  dragging: boolean;
  onBodyPointerDown: (e: React.PointerEvent) => void;
  onCopyPointerDown: (e: React.PointerEvent) => void;
  onResizeStartDown: (e: React.PointerEvent) => void;
  onResizeEndDown: (e: React.PointerEvent) => void;
}) {
  const entry = cell.entry!;
  const showTimes = cell.heightPx - 2 >= TIME_LABEL_MIN_HEIGHT;
  const outline = conflicted
    ? "outline outline-2 outline-red-500"
    : cell.overflow
      ? "outline outline-2 outline-amber-400"
      : "";
  const selectionRing = selected ? "ring-2 ring-zinc-100/80" : "";
  const typeLabel = entry.entryType === "normal" ? "普通事务" : "休息事务";
  const tooltip = `${minuteToHHMM(cell.startMinute)}~${minuteToHHMM(cell.realEndMinute)} · 时长 ${humanizeMinutes(
    entry.durationMinute,
  )} · ${entry.title || typeLabel}${cell.overflow ? "（超出当天结束时间）" : ""}`;
  const handle =
    "absolute z-10 opacity-0 transition-colors group-hover:bg-zinc-100/25 group-hover:opacity-100";

  return (
    <div
      title={tooltip}
      style={{ background: entryBackground(entry) }}
      onPointerDown={onBodyPointerDown}
      className={`group relative h-full w-full flex flex-col overflow-hidden rounded-xl px-2 py-1 text-xs text-zinc-100 ${outline} ${selectionRing} ${
        dragging ? "cursor-grabbing" : "cursor-move"
      }`}
    >
      <div
        onPointerDown={onResizeStartDown}
        title="拖动调整开始时间"
        className={`inset-x-0 top-0 h-1.5 cursor-ns-resize rounded-t-xl ${handle}`}
      />
      <div
        onPointerDown={onResizeEndDown}
        title="拖动调整结束时间"
        className={`inset-x-0 bottom-0 h-1.5 cursor-ns-resize rounded-b-xl ${handle}`}
      />
      <div
        onPointerDown={onCopyPointerDown}
        title="横向拖动：复制安排到其他天的同一时段"
        className={`inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-xl ${handle}`}
      />
      <div
        onPointerDown={onCopyPointerDown}
        title="横向拖动：复制安排到其他天的同一时段"
        className={`inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-xl ${handle}`}
      />
      {showTimes && (
        <span className="text-[10px] leading-3 text-zinc-300">
          {minuteToHHMM(cell.startMinute)}
        </span>
      )}
      <span className="grid grow place-items-center text-center leading-tight">
        {entry.title || typeLabel}
      </span>
      {showTimes && (
        <span className="text-[10px] leading-3 text-zinc-300">
          {minuteToHHMM(cell.realEndMinute)}
        </span>
      )}
    </div>
  );
}
