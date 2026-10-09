// 提醒弹窗（静态页，无 React）：首帧即内容，无加载态。
// 数据：invoke("get_last_alarm_payload") 取 Rust 仓库中的 AlarmPopupPayload；
// 更新：监听 scheet://alarm-popup 事件（复用路径）。
// 文案：构建期内联 zh/en（与主应用同一事实源，零漂移）。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyUiFont, registerBundledFontFaces } from "../lib/fonts";
import zh from "../i18n/zh";
import en from "../i18n/en";

interface AlarmPopupPayload {
  lang: string; // "auto" | "zh" | "en"
  title: string;
  body: string | null;
  kind: string | null; // "start" | "end"
  timeStart: string | null; // "HH:MM"
  timeEnd: string | null;
  mode: string; // "once" | "loop"
  entryType: string | null; // "normal" | "rest"
}

const RES = {
  zh: {
    reminder: zh.popup.reminder,
    looping: zh.popup.looping,
    clickHint: zh.popup.clickHint,
    openMain: zh.popup.openMain,
    start: zh.alarm.start,
    end: zh.alarm.end,
    normal: zh.alarmSnackbar.normal,
    rest: zh.alarmSnackbar.rest,
  },
  en: {
    reminder: en.popup.reminder,
    looping: en.popup.looping,
    clickHint: en.popup.clickHint,
    openMain: en.popup.openMain,
    start: en.alarm.start,
    end: en.alarm.end,
    normal: en.alarmSnackbar.normal,
    rest: en.alarmSnackbar.rest,
  },
};

function resolveLang(pref: string): "zh" | "en" {
  if (pref === "zh" || pref === "en") return pref;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
// 啥习惯啊怎么GPT GLM都喜欢在这搓个jquery余孽似的的东西

function render(p: AlarmPopupPayload): void {
  const s = RES[resolveLang(p.lang)];
  $("mode-label").textContent = p.mode === "loop" ? s.looping : s.reminder;
  $("title").textContent = p.title || (p.entryType === "rest" ? s.rest : s.normal);
  const kindText = p.kind ? (p.kind === "end" ? s.end : s.start) : "";
  const typeName = p.entryType ? (p.entryType === "rest" ? s.rest : s.normal) : "";
  const parts = [kindText, p.timeStart, typeName].filter(Boolean);
  $("sub").textContent = parts.join(" · ");
  if (p.body) $("sub").textContent += ` — ${p.body}`;
  const openMain = $("open-main");
  openMain.textContent = s.openMain;
  $("click-hint")!.textContent = s.clickHint;
}

function tick(): void {
  const d = new Date();
  $("clock").textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

// 本体点击：停铃 + 关闭（不聚焦主窗口）
document.body.addEventListener("click", () => {
  void invoke("close_alarm_popup").catch(() => undefined);
});
// 打开主窗口按钮（不随本体点击关闭）
$("open-main").addEventListener("click", (e) => {
  e.stopPropagation();
  void invoke("dismiss_alarm_popup").catch(() => undefined);
});

tick();
window.setInterval(tick, 250);

// 界面字体：注册内置字体 @font-face（asset 协议）后按全局设置应用；
// 失败保持 popup.html 的默认字体栈。每次弹窗显示时重取（设置中途换字体也能跟上）。
async function applyFont(): Promise<void> {
  const cfg = await invoke<{ uiFont: string }>("get_global_config");
  await registerBundledFontFaces();
  applyUiFont(cfg.uiFont);
}

// 初始载荷
void invoke<AlarmPopupPayload>("get_last_alarm_payload")
  .then((p) => render(p))
  .catch(() => undefined);
void applyFont().catch(() => undefined);

// 复用路径：后端 emit 更新
void listen<AlarmPopupPayload>("scheet://alarm-popup", (e) => {
  render(e.payload);
  void applyFont().catch(() => undefined);
}).catch(() => undefined);
