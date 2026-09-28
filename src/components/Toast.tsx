/** 右下角轻提示（自动消失）；M4 的提醒确认 snackbar 将扩展此形态。 */
export default function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed right-4 bottom-4 z-40 max-w-sm rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 shadow-lg">
      {message}
    </div>
  );
}
