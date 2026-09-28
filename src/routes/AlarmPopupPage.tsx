import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSearchParams } from "react-router-dom";
import { dismissAlarmPopup } from "../lib/popup";

interface AlarmPopupData {
  title: string;
  body: string;
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
  const [params] = useSearchParams();
  const [data, setData] = useState<AlarmPopupData>(() => ({
    title: params.get("title") ?? "提醒",
    body: params.get("body") ?? "",
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
      onClick={() => void dismissAlarmPopup().catch(() => undefined)}
      title="点击停止响铃并回到主窗口"
      className="h-screen w-screen cursor-pointer border border-zinc-600 bg-zinc-800 p-3 text-zinc-100 shadow-2xl"
    >
      <div className="flex items-center justify-between text-[10px] text-zinc-400">
        <span>
          {data.mode === "loop" ? "循环响铃中 · 点击停止" : "事务提醒"}
        </span>
        <span className="font-mono text-xs text-zinc-200">{clock}</span>
      </div>
      <div className="mt-1 truncate text-sm font-medium">{data.title}</div>
      <div className="truncate text-xs text-zinc-300">{data.body}</div>
      <div className="mt-1 text-[10px] text-zinc-500">
        点击任意位置停止响铃并回到主窗口
      </div>
    </div>
  );
}
