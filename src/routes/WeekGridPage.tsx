import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import Toast from "../components/Toast";
import WeekGrid from "../components/week/WeekGrid";
import WeekPlanTabs from "../components/week/WeekPlanTabs";
import { getGlobalConfig } from "../lib/global-config";
import {
  createWeekPlan,
  getCurrentWeekPlan,
  getWeekPlan,
  listWeekPlans,
  saveWeekPlan,
} from "../lib/weeks";
import type { GlobalConfig } from "../types/global-config";
import type { FullPlan, WeekPlan } from "../types/weeks";

/** 周表页：左侧 tab 列 + 中央网格。编辑在工作副本上进行，显式保存入库。 */
export default function WeekGridPage() {
  const [plans, setPlans] = useState<WeekPlan[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [plan, setPlan] = useState<FullPlan | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const loadPlans = useCallback(
    async (preferred: number | null) => {
      const [list, current] = await Promise.all([
        listWeekPlans(),
        getCurrentWeekPlan().catch(() => null),
      ]);
      setPlans(list);
      setCurrentId(current ? current.plan.id : null);
      setSelectedId(preferred ?? current?.plan.id ?? list[0]?.id ?? null);
    },
    [],
  );

  useEffect(() => {
    getGlobalConfig()
      .then(setConfig)
      .catch((e) => showToast(String(e)));
    loadPlans(null).catch((e) => showToast(String(e)));
  }, [loadPlans, showToast]);

  useEffect(() => {
    if (selectedId == null) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    getWeekPlan(selectedId)
      .then((loaded) => {
        if (cancelled) return;
        setPlan(loaded);
        setSavedSnapshot(JSON.stringify(loaded));
      })
      .catch((e) => showToast(String(e)));
    return () => {
      cancelled = true;
    };
  }, [selectedId, showToast]);

  const dirty = plan != null && JSON.stringify(plan) !== savedSnapshot;

  const handleSelect = (id: number) => {
    if (id === selectedId) return;
    if (dirty) {
      setConfirmSwitch(id);
      return;
    }
    setSelectedId(id);
  };

  const handleAdd = async () => {
    try {
      const created = await createWeekPlan();
      await loadPlans(created.id);
      showToast(`已创建 ${created.name}`);
    } catch (e) {
      showToast(String(e));
    }
  };

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const outcome = await saveWeekPlan({
        id: plan.plan.id,
        name: plan.plan.name,
        dayStartMinute: plan.plan.dayStartMinute,
        dayEndMinute: plan.plan.dayEndMinute,
        entries: plan.entries,
        overrides: plan.overrides,
      });
      if (outcome.saved && outcome.plan) {
        setPlan(outcome.plan);
        setSavedSnapshot(JSON.stringify(outcome.plan));
        showToast("周表已保存");
      } else {
        showToast(`存在 ${outcome.conflicts.length} 处时间重叠，已拒绝保存`);
      }
    } catch (e) {
      showToast(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!config || !plan) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-300">
        加载周表…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <WeekPlanTabs
        plans={plans}
        selectedId={selectedId}
        currentId={currentId}
        onSelect={handleSelect}
        onAdd={handleAdd}
      />
      <WeekGrid
        plan={plan}
        config={config}
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
      />
      <aside className="w-64 shrink-0 border-l border-zinc-600 p-3">
        <div className="text-xs text-zinc-400">今日待办</div>
        <div className="mt-2 text-[10px] text-zinc-500">
          待办列表与剪贴板预览将在 M5 里程碑提供
        </div>
      </aside>
      <ConfirmDialog
        open={confirmSwitch != null}
        title="未保存的更改"
        message="切换周表将丢弃未保存的修改，确定继续？"
        confirmText="丢弃并切换"
        danger
        onConfirm={() => {
          const target = confirmSwitch;
          setConfirmSwitch(null);
          if (target != null) setSelectedId(target);
        }}
        onCancel={() => setConfirmSwitch(null)}
      />
      <Toast message={toast} />
    </div>
  );
}
