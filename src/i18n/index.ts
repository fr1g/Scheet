import i18n from "i18next";
import { useTranslation, initReactI18next } from "react-i18next";
import zh from "./zh";
import en from "./en";

export type AppLanguage = "auto" | "zh" | "en";

export const resources = {
  zh: { translation: zh },
  en: { translation: en },
} as const;

function detectLanguage(): "zh" | "en" {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

/** 应用全局配置里的语言偏好（auto=跟随系统）→ 切换 i18n。 */
export function applyLanguage(pref: AppLanguage | undefined): void {
  const lng = pref === "zh" || pref === "en" ? pref : detectLanguage();
  if (i18n.language !== lng) {
    void i18n.changeLanguage(lng);
  }
}

/** 分钟数 → "x 小时 x 分钟" 的本地化形式（组件内使用）。 */
export function useHumanizeMinutes(): (minutes: number) => string {
  const { t } = useTranslation();
  return (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return t("duration.m", { m });
    if (m === 0) return t("duration.h", { h });
    return t("duration.hM", { h, m });
  };
}
