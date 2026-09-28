//! 提醒事件计算（timetable）：由"当前周表 + 今天"推导当日提醒事件。
//!
//! 规则（对应 fn-req.md）：
//! - 每个提醒事务（普通/休息）在其开始时刻触发"开始铃"；
//! - 结束铃只属于"其后没有相邻提醒事务"的事务（链式规则：一串无空隔的
//!   事务只播开始铃，最后一个在结束时播结束铃）；
//! - 事务结束时间超出当天结束时间时，结束铃钳制到当天结束时间（溢出警告）；
//! - 铃声解析链：事务 → 事务类型 → 全部提醒事务 → 内置默认铃声；
//!   取值 "none" 表示不提醒（静音、不推送，仍弹应用内 snackbar）。
//!
//! 计算是纯函数，由 scheduler.rs 每 500ms 调用一次并负责触发与去重。

use serde::{Deserialize, Serialize};

use crate::settings::GlobalConfig;
use crate::sound::AlarmMode;
use crate::weeks::{EntryType, WeekEntry};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AlarmKind {
    Start,
    End,
}

/// 解析后的铃声选择。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ringtone {
    /// 内置默认铃声。
    Builtin,
    /// 不提醒：静音、不推送系统通知，仍弹 snackbar。
    Silent,
    /// alarms 目录下的文件名。
    File(String),
}

/// 一条到期的提醒事件。
#[derive(Debug, Clone, PartialEq)]
pub struct AlarmEvent {
    pub entry_id: i64,
    pub kind: AlarmKind,
    pub entry_type: EntryType,
    pub title: String,
    /// 当天分钟（0–1439），结束铃已按当天结束时间钳制。
    pub fire_minute: i64,
    pub ringtone: Ringtone,
    pub mode: AlarmMode,
}

/// 铃声解析链。
///
/// 开始铃：事务 → 类型默认 → 全局默认 → 内置。
/// 结束铃：事务结束 → 事务开始 → 类型结束默认 → 类型默认 → 全局结束默认 → 全局默认 → 内置
/// （即未单独设置结束铃声时，自然回落到开始铃声，保持向后兼容）。
pub(crate) fn resolve_alarm(
    kind: AlarmKind,
    entry: &WeekEntry,
    cfg: &GlobalConfig,
) -> (Ringtone, AlarmMode) {
    let (type_file, type_mode) = match entry.entry_type {
        EntryType::Normal => (cfg.alarm_normal_file.as_deref(), cfg.alarm_normal_mode),
        EntryType::Rest => (cfg.alarm_rest_file.as_deref(), cfg.alarm_rest_mode),
    };
    let (type_end_file, type_end_mode) = match entry.entry_type {
        EntryType::Normal => (
            cfg.alarm_normal_end_file.as_deref(),
            cfg.alarm_normal_end_mode,
        ),
        EntryType::Rest => (cfg.alarm_rest_end_file.as_deref(), cfg.alarm_rest_end_mode),
    };

    let (file, mode) = match kind {
        AlarmKind::Start => (
            entry
                .alarm_file
                .as_deref()
                .or(type_file)
                .or(cfg.alarm_all_file.as_deref()),
            entry
                .alarm_mode
                .or(type_mode)
                .or(cfg.alarm_all_mode)
                .unwrap_or(AlarmMode::Once),
        ),
        AlarmKind::End => (
            entry
                .end_alarm_file
                .as_deref()
                .or(entry.alarm_file.as_deref())
                .or(type_end_file)
                .or(type_file)
                .or(cfg.alarm_all_end_file.as_deref())
                .or(cfg.alarm_all_file.as_deref()),
            entry
                .end_alarm_mode
                .or(entry.alarm_mode)
                .or(type_end_mode)
                .or(type_mode)
                .or(cfg.alarm_all_end_mode)
                .or(cfg.alarm_all_mode)
                .unwrap_or(AlarmMode::Once),
        ),
    };

    let ringtone = match file {
        None | Some("builtin") => Ringtone::Builtin,
        Some("none") => Ringtone::Silent,
        Some(f) => Ringtone::File(f.to_string()),
    };
    (ringtone, mode)
}

/// 计算某天（weekday: 1=周一..7=周日）的提醒事件。
///
/// `entries`：当天的提醒事务（普通/休息），无需预先排序；
/// `day_end_minute`：当天结束时间（结束铃的钳制点）。
pub fn compute_day_events(
    entries: &[WeekEntry],
    weekday: u32,
    day_end_minute: i64,
    cfg: &GlobalConfig,
) -> Vec<AlarmEvent> {
    let mut today: Vec<&WeekEntry> = entries
        .iter()
        .filter(|e| e.weekday as u32 == weekday)
        .collect();
    today.sort_by_key(|e| e.start_minute);

    let mut events = Vec::new();
    for (i, entry) in today.iter().enumerate() {
        let (start_ringtone, start_mode) = resolve_alarm(AlarmKind::Start, entry, cfg);
        let (end_ringtone, end_mode) = resolve_alarm(AlarmKind::End, entry, cfg);
        let end_minute = entry.start_minute + entry.duration_minute;

        events.push(AlarmEvent {
            entry_id: entry.id,
            kind: AlarmKind::Start,
            entry_type: entry.entry_type,
            title: entry.title.clone(),
            fire_minute: entry.start_minute,
            ringtone: start_ringtone,
            mode: start_mode,
        });

        // 链式结束铃：下一个提醒事务恰好在本事务结束时开始则不响结束铃
        let chained = today
            .get(i + 1)
            .map(|next| next.start_minute == end_minute)
            .unwrap_or(false);
        if !chained {
            events.push(AlarmEvent {
                entry_id: entry.id,
                kind: AlarmKind::End,
                entry_type: entry.entry_type,
                title: entry.title.clone(),
                fire_minute: end_minute.min(day_end_minute),
                ringtone: end_ringtone,
                mode: end_mode,
            });
        }
    }
    events
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: i64, weekday: u32, start: i64, duration: i64) -> WeekEntry {
        WeekEntry {
            id,
            weekday: weekday as i64,
            start_minute: start,
            duration_minute: duration,
            entry_type: EntryType::Normal,
            title: format!("事务{id}"),
            alarm_file: None,
            alarm_mode: None,
            color: None,
            end_alarm_file: None,
            end_alarm_mode: None,
        }
    }

    #[test]
    fn chained_entries_only_ring_end_of_chain() {
        // A(6:00-7:00) -> B(7:00-8:00) -> 空隙
        let entries = vec![entry(1, 1, 360, 60), entry(2, 1, 420, 60)];
        let events = compute_day_events(&entries, 1, 1439, &GlobalConfig::default());
        let starts: Vec<i64> = events
            .iter()
            .filter(|e| e.kind == AlarmKind::Start)
            .map(|e| e.fire_minute)
            .collect();
        let ends: Vec<&AlarmEvent> = events.iter().filter(|e| e.kind == AlarmKind::End).collect();
        assert_eq!(starts, vec![360, 420]); // 都有开始铃
        assert_eq!(ends.len(), 1); // 只有链尾有结束铃
        assert_eq!(ends[0].entry_id, 2);
        assert_eq!(ends[0].fire_minute, 480);
    }

    #[test]
    fn gap_gives_each_entry_its_own_end_bell() {
        let entries = vec![entry(1, 1, 360, 30), entry(2, 1, 420, 30)];
        let events = compute_day_events(&entries, 1, 1439, &GlobalConfig::default());
        let ends: Vec<i64> = events
            .iter()
            .filter(|e| e.kind == AlarmKind::End)
            .map(|e| e.fire_minute)
            .collect();
        assert_eq!(ends, vec![390, 450]);
    }

    #[test]
    fn overflow_end_bell_clamps_to_day_end() {
        // 23:00 开始、60 分钟 → 24:00 超出 23:59 结束
        let entries = vec![entry(1, 1, 1380, 60)];
        let events = compute_day_events(&entries, 1, 1439, &GlobalConfig::default());
        let end = events.iter().find(|e| e.kind == AlarmKind::End).unwrap();
        assert_eq!(end.fire_minute, 1439);
    }

    #[test]
    fn other_days_excluded() {
        let entries = vec![entry(1, 2, 360, 30), entry(2, 3, 420, 30)];
        assert!(compute_day_events(&entries, 1, 1439, &GlobalConfig::default()).is_empty());
    }

    #[test]
    fn ringtone_resolution_chain() {
        let mut cfg = GlobalConfig::default();
        cfg.alarm_all_file = Some("all.mp3".into());
        cfg.alarm_normal_file = Some("normal.mp3".into());
        cfg.alarm_normal_mode = Some(AlarmMode::Loop);

        let mut e = entry(1, 1, 360, 30);
        e.entry_type = EntryType::Normal;
        // 事务未设置 → 类型级
        assert_eq!(
            resolve_alarm(AlarmKind::Start, &e, &cfg).0,
            Ringtone::File("normal.mp3".into())
        );
        assert_eq!(resolve_alarm(AlarmKind::Start, &e, &cfg).1, AlarmMode::Loop);
        // 事务级覆盖
        e.alarm_file = Some("tx.mp3".into());
        e.alarm_mode = Some(AlarmMode::Once);
        assert_eq!(
            resolve_alarm(AlarmKind::Start, &e, &cfg).0,
            Ringtone::File("tx.mp3".into())
        );
        assert_eq!(resolve_alarm(AlarmKind::Start, &e, &cfg).1, AlarmMode::Once);
        // none 静音
        e.alarm_file = Some("none".into());
        assert_eq!(resolve_alarm(AlarmKind::Start, &e, &cfg).0, Ringtone::Silent);
        // 休息事务 → rest 级（未设置）→ all 级
        let mut r = entry(2, 1, 360, 30);
        r.entry_type = EntryType::Rest;
        assert_eq!(
            resolve_alarm(AlarmKind::Start, &r, &cfg).0,
            Ringtone::File("all.mp3".into())
        );
        // 全链未设置 → 内置默认
        cfg.alarm_all_file = None;
        r.alarm_file = None;
        assert_eq!(resolve_alarm(AlarmKind::Start, &r, &cfg).0, Ringtone::Builtin);
        assert_eq!(resolve_alarm(AlarmKind::Start, &r, &cfg).1, AlarmMode::Once);
    }

    #[test]
    fn end_bell_falls_back_to_start_chain_then_overrides() {
        let mut cfg = GlobalConfig::default();
        cfg.alarm_all_file = Some("start-all.mp3".into());
        let mut e = entry(1, 1, 360, 30);

        // 未设置任何结束铃声 → 回落到开始铃声链
        assert_eq!(
            resolve_alarm(AlarmKind::End, &e, &cfg).0,
            Ringtone::File("start-all.mp3".into())
        );
        // 全局结束默认优先于全局开始默认
        cfg.alarm_all_end_file = Some("end-all.mp3".into());
        assert_eq!(
            resolve_alarm(AlarmKind::End, &e, &cfg).0,
            Ringtone::File("end-all.mp3".into())
        );
        // 类型结束默认优先于全局结束默认
        cfg.alarm_normal_end_file = Some("end-normal.mp3".into());
        assert_eq!(
            resolve_alarm(AlarmKind::End, &e, &cfg).0,
            Ringtone::File("end-normal.mp3".into())
        );
        // 事务结束铃声最高优先
        e.end_alarm_file = Some("end-tx.mp3".into());
        assert_eq!(
            resolve_alarm(AlarmKind::End, &e, &cfg).0,
            Ringtone::File("end-tx.mp3".into())
        );
    }
}
