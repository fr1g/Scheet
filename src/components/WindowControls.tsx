import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CloseIcon, MinusIcon } from "tdesign-icons-react";
import type { WindowControlsPosition } from "../types/settings";

/** 跟踪 Shift 键按住状态（窗口失焦时复位，避免状态卡住）。 */
function useShiftHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setHeld(false);
    };
    const onBlur = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  return held;
}

type VisiblePosition = Exclude<WindowControlsPosition, "hidden">;

const buttonBase =
  "flex h-full shrink-0 items-center justify-center text-zinc-100 transition-colors";

export default function WindowControls({
  position,
  onExitRequest,
}: {
  position: VisiblePosition;
  /** Shift+点击关闭按钮：请求退出应用（弹出确认模态）。 */
  onExitRequest?: () => void;
}) {
  const shiftHeld = useShiftHeld();
  const { t } = useTranslation();

  const minimizeButton = (
    <button
      type="button"
      aria-label={t("titlebar.minimize")}
      className={`${buttonBase} w-11 hover:bg-zinc-600`}
      onClick={() => void getCurrentWindow().minimize()}
    >
      <MinusIcon size="16px" />
    </button>
  );

  const closeButton = (
    <button
      type="button"
      aria-label={shiftHeld ? t("titlebar.exitButton") : t("titlebar.closeButton")}
      title={
        shiftHeld ? t("titlebar.exitButtonTitle") : t("titlebar.closeButtonTitle")
      }
      onClick={(e) => {
        if (e.shiftKey) {
          onExitRequest?.();
        } else {
          void getCurrentWindow().close();
        }
      }}
      className={
        shiftHeld
          ? `${buttonBase} w-14 bg-red-500/80 text-xs font-medium text-white hover:bg-red-500`
          : `${buttonBase} w-11 hover:bg-red-500`
      }
    >
      {shiftHeld ? t("titlebar.exitButton") : <CloseIcon size="16px" />}
    </button>
  );

  return position === "left" ? (
    <>
      {closeButton}
      {minimizeButton}
    </>
  ) : (
    <>
      {minimizeButton}
      {closeButton}
    </>
  );
}
