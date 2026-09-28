import { getCurrentWindow } from "@tauri-apps/api/window";
import { CloseIcon, MinusIcon } from "tdesign-icons-react";
import type { WindowControlsPosition } from "../types/settings";

type VisiblePosition = Exclude<WindowControlsPosition, "hidden">;

const buttonBase =
  "flex h-full w-11 shrink-0 items-center justify-center text-zinc-100 transition-colors";

export default function WindowControls({
  position,
}: {
  position: VisiblePosition;
}) {
  const minimizeButton = (
    <button
      type="button"
      aria-label="最小化"
      className={`${buttonBase} hover:bg-zinc-600`}
      onClick={() => void getCurrentWindow().minimize()}
    >
      <MinusIcon size="16px" />
    </button>
  );

  const closeButton = (
    <button
      type="button"
      aria-label="关闭"
      className={`${buttonBase} hover:bg-red-500 hover:text-white`}
      onClick={() => void getCurrentWindow().close()}
    >
      <CloseIcon size="16px" />
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
