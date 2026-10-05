import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { stopAlarmSound } from "../lib/alarm-sound";

export interface AlarmEventData {
  entryId: number;
  kind: "start" | "end";
  entryType: "normal" | "rest";
  title: string;
  body: string;
  ringtone: string;
  mode: "once" | "loop";
}

/**
 * 应用内提醒 snackbar：提醒事件触发时出现在主窗口右下角。
 * 循环响铃持续到点击【确认】；一次性提醒 30 秒后自动消退。
 * 仅在主窗口渲染（提醒弹窗子窗口不显示 snackbar）。
 */
export default function AlarmSnackbar() {
  const { t } = useTranslation();
  const [event, setEvent] = useState<AlarmEventData | null>(null);

  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    let unlisten: (() => void) | undefined;
    void listen<AlarmEventData>("scheet://alarm", (e) => setEvent(e.payload)).then(
      (un) => {
        unlisten = un;
      },
    );
    return () => unlisten?.();
  }, []);

  const isLoop = event?.mode === "loop";
  useEffect(() => {
    if (!event || isLoop) return;
    const timer = window.setTimeout(() => setEvent(null), 30000);
    return () => window.clearTimeout(timer);
  }, [event, isLoop]);

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          key="alarm-snackbar"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="alarm-snackbar-pulse fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-zinc-600 bg-zinc-800 p-3"
        >
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>
              {t(event.kind === "start" ? "alarmSnackbar.start" : "alarmSnackbar.end")} ·{" "}
              {t(
                event.entryType === "normal" ? "alarmSnackbar.normal" : "alarmSnackbar.rest",
              )}
            </span>
            {isLoop && <span className="text-amber-300">{t("alarmSnackbar.looping")}</span>}
          </div>
          <div className="mt-1 truncate text-sm text-zinc-100">
            {event.title ||
              (event.entryType === "rest"
                ? t("alarmSnackbar.rest")
                : t("alarmSnackbar.normal"))}
          </div>
          <div className="mt-0.5 text-xs text-zinc-300">{event.body}</div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                void stopAlarmSound().catch(() => undefined);
                setEvent(null);
              }}
              className="rounded bg-blue-500 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-400"
            >
              {t("alarmSnackbar.confirm")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
