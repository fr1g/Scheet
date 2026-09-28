import { HashRouter, Route, Routes } from "react-router-dom";
import ErrorScreen from "./components/ErrorScreen";
import LoadingScreen from "./components/LoadingScreen";
import TitleBar from "./components/TitleBar";
import { SettingsProvider, useSettings } from "./state/SettingsContext";
import WeekGridPage from "./routes/WeekGridPage";
import SettingsPage from "./routes/SettingsPage";

function AppShell() {
  const { status } = useSettings();

  // 标题栏始终渲染：即使加载/出错也保留拖拽区与窗口控制按钮，避免窗口无法操作
  let content;
  if (status === "loading") {
    content = <LoadingScreen />;
  } else if (status === "error") {
    content = <ErrorScreen />;
  } else {
    content = (
      <Routes>
        <Route path="/" element={<WeekGridPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    );
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
