import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon, SaveIcon } from "tdesign-icons-react";
import Toast from "../components/Toast";
import { TimeField } from "../components/week/PlanSettingsDialog";
import { listAlarmSounds } from "../lib/clipboard";
import { getGlobalConfig, setGlobalConfig } from "../lib/global-config";
import {
  alarmFileLabel,
  alarmModeLabel,
  minuteToTimeInput,
  timeInputToMinute,
} from "../lib/weekgrid";
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

const POSITION_LABELS: Record<WindowControlsPosition, string> = {
  left: "左侧（关闭、最小化）",
  right: "右侧（最小化、关闭）",
  hidden: "隐藏",
};

const LEVELS: { label: string; fileKey: FileKey; modeKey: ModeKey; kind: "start" | "end" }[] = [
  { label: "全部提醒事务", fileKey: "alarmAllFile", modeKey: "alarmAllMode", kind: "start" },
  { label: "普通事务默认", fileKey: "alarmNormalFile", modeKey: "alarmNormalMode", kind: "start" },
  { label: "休息事务默认", fileKey: "alarmRestFile", modeKey: "alarmRestMode", kind: "start" },
  { label: "全部提醒事务（结束）", fileKey: "alarmAllEndFile", modeKey: "alarmAllEndMode", kind: "end" },
  { label: "普通事务默认（结束）", fileKey: "alarmNormalEndFile", modeKey: "alarmNormalEndMode", kind: "end" },
  { label: "休息事务默认（结束）", fileKey: "alarmRestEndFile", modeKey: "alarmRestEndMode", kind: "end" },
];

/** 全局设置页：一天窗口 / 每周第一天 / 铃声解析链 / 窗口按钮位置。 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateWindowControlsPosition } = useSettings();
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [snapshot, setSnapshot] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [alarmFiles, setAlarmFiles] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const loaded = await getGlobalConfig();
      setConfig(loaded);
      setSnapshot(JSON.stringify(loaded));
      setStartTime(minuteToTimeInput(loaded.dayStartMinute));
      setEndTime(minuteToTimeInput(loaded.dayEndMinute));
    } catch (e) {
      setLoadError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    listAlarmSounds()
      .then(setAlarmFiles)
      .catch(() => setAlarmFiles([]));
  }, [load]);

  const dirty = config != null && JSON.stringify(config) !== snapshot;

  const patchFile = (key: FileKey, value: string | null) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  };
  const patchMode = (key: ModeKey, value: AlarmMode | null) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const validate = (): GlobalConfig | null => {
    if (!config) return null;
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
      showToast("一天起止时间格式不正确");
      return null;
    }
    if (start >= end) {
      showToast("一天开始时间必须早于结束时间");
      return null;
    }
    for (const key of LEVELS.map((l) => l.fileKey)) {
      const value = config[key];
      if (value != null && value !== "builtin" && value !== "none") {
        if (
          value.includes("/") ||
          value.includes("\\") ||
          value.includes("..") ||
          value.startsWith(".")
        ) {
          showToast(`铃声文件名不合法: ${value}`);
          return null;
        }
      }
    }
    return { ...config, dayStartMinute: start, dayEndMinute: end };
  };

  const handleSave = async () => {
    const next = validate();
    if (!next) return;
    setSaving(true);
    try {
      const saved = await setGlobalConfig(next);
      setConfig(saved);
      setSnapshot(JSON.stringify(saved));
      setStartTime(minuteToTimeInput(saved.dayStartMinute));
      setEndTime(minuteToTimeInput(saved.dayEndMinute));
      showToast("设置已保存，提醒立即按新配置生效");
    } catch (e) {
      showToast(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePosition = async (position: WindowControlsPosition) => {
    try {
      await updateWindowControlsPosition(position);
      showToast("窗口按钮位置已更新");
    } catch (e) {
      showToast(String(e));
    }
  };

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-100">
        <p className="text-sm">设置加载失败</p>
        <p className="max-w-md text-center text-xs break-all text-zinc-300">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded px-4 py-1.5 text-sm transition-colors hover:bg-zinc-600"
        >
          重试
        </button>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-300">
        加载设置…
      </div>
    );
  }

  const position = settings?.windowControls.position ?? "right";
  const inputClass =
    "mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-400";
  const unsetStartFileLabel = "未设置（按内置铃声）";
  const unsetEndFileLabel = "未设置（跟随开始铃声）";
  const unsetStartModeLabel = "未设置（播放一次）";
  const unsetEndModeLabel = "未设置（跟随开始模式）";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-600 px-3 py-1.5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          title="返回"
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          <ArrowLeftIcon size="15px" />
        </button>
        <h1 className="text-sm text-zinc-100">设置</h1>
        {dirty && (
          <span className="animate-pulse rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-300">
            未保存更改 ●
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
          保存
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          <section>
            <h2 className="text-xs font-medium text-zinc-100">一天窗口</h2>
            <p className="mt-1 text-[10px] text-zinc-500">
              周表未单独设置时的全局默认；周表/当天的设置会覆盖这里。
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <TimeField label="一天开始" value={startTime} onChange={setStartTime} />
              <TimeField label="一天结束" value={endTime} onChange={setEndTime} />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-zinc-100">每周第一天</h2>
            <p className="mt-1 text-[10px] text-zinc-500">
              影响网格列顺序与周表轮换的锚点计算。
            </p>
            <div className="mt-2 grid w-64 grid-cols-2 gap-2">
              {(["mon", "sun"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setConfig((prev) => (prev ? { ...prev, firstDayOfWeek: d } : prev))}
                  className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                    config.firstDayOfWeek === d
                      ? "border-blue-400 bg-blue-400/15 text-zinc-100"
                      : "border-zinc-600 text-zinc-300 hover:bg-zinc-600/60"
                  }`}
                >
                  {d === "mon" ? "周一" : "周日"}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-zinc-100">铃声解析链</h2>
            <p className="mt-1 text-[10px] text-zinc-500">
              事务级未设置时按 类型默认 → 这里的全局默认 → 内置铃声 回退；
              结束铃声未设置时先跟随开始铃声。
            </p>
            <div className="mt-2 space-y-4">
              {LEVELS.map((level) => (
                <div key={level.fileKey} className="rounded-lg border border-zinc-600/60 p-3">
                  <div className="text-xs text-zinc-200">{level.label}</div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <label className="block text-xs text-zinc-300">
                      铃声
                      <select
                        value={config[level.fileKey] ?? ""}
                        onChange={(e) =>
                          patchFile(level.fileKey, e.target.value === "" ? null : e.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">
                          {level.kind === "start" ? unsetStartFileLabel : unsetEndFileLabel}
                        </option>
                        <option value="builtin">{alarmFileLabel("builtin")}</option>
                        <option value="none">{alarmFileLabel("none")}</option>
                        {alarmFiles.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-zinc-300">
                      播放模式
                      <select
                        value={config[level.modeKey] ?? ""}
                        onChange={(e) =>
                          patchMode(
                            level.modeKey,
                            e.target.value === "" ? null : (e.target.value as AlarmMode),
                          )
                        }
                        className={inputClass}
                      >
                        <option value="">
                          {level.kind === "start" ? unsetStartModeLabel : unsetEndModeLabel}
                        </option>
                        <option value="once">{alarmModeLabel("once")}</option>
                        <option value="loop">{alarmModeLabel("loop")}</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-zinc-100">窗口控制按钮组</h2>
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
                  {POSITION_LABELS[p]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">立即生效并持久化。</p>
          </section>
        </div>
      </div>

      <Toast message={toast} />
    </div>
  );
}
