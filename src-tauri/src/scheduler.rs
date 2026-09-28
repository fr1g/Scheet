//! 统一后台调度线程（500ms 轮询）：
//! 1. 手动提醒（data.db 的 reminders 表，含离线补发）；
//! 2. 周课表提醒事件（由当前周表推导，不做离线补发——新一天首轮只标记不触发，
//!    避免应用启动时轰炸当天已过期的历史事件）；
//! 3. todo 日切滚动（日期变化时执行）。

use std::collections::HashSet;
use std::sync::Arc;

use chrono::{Datelike, Local, NaiveDate, Timelike};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::db::{DataDb, TodoDb, WeeksDb};
use crate::reminders;
use crate::settings::load_global_config;
use crate::sound::AlarmMode;
use crate::timetable::{self, AlarmEvent, AlarmKind, Ringtone};
use crate::todo;
use crate::weeks::{self, EntryType};

const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(500);

/// 推送给前端的提醒事件载荷（snackbar 数据）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlarmEventPayload {
    entry_id: i64,
    kind: AlarmKind,
    entry_type: EntryType,
    title: String,
    /// "builtin" | "none" | alarms 文件名。
    ringtone: String,
    mode: AlarmMode,
}

pub fn start(app: AppHandle, data: Arc<DataDb>, weeks: Arc<WeeksDb>, todo_db: Arc<TodoDb>) {
    let spawned = std::thread::Builder::new()
        .name("scheduler".into())
        .spawn(move || {
            let mut fired: HashSet<String> = HashSet::new();
            let mut last_date: Option<NaiveDate> = None;
            loop {
                std::thread::sleep(POLL_INTERVAL);

                if let Err(e) = reminders::poll_due(&app, &data) {
                    eprintln!("[scheduler] 手动提醒轮询失败: {e}");
                }

                let today = Local::now().date_naive();
                let date_changed = last_date != Some(today);
                if date_changed {
                    fired.clear();
                    if let Err(e) = todo_db.with_conn(|conn| todo::ensure_rollover(conn)) {
                        eprintln!("[scheduler] todo 日切滚动失败: {e}");
                    }
                    last_date = Some(today);
                }

                if let Err(e) =
                    poll_timetable(&app, &data, &weeks, &mut fired, today, date_changed)
                {
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
    fired: &mut HashSet<String>,
    today: NaiveDate,
    date_changed: bool,
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
    let date_key = today.format("%Y-%m-%d").to_string();
    for event in events {
        if event.fire_minute > now_minute {
            continue;
        }
        let key = format!("{date_key}-{}-{:?}", event.entry_id, event.kind);
        if !fired.insert(key) {
            continue;
        }
        // 新一天的首轮只做标记，不触发（避免启动时补发全天历史事件）
        if !date_changed {
            fire_alarm_event(app, &event);
        }
    }
    Ok(())
}

fn fire_alarm_event(app: &AppHandle, event: &AlarmEvent) {
    let title = if event.title.trim().is_empty() {
        match event.entry_type {
            EntryType::Normal => "普通事务",
            EntryType::Rest => "休息事务",
        }
        .to_string()
    } else {
        event.title.trim().to_string()
    };
    let kind_text = match event.kind {
        AlarmKind::Start => "开始",
        AlarmKind::End => "结束",
    };
    let body = format!("{kind_text}提醒 · {}", minute_to_hhmm(event.fire_minute));

    let ringtone_name = match &event.ringtone {
        Ringtone::Silent => "none",
        Ringtone::Builtin => "builtin",
        Ringtone::File(name) => name.as_str(),
    };

    if !matches!(event.ringtone, Ringtone::Silent) {
        if let Err(e) = crate::notify::send(app, &title, &body) {
            eprintln!("[scheduler] 通知发送失败(已忽略): {e}");
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
