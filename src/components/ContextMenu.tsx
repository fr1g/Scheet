import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  danger?: boolean;
  hidden?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** 轻量右键菜单：fixed 定位，点击外部/Escape 关闭。 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const visible = items.filter((item) => !item.hidden);
  if (!visible.length) return null;

  const clampedY = Math.min(y, window.innerHeight - visible.length * 30 - 12);

  return (
    <div
      ref={ref}
      style={{ left: x, top: clampedY }}
      className="fixed z-50 min-w-[140px] rounded-lg border border-zinc-600 bg-zinc-800 py-1 shadow-lg"
    >
      {visible.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-zinc-600 ${
            item.danger ? "text-red-400" : "text-zinc-100"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
