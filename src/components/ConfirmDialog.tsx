import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  /** 危险操作（如删除）用红色确认按钮。 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "确认",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} className="relative z-50">
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-sm rounded-xl border border-zinc-600 bg-zinc-800 p-4">
          <DialogTitle className="text-sm font-medium text-zinc-100">
            {title}
          </DialogTitle>
          <p className="mt-2 text-xs text-zinc-300">{message}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs text-zinc-100 transition-colors hover:bg-zinc-600"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`rounded px-3 py-1.5 text-xs text-white transition-colors ${
                danger
                  ? "bg-red-500 hover:bg-red-400"
                  : "bg-blue-500 hover:bg-blue-400"
              }`}
            >
              {confirmText}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
