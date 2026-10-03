import { Dialog, DialogTitle } from "@headlessui/react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "tdesign-icons-react";
import {
  minuteToTimeInput,
  timeInputToMinute,
  usePlanName,
} from "../../lib/weekgrid";
import type { WeekPlan } from "../../types/weeks";

/** 通用的模态外壳（HeadlessUI Dialog + framer-motion 过渡）。
 *  footer 缺省为"取消/确认"，可整体替换。 */
export function DialogShell({
  title,
  children,
  onClose,
  onConfirm,
  canConfirm = true,
  confirmText,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  canConfirm?: boolean;
  confirmText?: string;
  /** 提供时替换默认页脚（编辑模态用它放"删除/取消/保存"组合）。 */
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/50"
        aria-hidden
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="w-full max-w-md rounded-xl border border-zinc-600 bg-zinc-800 p-4"
        >
          <DialogTitle className="text-sm font-medium text-zinc-100">{title}</DialogTitle>
          <div className="my-3">{children}</div>
          {footer ?? (
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canConfirm}
                className="rounded bg-blue-500 px-3 py-1.5 text-xs text-white transition-colors enabled:hover:bg-blue-400 disabled:opacity-40"
              >
                {confirmText ?? t("common.confirm")}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </Dialog>
  );
}

interface PlanColorOverrides {
  normalColor: string | null;
  restColor: string | null;
  normalTextDark: boolean | null;
  restTextDark: boolean | null;
}

interface PlanSettingsDialogProps {
  plan: WeekPlan;
  onClose: () => void;
  /** 确认后只修改工作副本，随主保存按钮统一入库。 */
  onConfirm: (
    name: string,
    dayStart: number | null,
    dayEnd: number | null,
    colors: PlanColorOverrides,
  ) => void;
}

/** 周表设置：名称 + 周表级一天起止时间（留空继承全局）+ 事务默认色覆盖。 */
export default function PlanSettingsDialog({
  plan,
  onClose,
  onConfirm,
}: PlanSettingsDialogProps) {
  const { t } = useTranslation();
  const planName = usePlanName();
  const [name, setName] = useState(planName(plan.name));
  const [start, setStart] = useState(minuteToTimeInput(plan.dayStartMinute));
  const [end, setEnd] = useState(minuteToTimeInput(plan.dayEndMinute));
  const [normalColor, setNormalColor] = useState(plan.normalColor ?? "");
  const [restColor, setRestColor] = useState(plan.restColor ?? "");
  const [normalText, setNormalText] = useState(
    plan.normalTextDark == null ? "inherit" : plan.normalTextDark ? "dark" : "light",
  );
  const [restText, setRestText] = useState(
    plan.restTextDark == null ? "inherit" : plan.restTextDark ? "dark" : "light",
  );

  const hexOk = (v: string) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v);
  const colorsOk = hexOk(normalColor) && hexOk(restColor);

  const startMinute = timeInputToMinute(start);
  const endMinute = timeInputToMinute(end);
  const nameOk = name.trim().length > 0;
  const timesOk =
    !Number.isNaN(startMinute) &&
    !Number.isNaN(endMinute) &&
    (startMinute == null || startMinute % 5 === 0) &&
    (endMinute == null || endMinute % 5 === 0) &&
    (startMinute == null || endMinute == null || startMinute < endMinute);
  const canConfirm = nameOk && timesOk && colorsOk;

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm(name.trim(), startMinute, endMinute, {
      normalColor: normalColor.trim() || null,
      restColor: restColor.trim() || null,
      normalTextDark: normalText === "inherit" ? null : normalText === "dark",
      restTextDark: restText === "inherit" ? null : restText === "dark",
    });
  };

  return (
    <DialogShell
      title={t("planSettings.title")}
      onClose={onClose}
      onConfirm={confirm}
      canConfirm={canConfirm}
    >
      <label className="block text-xs text-zinc-300">
        {t("planSettings.name")}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <TimeField
          label={t("planSettings.start")}
          value={start}
          onChange={setStart}
          clearable
          clearTitle={t("planSettings.clearTitle")}
          onClear={() => setStart("")}
        />
        <TimeField
          label={t("planSettings.end")}
          value={end}
          onChange={setEnd}
          clearable
          clearTitle={t("planSettings.clearTitle")}
          onClear={() => setEnd("")}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-xs text-zinc-300">
          {t("planSettings.entryNormalColor")}
          <input
            type="text"
            value={normalColor}
            onChange={(e) => setNormalColor(e.target.value)}
            placeholder={t("planSettings.colorInherit")}
            className={`mt-1 w-full rounded border bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400 ${
              hexOk(normalColor) ? "border-zinc-600" : "border-red-500"
            }`}
          />
        </label>
        <label className="block text-xs text-zinc-300">
          {t("planSettings.entryRestColor")}
          <input
            type="text"
            value={restColor}
            onChange={(e) => setRestColor(e.target.value)}
            placeholder={t("planSettings.colorInherit")}
            className={`mt-1 w-full rounded border bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400 ${
              hexOk(restColor) ? "border-zinc-600" : "border-red-500"
            }`}
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-xs text-zinc-300">
          {t("planSettings.entryNormalTextDark")}
          <select
            value={normalText}
            onChange={(e) => setNormalText(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400"
          >
            <option value="inherit">{t("planSettings.textInherit")}</option>
            <option value="light">{t("planSettings.textLight")}</option>
            <option value="dark">{t("planSettings.textDark")}</option>
          </select>
        </label>
        <label className="block text-xs text-zinc-300">
          {t("planSettings.entryRestTextDark")}
          <select
            value={restText}
            onChange={(e) => setRestText(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400"
          >
            <option value="inherit">{t("planSettings.textInherit")}</option>
            <option value="light">{t("planSettings.textLight")}</option>
            <option value="dark">{t("planSettings.textDark")}</option>
          </select>
        </label>
      </div>
    </DialogShell>
  );
}

export function TimeField({
  label,
  value,
  onChange,
  suffix,
  clearable = false,
  onClear,
  clearTitle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** 输入框右侧的附加操作（如"填入现在的时间"）。 */
  suffix?: React.ReactNode;
  /** 可留空的时间设置：值非空时显示清除按钮（恢复继承）。 */
  clearable?: boolean;
  onClear?: () => void;
  clearTitle?: string;
}) {
  const { t } = useTranslation();
  return (
    <label className="block text-xs text-zinc-300">
      {label}
      <div className="mt-1 flex items-center gap-1">
        <input
          type="time"
          step={300}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400"
        />
        {suffix}
        {clearable && value && (
          <button
            type="button"
            onClick={() => (onClear ? onClear() : onChange(""))}
            title={clearTitle ?? t("timeField.clear")}
            className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-600 hover:text-zinc-100"
          >
            <CloseIcon size="12px" />
          </button>
        )}
      </div>
    </label>
  );
}
