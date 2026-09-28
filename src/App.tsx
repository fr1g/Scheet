import { HashRouter, Route, Routes } from "react-router-dom";
import ErrorScreen from "./components/ErrorScreen";
import LoadingScreen from "./components/LoadingScreen";
import TitleBar from "./components/TitleBar";
import { SettingsProvider, useSettings } from "./state/SettingsContext";
import WeekGridPage from "./routes/WeekGridPage";
import SettingsPage from "./routes/SettingsPage";

function AppShell() {
  const { status } = useSettings();

  if (status === "loading") {
    return <LoadingScreen />;
  }
  if (status === "error") {
    return <ErrorScreen />;
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<WeekGridPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
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
