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
  { id: "maple-mono-nf-cn", family: "Maple Mono NF CN", file: "maple-mono-nf-cn.ttf" },
  { id: "harmonyos-sans-sc", family: "HarmonyOS Sans SC", file: "harmonyos-sans-sc.ttf" },
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

/** 界面字号档位 → 根元素 font-size（Tailwind 的 rem 尺寸随根字号整体缩放）。 */
const UI_FONT_SIZES: Record<string, string> = {
  sm: "13px",
  base: "16px",
  lg: "18px",
};

/** 把界面字号应用到整个文档（未知档位回退标准 16px）。 */
export function applyUiFontSize(size: string): void {
  document.documentElement.style.fontSize = UI_FONT_SIZES[size] ?? "16px";
}
