import { AddIcon } from "tdesign-icons-react";
import type { WeekPlan } from "../../types/weeks";

interface WeekPlanTabsProps {
  plans: WeekPlan[];
  selectedId: number | null;
  /** 当前轮换周应使用的周表（tab 上打点标记）。 */
  currentId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  /** 右键 tab：打开周表菜单（设置/设为当周/删除）。 */
  onTabMenu?: (e: React.MouseEvent, plan: WeekPlan) => void;
}

/**
 * 左侧纵向周表 tab 列：每个 tab 占窗口高度的 1/6（类似 Windows 属性标签页），
 * 选中的 tab 与右侧表区连通（右侧无边框 + 负外边距盖住内容区左边框）。
 */
export default function WeekPlanTabs({
  plans,
  selectedId,
  currentId,
  onSelect,
  onAdd,
  onTabMenu,
}: WeekPlanTabsProps) {
  return (
    <nav className="flex h-full w-16 shrink-0 flex-col">
      {plans.map((plan) => {
        const selected = plan.id === selectedId;
        const isCurrent = plan.id === currentId;
        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              onTabMenu?.(e, plan);
            }}
            title={isCurrent ? `${plan.name}（当周）` : plan.name}
            className={`relative h-1/6 w-full border text-left transition-colors ${
              selected
                ? "z-10 -mr-px border-zinc-600 border-r-0 bg-zinc-700"
                : "border-zinc-600 bg-zinc-800 hover:bg-zinc-600/60"
            }`}
          >
            {isCurrent && (
              <span className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
            <span className="absolute right-1.5 top-1 text-[10px] leading-3 text-zinc-500">
              {plan.slot}
            </span>
            <span className="flex h-full w-full items-center justify-center px-1">
              <span className="line-clamp-2 text-center text-xs leading-tight text-zinc-100">
                {plan.name}
              </span>
            </span>
          </button>
        );
      })}
      {plans.length < 6 && (
        <button
          type="button"
          onClick={onAdd}
          title="添加周表"
          className="flex h-1/6 w-full items-center justify-center border border-zinc-600 bg-zinc-800 text-zinc-100 transition-colors hover:bg-zinc-600/60"
        >
          <AddIcon size="16px" />
        </button>
      )}
    </nav>
  );
}
