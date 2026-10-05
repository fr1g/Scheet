import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { closeAlarmPopup, dismissAlarmPopup } from "../lib/popup";

interface AlarmPopupData {
  title: string;
  /** 手动提醒的自定义内容（周课表提醒没有）。 */
  body: string;
  /** "start" | "end"（周课表提醒）。 */
  kind: string;
  /** "HH:MM"（周课表提醒）。 */
  time: string;
  mode: string;
}

function clockText(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** 提醒弹窗：置顶子窗口，展示事务信息与实时时钟；点击 = 停止响铃 + 回主窗口。 */
export default function AlarmPopupPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [data, setData] = useState<AlarmPopupData>(() => ({
    title: params.get("title") ?? "",
    body: params.get("body") ?? "",
    kind: params.get("kind") ?? "",
    time: params.get("time") ?? "",
    mode: params.get("mode") ?? "once",
  }));
  const [clock, setClock] = useState(clockText());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(clockText()), 250);
    return () => window.clearInterval(timer);
  }, []);

  // 后端复用弹窗时通过事件更新内容
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<AlarmPopupData>("scheet://alarm-popup", (e) => setData(e.payload)).then(
      (un) => {
        unlisten = un;
      },
    );
    return () => unlisten?.();
  }, []);

  return (
    <div
      onClick={() => void closeAlarmPopup().catch(() => undefined)}
      title={t("popup.clickHint")}
      className="h-screen w-screen cursor-pointer border border-zinc-600 bg-zinc-800 p-3 text-zinc-100 shadow-2xl"
    >
      <div className="flex items-center justify-between text-[10px] text-zinc-400">
        <span>
          {data.mode === "loop" ? t("popup.looping") : t("popup.reminder")}
        </span>
        <span className="font-mono text-xs text-zinc-200">{clock}</span>
      </div>
      <div className="mt-1 truncate text-sm font-medium">{data.title}</div>
      {data.kind && data.time && (
        <div className="truncate text-xs text-zinc-300">
          {t(data.kind === "end" ? "alarm.end" : "alarm.start")} · {data.time}
        </div>
      )}
      {data.body && <div className="truncate text-xs text-zinc-300">{data.body}</div>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-zinc-500">{t("popup.clickHint")}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void dismissAlarmPopup().catch(() => undefined);
          }}
          className="rounded border border-zinc-500 px-2 py-0.5 text-[10px] text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          {t("popup.openMain")}
        </button>
      </div>
    </div>
  );
}
