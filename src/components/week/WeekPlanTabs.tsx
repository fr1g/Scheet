import { AddIcon } from "tdesign-icons-react";
import type { WeekPlan } from "../../types/weeks";

interface WeekPlanTabsProps {
  plans: WeekPlan[];
  selectedId: number | null;
  /** 当前轮换周应使用的周表（tab 上打点标记）。 */
  currentId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
}

/** 左侧纵向周表 tab 列：1~6 个动态槽位，未满时末尾显示添加按钮。 */
export default function WeekPlanTabs({
  plans,
  selectedId,
  currentId,
  onSelect,
  onAdd,
}: WeekPlanTabsProps) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-zinc-600 py-2">
      {plans.map((plan) => {
        const selected = plan.id === selectedId;
        const isCurrent = plan.id === currentId;
        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            title={isCurrent ? `${plan.name}（当周）` : plan.name}
            className={`relative w-12 rounded-lg px-1 py-2 text-center transition-colors ${
              selected ? "bg-zinc-600" : "hover:bg-zinc-600/60"
            }`}
          >
            {isCurrent && (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
            <span className="block text-[10px] leading-3 text-zinc-400">
              {plan.slot}
            </span>
            <span className="block w-full truncate text-[10px] leading-3 text-zinc-100">
              {plan.name}
            </span>
          </button>
        );
      })}
      {plans.length < 6 && (
        <button
          type="button"
          onClick={onAdd}
          title="添加周表"
          className="flex h-9 w-12 items-center justify-center rounded-lg text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          <AddIcon size="16px" />
        </button>
      )}
    </nav>
  );
}
