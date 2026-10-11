import { useSyncExternalStore } from "react";

/** 标题栏操作按钮组（周表页写入，TitleBar 订阅；离开周表页即清空 → 自动隐藏）。 */
export interface TitleBarActions {
  /** 工作副本有未保存改动（显示未保存徽章与回滚按钮）。 */
  dirty: boolean;
  /** 保存进行中（保存按钮禁用）。 */
  saving: boolean;
  /** 已选中事务（复制按钮可用）。 */
  canCopy: boolean;
  /** 已设粘贴目标且剪贴板有待粘贴事务（粘贴按钮可用）。 */
  canPaste: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onSave: () => void;
  /** 打开"放弃改动"确认框（确认框仍由周表页渲染）。 */
  onRevert: () => void;
}

/** 标题栏所需的共享状态（周表页写入，TitleBar 订阅）。 */
export interface TitleState {
  /** 轮换"当周"对应的槽位号（1..=6）。 */
  currentPlanSlot: number | null;
  /** tab 当前选中（编辑中）周表的槽位号。 */
  selectedPlanSlot: number | null;
  /** 周表总数（决定单周/双周命名规则）。 */
  planCount: number;
  /** 操作按钮组；null = 当前不在周表页（标题栏隐藏按钮组）。 */
  actions: TitleBarActions | null;
}

let state: TitleState = {
  currentPlanSlot: null,
  selectedPlanSlot: null,
  planCount: 0,
  actions: null,
};

const listeners = new Set<() => void>();

export function setTitleState(patch: Partial<TitleState>): void {
  const next = { ...state, ...patch };
  if (
    next.currentPlanSlot === state.currentPlanSlot &&
    next.selectedPlanSlot === state.selectedPlanSlot &&
    next.planCount === state.planCount &&
    next.actions === state.actions
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
