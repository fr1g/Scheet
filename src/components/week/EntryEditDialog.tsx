import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { playAlarmSound, stopAlarmSound } from "../../lib/alarm-sound";
import { listAlarmSounds } from "../../lib/clipboard";
import CollapseBar from "../CollapseBar";
import {
  hexWithAlpha,
  minuteToHHMM,
  minuteToTimeInput,
  resolveAlarmChain,
  timeInputToMinute,
} from "../../lib/weekgrid";
import type { GlobalConfig } from "../../types/global-config";
import type { AlarmMode, EntryType, WeekEntry } from "../../types/weeks";
import { DialogShell, TimeField } from "./PlanSettingsDialog";

/** 铃声下拉的取值：inherit=未设置（继承类型/全局）、builtin、none、或 alarms 文件名。 */
type AlarmFileChoice = "inherit" | "builtin" | "none" | (string & {});
type AlarmModeChoice = "inherit" | AlarmMode;

/**
 * 时长输入解析：支持纯分钟数（"175"）与 "小时.分钟" 小数形式（"1.30" → 1 小时 30 分钟）。
 * 返回分钟数（非 5 的倍数也会返回，由提交时 2舍3入），非法返回 null。
 */
export function parseDurationInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes(".")) {
    const [h, m] = s.split(".");
    const hours = Number(h);
    const minutes = m === "" ? 0 : Number(m);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

interface EntryEditDialogProps {
  entry: WeekEntry;
  config: GlobalConfig;
  /** true = 双击无安排区域刚创建的临时事务：取消时一并撤销。 */
  createdNow: boolean;
  onClose: () => void;
  onConfirm: (entry: WeekEntry) => void;
  onDelete: () => void;
}

/** 事务编辑模态：双击事务编辑 / 双击无安排区域新建。 */
export default function EntryEditDialog({
  entry,
  config,
  createdNow,
  onClose,
  onConfirm,
  onDelete,
}: EntryEditDialogProps) {
  const { t } = useTranslation();
  const [entryType, setEntryType] = useState<EntryType>(entry.entryType);
  const [title, setTitle] = useState(entry.title);
  const [start, setStart] = useState(minuteToTimeInput(entry.startMinute));
  const [duration, setDuration] = useState(String(entry.durationMinute));
  const [alarmChoice, setAlarmChoice] = useState<AlarmFileChoice>(
    entry.alarmFile ?? "inherit",
  );
  const [modeChoice, setModeChoice] = useState<AlarmModeChoice>(
    entry.alarmMode ?? "inherit",
  );
  const [endAlarmChoice, setEndAlarmChoice] = useState<AlarmFileChoice>(
    entry.endAlarmFile ?? "inherit",
  );
  const [endModeChoice, setEndModeChoice] = useState<AlarmModeChoice>(
    entry.endAlarmMode ?? "inherit",
  );
  const [color, setColor] = useState(entry.color ?? "");
  const [alarmFiles, setAlarmFiles] = useState<string[]>([]);

  useEffect(() => {
    listAlarmSounds()
      .then(setAlarmFiles)
      .catch((e: unknown) => console.error("读取提示音列表失败", e));
    return () => void stopAlarmSound().catch(() => undefined);
  }, []);

  const startChain = resolveAlarmChain("start", entryType, config);
  const endChain = resolveAlarmChain("end", entryType, config);

  const startMinute = timeInputToMinute(start);
  const durationMinutes = parseDurationInput(duration);
  const snappedDuration =
    durationMinutes == null
      ? null
      : Math.min(1440, Math.max(5, Math.round(durationMinutes / 5) * 5));
  const colorOk = color === "" || /^#[0-9a-fA-F]{6}$/.test(color);
  const titleOk = entryType === "rest" || title.trim().length > 0;
  const timesOk =
    !Number.isNaN(startMinute) &&
    startMinute != null &&
    startMinute >= 0 &&
    startMinute <= 1435 &&
    startMinute % 5 === 0 &&
    durationMinutes != null &&
    !Number.isNaN(durationMinutes) &&
    durationMinutes > 0;
  const canConfirm = titleOk && timesOk && colorOk && snappedDuration != null;

  // 开始时间不是 5 的倍数时，给出就近取整建议（2舍3入）
  const needsStartSnap =
    startMinute != null &&
    !Number.isNaN(startMinute) &&
    startMinute >= 0 &&
    startMinute <= 1439 &&
    startMinute % 5 !== 0;
  const suggestedStart =
    needsStartSnap && startMinute != null
      ? Math.min(1435, Math.max(0, Math.round(startMinute / 5) * 5))
      : null;

  const fillNow = () => {
    const d = new Date();
    setStart(
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    );
  };

  const previewFileFor = (kind: "start" | "end"): string | null => {
    const choice = kind === "start" ? alarmChoice : endAlarmChoice;
    const chain = kind === "start" ? startChain : endChain;
    if (choice === "inherit") {
      return chain.file === "builtin" ? "" : chain.file === "none" ? null : chain.file;
    }
    if (choice === "builtin") return "";
    if (choice === "none") return null;
    return choice;
  };
  const previewModeFor = (kind: "start" | "end"): AlarmMode => {
    const choice = kind === "start" ? modeChoice : endModeChoice;
    const chain = kind === "start" ? startChain : endChain;
    return choice === "inherit" ? chain.mode : choice;
  };

  const handlePreview = async (kind: "start" | "end") => {
    const file = previewFileFor(kind);
    if (file == null) return;
    try {
      await playAlarmSound(file, previewModeFor(kind));
    } catch (e: unknown) {
      console.error("试听失败", e);
    }
  };

  const confirm = () => {
    if (!canConfirm || startMinute == null || snappedDuration == null) return;
    onConfirm({
      ...entry,
      entryType,
      title: title.trim(),
      startMinute,
      durationMinute: snappedDuration,
      alarmFile: alarmChoice === "inherit" ? null : alarmChoice,
      alarmMode: modeChoice === "inherit" ? null : modeChoice,
      endAlarmFile: endAlarmChoice === "inherit" ? null : endAlarmChoice,
      endAlarmMode: endModeChoice === "inherit" ? null : endModeChoice,
      color: color === "" ? null : color.toUpperCase(),
    });
  };

  const selectClass =
    "mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400";
  const inputClass =
    "mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400";
  const typeLabel = (et: EntryType) =>
    et === "normal" ? t("entry.normal") : t("entry.rest");

  return (
    <DialogShell
      title={createdNow ? t("entry.new") : t("entry.edit")}
      onClose={onClose}
      onConfirm={confirm}
      canConfirm={canConfirm}
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="rounded px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/15"
          >
            {t("entry.delete")}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
            >
              {createdNow ? t("entry.cancelNew") : t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="rounded bg-blue-500 px-3 py-1.5 text-xs text-white transition-colors enabled:hover:bg-blue-400 disabled:opacity-40"
            >
              {t("entry.apply")}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {(["normal", "rest"] as EntryType[]).map((et) => (
          <button
            key={et}
            type="button"
            onClick={() => setEntryType(et)}
            className={`rounded border px-2 py-1.5 text-xs transition-colors ${
              entryType === et
                ? "border-blue-400 bg-blue-400/15 text-zinc-100"
                : "border-zinc-600 text-zinc-300 hover:bg-zinc-600/60"
            }`}
          >
            {typeLabel(et)}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-xs text-zinc-300">
        {t("entry.titleLabel")}
        {entryType === "normal" ? t("entry.titleRequiredHint") : t("entry.titleOptionalHint")}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={entryType === "rest" ? t("entry.rest") : ""}
          className={inputClass}
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <TimeField
          label={t("entry.start")}
          value={start}
          onChange={setStart}
          suffix={
            <button
              type="button"
              onClick={fillNow}
              title={t("entry.nowTitle")}
              className="shrink-0 rounded px-1.5 py-1 text-[10px] text-zinc-100 transition-colors hover:bg-zinc-600"
            >
              {t("entry.now")}
            </button>
          }
        />
        <label className="block text-xs text-zinc-300">
          {t("entry.duration")}
          <input
            type="text"
            inputMode="decimal"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={t("entry.durationPlaceholder")}
            className={inputClass}
          />
        </label>
      </div>
      {needsStartSnap && suggestedStart != null && (
        <p className="mt-1 text-[10px] text-amber-300">
          {t("entry.startSnapHint", {
            time: minuteToHHMM(suggestedStart),
          })}
          <button
            type="button"
            onClick={() => setStart(minuteToHHMM(suggestedStart))}
            className="ml-1 underline transition-colors hover:text-zinc-100"
          >
            {t("entry.startSnapApply", { time: minuteToHHMM(suggestedStart) })}
          </button>
        </p>
      )}
      <p className="mt-1 text-[10px] text-zinc-500">
        {t("entry.snapHint")}
        {snappedDuration != null && durationMinutes != null && durationMinutes > 0 && (
          <>
            ：{t("entry.willBe", { duration: humanizeMinutes(snappedDuration) })}
            {durationMinutes !== snappedDuration && (
              <span className="text-zinc-400">
                （{t("entry.inputWas", { duration: humanizeMinutes(durationMinutes) })}）
              </span>
            )}
          </>
        )}
      </p>

      <CollapseBar
        title={t("entry.collapse")}
        className="mt-3"
        contentClassName=""
      >
        <div className="px-2 pb-2 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-300">
              {t("entry.startBell")}
              <select
                value={alarmChoice}
                onChange={(e) => setAlarmChoice(e.target.value as AlarmFileChoice)}
                className={selectClass}
              >
                <option value="inherit">
                  {t("entry.inheritFile", {
                    file: alarmFileLabel(startChain.file),
                    source: t(`entry.${startChain.fileSource}`),
                  })}
                </option>
                <option value="builtin">{t("settings.builtin")}</option>
                <option value="none">{t("entry.none")}</option>
                {alarmFiles.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-zinc-300">
              {t("entry.endBell")}
              <select
                value={endAlarmChoice}
                onChange={(e) => setEndAlarmChoice(e.target.value as AlarmFileChoice)}
                className={selectClass}
              >
                <option value="inherit">
                  {t("entry.inheritFile", {
                    file: alarmFileLabel(endChain.file),
                    source: t(`entry.${endChain.fileSource}`),
                  })}
                </option>
                <option value="builtin">{t("settings.builtin")}</option>
                <option value="none">{t("entry.none")}</option>
                {alarmFiles.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-300">
              {t("entry.startMode")}
              <select
                value={modeChoice}
                onChange={(e) => setModeChoice(e.target.value as AlarmModeChoice)}
                className={selectClass}
              >
                <option value="inherit">
                  {t("entry.inheritMode", {
                    mode: alarmModeLabel(startChain.mode),
                    source: t(`entry.${startChain.modeSource}`),
                  })}
                </option>
                <option value="once">{t("settings.once")}</option>
                <option value="loop">{t("entry.loop")}</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-300">
              {t("entry.endMode")}
              <select
                value={endModeChoice}
                onChange={(e) => setEndModeChoice(e.target.value as AlarmModeChoice)}
                className={selectClass}
              >
                <option value="inherit">
                  {t("entry.inheritMode", {
                    mode: alarmModeLabel(endChain.mode),
                    source: t(`entry.${endChain.modeSource}`),
                  })}
                </option>
                <option value="once">{t("settings.once")}</option>
                <option value="loop">{t("entry.loop")}</option>
              </select>
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePreview("start")}
              disabled={previewFileFor("start") == null}
              title={previewFileFor("start") == null ? t("entry.noSound") : undefined}
              className="rounded px-3 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
            >
              {t("entry.previewStart")}
            </button>
            <button
              type="button"
              onClick={() => void handlePreview("end")}
              disabled={previewFileFor("end") == null}
              title={previewFileFor("end") == null ? t("entry.noSound") : undefined}
              className="rounded px-3 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
            >
              {t("entry.previewEnd")}
            </button>
            <button
              type="button"
              onClick={() => void stopAlarmSound().catch(() => undefined)}
              className="rounded px-3 py-1 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
            >
              {t("common.stop")}
            </button>
          </div>

          <label className="mt-3 block text-xs text-zinc-300">
            {t("entry.color")}
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#RRGGBB"
                className={inputClass}
              />
              <span
                className="h-7 w-7 shrink-0 rounded border border-zinc-600"
                style={{
                  background:
                    color === ""
                      ? entryType === "normal"
                        ? "rgba(96, 165, 250, 0.35)"
                        : "rgba(251, 191, 36, 0.35)"
                      : (hexWithAlpha(color, 0.35) ?? "transparent"),
                }}
              />
            </div>
          </label>
          {!colorOk && (
            <p className="mt-2 text-[10px] text-red-400">{t("entry.colorError")}</p>
          )}
        </div>
      </CollapseBar>

      {!titleOk && (
        <p className="mt-2 text-[10px] text-red-400">{t("entry.titleError")}</p>
      )}
    </DialogShell>
  );
}

function humanizeMinutes(minutes: number): string {
  const { t } = useTranslation();
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t("duration.m", { m });
  if (m === 0) return t("duration.h", { h });
  return t("duration.hM", { h, m });
}

function alarmFileLabel(value: "builtin" | "none" | string): string {
  const { t } = useTranslation();
  return value === "builtin" ? t("settings.builtin") : value === "none" ? t("entry.none") : value;
}

function alarmModeLabel(mode: AlarmMode): string {
  const { t } = useTranslation();
  return mode === "loop" ? t("settings.loop") : t("settings.once");
}
