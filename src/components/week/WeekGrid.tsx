import { SaveIcon, SettingIcon, CopyIcon, PasteIcon } from "tdesign-icons-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { GlobalConfig } from "../../types/global-config";
import type { FullPlan } from "../../types/weeks";
import {
  buildDayCells,
  entryBackground,
  findConflicts,
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
  /** 左键点击事务 cell：选中/取消。 */
  onSelectEntry: (entryId: number | null) => void;
  /** 左键点击表头：设定粘贴目标天（null = 无）。 */
  onPasteTarget: (weekday: number | null) => void;
  pasteTargetWeekday: number | null;
  /** 复制选中事务到剪贴板。 */
  onCopy: () => void;
  /** 把剪贴板事务粘贴到粘贴目标天。 */
  onPaste: () => void;
}

/** thead 行高（h-8，含边框）。 */
const HEADER_ROW_PX = 32;
/** tbody td 的上下内边距合计（p-1）。 */
const TD_PADDING_PX = 8;

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
  onCopy,
  onPaste,
}: WeekGridProps) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapHeight, setWrapHeight] = useState(0);
  const { weekday: today } = useToday();

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-600 px-3 py-1.5">
        <h1 className="text-sm text-zinc-100">{plan.plan.name}</h1>
        {dirty && <span className="text-xs text-zinc-400">未保存 ●</span>}
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
          disabled={pasteTargetWeekday == null}
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
                  onClick={() => onPasteTarget(pasteTargetWeekday === d ? null : d)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onDayMenu?.(e, d);
                  }}
                  title={pasteTargetWeekday === d ? "粘贴目标（点击取消）" : "左键设为粘贴目标，右键打开当天设置"}
                  className={`h-8 border border-zinc-600 px-2 text-left text-xs font-normal text-zinc-100 transition-colors ${
                    pasteTargetWeekday === d ? "cursor-pointer bg-zinc-600/70" : "cursor-pointer"
                  }`}
                >
                  {weekdayLabel(d)}
                  {d === today && (
                    <span className="ml-1 text-[10px] text-blue-300">今天</span>
                  )}
                  {pasteTargetWeekday === d && (
                    <span className="ml-1 text-[10px] text-emerald-300">粘贴目标</span>
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
                  <td key={d} className="border border-zinc-600 p-1 align-top">
                    <div className="flex h-full flex-col overflow-hidden">
                      {leading > 0 && (
                        <div
                          className="shrink-0 py-px"
                          style={{ height: leading }}
                        />
                      )}
                      {cells.map((cell, i) =>
                        cell.kind === "unplanned" ? (
                          <div
                            key={i}
                            className="shrink-0 py-px"
                            style={{ height: cell.heightPx }}
                            onClick={() => onSelectEntry(null)}
                          >
                            <div className="h-full rounded-xl opacity-0" />
                          </div>
                        ) : (
                          <div
                            key={i}
                            className="shrink-0 py-px"
                            style={{ height: cell.heightPx }}
                            onClick={() => onSelectEntry(cell.entry!.id)}
                          >
                            <EntryCell
                              cell={cell}
                              conflicted={conflictIds.has(cell.entry!.id)}
                              selected={selectedEntryId === cell.entry!.id}
                            />
                          </div>
                        ),
                      )}
                      {trailing > 0 && (
                        <div
                          className="shrink-0 py-px"
                          style={{ height: trailing }}
                        />
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

/** 每个 cell 的占位槽：槽高=分钟比例高度，内层留 1px 垂直缝形成卡片间隔。 */
function EntryCell({
  cell,
  conflicted,
  selected,
}: {
  cell: DayCellModel;
  conflicted: boolean;
  selected: boolean;
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
  const tooltip = `${minuteToHHMM(cell.startMinute)}~${minuteToHHMM(cell.realEndMinute)} ${
    entry.title || typeLabel
  }${cell.overflow ? "（超出当天结束时间）" : ""}`;

  return (
    <div
      title={tooltip}
      style={{ background: entryBackground(entry) }}
      className={`h-full w-full flex flex-col overflow-hidden rounded-xl px-2 py-1 text-xs text-zinc-100 ${outline} ${selectionRing}`}
    >
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
