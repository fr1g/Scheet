import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { appLog } from "./lib/logger";
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

/** 拖拽调整窗口大小时，右下角低可见度地显示当前窗口尺寸，停止拖拽约 1.2s 后淡出。 */
function WindowSizeBadge() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    const onResize = () => {
      setSize({ w: window.innerWidth, h: window.innerHeight });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setSize(null), 1200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!size) return null;
  return (
    <div className="pointer-events-none fixed bottom-1.5 right-3 z-50 text-[10px] text-zinc-500/70">
      {size.w} × {size.h}
    </div>
  );
}

function AppShell() {
  const { status } = useSettings();
  const location = useLocation();
  // 提醒弹窗子窗口自绘全部内容：不渲染主窗口标题栏
  const isPopup = getCurrentWindow().label === "alarm-popup";

  // 全局屏蔽浏览器默认右键菜单（自定义菜单自行 preventDefault + 打开）
  // 并拦截 F12：DevTools 只经 设置-高级 的 Shift 隐藏按钮进入
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F12") e.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // 前端运行时错误转发到日志（[R] 源；写入文件并镜像 stderr）
  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    const onError = (e: ErrorEvent) => {
      appLog("error", `JS error: ${e.message} @ ${e.filename ?? "?"}:${e.lineno}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      appLog("error", `Unhandled promise rejection: ${e.reason}`);
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
      <main id="main-content" className="min-h-0 flex-1">
        <ErrorBoundary>{content}</ErrorBoundary>
      </main>
      <WindowSizeBadge />
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
