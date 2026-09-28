import { useSyncExternalStore } from "react";

/** 标题栏应用标题所需的共享状态（周表页写入，TitleBar 订阅）。 */
export interface TitleState {
  /** 轮换"当周"对应的槽位号（1..=6）。 */
  currentPlanSlot: number | null;
  /** tab 当前选中（编辑中）周表的槽位号。 */
  selectedPlanSlot: number | null;
  /** 周表总数（决定单周/双周命名规则）。 */
  planCount: number;
}

let state: TitleState = {
  currentPlanSlot: null,
  selectedPlanSlot: null,
  planCount: 0,
};

const listeners = new Set<() => void>();

export function setTitleState(patch: Partial<TitleState>): void {
  const next = { ...state, ...patch };
  if (
    next.currentPlanSlot === state.currentPlanSlot &&
    next.selectedPlanSlot === state.selectedPlanSlot &&
    next.planCount === state.planCount
  ) {
    return;
  }
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTitleState(): TitleState {
  return useSyncExternalStore(subscribe, () => state);
}
