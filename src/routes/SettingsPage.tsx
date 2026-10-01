import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, SaveIcon } from "tdesign-icons-react";
import { invoke } from "@tauri-apps/api/core";
import Toast from "../components/Toast";
import { DialogShell, TimeField } from "../components/week/PlanSettingsDialog";
import { listAlarmSounds } from "../lib/clipboard";
import { useGlobalConfig } from "../state/GlobalConfigContext";
import { useSettings } from "../state/SettingsContext";
import logoUrl from "../assets/logo.png";
import { BUNDLED_FONTS } from "../lib/fonts";
import {
  minuteToTimeInput,
  timeInputToMinute,
} from "../lib/weekgrid";
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
type TabId = "general" | "bells" | "appearance" | "about";

const TABS: { id: TabId; labelKey: string }[] = [
  { id: "general", labelKey: "settings.tabs.general" },
  { id: "bells", labelKey: "settings.tabs.bells" },
  { id: "appearance", labelKey: "settings.tabs.appearance" },
  { id: "about", labelKey: "settings.tabs.about" },
];

const LEVELS: {
  labelKey: string;
  fileKey: FileKey;
  modeKey: ModeKey;
  kind: "start" | "end";
}[] = [
  { labelKey: "settings.levelAll", fileKey: "alarmAllFile", modeKey: "alarmAllMode", kind: "start" },
  {
    labelKey: "settings.levelNormal",
    fileKey: "alarmNormalFile",
    modeKey: "alarmNormalMode",
    kind: "start",
  },
  {
    labelKey: "settings.levelRest",
    fileKey: "alarmRestFile",
    modeKey: "alarmRestMode",
    kind: "start",
  },
  {
    labelKey: "settings.levelAll",
    fileKey: "alarmAllEndFile",
    modeKey: "alarmAllEndMode",
    kind: "end",
  },
  {
    labelKey: "settings.levelNormal",
    fileKey: "alarmNormalEndFile",
    modeKey: "alarmNormalEndMode",
    kind: "end",
  },
  {
    labelKey: "settings.levelRest",
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

const UI_FONT_IDS = ["system", ...BUNDLED_FONTS.map((f) => f.id)];

const sectionTitle = "text-xs font-medium text-zinc-100";
const sectionHint = "mt-1 text-[10px] text-zinc-500";
const inputLabel = "block text-xs text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400";

/** 全局设置页：分 Tab 展示（通用/提醒铃声/外观/关于），切换带淡入淡出过渡。 */
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
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [clearStep, setClearStep] = useState<0 | 1 | 2 | 3>(0);
  const [agreeText, setAgreeText] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  // 配置加载后初始化工作副本（仅在无草稿时同步，避免覆盖正在编辑的内容）
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

  const patchFirstDay = (value: "mon" | "sun") => {
    setDraft((prev) => (prev ? { ...prev, firstDayOfWeek: value } : prev));
  };
  const patchFile = (key: FileKey, value: string | null) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };
  const patchMode = (key: ModeKey, value: AlarmMode | null) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const validate = (): GlobalConfig | null => {
    if (!draft) return null;
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
      return null;
    }
    if (start >= end) {
      showToast(t("settings.startAfterEnd"));
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
          return null;
        }
      }
    }
    if (!UI_FONT_IDS.includes(draft.uiFont)) {
      showToast(t("settings.badFont"));
      return null;
    }
    return { ...draft, dayStartMinute: start, dayEndMinute: end };
  };

  const handleSave = useCallback(async () => {
    const next = validate();
    if (!next) return;
    setSaving(true);
    try {
      await update(next);
      setStartTime(minuteToTimeInput(next.dayStartMinute));
      setEndTime(minuteToTimeInput(next.dayEndMinute));
      showToast(t("toasts.settingsSaved"));
    } catch (e: unknown) {
      showToast(String(e));
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, startTime, endTime, update, showToast, t]);

  const handlePosition = useCallback(async (position: WindowControlsPosition) => {
    try {
      await updateWindowControlsPosition(position);
      showToast(t("toasts.positionUpdated"));
    } catch (e: unknown) {
      showToast(String(e));
    }
  }, [update, showToast, t]);

  // 渲染闸门放在所有 hook 之后（Rules of Hooks）；之后的代码可把 draft 收窄为非空
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

  const fontPreviewFamily = (fontId: string): string => {
    const font = BUNDLED_FONTS.find((f) => f.id === fontId);
    return font
      ? `"${font.family}", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif`
      : '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
  };

  const levelRow = (
    labelKey: string,
    fileKey: FileKey,
    modeKey: ModeKey,
    kind: "start" | "end",
  ) => {
    const value = draft[fileKey];
    const modeValue = draft[modeKey];
    const unsetFile =
      kind === "start" ? t("settings.unsetStartFile") : t("settings.unsetEndFile");
    const unsetMode =
      kind === "start" ? t("settings.unsetStartMode") : t("settings.unsetEndMode");
    return (
      <div className="rounded-lg border border-zinc-600/60 p-3">
        <div className="text-xs text-zinc-200">{t(labelKey)}</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className={inputLabel}>
            {t("settings.bellFile")}
            <select
              value={value ?? ""}
              onChange={(e) => patchFile(fileKey, e.target.value === "" ? null : e.target.value)}
              className={inputClass}
            >
              <option value="">{unsetFile}</option>
              <option value="builtin">{t("settings.builtin")}</option>
              <option value="none">{t("settings.none")}</option>
              {alarmFiles.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className={inputLabel}>
            {t("settings.bellMode")}
            <select
              value={modeValue ?? ""}
              onChange={(e) => patchMode(modeKey, e.target.value === "" ? null : (e.target.value as AlarmMode))}
              className={inputClass}
            >
              <option value="">{unsetMode}</option>
              <option value="once">{t("settings.once")}</option>
              <option value="loop">{t("settings.loop")}</option>
            </select>
          </label>
        </div>
      </div>
    );
  };

  const position = settings?.windowControls.position ?? "right";

  const generalPanel = (
    <>
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
              onClick={() => patchFirstDay(d)}
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
        <h2 className={sectionTitle}>{t("settings.language")}</h2>
        <div className="mt-2 grid w-64 grid-cols-3 gap-2">
          {(["auto", "zh", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => void patchLanguage(l)}
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
    </>
  );

  const bellsPanel = (
    <section>
      <h2 className={sectionTitle}>{t("settings.bells")}</h2>
      <p className={sectionHint}>{t("settings.bellsHint")}</p>
      <div className="mt-2 space-y-3">
        {levelRow("settings.levelAll", "alarmAllFile", "alarmAllMode", "start")}
        {levelRow("settings.levelNormal", "alarmNormalFile", "alarmNormalMode", "start")}
        {levelRow("settings.levelRest", "alarmRestFile", "alarmRestMode", "start")}
        {levelRow("settings.levelAllEnd", "alarmAllEndFile", "alarmAllEndMode", "end")}
        {levelRow("settings.levelNormalEnd", "alarmNormalEndFile", "alarmNormalEndMode", "end")}
        {levelRow("settings.levelRestEnd", "alarmRestEndFile", "alarmRestEndMode", "end")}
      </div>
    </section>
  );

  const appearancePanel = (
    <>
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
    </>
  );

  const handleOpenDataDir = async () => {
    try {
      await invoke("open_app_data_dir");
    } catch (e: unknown) {
      showToast(String(e));
    }
  };

  /** 语言立即生效并立即持久化（对齐提示文案"马上生效"）：
   *  以已保存的配置为基准合并，不影响其他尚未保存的草稿修改。 */
  const patchLanguage = async (value: "auto" | "zh" | "en") => {
    setDraft((prev) => (prev ? { ...prev, uiLanguage: value } : prev));
    try {
      await update({ ...config, uiLanguage: value });
    } catch (e: unknown) {
      showToast(String(e));
    }
  };

  /** 三步确认后的最终执行：后端关库→删数据目录→原地重建；完成后整页重载进入全新状态。 */
  const handleClearNow = async () => {
    try {
      await invoke("request_clear_data");
      window.location.reload();
    } catch (e: unknown) {
      showToast(`${t("about.clearFailed")}: ${String(e)}`);
      setClearStep(0);
    }
  };

  const aboutPanel = (
    <section className="flex flex-col items-center gap-4 py-6 text-center">
      <img src={logoUrl} alt="Scheet" className="h-20 w-20 rounded-2xl" />
      <div>
        <div className="text-sm font-medium text-zinc-100">Scheet</div>
        <div className="mt-1 text-xs text-zinc-400">{t("about.tagline")}</div>
      </div>
      <p className="max-w-md text-xs leading-relaxed text-zinc-400">
        {t("about.intro")}
      </p>
      <div className="w-full max-w-sm rounded-lg border border-zinc-600/60 p-3 text-left">
        <div className="text-xs text-zinc-300">{t("about.collaborators")}</div>
        <div className="mt-1 text-xs text-zinc-100">GLM-5.3-Flash</div>
        <div className="text-[10px] text-zinc-500">{t("about.aiNote")}</div>
      </div>
      <button
        type="button"
        onClick={() => setClearStep(1)}
        className="rounded border border-zinc-500 px-4 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
      >
        {t("about.clearData")}
      </button>
    </section>
  );

  const panels: Record<TabId, ReactNode> = {
    general: generalPanel,
    bells: bellsPanel,
    appearance: appearancePanel,
    about: aboutPanel,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
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

      <div className="flex gap-1 border-b border-zinc-600 px-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs transition-colors ${
              activeTab === tab.id
                ? "border-blue-400 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="mx-auto max-w-2xl space-y-6"
          >
            {panels[activeTab]}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {clearStep === 1 && (
          <DialogShell
            key="clear-1"
            title={t("about.clearTitle")}
            onClose={() => setClearStep(0)}
            onConfirm={() => setClearStep(2)}
            footer={
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClearStep(0)}
                  className="rounded px-3 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenDataDir()}
                  className="rounded px-3 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
                >
                  {t("about.clearOpenFolder")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAgreeText("");
                    setClearStep(2);
                  }}
                  className="rounded bg-blue-500 px-3 py-1.5 text-xs text-white transition-colors hover:bg-blue-400"
                >
                  {t("about.clearNext")}
                </button>
              </div>
            }
          >
            <p className="text-xs leading-relaxed text-zinc-300">
              {t("about.clearStep1Body")}
            </p>
          </DialogShell>
        )}
        {clearStep === 2 && (
          <DialogShell
            key="clear-2"
            title={t("about.clearTitle")}
            onClose={() => setClearStep(0)}
            onConfirm={() => setClearStep(3)}
            canConfirm={agreeText === "AGREE TO CLEAR"}
            confirmText={t("about.clearContinue")}
          >
            <p className="text-xs leading-relaxed text-zinc-300">
              {t("about.clearStep2Body")}
            </p>
            <input
              value={agreeText}
              onChange={(e) => setAgreeText(e.target.value)}
              placeholder={t("about.clearAgreePlaceholder")}
              autoFocus
              className={inputClass}
            />
          </DialogShell>
        )}
        {clearStep === 3 && (
          <DialogShell
            key="clear-3"
            title={t("about.clearTitle")}
            onClose={() => setClearStep(0)}
            onConfirm={() => void handleClearNow()}
            confirmText={t("about.clearFinal")}
          >
            <p className="text-xs leading-relaxed text-zinc-300">
              {t("about.clearStep3Body")}
            </p>
          </DialogShell>
        )}
      </AnimatePresence>

      <Toast message={toast} />
    </motion.div>
  );
}
