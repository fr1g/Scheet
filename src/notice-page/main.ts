// 首次"关闭→收进托盘"说明小窗（静态页，无 React）：文案内建中英按系统语言选择。
// 整页可点击（与提醒弹窗同款交互）：点击任意处或"知道了"按钮经 finish 命令隐藏本窗。
import { invoke } from "@tauri-apps/api/core";
import { applyUiFont, registerBundledFontFaces } from "../lib/fonts";
import zh from "../i18n/zh";
import en from "../i18n/en";

interface Texts {
  title: string;
  body1: string;
  body2: string;
  bodyWin: string;
  ok: string;
}

const RES: Record<"zh" | "en", Texts> = {
  zh: {
    title: zh.closeNotice.title,
    body1: zh.closeNotice.body1,
    body2: zh.closeNotice.body2,
    bodyWin: zh.closeNotice.bodyWin,
    ok: zh.closeNotice.ok,
  },
  en: {
    title: en.closeNotice.title,
    body1: en.closeNotice.body1,
    body2: en.closeNotice.body2,
    bodyWin: en.closeNotice.bodyWin,
    ok: en.closeNotice.ok,
  },
};

const s = navigator.language.toLowerCase().startsWith("zh") ? RES.zh : RES.en;

$("title").textContent = s.title;
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

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

// 界面字体：与提醒弹窗同款——注册内置字体后按全局设置应用
async function applyFont(): Promise<void> {
  const cfg = await invoke<{ uiFont: string }>("get_global_config");
  await registerBundledFontFaces();
  applyUiFont(cfg.uiFont);
}
void applyFont().catch(() => undefined);

// 整页可点击（含按钮）：隐藏本窗
document.body.addEventListener("click", () => {
  void invoke("finish_close_notice").catch(() => undefined);
});
