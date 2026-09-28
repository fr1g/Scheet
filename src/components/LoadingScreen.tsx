export default function LoadingScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-zinc-700 text-zinc-100">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-100 border-t-transparent"
        aria-hidden
      />
      <p className="text-sm">正在加载设置…</p>
    </div>
  );
}
