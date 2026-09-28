//! 时间存储约定（SQLite 无原生日期类型，统一按以下三类存储，全项目不得混用）：
//!
//! 1. **时间点**（created_at / updated_at / fire_at 等元数据与提醒时刻）：
//!    RFC3339 UTC 文本（`…Z`）。输入若带时区偏移，解析时先转 UTC 再落库——
//!    时刻信息无损，只是统一了表示。
//! 2. **一天之内的时间**（事务 start_minute / duration_minute / 日覆盖等）：
//!    当日分钟数（0–1439），纯"仅时间"，与任何时区无关。
//! 3. **日历日**（todo 的 date、周表轮换锚点）：
//!    本地日期文本 "YYYY-MM-DD"。"一天"的边界按用户本地时间定义，属刻意选择。

use chrono::{Local, NaiveDate, SecondsFormat, Utc};

/// 当前时刻，RFC3339 UTC 文本（如 `2026-09-28T02:00:00Z`）。
pub fn now_utc_string() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// 本地日历日文本（如 `2026-09-28`）。
pub fn today_local_string() -> String {
    date_string(Local::now().date_naive())
}

/// 任意日历日 -> 本地日期文本。
pub fn date_string(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::DateTime;

    #[test]
    fn now_utc_string_is_utc_rfc3339() {
        let before = Utc::now();
        let s = now_utc_string();
        let parsed = DateTime::parse_from_rfc3339(&s)
            .unwrap()
            .with_timezone(&Utc);
        // 生成的时刻与当前时刻相差应在数秒内
        assert!((before - parsed).num_seconds().abs() <= 5);
    }

    #[test]
    fn local_offset_is_normalized_to_utc_when_storing_instants() {
        // 带偏移的输入：+08:00 的 10:00 == UTC 02:00，落库后无偏移损失
        let input = "2026-09-28T10:00:00+08:00";
        let parsed = DateTime::parse_from_rfc3339(input).unwrap();
        let stored = parsed.with_timezone(&Utc).to_rfc3339_opts(SecondsFormat::Secs, true);
        assert_eq!(stored, "2026-09-28T02:00:00Z");
        // 往返一致
        assert_eq!(
            DateTime::parse_from_rfc3339(&stored).unwrap(),
            parsed
        );
    }

    #[test]
    fn date_string_format() {
        let d = NaiveDate::from_ymd_opt(2026, 9, 28).unwrap();
        assert_eq!(date_string(d), "2026-09-28");
        assert_eq!(date_string(d).len(), 10);
    }
}
