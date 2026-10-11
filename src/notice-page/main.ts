// 首次"关闭→收进托盘"说明小窗（静态页，无 React）：
// 语言与字体跟随应用设置（auto=系统语言），与主窗口/提醒弹窗一致。
// 整页可点击（与提醒弹窗同款交互）：点击任意处或"知道了"按钮经 finish 命令隐藏本窗。
import { invoke } from "@tauri-apps/api/core";
import { applyUiFont, registerBundledFontFaces } from "../lib/fonts";
import zh from "../i18n/zh";
import en from "../i18n/en";

interface Texts {
  prefix: string;
  title: string;
  body1: string;
  body2: string;
  bodyWin: string;
  ok: string;
}

const RES: Record<"zh" | "en", Texts> = {
  zh: {
    prefix: zh.closeNotice.prefix,
    title: zh.closeNotice.title,
    body1: zh.closeNotice.body1,
    body2: zh.closeNotice.body2,
    bodyWin: zh.closeNotice.bodyWin,
    ok: zh.closeNotice.ok,
  },
  en: {
    prefix: en.closeNotice.prefix,
    title: en.closeNotice.title,
    body1: en.closeNotice.body1,
    body2: en.closeNotice.body2,
    bodyWin: en.closeNotice.bodyWin,
    ok: en.closeNotice.ok,
  },
};

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

async function boot(): Promise<void> {
  // 语言与字体一次取齐：跟随应用设置，auto 回退系统语言
  let lang: "zh" | "en" = navigator.language.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
  let uiFont = "system";
  try {
    const cfg = await invoke<{ uiLanguage: string; uiFont: string }>(
      "get_global_config",
    );
    if (cfg.uiLanguage === "zh" || cfg.uiLanguage === "en") lang = cfg.uiLanguage;
    uiFont = cfg.uiFont;
  } catch {
    // 配置不可得按系统语言与默认字体
  }

  const s = RES[lang];
  $("title").textContent = s.prefix + s.title;
  const body = $("body");
  const p1 = document.createElement("p");
  p1.textContent = s.body1;
  const p2 = document.createElement("p");
  p2.textContent = s.body2;
  body.append(p1, p2);
  // 托盘常驻建议仅对 Windows 用户有意义
  if (navigator.userAgent.includes("Windows")) {
    const tip = document.createElement("p");
    tip.className = "tip";
    tip.textContent = s.bodyWin;
    body.append(tip);
  }
  $("ok").textContent = s.ok;

  await registerBundledFontFaces();
  applyUiFont(uiFont);
}

void boot().catch(() => undefined);

// 整页可点击（含按钮）：隐藏本窗
document.body.addEventListener("click", () => {
  void invoke("finish_close_notice").catch(() => undefined);
});
