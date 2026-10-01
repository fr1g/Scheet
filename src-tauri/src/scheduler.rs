//! 统一后台调度线程（1000ms 轮询）：
//! 1. 手动提醒（data.db 的 reminders 表，含离线补发）；
//! 2. 周课表提醒事件（由当前周表推导）——按"时间窗"触发：只触发自上次轮询
//!    以来新到期的提醒，因此保存/编辑周表不会让早已处于事件区间内的时间点
//!    意外响铃；新一天首轮只推进水位线不触发（避免启动时补发全天历史事件）；
//! 3. todo 日切滚动（日期变化时执行，并 emit 日期切换事件刷新前端日期 UI）。
//!
//! 提醒的"推送"形态：置顶提醒弹窗子窗口（popup.rs），替代系统通知——
//! 部分环境（勿扰模式、未注册 AUMID 等）下系统通知不可见。

use std::sync::Arc;

use chrono::{Datelike, Local, NaiveDate, Timelike};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::db::{DataDb, TodoDb, WeeksDb};
use crate::popup;
use crate::reminders;
use crate::settings::load_global_config;
use crate::sound::AlarmMode;
use crate::timetable::{self, AlarmEvent, AlarmKind, Ringtone};
use crate::todo;
use crate::weeks::{self, EntryType};

const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(1000);

/// 清空数据期间置真：调度线程跳过全部轮询，避免重新打开刚被关闭/删除的数据库。
static PAUSED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn set_paused(paused: bool) {
    PAUSED.store(paused, std::sync::atomic::Ordering::SeqCst);
}

/// 推送给前端的提醒事件载荷（snackbar 数据）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlarmEventPayload {
    entry_id: i64,
    kind: AlarmKind,
    entry_type: EntryType,
    title: String,
    /// 到期时间（当日分钟数），文案由前端按语言生成。
    fire_minute: i64,
    /// "builtin" | "none" | alarms 文件名。
    ringtone: String,
    mode: AlarmMode,
}

/// 日期切换事件载荷（标题栏日期、"今天"列标记刷新）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DateChangedPayload {
    date: String,
    weekday: u32,
}

pub fn start(app: AppHandle, data: Arc<DataDb>, weeks: Arc<WeeksDb>, todo_db: Arc<TodoDb>) {
    let spawned = std::thread::Builder::new()
        .name("scheduler".into())
        .spawn(move || {
            // 当天已轮询到的时间水位线（分钟）：None = 尚未轮询
            let mut last_poll_minute: Option<i64> = None;
            let mut last_date: Option<NaiveDate> = None;
            loop {
                std::thread::sleep(POLL_INTERVAL);

                if PAUSED.load(std::sync::atomic::Ordering::SeqCst) {
                    continue;
                }

                if let Err(e) = reminders::poll_due(&app, &data) {
                    eprintln!("[scheduler] 手动提醒轮询失败: {e}");
                }

                let today = Local::now().date_naive();
                let date_changed = last_date != Some(today);
                if date_changed {
                    last_poll_minute = None;
                    // 通知前端刷新日期相关 UI（标题栏日期、"今天"列标记）
                    let payload = DateChangedPayload {
                        date: today.format("%Y-%m-%d").to_string(),
                        weekday: today.weekday().num_days_from_monday() as u32 + 1,
                    };
                    if let Err(e) = app.emit("scheet://date-changed", payload) {
                        eprintln!("[scheduler] 日期切换事件推送失败: {e}");
                    }
                    if let Err(e) = todo_db.with_conn(|conn| todo::ensure_rollover(conn)) {
                        eprintln!("[scheduler] todo 日切滚动失败: {e}");
                    }
                    last_date = Some(today);
                }

                if let Err(e) = poll_timetable(
                    &app,
                    &data,
                    &weeks,
                    &mut last_poll_minute,
                    today,
                ) {
                    eprintln!("[scheduler] 周课表事件轮询失败: {e}");
                }
            }
        });
    if let Err(e) = spawned {
        eprintln!("[scheduler] 调度线程启动失败(提醒功能不可用): {e}");
    }
}

fn poll_timetable(
    app: &AppHandle,
    data: &Arc<DataDb>,
    weeks: &Arc<WeeksDb>,
    last_poll_minute: &mut Option<i64>,
    today: NaiveDate,
) -> Result<(), String> {
    let plan_id = weeks.with_conn(|weeks_conn| {
        data.with_conn(|data_conn| weeks::current_plan_id(weeks_conn, data_conn))
    })?;
    let plan = weeks.with_conn(|conn| weeks::get_full_plan(conn, plan_id))?;
    let cfg = data.with_conn(load_global_config)?;
    let weekday = today.weekday().num_days_from_monday() as u32 + 1; // ISO 1=周一..7=周日
    let (_day_start, day_end) = weeks::resolve_day_window(&plan, weekday, &cfg);
    let events = timetable::compute_day_events(&plan.entries, weekday, day_end, &cfg);

    let now_time = Local::now().time();
    let now_minute = (now_time.hour() * 60 + now_time.minute()) as i64;

    match *last_poll_minute {
        // 新一天/新计划的首轮：只推进水位线，不触发历史事件（避免补发轰炸）
        None => {
            *last_poll_minute = Some(now_minute);
            return Ok(());
        }
        Some(window_start) => {
            for event in events {
                // 时间窗触发：只触发自上次轮询以来新到期的提醒
                if event.fire_minute <= window_start || event.fire_minute > now_minute {
                    continue;
                }
                fire_alarm_event(app, &event);
            }
        }
    }
    *last_poll_minute = Some(now_minute);
    Ok(())
}

fn fire_alarm_event(app: &AppHandle, event: &AlarmEvent) {
    // 标题原样传递；空标题由前端按事务类型回退显示（文案走 i18n）
    let title = event.title.trim().to_string();

    let ringtone_name = match &event.ringtone {
        Ringtone::Silent => "none",
        Ringtone::Builtin => "builtin",
        Ringtone::File(name) => name.as_str(),
    };

    if !matches!(event.ringtone, Ringtone::Silent) {
        // 系统通知在部分环境不可见，改为置顶弹窗（跨平台一致）
        let kind_text = match event.kind {
            AlarmKind::Start => "start",
            AlarmKind::End => "end",
        };
        if let Err(e) = popup::show(
            app,
            &title,
            None,
            Some(kind_text),
            Some(&minute_to_hhmm(event.fire_minute)),
            match event.mode {
                AlarmMode::Once => "once",
                AlarmMode::Loop => "loop",
            },
        ) {
            eprintln!("[scheduler] 提醒弹窗失败(已忽略): {e}");
        }
        let sound_file = match &event.ringtone {
            Ringtone::File(name) => name.as_str(),
            _ => "",
        };
        if let Err(e) = crate::sound::play(sound_file, event.mode) {
            eprintln!("[scheduler] 提示音播放失败(已忽略): {e}");
        }
    }

    let payload = AlarmEventPayload {
        entry_id: event.entry_id,
        kind: event.kind,
        entry_type: event.entry_type,
        title,
        fire_minute: event.fire_minute,
        ringtone: ringtone_name.to_string(),
        mode: event.mode,
    };
    if let Err(e) = app.emit("scheet://alarm", payload) {
        eprintln!("[scheduler] 提醒事件推送失败: {e}");
    }
}

fn minute_to_hhmm(minute: i64) -> String {
    format!("{:02}:{:02}", minute / 60, minute % 60)
}
