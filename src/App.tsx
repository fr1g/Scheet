import { HashRouter, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AlarmSnackbar from "./components/AlarmSnackbar";
import ErrorScreen from "./components/ErrorScreen";
import LoadingScreen from "./components/LoadingScreen";
import TitleBar from "./components/TitleBar";
import { SettingsProvider, useSettings } from "./state/SettingsContext";
import WeekGridPage from "./routes/WeekGridPage";
import SettingsPage from "./routes/SettingsPage";
import AlarmPopupPage from "./routes/AlarmPopupPage";

function AppShell() {
  const { status } = useSettings();
  // 提醒弹窗子窗口自绘全部内容：不渲染主窗口标题栏
  const isPopup = getCurrentWindow().label === "alarm-popup";

  // 全局屏蔽浏览器默认右键菜单（自定义菜单自行 preventDefault + 打开）
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

  // 标题栏始终渲染：即使加载/出错也保留拖拽区与窗口控制按钮，避免窗口无法操作
  let content;
  if (status === "loading") {
    content = <LoadingScreen />;
  } else if (status === "error") {
    content = <ErrorScreen />;
  } else {
    content = (
      <>
        <Routes>
          <Route path="/" element={<WeekGridPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/alarm-popup" element={<AlarmPopupPage />} />
        </Routes>
        {!isPopup && <AlarmSnackbar />}
      </>
    );
  }

  if (isPopup) {
    return <main className="h-full">{content}</main>;
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="min-h-0 flex-1">{content}</main>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <HashRouter>
        <AppShell />
      </HashRouter>
    </SettingsProvider>
  );
}
