import { useTranslation } from "react-i18next";
import { useSettings } from "../state/SettingsContext";

export default function ErrorScreen() {
  const { t } = useTranslation();
  const { error, reload } = useSettings();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-700 text-zinc-100">
      <p className="text-sm">{t("error.title")}</p>
      {error && (
        <p className="max-w-md px-6 text-center text-xs break-all text-zinc-300">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={reload}
        className="rounded px-4 py-1.5 text-sm transition-colors hover:bg-zinc-600"
      >
        {t("error.retry")}
      </button>
    </div>
  );
}
