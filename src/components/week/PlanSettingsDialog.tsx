import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useState } from "react";
import {
  minuteToTimeInput,
  timeInputToMinute,
} from "../../lib/weekgrid";
import type { WeekPlan } from "../../types/weeks";

interface PlanSettingsDialogProps {
  plan: WeekPlan;
  onClose: () => void;
  /** 确认后只修改工作副本，随主保存按钮统一入库。 */
  onConfirm: (name: string, dayStart: number | null, dayEnd: number | null) => void;
}

/** 周表设置：名称 + 周表级一天起止时间（留空继承全局）。 */
export default function PlanSettingsDialog({
  plan,
  onClose,
  onConfirm,
}: PlanSettingsDialogProps) {
  const [name, setName] = useState(plan.name);
  const [start, setStart] = useState(minuteToTimeInput(plan.dayStartMinute));
  const [end, setEnd] = useState(minuteToTimeInput(plan.dayEndMinute));

  const startMinute = timeInputToMinute(start);
  const endMinute = timeInputToMinute(end);
  const nameOk = name.trim().length > 0;
  const timesOk =
    !Number.isNaN(startMinute) &&
    !Number.isNaN(endMinute) &&
    (startMinute == null || startMinute % 5 === 0) &&
    (endMinute == null || endMinute % 5 === 0) &&
    (startMinute == null || endMinute == null || startMinute < endMinute);
  const canConfirm = nameOk && timesOk;

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm(name.trim(), startMinute, endMinute);
  };

  return (
    <DialogShell title="周表设置" onClose={onClose} onConfirm={confirm} canConfirm={canConfirm}>
      <label className="block text-xs text-zinc-300">
        名称
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <TimeField label="一天开始（留空继承全局）" value={start} onChange={setStart} />
        <TimeField label="一天结束（留空继承全局）" value={end} onChange={setEnd} />
      </div>
    </DialogShell>
  );
}

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-zinc-300">
      {label}
      <input
        type="time"
        step={300}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400"
      />
    </label>
  );
}

/** 通用的模态外壳（HeadlessUI Dialog）。 */
export function DialogShell({
  title,
  children,
  onClose,
  onConfirm,
  canConfirm = true,
  confirmText = "确定",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  canConfirm?: boolean;
  confirmText?: string;
}) {
  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl border border-zinc-600 bg-zinc-800 p-4">
          <DialogTitle className="text-sm font-medium text-zinc-100">{title}</DialogTitle>
          <div className="mt-3">{children}</div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              className="rounded bg-blue-500 px-3 py-1.5 text-xs text-white transition-colors enabled:hover:bg-blue-400 disabled:opacity-40"
            >
              {confirmText}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
