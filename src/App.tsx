import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import ErrorBoundary from "./components/ErrorBoundary";
import AlarmSnackbar from "./components/AlarmSnackbar";
import ErrorScreen from "./components/ErrorScreen";
import LoadingScreen from "./components/LoadingScreen";
import TitleBar from "./components/TitleBar";
import { SettingsProvider, useSettings } from "./state/SettingsContext";
import { GlobalConfigProvider } from "./state/GlobalConfigContext";
import WeekGridPage from "./routes/WeekGridPage";
import SettingsPage from "./routes/SettingsPage";
import AlarmPopupPage from "./routes/AlarmPopupPage";

function AppShell() {
  const { status } = useSettings();
  const location = useLocation();
  // 提醒弹窗子窗口自绘全部内容：不渲染主窗口标题栏
  const isPopup = getCurrentWindow().label === "alarm-popup";

  // 全局屏蔽浏览器默认右键菜单（自定义菜单自行 preventDefault + 打开）
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

  // 前端运行时错误转发到 stderr（dev 诊断；生产无副作用）
  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    const onError = (e: ErrorEvent) => {
      invoke("debug_log", {
        msg: `JS 错误: ${e.message} @ ${e.filename ?? "?"}:${e.lineno}`,
      }).catch(() => undefined);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      invoke("debug_log", { msg: `未处理的 Promise 拒绝: ${e.reason}` }).catch(
        () => undefined,
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
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
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<WeekGridPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/alarm-popup" element={<AlarmPopupPage />} />
          </Routes>
        </AnimatePresence>
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
      <main className="min-h-0 flex-1">
        <ErrorBoundary>{content}</ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <GlobalConfigProvider>
        <HashRouter>
          <AppShell />
        </HashRouter>
      </GlobalConfigProvider>
    </SettingsProvider>
  );
}
