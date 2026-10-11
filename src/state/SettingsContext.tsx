import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  loadAppSettings,
  saveWindowControlsPosition,
} from "../lib/settings";
import type { AppSettings, WindowControlsPosition } from "../types/settings";

type SettingsStatus = "loading" | "ready" | "error";

interface SettingsContextValue {
  status: SettingsStatus;
  error: string | null;
  settings: AppSettings | null;
  reload: () => void;
  updateWindowControlsPosition: (
    position: WindowControlsPosition,
  ) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SettingsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    loadAppSettings()
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const updateWindowControlsPosition = useCallback(
    async (position: WindowControlsPosition) => {
      const next = await saveWindowControlsPosition(position);
      setSettings(next);
    },
    [],
  );

  return (
    <SettingsContext.Provider
      value={{ status, error, settings, reload, updateWindowControlsPosition }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings 必须在 SettingsProvider 内使用");
  }
  return ctx;
}

// HMR 政策：状态/上下文模块热替换会撕裂对象身份（context 找不到 Provider、
// 外部 store 监听器分裂）——拒绝热替换，让 Vite 冒泡到整页刷新。
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}
