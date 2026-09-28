import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ConfirmDialog from "./ConfirmDialog";
import { exitApplication } from "../lib/app";
import { buildAppTitle } from "../lib/apptitle";
import { useSettings } from "../state/SettingsContext";
import { useTitleState } from "../state/titleState";
import { useToday } from "../state/dateState";
import WindowControls from "./WindowControls";

/** 应用标题：显示在窗口控制按钮的相反一侧，并同步到系统窗口标题。 */
function AppTitle() {
  const titleState = useTitleState();
  const { date } = useToday();
  const title = buildAppTitle(titleState, date);

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
        title="退出 Scheet"
        message="退出后将无法收到提醒（包括循环响铃），直到重新打开应用。确定退出？"
        confirmText="退出"
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
