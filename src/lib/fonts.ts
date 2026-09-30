import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

/** 内置字体清单（与 Rust fonts.rs 的解压列表保持一致）。 */
export interface BundledFont {
  /** 设置项 id（持久化到 uiFont）。 */
  id: string;
  /** @font-face 声明的 font-family。 */
  family: string;
  /** fonts 目录中的文件名。 */
  file: string;
}

export const BUNDLED_FONTS: BundledFont[] = [
  { id: "lxgw-wenkai-mono", family: "LXGW WenKai Mono", file: "lxgw-wenkai-mono.ttf" },
  { id: "lxgw-wenkai", family: "LXGW WenKai", file: "lxgw-wenkai.ttf" },
  // Maple Mono NF CN：等网络恢复后补入 EMBEDDED_FONTS，届时此条自动生效
  { id: "maple-mono-nf-cn", family: "Maple Mono NF CN", file: "maple-mono-nf-cn.ttf" },
  { id: "harmonyos-sans-sc", family: "HarmonyOS Sans SC", file: "harmonyos-sans-sc.ttf" },
  { id: "oppo-sans", family: "OPPO Sans", file: "oppo-sans.ttf" },
];

export const DEFAULT_UI_FONT = "lxgw-wenkai-mono";
export const SYSTEM_FONT_ID = "system";

/** 字体目录（数据目录/fonts，与 data.db 同级）。 */
let fontsDirCache: string | null = null;

export async function getFontsDir(): Promise<string> {
  if (fontsDirCache == null) {
    fontsDirCache = await invoke<string>("get_fonts_dir");
  }
  return fontsDirCache;
}

/** 为所有内置字体注册 @font-face（浏览器仅在字体被使用时才加载文件）。 */
export async function registerBundledFontFaces(): Promise<void> {
  if (document.getElementById("bundled-font-faces")) return;
  const dir = await getFontsDir();
  const style = document.createElement("style");
  style.id = "bundled-font-faces";
  style.textContent = BUNDLED_FONTS.map(
    (f) =>
      `@font-face { font-family: "${f.family}"; src: url("${convertFileSrc(`${dir}/${f.file}`)}"); }`,
  ).join("\n");
  document.head.appendChild(style);
}

/** 把界面字体应用到整个文档（system = 移除覆盖，回退系统字体栈）。 */
export function applyUiFont(fontId: string): void {
  const font = BUNDLED_FONTS.find((f) => f.id === fontId);
  const stack = font
    ? `"${font.family}", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif`
    : '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
  document.documentElement.style.fontFamily = stack;
}
