import { useEffect, useState } from "react";
import { Dialog, DialogTitle } from "@headlessui/react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { getAppFlag, setAppFlag } from "../lib/flags";

const FLAG_KEY = "clipboardNoticeShown";

/** 首次使用的剪贴板提示弹窗：flags 标记只弹一次；确认或 Esc 均视为已读并落库。 */
export default function ClipboardNotice() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void getAppFlag(FLAG_KEY)
      .then((seen) => {
        if (seen !== "1") setOpen(true);
      })
      .catch(() => undefined);
  }, []);

  const dismiss = () => {
    setOpen(false);
    void setAppFlag(FLAG_KEY, "1").catch(() => undefined);
  };

  return (
    <Dialog open={open} onClose={dismiss} className="relative z-50">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/50"
        aria-hidden
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="w-full max-w-sm rounded-xl border border-zinc-600 bg-zinc-800 p-4"
        >
          <DialogTitle className="text-sm font-medium text-zinc-100">
            {t("clipboardNotice.title")}
          </DialogTitle>
          <p className="mt-2 text-xs leading-5 text-zinc-300">
            {t("clipboardNotice.body")}
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={dismiss}
              className="rounded bg-blue-500 px-3 py-1.5 text-xs text-white transition-colors hover:bg-blue-400"
            >
              {t("clipboardNotice.ok")}
            </button>
          </div>
        </motion.div>
      </div>
    </Dialog>
  );
}
