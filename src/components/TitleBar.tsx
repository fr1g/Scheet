import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "./ConfirmDialog";
import { exitApplication } from "../lib/app";
import { useSettings } from "../state/SettingsContext";
import { useTitleState } from "../state/titleState";
import { useToday } from "../state/dateState";
import WindowControls from "./WindowControls";

/** 应用标题：显示在窗口控制按钮的相反一侧，并同步到系统窗口标题。 */
function AppTitle() {
  const { t } = useTranslation();
  const { currentPlanSlot, selectedPlanSlot, planCount } = useTitleState();
  const { date } = useToday();

  const weekLabel = (slot: number | null): string => {
    if (slot == null) return "";
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

export default function TitleBar() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const position = settings?.windowControls.position ?? "right";
  const [confirmExit, setConfirmExit] = useState(false);

  return (
    <>
      <header className="flex h-10 shrink-0 items-stretch">
        {position === "right" && <AppTitle />}
        {position === "left" && (
          <WindowControls
            position="left"
            onExitRequest={() => setConfirmExit(true)}
          />
        )}
        <div data-tauri-drag-region className="min-w-0 flex-1" />
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
        confirmText={t("exitConfirm.confirm")}
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
