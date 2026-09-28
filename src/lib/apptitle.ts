/**
 * 应用标题的命名规则：
 * - 周表数为 2 时：槽位 1 显示"单周"、槽位 2 显示"双周"；
 * - 其他数量：显示"第x周"（x = 槽位号）。
 * 标题格式：`{当前周}，{日期} - Scheet`；tab 选中与当周不同的周表时
 * 末尾追加 `(选中: {选中周})`。同一标题同步到系统窗口标题。
 */

import type { TitleState } from "../state/titleState";

export function weekLabel(
  slot: number | null,
  planCount: number,
): string {
  if (slot == null) return "";
  if (planCount === 2) {
    return slot === 1 ? "单周" : "双周";
  }
  return `第${slot}周`;
}

export function todayLocalISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function buildAppTitle(state: TitleState): string {
  const current = weekLabel(state.currentPlanSlot, state.planCount);
  if (!current) {
    return "Scheet";
  }
  let title = `${current}，${todayLocalISO()} - Scheet`;
  if (
    state.selectedPlanSlot != null &&
    state.selectedPlanSlot !== state.currentPlanSlot
  ) {
    title += `(选中: ${weekLabel(state.selectedPlanSlot, state.planCount)})`;
  }
  return title;
}
