import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import ContextMenu, { type ContextMenuItem } from "../components/ContextMenu";
import Toast from "../components/Toast";
import DaySettingsDialog from "../components/week/DaySettingsDialog";
import PlanSettingsDialog from "../components/week/PlanSettingsDialog";
import WeekGrid from "../components/week/WeekGrid";
import WeekPlanTabs from "../components/week/WeekPlanTabs";
import { getGlobalConfig } from "../lib/global-config";
import {
  createWeekPlan,
  deleteWeekPlan,
  getWeekPlan,
  getCurrentWeekPlan,
  listWeekPlans,
  saveWeekPlan,
  setActiveWeekPlan,
} from "../lib/weeks";
import { readClipboardText, writeClipboardText } from "../lib/clipboard";
import {
  parseEntryPlan,
  serializeEntryPlan,
  weekdayLabel,
} from "../lib/weekgrid";
import type { GlobalConfig } from "../types/global-config";
import type { FullPlan, WeekPlan } from "../types/weeks";
import { setTitleState } from "../state/titleState";

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

  // 右键菜单与设置弹窗状态
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; plan: WeekPlan } | null>(null);
  const [dayMenu, setDayMenu] = useState<{ x: number; y: number; weekday: number } | null>(null);
  const [planSettings, setPlanSettings] = useState<WeekPlan | null>(null);
  const [daySettings, setDaySettings] = useState<{
    weekday: number;
    initialStart: number | null;
    initialEnd: number | null;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WeekPlan | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [pasteTargetWeekday, setPasteTargetWeekday] = useState<number | null>(null);

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

  // 同步标题栏/系统窗口标题所需的状态
  useEffect(() => {
    setTitleState({
      currentPlanSlot:
        plans.find((p) => p.id === currentId)?.slot ?? null,
      selectedPlanSlot:
        plans.find((p) => p.id === selectedId)?.slot ?? null,
      planCount: plans.length,
    });
  }, [plans, currentId, selectedId]);

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

  // ============ 右键菜单动作 ============

  const handleSetActive = async (target: WeekPlan) => {
    try {
      await setActiveWeekPlan(target.id);
      await loadPlans(selectedId);
      showToast(`已将「${target.name}」设为当周`);
    } catch (e) {
      showToast(String(e));
    }
  };

  const handleDelete = async (target: WeekPlan) => {
    try {
      await deleteWeekPlan(target.id);
      await loadPlans(selectedId === target.id ? null : selectedId);
      showToast(`已删除「${target.name}」`);
    } catch (e) {
      showToast(String(e));
    }
  };

  const tabMenuItems: ContextMenuItem[] = tabMenu
    ? [
        {
          label: "周表设置…",
          onSelect: () => setPlanSettings(tabMenu.plan),
        },
        {
          label: "设为当周",
          hidden: tabMenu.plan.id === currentId,
          onSelect: () => void handleSetActive(tabMenu.plan),
        },
        {
          label: "删除…",
          danger: true,
          hidden: tabMenu.plan.slot === 1,
          onSelect: () => setConfirmDelete(tabMenu.plan),
        },
      ]
    : [];

  const dayMenuItems: ContextMenuItem[] = dayMenu
    ? [
        {
          label: "当天设置…",
          onSelect: () => {
            if (!plan) return;
            const o = plan.overrides.find((o) => o.weekday === dayMenu.weekday);
            setDaySettings({
              weekday: dayMenu.weekday,
              initialStart: o?.dayStartMinute ?? null,
              initialEnd: o?.dayEndMinute ?? null,
            });
          },
        },
      ]
    : [];

  /** 周表设置确认：只改工作副本，随主保存按钮入库。 */
  const handlePlanSettings = (
    name: string,
    dayStart: number | null,
    dayEnd: number | null,
  ) => {
    setPlanSettings(null);
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            plan: { ...prev.plan, name, dayStartMinute: dayStart, dayEndMinute: dayEnd },
          }
        : prev,
    );
  };

  // ============ 选中 / 复制 / 粘贴 ============

  const handleCopy = useCallback(async () => {
    if (!plan || selectedEntryId == null) return;
    const entry = plan.entries.find((e) => e.id === selectedEntryId);
    if (!entry) return;
    await writeClipboardText(serializeEntryPlan(entry));
    showToast("已复制事务到剪贴板");
  }, [plan, selectedEntryId, showToast]);

  const handlePaste = useCallback(async () => {
    if (pasteTargetWeekday == null) return;
    try {
      const raw = await readClipboardText();
      const base = parseEntryPlan(raw);
      if (!base) {
        showToast("剪贴板中没有可用的事务数据");
        return;
      }
      setPlan((prev) => {
        if (!prev) return prev;
        // 新条目使用递减的负数临时 id（仅用于冲突配对，保存后重建）
        const tempId = Math.min(0, ...prev.entries.map((e) => e.id)) - 1;
        return {
          ...prev,
          entries: [
            ...prev.entries,
            { ...base, id: tempId, weekday: pasteTargetWeekday },
          ],
        };
      });
      showToast(`已粘贴到${weekdayLabel(pasteTargetWeekday)}（重叠冲突已标红）`);
    } catch (e) {
      showToast(String(e));
    }
  }, [pasteTargetWeekday, showToast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "c" && selectedEntryId != null) {
        e.preventDefault();
        void handleCopy();
      } else if (key === "v" && pasteTargetWeekday != null) {
        e.preventDefault();
        void handlePaste();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCopy, handlePaste, selectedEntryId, pasteTargetWeekday]);

  /** 当天设置确认：更新/移除工作副本中的日覆盖。 */
  const handleDaySettings = (
    weekday: number,
    dayStart: number | null,
    dayEnd: number | null,
  ) => {
    setDaySettings(null);
    setPlan((prev) => {
      if (!prev) return prev;
      const others = prev.overrides.filter((o) => o.weekday !== weekday);
      const overrides =
        dayStart == null && dayEnd == null
          ? others
          : [...others, { weekday, dayStartMinute: dayStart, dayEndMinute: dayEnd }];
      return { ...prev, overrides };
    });
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
        onTabMenu={(e, target) => setTabMenu({ x: e.clientX, y: e.clientY, plan: target })}
      />
      <WeekGrid
        plan={plan}
        config={config}
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onDayMenu={(e, weekday) => setDayMenu({ x: e.clientX, y: e.clientY, weekday })}
        selectedEntryId={selectedEntryId}
        onSelectEntry={setSelectedEntryId}
        onPasteTarget={setPasteTargetWeekday}
        pasteTargetWeekday={pasteTargetWeekday}
        onCopy={() => void handleCopy()}
        onPaste={() => void handlePaste()}
      />
      <aside className="w-64 shrink-0 border-l border-zinc-600 p-3">
        <div className="text-xs text-zinc-400">今日待办</div>
        <div className="mt-2 text-[10px] text-zinc-500">
          待办列表与剪贴板预览将在 M5 里程碑提供
        </div>
      </aside>
      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          items={tabMenuItems}
          onClose={() => setTabMenu(null)}
        />
      )}
      {dayMenu && (
        <ContextMenu
          x={dayMenu.x}
          y={dayMenu.y}
          items={dayMenuItems}
          onClose={() => setDayMenu(null)}
        />
      )}
      {planSettings && (
        <PlanSettingsDialog
          key={planSettings.id}
          plan={planSettings}
          onClose={() => setPlanSettings(null)}
          onConfirm={handlePlanSettings}
        />
      )}
      {daySettings && (
        <DaySettingsDialog
          key={daySettings.weekday}
          weekday={daySettings.weekday}
          initialStart={daySettings.initialStart}
          initialEnd={daySettings.initialEnd}
          onClose={() => setDaySettings(null)}
          onConfirm={(dayStart, dayEnd) =>
            handleDaySettings(daySettings.weekday, dayStart, dayEnd)
          }
        />
      )}
      <ConfirmDialog
        open={confirmDelete != null}
        title="删除周表"
        message={`将删除「${confirmDelete?.name ?? ""}」及其全部事务与日覆盖，不可恢复。确定删除？`}
        confirmText="删除"
        danger
        onConfirm={() => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (target) void handleDelete(target);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
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
