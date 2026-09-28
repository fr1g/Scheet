import { AnimatePresence, motion } from "framer-motion";

/** 右下角轻提示（自动消失，带过渡）；提醒确认 snackbar 见 AlarmSnackbar。 */
export default function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key="toast"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed bottom-4 right-4 z-40 max-w-sm rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 shadow-lg"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
