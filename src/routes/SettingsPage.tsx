import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, CrookedSmileIcon, FolderIcon, JumpIcon, LogoGithubIcon, RefreshIcon, SaveIcon } from "tdesign-icons-react";
import { invoke } from "@tauri-apps/api/core";
import Toast from "../components/Toast";
import CollapseBar from "../components/CollapseBar";
import { DialogShell, TimeField } from "../components/week/PlanSettingsDialog";
import { listAlarmSounds } from "../lib/clipboard";
import { getWeekPlan, listWeekPlans } from "../lib/weeks";
import { useGlobalConfig } from "../state/GlobalConfigContext";
import { useShiftHeld } from "../components/WindowControls";
import { useSettings } from "../state/SettingsContext";
import logoUrl from "../assets/appicon.png";
import pkg from "../../package.json";
import zaiLogoUrl from "../assets/zai-logo.webp";
import fr1gAvatarUrl from "../assets/fr1g-avatar.webp";
import vbClubLogo from "../assets/vibrative-t-64.webp";
import { BUNDLED_FONTS } from "../lib/fonts";
import {
  minuteToTimeInput,
  timeInputToMinute,
} from "../lib/weekgrid";
import type { GlobalConfig } from "../types/global-config";
import type { AlarmMode } from "../types/weeks";
import type { WindowControlsPosition } from "../types/settings";
import Opener from "../lib/opener";

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
type TabId = "general" | "bells" | "appearance" | "advanced" | "about";

const TABS: { id: TabId; labelKey: string }[] = [
  { id: "general", labelKey: "settings.tabs.general" },
  { id: "bells", labelKey: "settings.tabs.bells" },
  { id: "appearance", labelKey: "settings.tabs.appearance" },
  { id: "advanced", labelKey: "settings.tabs.advanced" },
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

// 应用直接使用的开源项目（前端 npm + Rust cargo 直接依赖）
const OPENSOURCE: [string, string][] = [
  ["Tauri", "https://github.com/tauri-apps/tauri"],
  ["React", "https://github.com/facebook/react"],
  ["React Router", "https://github.com/remix-run/react-router"],
  ["Tailwind CSS", "https://github.com/tailwindlabs/tailwindcss"],
  ["Headless UI", "https://github.com/tailwindlabs/headlessui"],
  ["TDesign Icons", "https://github.com/Tencent/tdesign"],
  ["Framer Motion", "https://github.com/motiondivision/motion"],
  ["i18next", "https://github.com/i18next/i18next"],
  ["react-i18next", "https://github.com/i18next/react-i18next"],
  ["resvg-js", "https://github.com/thx/resvg-js"],
  ["rusqlite", "https://github.com/rusqlite/rusqlite"],
  ["chrono", "https://github.com/chronotope/chrono"],
  ["rodio", "https://github.com/RustAudio/rodio"],
  ["arboard", "https://github.com/1Password/arboard"],
  ["flate2", "https://github.com/rust-lang/flate2-rs"],
  ["log", "https://github.com/rust-lang/log"],
  ["dirs", "https://github.com/dirs-dev/dirs-rs"],
  ["serde", "https://github.com/serde-rs/serde"],
  ["windows-sys", "https://github.com/microsoft/windows-rs"],
  ["tauri-winrt-notification", "https://github.com/tauri-apps/tauri-winrt-notification"],
];

const POSITION_LABELS: Record<WindowControlsPosition, string> = {
  left: "settings.posLeft",
  right: "settings.posRight",
  hidden: "settings.posHidden",
};

const UI_FONT_IDS = ["system", ...BUNDLED_FONTS.map((f) => f.id)];

/** 预览 swatch 底色：合法 #RRGGBB → 半透明呈现；非法 → 中性灰。 */
function hexPreview(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}88` : "#52525b";
}

const LOG_LEVELS = ["none", "verbose", "info", "warn", "error", "fatal"];
const ICON_VARIANTS = ["color", "grayscale", "zinc50"];

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
  const [missingAlarmFiles, setMissingAlarmFiles] = useState<string[]>([]);
  // 当前进程启动时生效的 WebView2 开关（用于判断改动是否在等重启生效）
  const [startupFlags, setStartupFlags] = useState<{ hw: boolean; smooth: boolean } | null>(
    null,
  );
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

  useEffect(() => {
    invoke<[boolean, boolean]>("get_startup_webview_flags")
      .then(([hw, smooth]) => setStartupFlags({ hw, smooth }))
      .catch(() => setStartupFlags(null));
  }, []);

  // 已配置为铃声的源文件是否仍然存在（全局六槽 + 各周表事务级）；
  // 丢失时在铃声 Tab 黄色提示，播放时后端自动回退内置铃声。
  const alarmSlotSignature = draft
    ? LEVELS.map((l) => draft[l.fileKey]).join("|")
    : "";
  useEffect(() => {
    let cancelled = false;
    const configured = new Set<string>();
    const add = (v: string | null) => {
      if (v && v !== "builtin" && v !== "none") configured.add(v);
    };
    if (draft) {
      for (const l of LEVELS) add(draft[l.fileKey]);
    }
    void (async () => {
      try {
        const plans = await listWeekPlans();
        for (const p of plans) {
          const full = await getWeekPlan(p.id);
          for (const e of full.entries) {
            add(e.alarmFile);
            add(e.endAlarmFile);
          }
        }
      } catch {
        // 事务级扫描失败不影响全局检查
      }
      const missing = [...configured]
        .filter((f) => !alarmFiles.includes(f))
        .sort();
      if (!cancelled) setMissingAlarmFiles(missing);
    })();
    return () => {
      cancelled = true;
    };

  }, [alarmFiles, alarmSlotSignature]);

  // 起止时间存放在独立的输入状态里，比较时需一并纳入，否则改时间无法激活保存按钮
  const dirty =
    draft != null &&
    config != null &&
    (JSON.stringify(draft) !== JSON.stringify(config) ||
      timeInputToMinute(startTime) !== config.dayStartMinute ||
      timeInputToMinute(endTime) !== config.dayEndMinute);

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
    if (!["sm", "base", "lg"].includes(draft.uiFontSize)) {
      showToast(t("settings.badFontSize"));
      return null;
    }
    if (!LOG_LEVELS.includes(draft.logLevel)) {
      showToast(t("settings.badLogLevel"));
      return null;
    }
    if (!ICON_VARIANTS.includes(draft.iconVariant)) {
      showToast(t("settings.badIconVariant"));
      return null;
    }
    for (const v of [draft.entryNormalColor, draft.entryRestColor]) {
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
        showToast(t("settings.badEntryColor"));
        return null;
      }
    }
    return { ...draft, dayStartMinute: start, dayEndMinute: end };
  };

  const handleSave = useCallback(async () => {
    const next = validate();
    if (!next) return;
    const prev = config;
    setSaving(true);
    try {
      await update(next);
      // 同步草稿与时间输入框：否则 draft 里的旧起止分钟会让脏检查一直判为未保存
      setDraft(next);
      setStartTime(minuteToTimeInput(next.dayStartMinute));
      setEndTime(minuteToTimeInput(next.dayEndMinute));
      // 显示引擎开关的改动需要重启才生效，提示文案与普通项区分
      const needsRestart =
        prev != null &&
        (next.webviewHwAccel !== prev.webviewHwAccel ||
          next.webviewSmoothScrolling !== prev.webviewSmoothScrolling);
      showToast(
        needsRestart ? t("toasts.settingsSavedRestart") : t("toasts.settingsSaved"),
      );
    } catch (e: unknown) {
      showToast(String(e));
    } finally {
      setSaving(false);
    }

  }, [config, draft, startTime, endTime, update, showToast, t]);

  // 快捷键：Ctrl+S 保存；Ctrl+Z 丢弃草稿（文本输入框内不拦截，保留原生撤销）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s" && dirty) {
        e.preventDefault();
        void handleSave();
      } else if (key === "z" && dirty) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        if (config) {
          e.preventDefault();
          setDraft(config);
          setStartTime(minuteToTimeInput(config.dayStartMinute));
          setEndTime(minuteToTimeInput(config.dayEndMinute));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [config, dirty, handleSave]);

  const handlePosition = useCallback(async (position: WindowControlsPosition) => {
    try {
      await updateWindowControlsPosition(position);
      showToast(t("toasts.positionUpdated"));
    } catch (e: unknown) {
      showToast(String(e));
    }
  }, [update, showToast, t]);

  // 渲染闸门放在所有 hook 之后（Rules of Hooks）；之后的代码可把 draft 收窄为非空
  const shiftHeld = useShiftHeld();

  // ⚠️ 渲染闸门：此行以下禁止声明任何 hook（useXxx/useMemo/useCallback）——
  //    否则首次渲染（config 未到）与之后的 hook 数量不一致，触发
  //    "Rendered more hooks than during the previous render"。新 hook 请放到本注释之前。
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

  // 已保存的显示引擎开关与本进程启动时的不一致 → 需要重启才能生效
  const restartPending =
    config != null &&
    startupFlags != null &&
    (config.webviewHwAccel !== startupFlags.hw ||
      config.webviewSmoothScrolling !== startupFlags.smooth);

  const handleRestartNow = async () => {
    try {
      await invoke("restart_application");
    } catch {
      // 重启成功时进程被替换，promise 不会返回；失败静默（按钮仍在，可重试）
    }
  };

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
              className={`rounded border px-2 py-1.5 text-xs transition-colors ${draft.firstDayOfWeek === d
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
              className={`rounded border px-2 py-1.5 text-xs transition-colors ${draft.uiLanguage === l
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
      <div className="flex items-center gap-2">
        <h2 className={sectionTitle}>{t("settings.bells")}</h2>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() =>
            void invoke("open_alarms_dir").catch((e: unknown) => showToast(String(e)))
          }
          className="flex items-center gap-1 rounded border border-zinc-500 px-2 py-1 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          <FolderIcon size="12px" />
          {t("settings.bellsOpenDir")}
        </button>
        <button
          type="button"
          onClick={() =>
            void listAlarmSounds()
              .then(setAlarmFiles)
              .catch(() => setAlarmFiles([]))
          }
          className="flex items-center gap-1 rounded border border-zinc-500 px-2 py-1 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          <RefreshIcon size="12px" />
          {t("settings.bellsRefresh")}
        </button>
      </div>
      <p className={sectionHint}>{t("settings.bellsHint")}</p>
      {missingAlarmFiles.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-300">
          {t("settings.bellsMissing", { names: missingAlarmFiles.join("、") })}
        </div>
      )}
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

  /** WebView2 开关行：点击切换草稿值，保存后重启应用生效。 */
  const webviewToggle = (
    labelKey: string,
    key: "webviewHwAccel" | "webviewSmoothScrolling" | "titlebarClock" | "titlebarClockSeconds",
  ) => (
    <button
      type="button"
      onClick={() =>
        setDraft((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev))
      }
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${draft[key]
        ? "border-blue-400 bg-blue-400/15 text-zinc-100"
        : "border-zinc-600 text-zinc-300 hover:bg-zinc-600/60"
        }`}
    >
      <span>{t(labelKey)}</span>
      <span className="text-[10px] text-zinc-400">
        {draft[key] ? t("settings.on") : t("settings.off")}
      </span>
    </button>
  );

  const appearancePanel = (
    <>
      <section>
        <h2 className={sectionTitle}>{t("settings.uiFont")}</h2>
        <div className="mt-2 flex max-w-md items-end gap-2">
          <select
            value={draft.uiFont}
            onChange={(e) =>
              setDraft((prev) => (prev ? { ...prev, uiFont: e.target.value } : prev))
            }
            className={`${inputClass} mt-0 flex-1`}
          >
            <option value="system">{t("settings.fontSystem")}</option>
            {BUNDLED_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.family}
                {f.id === "lxgw-wenkai-mono" ? t("settings.fontDefault") : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              void invoke("open_fonts_dir").catch((e: unknown) => showToast(String(e)))
            }
            className="flex shrink-0 items-center gap-1 rounded border border-zinc-500 px-2 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
          >
            <FolderIcon size="12px" />
            {t("settings.openFontDir")}
          </button>
        </div>
        <div
          className="mt-2 rounded-lg border border-zinc-600/60 p-3 text-sm text-zinc-100"
          style={{ fontFamily: fontPreviewFamily(draft.uiFont) }}
        >
          {t("settings.fontPreviewText")}
        </div>
      </section>

      <section>
        <h2 className={sectionTitle}>{t("settings.fontSize")}</h2>
        <div className="mt-2 grid w-64 grid-cols-3 gap-2">
          {(["sm", "base", "lg"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                setDraft((prev) => (prev ? { ...prev, uiFontSize: s } : prev))
              }
              className={`rounded border px-2 py-1.5 text-xs transition-colors ${draft.uiFontSize === s
                ? "border-blue-400 bg-blue-400/15 text-zinc-100"
                : "border-zinc-600 text-zinc-300 hover:bg-zinc-600/60"
                }`}
            >
              {s === "sm"
                ? t("settings.fontSizeSm")
                : s === "base"
                  ? t("settings.fontSizeBase")
                  : t("settings.fontSizeLg")}
            </button>
          ))}
        </div>
        <p className={sectionHint}>{t("settings.fontSizeHint")}</p>
      </section>

      <section>
        <h2 className={sectionTitle}>{t("settings.titlebarClockSection")}</h2>
        <p className={sectionHint}>{t("settings.titlebarClockHint")}</p>
        <div className="mt-2 space-y-3">
          <div>
            {webviewToggle("settings.titlebarClock", "titlebarClock")}
            {draft.titlebarClock && (
              <div className="mt-1">
                {webviewToggle("settings.titlebarClockSeconds", "titlebarClockSeconds")}
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className={sectionTitle}>{t("settings.iconVariant")}</h2>
        <div className="mt-2 grid w-full max-w-md grid-cols-3 gap-2">
          {(["color", "grayscale", "zinc50"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() =>
                setDraft((prev) => (prev ? { ...prev, iconVariant: v } : prev))
              }
              className={`rounded border px-2 py-1.5 text-xs transition-colors ${draft.iconVariant === v
                ? "border-blue-400 bg-blue-400/15 text-zinc-100"
                : "border-zinc-600 text-zinc-300 hover:bg-zinc-600/60"
                }`}
            >
              {t(`settings.iconVariant_${v}`)}
            </button>
          ))}
        </div>
        <p className={sectionHint}>{t("settings.iconVariantHint")}</p>
      </section>

      <section>
        <h2 className={sectionTitle}>{t("settings.entryColors")}</h2>
        <p className={sectionHint}>{t("settings.entryColorsHint")}</p>
        <div className="mt-2 grid w-full max-w-md grid-cols-2 gap-3">
          <label className="block text-xs text-zinc-300">
            {t("settings.entryNormalColor")}
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={draft.entryNormalColor}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev ? { ...prev, entryNormalColor: e.target.value } : prev
                  )
                }
                className={`w-full rounded border bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400 ${/^#[0-9a-fA-F]{6}$/.test(draft.entryNormalColor)
                  ? "border-zinc-600"
                  : "border-red-500"
                  }`}
              />
              <span
                className="size-7 shrink-0 rounded border border-zinc-600"
                style={{ background: hexPreview(draft.entryNormalColor) }}
              />
            </div>
          </label>
          <label className="block text-xs text-zinc-300">
            {t("settings.entryRestColor")}
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={draft.entryRestColor}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev ? { ...prev, entryRestColor: e.target.value } : prev
                  )
                }
                className={`w-full rounded border bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400 ${/^#[0-9a-fA-F]{6}$/.test(draft.entryRestColor)
                  ? "border-zinc-600"
                  : "border-red-500"
                  }`}
              />
              <span
                className="size-7 shrink-0 rounded border border-zinc-600"
                style={{ background: hexPreview(draft.entryRestColor) }}
              />
            </div>
          </label>
        </div>
        <div className="mt-3 grid w-full max-w-md grid-cols-2 gap-3">
          <label className="block text-xs text-zinc-300">
            {t("settings.entryNormalTextDark")}
            <select
              value={String(draft.entryNormalTextDark)}
              onChange={(e) =>
                setDraft((prev) =>
                  prev
                    ? { ...prev, entryNormalTextDark: e.target.value === "true" }
                    : prev
                )
              }
              className="mt-1 w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400"
            >
              <option value="false">{t("settings.textLight")}</option>
              <option value="true">{t("settings.textDark")}</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-300">
            {t("settings.entryRestTextDark")}
            <select
              value={String(draft.entryRestTextDark)}
              onChange={(e) =>
                setDraft((prev) =>
                  prev
                    ? { ...prev, entryRestTextDark: e.target.value === "true" }
                    : prev
                )
              }
              className="mt-1 w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400"
            >
              <option value="false">{t("settings.textLight")}</option>
              <option value="true">{t("settings.textDark")}</option>
            </select>
          </label>
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
              className={`rounded border px-2 py-1.5 text-xs transition-colors ${position === p
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

  const advancedPanel = (
    <>
      <section>
        <h2 className={sectionTitle}>{t("settings.webview")}</h2>
        <p className={sectionHint}>{t("settings.webviewHint")}</p>
        <div className="mt-2 space-y-3">
          <div>
            {webviewToggle("settings.advHwAccel", "webviewHwAccel")}
            <p className="mt-1 text-[10px] text-zinc-500">{t("settings.advHwAccelHint")}</p>
          </div>
          <div>
            {webviewToggle("settings.advSmooth", "webviewSmoothScrolling")}
            <p className="mt-1 text-[10px] text-zinc-500">{t("settings.advSmoothHint")}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className={sectionTitle}>{t("settings.logLevel")}</h2>
        <div className="mt-2 grid w-full max-w-md grid-cols-3 gap-2">
          {(["none", "verbose", "info", "warn", "error", "fatal"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() =>
                setDraft((prev) => (prev ? { ...prev, logLevel: l } : prev))
              }
              className={`rounded border px-2 py-1.5 text-xs transition-colors ${draft.logLevel === l
                ? "border-blue-400 bg-blue-400/15 text-zinc-100"
                : "border-zinc-600 text-zinc-300 hover:bg-zinc-600/60"
                }`}
            >
              {l}
            </button>
          ))}
        </div>
        <p className={sectionHint}>{t("settings.logLevelHint")}</p>
      </section>

      <section>
        {shiftHeld && (
          <button
            type="button"
            onClick={() => void invoke("open_devtools")}
            title={t("settings.openDevtoolsTitle")}
            className="rounded border border-zinc-500 px-4 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
          >
            {t("settings.openDevtools")}
          </button>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setClearStep(1)}
          className="rounded border border-zinc-500 px-4 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          {t("about.clearData")}
        </button>
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
        <div className="text-sm font-medium text-zinc-100">
          Scheet
          <span className="ml-2 text-xs text-zinc-400">v{pkg.version}</span>
        </div>
        <div className="mt-1 text-xs text-zinc-400">{t("about.tagline")}</div>
      </div>
      <p className="max-w-md text-xs leading-relaxed text-zinc-400 text-justify indent-6">
        {t("about.intro")}
      </p>
      <div className="w-full max-w-sm rounded-lg border border-zinc-600/60 p-3 pt-2.5 text-left">
        <div className="text-sm font-thin text-zinc-200">{t("about.mgr")}</div>
        <div className="mt-2 flex items-center gap-3">
          <img
            src={fr1gAvatarUrl}
            alt="@fr1g"
            className="size-10 shrink-0 rounded-lg object-cover"
          />
          <div>
            <div className="text-sm font-mono font-semibold text-zinc-100">@fr1g</div>
            <div className="text-[10px] text-zinc-500">{t("about.mgrNote")}</div>
          </div>
        </div>
      </div>
      <div className="w-full max-w-sm rounded-lg border border-zinc-600/60 p-3 pt-2.5 text-left">
        <div className="text-sm font-thin text-zinc-200">{t("about.collaborators")}</div>
        <div className="mt-2 flex items-center gap-3">
          <img
            src={zaiLogoUrl}
            alt="Z.ai"
            className="size-10 shrink-0 rounded-lg"
          />
          <div>
            <div className="text-sm font-mono font-semibold text-zinc-100">GLM-5.3-Flash</div>
            <div className="text-[10px] text-zinc-500">{t("about.aiNote")}</div>
          </div>
        </div>
      </div>
      <div className="w-full max-w-sm rounded-lg  text-sm grid grid-cols-3 gap-3">
        <a onClick={() => {
          Opener.openInDefaultBrowserExpl("https://github.com/fr1g/Scheet")
        }} className="border flex gap-1 justify-center items-center px-3 py-1.75 border-zinc-600/60 hover:bg-zinc-50/10 transition rounded-lg min-h-5">
          {/* 查看仓库 */}
          <LogoGithubIcon fillColor='transparent' strokeColor='currentColor' strokeWidth={2} />
          <span>
            GitHub
          </span>
          <JumpIcon fillColor='transparent' strokeColor='currentColor' strokeWidth={2} />
        </a>
        <a
          onClick={() => {
            // Opener.openInDefaultBrowserExpl("")
            showToast("Coming soon...敬请期待")
          }}
          className="border flex gap-1 justify-center items-center px-3 py-1.75 border-zinc-600/60 hover:bg-zinc-50/10 transition rounded-lg min-h-5">
          {/* vibrative club */}
          <img src={vbClubLogo} width={16} className="inline-block grayscale-100 " />
          <div className="w-19.5 grid place-items-center px-0.5">
            <span className="inline-block origin-top-left font-mono scale-x-69" style={{ fontFamily: 'consolas, cascadia code, monaco, mono' }}>
              Vibrative<span className="underline font-extrabold!">Club</span>
            </span>
          </div>
        </a>
        <a className="border flex gap-1 justify-center items-center px-3 py-1.75 border-zinc-600/60 hover:bg-zinc-50/10 transition rounded-lg min-h-5">
          {/*  */}
          <CrookedSmileIcon fillColor='transparent' strokeColor='currentColor' strokeWidth={2} />
          <span>还没想好</span>
        </a>
      </div>
      <hr className="mx-auto border-zinc-100/30 border-2 rounded translate-y-0.5 w-5/7" />
      <p className="text-xs! opacity-70 font-mono translate-y-[3px]">the Program and its source code are permitted to copy, share, release and modify under MIT license, but some of the relied parts requires other permission.</p>
      <CollapseBar title={t("about.infoTitle")} className="w-full!">
        <pre className="typo indent-6">{t("about.info")}</pre>
        <p className="font-mono text-sm translate-y-1 opacity-65">OpenSource Ref Links <JumpIcon fillColor='transparent' strokeColor='currentColor' strokeWidth={2} /></p>
        <ul className="mt-3 space-y-1 text-xs text-zinc-400">
          {OPENSOURCE.map(([name, url]) => (
            <li key={url}>
              {name} ::{" "}
              <a
                onClick={() => {
                  Opener.openInDefaultBrowserExpl(url ?? '');
                }}
                rel="noreferrer"
                className="text-zinc-500 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-300"
              >
                {/* A CLICK HERE */}
                {url}
              </a>
            </li>
          ))}
        </ul>
      </CollapseBar>
    </section>
  );

  const panels: Record<TabId, ReactNode> = {
    general: generalPanel,
    bells: bellsPanel,
    appearance: appearancePanel,
    advanced: advancedPanel,
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
            {t("topbar.unsaved")}
          </span>
        )}
        <div className="flex-1" />
        {restartPending && (
          <button
            type="button"
            onClick={() => void handleRestartNow()}
            title={t("settings.restartNowTitle")}
            className="rounded border border-amber-400/50 px-2.5 py-1 text-xs text-amber-300 transition-colors hover:bg-zinc-600"
          >
            {t("settings.restartNow")}
          </button>
        )}
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
            className={`-mb-px border-b-2 px-3 py-2 text-xs transition-colors ${activeTab === tab.id
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
            title={t("about.clearData")}
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
            title={t("about.clearData")}
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
            title={t("about.clearData")}
            onClose={() => setClearStep(0)}
            onConfirm={() => void handleClearNow()}
            confirmText={t("common.confirm")}
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
