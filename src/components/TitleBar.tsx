import { useSettings } from "../state/SettingsContext";
import WindowControls from "./WindowControls";

export default function TitleBar() {
  const { settings } = useSettings();
  const position = settings?.windowControls.position ?? "right";

  return (
    <header className="flex h-10 shrink-0 items-stretch">
      {position === "left" && <WindowControls position="left" />}
      <div data-tauri-drag-region className="min-w-0 flex-1" />
      {position === "right" && <WindowControls position="right" />}
    </header>
  );
}
