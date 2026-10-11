import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { CopyIcon, PasteIcon, RollbackIcon, SaveIcon, SettingIcon } from "tdesign-icons-react";
import ConfirmDialog from "./ConfirmDialog";
import { exitApplication } from "../lib/app";
import { useSettings } from "../state/SettingsContext";
import { useGlobalConfig } from "../state/GlobalConfigContext";
import { useTitleState, type TitleBarActions } from "../state/titleState";
import { useToday } from "../state/dateState";
import WindowControls from "./WindowControls";

/** 应用标题：显示在窗口控制按钮的相反一侧，并同步到系统窗口标题。 */
function AppTitle() {
  const { t } = useTranslation();
  const { currentPlanSlot, selectedPlanSlot, planCount } = useTitleState();
  const { date } = useToday();

  const weekLabel = (slot: number | null): string => {
    if (slot == null) return "";
    if (planCount === 1) {
      return t("tabs.thisWeek");
    }
    if (planCount === 2) {
      return slot === 1 ? t("titlebar.single") : t("titlebar.double");
    }
    return t("titlebar.weekN", { n: slot });
  };

  const current = weekLabel(currentPlanSlot);
  let title = "Scheet";
  if (current) {
    title = t("titlebar.format", { week: current, date });
    if (selectedPlanSlot != null && selectedPlanSlot !== currentPlanSlot) {
      title += t("titlebar.selected", { label: weekLabel(selectedPlanSlot) });
    }
  }

  useEffect(() => {
    void getCurrentWindow().setTitle(title);
  }, [title]);

  return (
    <div className="flex h-full items-center px-3 text-xs text-zinc-300">
      {title}
    </div>
  );
}

/** 标题栏系统时钟（HH:MM 或 HH:MM:SS，按设置）。 */
function Clock({ seconds }: { seconds: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const text = [now.getHours(), now.getMinutes(), ...(seconds ? [now.getSeconds()] : [])]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return (
    <span className="flex h-full items-center px-2 scale-x-101 translate-x-px font-semibold font-mono text-xs text-zinc-300">
      {text}
    </span>
  );
}

/** 周表页操作按钮组：复制/粘贴/保存 + 未保存徽章与回滚（仅周表页挂载时显示）。 */
function PlanActions({ actions }: { actions: TitleBarActions }) {
  const { t } = useTranslation();
  const actionBtn =
    "flex h-full items-center gap-1 px-2.5 text-[11px] text-zinc-300 transition-colors enabled:hover:bg-zinc-600/50 disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <>
      <button
        type="button"
        onClick={actions.onCopy}
        disabled={!actions.canCopy}
        title={t("topbar.copyTitle")}
        className={actionBtn}
      >
        <CopyIcon size="12px" />
        {t("topbar.copy")}
      </button>
      <button
        type="button"
        onClick={actions.onPaste}
        disabled={!actions.canPaste}
        title={t("topbar.pasteTitle")}
        className={actionBtn}
      >
        <PasteIcon size="12px" />
        {t("topbar.paste")}
      </button>
      <button
        type="button"
        onClick={actions.onSave}
        disabled={!actions.dirty || actions.saving}
        className={actionBtn}
      >
        <SaveIcon size="12px" />
        {t("topbar.save")}
      </button>
      {actions.dirty && (
        <>
          <span className="animate-pulse self-center rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] text-amber-300">
            {t("topbar.unsaved")}
          </span>
          <button
            type="button"
            onClick={actions.onRevert}
            title={t("topbar.revertTitle")}
            className="flex h-full items-center px-1.5 text-zinc-300 transition-colors hover:bg-zinc-600/50"
          >
            <RollbackIcon size="12px" />
          </button>
        </>
      )}
    </>
  );
}

export default function TitleBar() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { config } = useGlobalConfig();
  const { actions } = useTitleState();
  const location = useLocation();
  const navigate = useNavigate();
  const position = settings?.windowControls.position ?? "right";
  const [confirmExit, setConfirmExit] = useState(false);
  const clockOn = config?.titlebarClock ?? false;
  const clockSeconds = clockOn && (config?.titlebarClockSeconds ?? false);
  // 操作按钮组与设置入口仅主页（周表页）显示；设置页有自己的返回按钮
  const onHome = location.pathname === "/";

  return (
    <>
      <header className={`flex h-10 shrink-0 items-stretch   ${position === 'hidden' ? 'px-2.5' : ''}`}>
        {position === "hidden" && clockOn && <Clock seconds={clockSeconds} />}
        {position === "hidden" && actions && <PlanActions actions={actions} />}
        {position === "hidden" && onHome && (
          <button
            type="button"
            onClick={() => navigate("/settings")}
            title={t("topbar.settings")}
            className="flex h-full items-center px-2 text-zinc-300 transition-colors hover:bg-zinc-600/50"
          >
            <SettingIcon size="13px" />
          </button>
        )}

        {position === "right" && <AppTitle />}
        {position === "left" && (
          <WindowControls
            position="left"
            onExitRequest={() => setConfirmExit(true)}
          />
        )}
        {position === "left" && clockOn && <Clock seconds={clockSeconds} />}
        {position === "left" && actions && <PlanActions actions={actions} />}
        {position === "left" && onHome && (
          <button
            type="button"
            onClick={() => navigate("/settings")}
            title={t("topbar.settings")}
            className="flex h-full items-center px-2 text-zinc-300 transition-colors hover:bg-zinc-600/50"
          >
            <SettingIcon size="13px" />
          </button>
        )}
        <div data-tauri-drag-region className="min-w-0 flex-1" />
        {position === "right" && actions && <PlanActions actions={actions} />}
        {position === "right" && onHome && (
          <button
            type="button"
            onClick={() => navigate("/settings")}
            title={t("topbar.settings")}
            className="flex h-full items-center px-2 text-zinc-300 transition-colors hover:bg-zinc-600/50"
          >
            <SettingIcon size="13px" />
          </button>
        )}
        {position === "right" && clockOn && <Clock seconds={clockSeconds} />}
        {position === "right" && (
          <WindowControls
            position="right"
            onExitRequest={() => setConfirmExit(true)}
          />
        )}
        {position !== "right" && <AppTitle />}
      </header>
      <ConfirmDialog
        open={confirmExit}
        title={t("exitConfirm.title")}
        message={t("exitConfirm.message")}
        confirmText={t("titlebar.exitButton")}
        danger
        onConfirm={() => {
          setConfirmExit(false);
          void exitApplication().catch(() => undefined);
        }}
        onCancel={() => setConfirmExit(false)}
      />
    </>
  );
}
