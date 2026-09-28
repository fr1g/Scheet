import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { applyLanguage } from "../i18n";
import { getGlobalConfig, setGlobalConfig } from "../lib/global-config";
import type { GlobalConfig } from "../types/global-config";

interface GlobalConfigContextValue {
  config: GlobalConfig | null;
  error: string | null;
  reload: () => void;
  /** 校验并持久化到 data.db，成功后更新上下文（语言等立即生效）。 */
  update: (next: GlobalConfig) => Promise<void>;
}

const GlobalConfigContext = createContext<GlobalConfigContextValue | null>(null);

export function GlobalConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getGlobalConfig()
      .then((loaded) => {
        if (cancelled) return;
        setConfig(loaded);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // 语言偏好变化 → 切换 i18n
  useEffect(() => {
    if (config) applyLanguage(config.uiLanguage);
  }, [config?.uiLanguage]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const update = useCallback(async (next: GlobalConfig) => {
    const saved = await setGlobalConfig(next);
    setConfig(saved);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ config, error, reload, update }),
    [config, error, reload, update],
  );

  return (
    <GlobalConfigContext.Provider value={value}>
      {children}
    </GlobalConfigContext.Provider>
  );
}

export function useGlobalConfig(): GlobalConfigContextValue {
  const ctx = useContext(GlobalConfigContext);
  if (!ctx) {
    throw new Error("useGlobalConfig 必须在 GlobalConfigProvider 内使用");
  }
  return ctx;
}
