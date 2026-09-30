import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowLeftIcon, SaveIcon } from "tdesign-icons-react";
import Toast from "../components/Toast";
import { TimeField } from "../components/week/PlanSettingsDialog";
import { listAlarmSounds } from "../lib/clipboard";
import { useGlobalConfig } from "../state/GlobalConfigContext";
import {
  minuteToTimeInput,
  timeInputToMinute,
} from "../lib/weekgrid";
import { BUNDLED_FONTS } from "../lib/fonts";

const UI_FONT_IDS = ["system", ...BUNDLED_FONTS.map((f) => f.id)];
import { useSettings } from "../state/SettingsContext";
import type { GlobalConfig } from "../types/global-config";
import type { AlarmMode } from "../types/weeks";
import type { WindowControlsPosition } from "../types/settings";

type FileKey =
  | "alarmAllFile"
  | "alarmNormalFile"
  | "alarmRestFile"
  | "alarmAllEndFile"
  | "alarmNormalEndFile"
  | "alarmRestEndFile";
type ModeKey =
  | "alarmAllMode"
  | "alarmNormalMode"
  | "alarmRestMode"
  | "alarmAllEndMode"
  | "alarmNormalEndMode"
  | "alarmRestEndMode";

const LEVELS: {
  label: string;
  fileKey: FileKey;
  modeKey: ModeKey;
  kind: "start" | "end";
}[] = [
  { label: "settings.levelAll", fileKey: "alarmAllFile", modeKey: "alarmAllMode", kind: "start" },
  {
    label: "settings.levelNormal",
    fileKey: "alarmNormalFile",
    modeKey: "alarmNormalMode",
    kind: "start",
  },
  { label: "settings.levelRest", fileKey: "alarmRestFile", modeKey: "alarmRestMode", kind: "start" },
  {
    label: "settings.levelAll",
    fileKey: "alarmAllEndFile",
    modeKey: "alarmAllEndMode",
    kind: "end",
  },
  {
    label: "settings.levelNormal",
    fileKey: "alarmNormalEndFile",
    modeKey: "alarmNormalEndMode",
    kind: "end",
  },
  {
    label: "settings.levelRest",
    fileKey: "alarmRestEndFile",
    modeKey: "alarmRestEndMode",
    kind: "end",
  },
];

const POSITION_LABELS: Record<WindowControlsPosition, string> = {
  left: "settings.posLeft",
  right: "settings.posRight",
  hidden: "settings.posHidden",
};

/** 全局设置页：显示范围 / 一周起点 / 提醒铃声 / 窗口按钮 / 语言。 */
export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings, updateWindowControlsPosition } = useSettings();
  const { config, error: loadError, reload: reloadConfig, update } = useGlobalConfig();
  const [draft, setDraft] = useState<GlobalConfig | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [alarmFiles, setAlarmFiles] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  // 配置加载后初始化工作副本（仅在无草稿时同步）
  useEffect(() => {
    if (!config) return;
    setDraft((prev) => prev ?? config);
    setStartTime((prev) => prev || minuteToTimeInput(config.dayStartMinute));
    setEndTime((prev) => prev || minuteToTimeInput(config.dayEndMinute));
  }, [config]);

  useEffect(() => {
    listAlarmSounds()
      .then(setAlarmFiles)
      .catch(() => setAlarmFiles([]));
  }, []);

  const dirty = draft != null && JSON.stringify(draft) !== JSON.stringify(config);

  const patchFile = (key: FileKey, value: string | null) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };
  const patchMode = (key: ModeKey, value: AlarmMode | null) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };
  const patchLanguage = (value: "auto" | "zh" | "en") => {
    setDraft((prev) => (prev ? { ...prev, uiLanguage: value } : prev));
  };

  const handleSave = async () => {
    if (!draft) return;
    const start = timeInputToMinute(startTime);
    const end = timeInputToMinute(endTime);
    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start == null ||
      end == null ||
      start < 0 ||
      start > 1439 ||
      end < 0 ||
      end > 1439
    ) {
      showToast(t("settings.timeInvalid"));
      return;
    }
    if (start >= end) {
      showToast(t("settings.startAfterEnd"));
      return;
    }
    if (!UI_FONT_IDS.includes(draft.uiFont)) {
      showToast(t("settings.badFont"));
      return null;
    }
    for (const key of LEVELS.map((l) => l.fileKey)) {
      const value = draft[key];
      if (value != null && value !== "builtin" && value !== "none") {
        if (
          value.includes("/") ||
          value.includes("\\") ||
          value.includes("..") ||
          value.startsWith(".")
        ) {
          showToast(t("settings.badBellFile", { name: value }));
          return;
        }
      }
    }
    setSaving(true);
    try {
      await update({ ...draft, dayStartMinute: start, dayEndMinute: end });
      setStartTime(minuteToTimeInput(start));
      setEndTime(minuteToTimeInput(end));
      showToast(t("toasts.settingsSaved"));
    } catch (e: unknown) {
      showToast(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePosition = async (position: WindowControlsPosition) => {
    try {
      await updateWindowControlsPosition(position);
      showToast(t("toasts.positionUpdated"));
    } catch (e: unknown) {
      showToast(String(e));
    }
  };

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-100">
        <p className="text-sm">{t("settings.loadError")}</p>
        <p className="max-w-md text-center text-xs break-all text-zinc-300">{loadError}</p>
        <button
          type="button"
          onClick={reloadConfig}
          className="rounded px-4 py-1.5 text-sm transition-colors hover:bg-zinc-600"
        >
          {t("error.retry")}
        </button>
      </div>
    );
  }

  if (!config || !draft) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-300">
        {t("settings.loading")}
      </div>
    );
  }

  const position = settings?.windowControls.position ?? "right";
  const inputClass =
    "mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400";
  const sectionTitle = "text-xs font-medium text-zinc-100";
  const sectionHint = "mt-1 text-[10px] text-zinc-500";
  const inputLabel = "block text-xs text-zinc-300";

  const bellSelect = (
    level: { fileKey: FileKey; kind: "start" | "end" },
  ) => {
    const value = draft[level.fileKey];
    const unsetLabel =
      level.kind === "start" ? t("settings.unsetStartFile") : t("settings.unsetEndFile");
    return (
      <label className={inputLabel}>
        {t("settings.bellFile")}
        <select
          value={value ?? ""}
          onChange={(e) => patchFile(level.fileKey, e.target.value === "" ? null : e.target.value)}
          className={inputClass}
        >
          <option value="">{unsetLabel}</option>
          <option value="builtin">{t("settings.builtin")}</option>
          <option value="none">{t("settings.none")}</option>
          {alarmFiles.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const modeSelect = (level: { modeKey: ModeKey; kind: "start" | "end" }) => {
    const value = draft[level.modeKey];
    const unsetLabel =
      level.kind === "start" ? t("settings.unsetStartMode") : t("settings.unsetEndMode");
    return (
      <label className={inputLabel}>
        {t("settings.bellMode")}
        <select
          value={value ?? ""}
          onChange={(e) =>
            patchMode(level.modeKey, e.target.value === "" ? null : (e.target.value as AlarmMode))
          }
          className={inputClass}
        >
          <option value="">{unsetLabel}</option>
          <option value="once">{t("settings.once")}</option>
          <option value="loop">{t("settings.loop")}</option>
        </select>
      </label>
    );
  };

  const fontPreviewFamily = (fontId: string): string => {
    const font = BUNDLED_FONTS.find((f) => f.id === fontId);
    return font
      ? `"${font.family}", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif`
      : '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
  };

  const levelRow = (labelKey: string, fileKey: FileKey, modeKey: ModeKey, kind: "start" | "end") => (
    <div className="rounded-lg border border-zinc-600/60 p-3">
      <div className="text-xs text-zinc-200">
        {t(labelKey)}
        {kind === "end" ? ` · ${t("settings.endBells")}` : ""}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {bellSelect({ fileKey, kind })}
        {modeSelect({ modeKey, kind })}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="flex items-center gap-2 border-b border-zinc-600 px-3 py-1.5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          title={t("settings.back")}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          <ArrowLeftIcon size="15px" />
        </button>
        <h1 className="text-sm text-zinc-100">{t("settings.title")}</h1>
        {dirty && (
          <span className="animate-pulse rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-300">
            {t("settings.unsaved")}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:opacity-40"
        >
          <SaveIcon size="13px" />
          {t("settings.save")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          <section>
            <h2 className={sectionTitle}>{t("settings.dayWindow")}</h2>
            <p className={sectionHint}>{t("settings.dayWindowHint")}</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <TimeField label={t("settings.dayStart")} value={startTime} onChange={setStartTime} />
              <TimeField label={t("settings.dayEnd")} value={endTime} onChange={setEndTime} />
            </div>
          </section>

          <section>
            <h2 className={sectionTitle}>{t("settings.firstDay")}</h2>
            <p className={sectionHint}>{t("settings.firstDayHint")}</p>
            <div className="mt-2 grid w-64 grid-cols-2 gap-2">
              {(["mon", "sun"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setDraft((prev) =>
                      prev ? { ...prev, firstDayOfWeek: d } : prev,
                    )
                  }
                  className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                    draft.firstDayOfWeek === d
                      ? "border-blue-400 bg-blue-400/15 text-zinc-100"
                      : "border-zinc-600 text-zinc-300 hover:bg-zinc-600/60"
                  }`}
                >
                  {d === "mon" ? t("settings.monday") : t("settings.sunday")}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className={sectionTitle}>{t("settings.uiFont")}</h2>
            <div className="mt-2 max-w-md">
              <select
                value={draft.uiFont}
                onChange={(e) =>
                  setDraft((prev) => (prev ? { ...prev, uiFont: e.target.value } : prev))
                }
                className={inputClass}
              >
                <option value="system">{t("settings.fontSystem")}</option>
                {BUNDLED_FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.family}
                    {f.id === "lxgw-wenkai-mono" ? t("settings.fontDefault") : ""}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="mt-2 rounded-lg border border-zinc-600/60 p-3 text-sm text-zinc-100"
              style={{ fontFamily: fontPreviewFamily(draft.uiFont) }}
            >
              {t("settings.fontPreviewText")}
            </div>
          </section>

          <section>
            <h2 className={sectionTitle}>{t("settings.bells")}</h2>
            <p className={sectionHint}>{t("settings.bellsHint")}</p>
            <div className="mt-2 space-y-3">
              {levelRow("settings.levelAll", "alarmAllFile", "alarmAllMode", "start")}
              {levelRow("settings.levelNormal", "alarmNormalFile", "alarmNormalMode", "start")}
              {levelRow("settings.levelRest", "alarmRestFile", "alarmRestMode", "start")}
              {levelRow("settings.levelAll", "alarmAllEndFile", "alarmAllEndMode", "end")}
              {levelRow("settings.levelNormal", "alarmNormalEndFile", "alarmNormalEndMode", "end")}
              {levelRow("settings.levelRest", "alarmRestEndFile", "alarmRestEndMode", "end")}
            </div>
          </section>

          <section>
            <h2 className={sectionTitle}>{t("settings.windowButtons")}</h2>
            <div className="mt-2 grid w-full max-w-md grid-cols-3 gap-2">
              {(["left", "right", "hidden"] as WindowControlsPosition[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void handlePosition(p)}
                  className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                    position === p
                      ? "border-blue-400 bg-blue-400/15 text-zinc-100"
                      : "border-zinc-600 text-zinc-300 hover:bg-zinc-600/60"
                  }`}
                >
                  {t(POSITION_LABELS[p])}
                </button>
              ))}
            </div>
            <p className={sectionHint}>{t("settings.positionHint")}</p>
          </section>

          <section>
            <h2 className={sectionTitle}>{t("settings.language")}</h2>
            <div className="mt-2 grid w-full max-w-md grid-cols-3 gap-2">
              {(["auto", "zh", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => patchLanguage(l)}
                  className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                    draft.uiLanguage === l
                      ? "border-blue-400 bg-blue-400/15 text-zinc-100"
                      : "border-zinc-600 text-zinc-300 hover:bg-zinc-600/60"
                  }`}
                >
                  {l === "auto"
                    ? t("settings.langAuto")
                    : l === "zh"
                      ? t("settings.langZh")
                      : t("settings.langEn")}
                </button>
              ))}
            </div>
            <p className={sectionHint}>{t("settings.languageHint")}</p>
          </section>
        </div>
      </div>

      <Toast message={toast} />
    </motion.div>
  );
}
