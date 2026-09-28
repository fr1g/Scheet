import { useNavigate } from "react-router-dom";

/** 设置页占位：M4 里程碑提供完整表单（起止时间/每周第一天/铃声链/窗口按钮位置）。 */
export default function SettingsPage() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-100">
      <p className="text-sm">设置功能将在 M4 里程碑提供</p>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="rounded px-4 py-1.5 text-sm transition-colors hover:bg-zinc-600"
      >
        返回
      </button>
    </div>
  );
}
