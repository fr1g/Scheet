import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  build: {
    rollupOptions: {
      // 多页入口：主应用 + 提醒弹窗（静态页，无 React）
      input: {
        main: "index.html",
        popup: "popup.html",
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // cargo 构建产物会触发 EBUSY（Windows 文件锁），交给 tauri CLI 处理
      ignored: ["**/src-tauri/**"],
    },
  },
});
