import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRightIcon } from "tdesign-icons-react";

/** 可折叠信息栏：标题行点击展开/收起，内容带高度过渡。 */
export default function CollapseBar({
  title,
  children,
  className = "",
  contentClassName = "",
  open: controlledOpen,
  onOpenChange,
}: {
  title: string;
  children: ReactNode;
  /** 追加到外壳（宽度/边距等布局用）。 */
  className?: string;
  /** 覆写内容区内边距（默认 px-3 pb-3）。 */
  contentClassName?: string;
  /** 受控展开态（传入 open/onOpenChange 即由外部控制，用于互斥分组）。 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  return (
    <div
      className={`overflow-hidden rounded-lg border border-zinc-600/60 text-left ${className}`}
    >
      <button
        type="button"
        onClick={() => {
          const next = !isOpen;
          if (onOpenChange) onOpenChange(next);
          else setInternalOpen(next);
        }}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-thin text-zinc-200 transition-colors hover:bg-zinc-600/40"
      >
        {title}
        <motion.span
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center"
        >
          <ChevronRightIcon size="14px" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className={contentClassName || "px-3 pb-3"}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
