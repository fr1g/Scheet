import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";

/** 当前本地日期（单一事实来源：Rust 调度线程，与提醒事件/todo 滚动一致）。 */
export interface TodayState {
  /** 本地日期 YYYY-MM-DD。 */
  date: string;
  /** ISO 周几（1=周一..7=周日）。 */
  weekday: number;
}

function computeLocalToday(): TodayState {
  const now = new Date();
  const day = now.getDay();
  return {
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`,
    weekday: day === 0 ? 7 : day,
  };
}

let state: TodayState = computeLocalToday();
const listeners = new Set<() => void>();
let listenerAttached = false;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // 惰性挂载调度器的日期切换事件（应用生命周期内常驻）
  if (!listenerAttached) {
    listenerAttached = true;
    void listen<TodayState>("scheet://date-changed", (event) => {
      const next = event.payload;
      if (next.date === state.date) return;
      state = next;
      listeners.forEach((fn) => fn());
    }).catch((e) => {
      listenerAttached = false;
      console.error("监听日期切换事件失败", e);
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useToday(): TodayState {
  return useSyncExternalStore(subscribe, () => state);
}
