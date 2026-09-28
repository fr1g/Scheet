import { useState } from "react";
import {
  minuteToTimeInput,
  timeInputToMinute,
  weekdayLabel,
} from "../../lib/weekgrid";
import { DialogShell, TimeField } from "./PlanSettingsDialog";

interface DaySettingsDialogProps {
  weekday: number;
  /** 打开时该天已有的覆盖值（无则 null）。 */
  initialStart: number | null;
  initialEnd: number | null;
  onClose: () => void;
  /** 确认后写入工作副本的日覆盖；两个值都为 null 表示移除覆盖。 */
  onConfirm: (dayStart: number | null, dayEnd: number | null) => void;
}

/** 当天设置：覆盖该天的一天起止时间（留空=清除该级覆盖）。 */
export default function DaySettingsDialog({
  weekday,
  initialStart,
  initialEnd,
  onClose,
  onConfirm,
}: DaySettingsDialogProps) {
  const [start, setStart] = useState(minuteToTimeInput(initialStart));
  const [end, setEnd] = useState(minuteToTimeInput(initialEnd));

  const startMinute = timeInputToMinute(start);
  const endMinute = timeInputToMinute(end);
  const timesOk =
    !Number.isNaN(startMinute) &&
    !Number.isNaN(endMinute) &&
    (startMinute == null || startMinute % 5 === 0) &&
    (endMinute == null || endMinute % 5 === 0) &&
    (startMinute == null || endMinute == null || startMinute < endMinute);

  return (
    <DialogShell
      title={`${weekdayLabel(weekday)} · 当天设置`}
      onClose={onClose}
      canConfirm={timesOk}
      onConfirm={() => onConfirm(startMinute, endMinute)}
      confirmText="保存到工作副本"
    >
      <div className="grid grid-cols-2 gap-3">
        <TimeField label="一天开始（留空清除覆盖）" value={start} onChange={setStart} />
        <TimeField label="一天结束（留空清除覆盖）" value={end} onChange={setEnd} />
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        覆盖优先级：当天 → 周表 → 全局设置；随主保存按钮一并入库。
      </p>
    </DialogShell>
  );
}
