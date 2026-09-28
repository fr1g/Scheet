import { SaveIcon, SettingIcon } from "tdesign-icons-react";
import { useNavigate } from "react-router-dom";
import type { GlobalConfig } from "../../types/global-config";
import type { FullPlan } from "../../types/weeks";
import {
  buildDayCells,
  entryBackground,
  findConflicts,
  minuteToHHMM,
  orderedWeekdays,
  PX_PER_MINUTE,
  resolveDayWindow,
  TIME_LABEL_MIN_HEIGHT,
  todayWeekday,
  weekdayLabel,
  type DayCellModel,
} from "../../lib/weekgrid";

interface WeekGridProps {
  plan: FullPlan;
  config: GlobalConfig;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

/** 周表网格：顶栏（保存/设置）+ 7 天列（表头 sticky + flex 顺排事务列）。 */
export default function WeekGrid({
  plan,
  config,
  dirty,
  saving,
  onSave,
}: WeekGridProps) {
  const navigate = useNavigate();
  const days = orderedWeekdays(config.firstDayOfWeek);
  const today = todayWeekday();
  const conflictIds = new Set<number>();
  for (const c of findConflicts(plan.entries)) {
    conflictIds.add(c.aId);
    conflictIds.add(c.bId);
  }

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
          onClick={onSave}
          disabled={!dirty || saving}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
        >
          <SaveIcon size="13px" />
          保存
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-zinc-700">
            <tr>
              {days.map((d) => (
                <th
                  key={d}
                  className="border border-zinc-600 px-2 py-1 text-left text-xs font-normal text-zinc-100"
                >
                  {weekdayLabel(d)}
                  {d === today && (
                    <span className="ml-1 text-[10px] text-blue-300">今天</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {days.map((d) => {
                const { dayStart, dayEnd } = resolveDayWindow(plan, d, config);
                const cells = buildDayCells(plan.entries, d, dayStart, dayEnd);
                return (
                  <td key={d} className="border border-zinc-600 p-1 align-top">
                    <div
                      className="flex flex-col gap-0.5"
                      style={{ height: (dayEnd - dayStart) * PX_PER_MINUTE }}
                    >
                      {cells.map((cell, i) =>
                        cell.kind === "unplanned" ? (
                          <div
                            key={i}
                            className="rounded-xl opacity-0"
                            style={{ height: cell.heightPx }}
                          />
                        ) : (
                          <EntryCell
                            key={i}
                            cell={cell}
                            conflicted={conflictIds.has(cell.entry!.id)}
                          />
                        ),
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

function EntryCell({
  cell,
  conflicted,
}: {
  cell: DayCellModel;
  conflicted: boolean;
}) {
  const entry = cell.entry!;
  const showTimes = cell.heightPx >= TIME_LABEL_MIN_HEIGHT;
  const outline = conflicted
    ? "outline outline-2 outline-red-500"
    : cell.overflow
      ? "outline outline-2 outline-amber-400"
      : "";
  const typeLabel = entry.entryType === "normal" ? "普通事务" : "休息事务";
  const tooltip = `${minuteToHHMM(cell.startMinute)}~${minuteToHHMM(cell.realEndMinute)} ${
    entry.title || typeLabel
  }${cell.overflow ? "（超出当天结束时间）" : ""}`;

  return (
    <div
      title={tooltip}
      style={{ height: cell.heightPx, background: entryBackground(entry) }}
      className={`flex flex-col overflow-hidden rounded-xl px-2 py-1 text-xs text-zinc-100 ${outline}`}
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
