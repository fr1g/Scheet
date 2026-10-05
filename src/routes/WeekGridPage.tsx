import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "../components/ConfirmDialog";
import ContextMenu, { type ContextMenuItem } from "../components/ContextMenu";
import Toast from "../components/Toast";
import DaySettingsDialog from "../components/week/DaySettingsDialog";
import EntryEditDialog from "../components/week/EntryEditDialog";
import PlanSettingsDialog from "../components/week/PlanSettingsDialog";
import TodoPanel from "../components/week/TodoPanel";
import WeekPlanTabs from "../components/week/WeekPlanTabs";
import WeekGrid from "../components/week/WeekGrid";
import { readClipboardText, writeClipboardText } from "../lib/clipboard";
import {
  entryColorScheme,
  resolveEntryColors,
  type EntryColorScheme,
  isPlanNameKey,
  minuteToHHMM,
  parseEntryPlan,
  serializeEntryPlan,
  usePlanName,
  planDisplayName,
} from "../lib/weekgrid";
import {
  createWeekPlan,
  deleteWeekPlan,
  getWeekPlan,
  getCurrentWeekPlan,
  listWeekPlans,
  saveWeekPlan,
  setActiveWeekPlan,
} from "../lib/weeks";
import type { FullPlan, WeekEntry, WeekPlan } from "../types/weeks";
import { setTitleState } from "../state/titleState";
import { useGlobalConfig } from "../state/GlobalConfigContext";

/** 周表页：左侧 tab 列 + 中央网格 + 右侧待办。编辑在工作副本上进行，显式保存入库。 */
export default function WeekGridPage() {
  const { t } = useTranslation();
  const { config, error: configError, reload: reloadConfig } = useGlobalConfig();
  const [plans, setPlans] = useState<WeekPlan[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [plan, setPlan] = useState<FullPlan | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
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
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [pasteTargetWeekday, setPasteTargetWeekday] = useState<number | null>(null);
  /** 聚焦窗口时嗅探：剪贴板中的事务（null = 无/非事务 JSON）。 */
  const [clipboardPlan, setClipboardPlan] = useState<
    Omit<WeekEntry, "id" | "weekday"> | null
  >(null);
  const clipboardHasPlan = clipboardPlan != null;
  /** 编辑中的事务；createdNow=双击无安排区域刚创建，取消时撤销。 */
  const [editEntry, setEditEntry] = useState<{
    entry: WeekEntry;
    createdNow: boolean;
  } | null>(null);

  const planName = usePlanName();
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
    loadPlans(null).catch((e: unknown) => showToast(String(e)));
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
      .catch((e: unknown) => showToast(String(e)));
    return () => {
      cancelled = true;
    };
  }, [selectedId, showToast]);

  const dirty = plan != null && JSON.stringify(plan) !== savedSnapshot;


  // 选中周表展示名走统一规则（本周/单周/双周/自定义名）
  const selectedPlanDisplayName = (() => {
    const index = plans.findIndex((p) => p.id === selectedId);
    if (index >= 0) return planDisplayName(plans, index, planName, t);
    return planName(plan?.plan.name ?? "");
  })();

  // 同步标题栏/系统窗口标题所需的状态
  useEffect(() => {
    setTitleState({
      currentPlanSlot: plans.find((p) => p.id === currentId)?.slot ?? null,
      selectedPlanSlot: plans.find((p) => p.id === selectedId)?.slot ?? null,
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
      showToast(
        t("toasts.planCreated", {
          name: planDisplayName([...plans, created], plans.length, planName, t),
        }),
      );
    } catch (e: unknown) {
      showToast(String(e));
    }
  };

  const handleSave = useCallback(async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const outcome = await saveWeekPlan({
        id: plan.plan.id,
        name: plan.plan.name,
        dayStartMinute: plan.plan.dayStartMinute,
        dayEndMinute: plan.plan.dayEndMinute,
        normalColor: plan.plan.normalColor,
        restColor: plan.plan.restColor,
        normalTextDark: plan.plan.normalTextDark,
        restTextDark: plan.plan.restTextDark,
        entries: plan.entries,
        overrides: plan.overrides,
      });
      if (outcome.saved && outcome.plan) {
        setPlan(outcome.plan);
        setSavedSnapshot(JSON.stringify(outcome.plan));
        showToast(t("toasts.saved"));
      } else {
        showToast(t("toasts.conflict", { count: outcome.conflicts.length }));
      }
    } catch (e: unknown) {
      showToast(String(e));
    } finally {
      setSaving(false);
    }
  }, [plan, showToast, t]);

  /** 放弃工作副本的自上次保存以来的全部修改。 */
  const handleRevert = useCallback(() => {
    setConfirmRevert(false);
    try {
      setPlan(JSON.parse(savedSnapshot));
      showToast(t("toasts.reverted"));
    } catch (e: unknown) {
      showToast(String(e));
    }
  }, [savedSnapshot, showToast, t]);

  // ============ 剪贴板嗅探（聚焦窗口时校验是否为事务 JSON） ============

  const refreshClipboardState = useCallback(async () => {
    try {
      const raw = await readClipboardText();
      setClipboardPlan(parseEntryPlan(raw));
    } catch {
      setClipboardPlan(null);
    }
  }, []);

  useEffect(() => {
    void refreshClipboardState();
    let timer = 0;
    // 焦点后延迟读取：避开焦点事件风暴期（该读取走 arboard 原生剪贴板，
    // 曾疑似与堆损坏相关），150ms 足以让窗口恢复的收尾操作先行完成
    const onFocus = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshClipboardState(), 150);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(timer);
    };
  }, [refreshClipboardState]);

  // 剪贴板失效时熄灭已设置的粘贴目标
  useEffect(() => {
    if (!clipboardHasPlan) setPasteTargetWeekday(null);
  }, [clipboardHasPlan]);

  // ============ 选中 / 复制 / 粘贴 ============

  const handleCopy = useCallback(async () => {
    if (!plan || selectedEntryId == null) return;
    const entry = plan.entries.find((e) => e.id === selectedEntryId);
    if (!entry) return;
    await writeClipboardText(serializeEntryPlan(entry));
    setClipboardPlan(parseEntryPlan(serializeEntryPlan(entry)));
    showToast(t("toasts.copied"));
  }, [plan, selectedEntryId, showToast, t]);

  const handlePaste = useCallback(async () => {
    if (pasteTargetWeekday == null) return;
    try {
      const raw = await readClipboardText();
      const base = parseEntryPlan(raw);
      if (!base) {
        showToast(t("toasts.pasteNoData"));
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
      showToast(t("toasts.pasted", { day: t(`days.${pasteTargetWeekday}`) }));
    } catch (e: unknown) {
      showToast(String(e));
    }
  }, [pasteTargetWeekday, showToast, t]);

  /** 删除选中事务（Shift+Delete；无确认，可 Ctrl+Z 撤回，随主保存入库）。 */
  const handleDeleteSelected = useCallback(() => {
    if (selectedEntryId == null) return;
    setPlan((prev) =>
      prev
        ? { ...prev, entries: prev.entries.filter((e) => e.id !== selectedEntryId) }
        : prev,
    );
    setSelectedEntryId(null);
  }, [selectedEntryId]);

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
      // Shift+Delete：删除选中事务
      if (e.shiftKey && e.key === "Delete" && selectedEntryId != null) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "c" && selectedEntryId != null) {
        e.preventDefault();
        void handleCopy();
      } else if (key === "v" && pasteTargetWeekday != null && clipboardHasPlan) {
        e.preventDefault();
        void handlePaste();
      } else if (key === "s" && dirty) {
        e.preventDefault();
        void handleSave();
      } else if (key === "z" && dirty) {
        e.preventDefault();
        handleRevert();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleCopy,
    handlePaste,
    handleSave,
    handleRevert,
    handleDeleteSelected,
    selectedEntryId,
    pasteTargetWeekday,
    clipboardHasPlan,
    dirty,
  ]);

  // ============ 拖拽导致的事务变更 ============

  const handleChangeEntries = useCallback(
    (updater: (entries: WeekEntry[]) => WeekEntry[]) => {
      setPlan((prev) => (prev ? { ...prev, entries: updater(prev.entries) } : prev));
    },
    [],
  );

  // ============ 双击编辑 / 新建 ============

  const handleCreateAt = (weekday: number, startMinute: number) => {
    if (!plan) return;
    const tempId = Math.min(0, ...plan.entries.map((e) => e.id)) - 1;
    const entry: WeekEntry = {
      id: tempId,
      weekday,
      startMinute,
      durationMinute: 30,
      entryType: "normal",
      notes: null,
      textDark: null,
      title: "",
      alarmFile: null,
      alarmMode: null,
      color: null,
      endAlarmFile: null,
      endAlarmMode: null,
    };
    setPlan({ ...plan, entries: [...plan.entries, entry] });
    setEditEntry({ entry, createdNow: true });
  };

  const handleEditConfirm = (edited: WeekEntry) => {
    setEditEntry(null);
    setPlan((prev) =>
      prev
        ? { ...prev, entries: prev.entries.map((e) => (e.id === edited.id ? edited : e)) }
        : prev,
    );
  };

  /** 取消：双击新建的临时事务一并撤销，其余仅关闭弹窗。 */
  const handleEditCancel = () => {
    if (editEntry?.createdNow) {
      const tempId = editEntry.entry.id;
      setPlan((prev) =>
        prev ? { ...prev, entries: prev.entries.filter((e) => e.id !== tempId) } : prev,
      );
    }
    setEditEntry(null);
  };

  const handleEditDelete = () => {
    if (!editEntry) return;
    const tempId = editEntry.entry.id;
    setPlan((prev) =>
      prev ? { ...prev, entries: prev.entries.filter((e) => e.id !== tempId) } : prev,
    );
    setEditEntry(null);
  };

  // ============ 右键菜单动作 ============

  const handleSetActive = async (target: WeekPlan) => {
    try {
      await setActiveWeekPlan(target.id);
      await loadPlans(selectedId);
      const idx = plans.findIndex((p) => p.id === target.id);
      showToast(
        t("toasts.setAsCurrent", {
          name:
            idx >= 0 ? planDisplayName(plans, idx, planName, t) : planName(target.name),
        }),
      );
    } catch (e: unknown) {
      showToast(String(e));
    }
  };

  const handleDelete = async (target: WeekPlan) => {
    const idx = plans.findIndex((p) => p.id === target.id);
    try {
      await deleteWeekPlan(target.id);
      await loadPlans(selectedId === target.id ? null : selectedId);
      showToast(
        t("toasts.planDeleted", {
          name:
            idx >= 0 ? planDisplayName(plans, idx, planName, t) : planName(target.name),
        }),
      );
    } catch (e: unknown) {
      showToast(String(e));
    }
  };

  const tabMenuItems: ContextMenuItem[] = tabMenu
    ? [
      {
        label: t("menu.planSettings"),
        onSelect: () => setPlanSettings(tabMenu.plan),
      },
      {
        label: t("menu.setActive"),
        hidden: tabMenu.plan.id === currentId,
        onSelect: () => void handleSetActive(tabMenu.plan),
      },
      {
        label: t("menu.deletePlan"),
        danger: true,
        hidden: tabMenu.plan.slot === 1,
        onSelect: () => setConfirmDelete(tabMenu.plan),
      },
    ]
    : [];

  const dayMenuItems: ContextMenuItem[] = dayMenu
    ? [
      {
        label: t("menu.daySettings"),
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
    colors: {
      normalColor: string | null;
      restColor: string | null;
      normalTextDark: boolean | null;
      restTextDark: boolean | null;
    },
  ) => {
    const raw = planSettings?.name;
    setPlanSettings(null);
    // 键名（weeks.wN）未被打字修改时保持键，避免把标记原文写进库
    const finalName =
      raw && isPlanNameKey(raw) && name === planName(raw) ? raw : name;
    setPlan((prev) =>
      prev
        ? {
          ...prev,
          plan: {
            ...prev.plan,
            name: finalName,
            dayStartMinute: dayStart,
            dayEndMinute: dayEnd,
            ...colors,
          },
        }
        : prev,
    );
  };

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
    if (configError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-100">
          <p className="text-sm">{String(configError)}</p>
          <button
            type="button"
            onClick={reloadConfig}
            className="rounded px-4 py-1.5 text-sm transition-colors hover:bg-zinc-600"
          >
            {t("error.retry")}
          </button>
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-300">
        {t("loading.text")}
      </div>
    );
  }

  // 事务默认色方案：周表覆盖 → 全局默认（guard 之后 config/plan 均非空）
  const colorScheme: EntryColorScheme = entryColorScheme(plan.plan, config);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex h-full min-h-0"
    >
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
        colorScheme={colorScheme}
        isCurrentWeek={selectedId === currentId}
        displayName={selectedPlanDisplayName}
        dirty={dirty}
        saving={saving}
        onSave={() => void handleSave()}
        onDayMenu={(e, weekday) => setDayMenu({ x: e.clientX, y: e.clientY, weekday })}
        selectedEntryId={selectedEntryId}
        onSelectEntry={setSelectedEntryId}
        onPasteTarget={setPasteTargetWeekday}
        pasteTargetWeekday={pasteTargetWeekday}
        clipboardHasPlan={clipboardHasPlan}
        onCopy={() => void handleCopy()}
        onPaste={() => void handlePaste()}
        onRevert={() => setConfirmRevert(true)}
        onChangeEntries={handleChangeEntries}
        onEditEntry={(entry) => setEditEntry({ entry, createdNow: false })}
        onCreateAt={handleCreateAt}
      />
      <aside className="relative w-64 shrink-0 border-l border-zinc-600">
        {clipboardPlan && (
          <div className="absolute inset-x-3 top-3 z-20">
            <div className="text-[10px] text-zinc-400">{t("clipboard.hint")}</div>
            <div
              className="mt-1 flex flex-col rounded-xl px-2 py-1 text-xs text-zinc-100 shadow-lg"
              style={{
                background: resolveEntryColors(
                  clipboardPlan.entryType,
                  clipboardPlan.color,
                  clipboardPlan.textDark,
                  colorScheme,
                ).background,
              }}
            >
              <span className="text-[10px] leading-3 text-zinc-300">
                {minuteToHHMM(clipboardPlan.startMinute)}
              </span>
              <span className="grid grow place-items-center py-1 text-center leading-tight">
                {clipboardPlan.title ||
                  t(clipboardPlan.entryType === "normal" ? "grid.normal" : "grid.rest")}
              </span>
              <span className="text-[10px] leading-3 text-zinc-300">
                {minuteToHHMM(clipboardPlan.startMinute + clipboardPlan.durationMinute)}
              </span>
            </div>
          </div>
        )}
        <TodoPanel className={clipboardPlan ? "pt-24" : ""} />
      </aside>
      <AnimatePresence>
        {tabMenu && (
          <ContextMenu
            key="tab-menu"
            x={tabMenu.x}
            y={tabMenu.y}
            items={tabMenuItems}
            onClose={() => setTabMenu(null)}
          />
        )}
        {dayMenu && (
          <ContextMenu
            key="day-menu"
            x={dayMenu.x}
            y={dayMenu.y}
            items={dayMenuItems}
            onClose={() => setDayMenu(null)}
          />
        )}
        {planSettings && (
          <PlanSettingsDialog
            key="plan-settings"
            plan={planSettings}
            onClose={() => setPlanSettings(null)}
            onConfirm={handlePlanSettings}
          />
        )}
        {daySettings && (
          <DaySettingsDialog
            key="day-settings"
            weekday={daySettings.weekday}
            initialStart={daySettings.initialStart}
            initialEnd={daySettings.initialEnd}
            onClose={() => setDaySettings(null)}
            onConfirm={(dayStart, dayEnd) =>
              handleDaySettings(daySettings.weekday, dayStart, dayEnd)
            }
          />
        )}
        {editEntry && (
          <EntryEditDialog
            key={`edit-${editEntry.entry.id}`}
            entry={editEntry.entry}
            config={config}
            scheme={colorScheme}
            createdNow={editEntry.createdNow}
            onClose={handleEditCancel}
            onConfirm={handleEditConfirm}
            onDelete={handleEditDelete}
          />
        )}
        {confirmDelete && (
          <ConfirmDialog
            key="confirm-delete"
            open
            title={t("confirms.deletePlanTitle")}
            message={t("confirms.deletePlanMessage", {
              name: (() => {
                const idx = plans.findIndex((p) => p.id === confirmDelete.id);
                return idx >= 0
                  ? planDisplayName(plans, idx, planName, t)
                  : planName(confirmDelete.name);
              })(),
            })}
            confirmText={t("confirms.deleteConfirm")}
            danger
            onConfirm={() => {
              const target = confirmDelete;
              setConfirmDelete(null);
              if (target) void handleDelete(target);
            }}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
        {confirmSwitch && (
          <ConfirmDialog
            key="confirm-switch"
            open
            title={t("topbar.unsaved")}
            message={t("confirms.switchMessage")}
            confirmText={t("confirms.switchConfirm")}
            danger
            onConfirm={() => {
              const target = confirmSwitch;
              setConfirmSwitch(null);
              if (target != null) setSelectedId(target);
            }}
            onCancel={() => setConfirmSwitch(null)}
          />
        )}
        {confirmRevert && (
          <ConfirmDialog
            key="confirm-revert"
            open
            title={t("topbar.revert")}
            message={t("confirms.revertMessage")}
            confirmText={t("topbar.revert")}
            danger
            onConfirm={handleRevert}
            onCancel={() => setConfirmRevert(false)}
          />
        )}
      </AnimatePresence>
      <Toast message={toast} />
    </motion.div>
  );
}
