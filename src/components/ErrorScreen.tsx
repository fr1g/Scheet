import { useSettings } from "../state/SettingsContext";

export default function ErrorScreen() {
  const { error, reload } = useSettings();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-700 text-zinc-100">
      <p className="text-sm">设置加载失败</p>
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
        重试
      </button>
    </div>
  );
}
