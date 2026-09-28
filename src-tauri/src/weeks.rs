//! 周表：以周为单位的事务编排（weeks.db）。
//!
//! - 周表至多 [`MAX_PLANS`] 个，第一个（slot 1）默认创建且不可删除；
//! - 事务（week_entries）分为普通/休息两类提醒事务，最小粒度 5 分钟，
//!   存 `start_minute`（0–1439）+ `duration_minute`（5 的倍数），允许溢出当天结束时间；
//! - 无安排时段不入库，由前端按空隙派生渲染；
//! - "当周"设置后按槽位顺序循环轮换（锚点日期存于 data.db 的 app_settings）。

use std::sync::Arc;

use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

use crate::clock;
use crate::db::WeeksDb;
use crate::settings::{load_global_config, set_setting, GlobalConfig};
use crate::sound::AlarmMode;

pub const MAX_PLANS: usize = 6;

fn now_str() -> String {
    clock::now_utc_string()
}

// ============ 类型 ============

/// 事务类型：普通 / 休息（提醒事务）；无安排时段不入库、由前端派生。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryType {
    Normal,
    Rest,
}

impl EntryType {
    pub fn as_db(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Rest => "rest",
        }
    }

    pub fn from_db(raw: &str) -> Self {
        match raw {
            "rest" => Self::Rest,
            _ => Self::Normal,
        }
    }
}

/// 周表元信息。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekPlan {
    pub id: i64,
    /// 槽位 1..=6，决定轮换顺序与 tab 显示顺序。
    pub slot: i64,
    pub name: String,
    pub day_start_minute: Option<i64>,
    pub day_end_minute: Option<i64>,
}

/// 周表内的一条事务。
///
/// `id`：已入库条目为正数；前端工作副本中的新条目使用负数临时 id
/// （仅用于冲突配对回显，保存时删除重建、id 会变化）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekEntry {
    pub id: i64,
    /// ISO 周几：1=周一 .. 7=周日。
    pub weekday: i64,
    pub start_minute: i64,
    pub duration_minute: i64,
    pub entry_type: EntryType,
    pub title: String,
    /// None=继承下一级；"builtin"=内置铃声；"none"=不提醒；其他=alarms 文件名。
    pub alarm_file: Option<String>,
    /// None=继承下一级。
    pub alarm_mode: Option<AlarmMode>,
}

/// 某周表某天的起止时间覆盖。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayOverride {
    pub weekday: i64,
    pub day_start_minute: Option<i64>,
    pub day_end_minute: Option<i64>,
}

/// 完整周表（元信息 + 全部事务 + 全部日覆盖）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullPlan {
    pub plan: WeekPlan,
    pub entries: Vec<WeekEntry>,
    pub overrides: Vec<DayOverride>,
}

/// 一对互相冲突（时间重叠）的提醒事务。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub a_id: i64,
    pub b_id: i64,
    pub weekday: i64,
}

/// 保存结果：冲突时拒绝写入并回显冲突对。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOutcome {
    pub saved: bool,
    pub plan: Option<FullPlan>,
    pub conflicts: Vec<Conflict>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePlanPayload {
    pub id: i64,
    pub name: String,
    pub day_start_minute: Option<i64>,
    pub day_end_minute: Option<i64>,
    pub entries: Vec<WeekEntry>,
    pub overrides: Vec<DayOverride>,
}

// ============ schema ============

pub(crate) fn init_weeks_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS week_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slot INTEGER NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 6),
            name TEXT NOT NULL,
            day_start_minute INTEGER,
            day_end_minute INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS week_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
            weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
            start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
            duration_minute INTEGER NOT NULL
                CHECK (duration_minute > 0 AND duration_minute % 5 = 0),
            entry_type TEXT NOT NULL CHECK (entry_type IN ('normal', 'rest')),
            title TEXT NOT NULL DEFAULT '',
            alarm_file TEXT,
            alarm_mode TEXT CHECK (alarm_mode IS NULL OR alarm_mode IN ('once', 'loop')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_week_entries_plan
            ON week_entries(plan_id, weekday, start_minute);
        CREATE TABLE IF NOT EXISTS week_day_overrides (
            plan_id INTEGER NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
            weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
            day_start_minute INTEGER,
            day_end_minute INTEGER,
            PRIMARY KEY (plan_id, weekday)
        );",
    )
    .map_err(|e| format!("初始化 weeks.db 失败: {e}"))?;
    ensure_default_plan(conn)
}

fn ensure_default_plan(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM week_plans", [], |r| r.get(0))
        .map_err(|e| format!("读取周表失败: {e}"))?;
    if count == 0 {
        let now = now_str();
        conn.execute(
            "INSERT INTO week_plans (slot, name, created_at, updated_at) VALUES (1, '第一周表', ?1, ?1)",
            [&now],
        )
        .map_err(|e| format!("创建默认周表失败: {e}"))?;
    }
    Ok(())
}

// ============ 周表 CRUD ============

fn row_to_plan(row: &rusqlite::Row<'_>) -> rusqlite::Result<WeekPlan> {
    Ok(WeekPlan {
        id: row.get("id")?,
        slot: row.get("slot")?,
        name: row.get("name")?,
        day_start_minute: row.get("day_start_minute")?,
        day_end_minute: row.get("day_end_minute")?,
    })
}

pub fn list_plans(conn: &Connection) -> Result<Vec<WeekPlan>, String> {
    let mut stmt = conn
        .prepare("SELECT id, slot, name, day_start_minute, day_end_minute FROM week_plans ORDER BY slot")
        .map_err(|e| format!("读取周表失败: {e}"))?;
    let rows = stmt
        .query_map([], row_to_plan)
        .map_err(|e| format!("读取周表失败: {e}"))?;
    let mut plans = Vec::new();
    for row in rows {
        plans.push(row.map_err(|e| format!("读取周表失败: {e}"))?);
    }
    Ok(plans)
}

pub fn create_plan(conn: &Connection, name: &str) -> Result<WeekPlan, String> {
    let existing = list_plans(conn)?;
    if existing.len() >= MAX_PLANS {
        return Err(format!("最多只能有 {MAX_PLANS} 个周表"));
    }
    let slot = (1..=MAX_PLANS as i64)
        .find(|s| !existing.iter().any(|p| p.slot == *s))
        .ok_or_else(|| format!("最多只能有 {MAX_PLANS} 个周表"))?;
    let now = now_str();
    conn.execute(
        "INSERT INTO week_plans (slot, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![slot, name, now],
    )
    .map_err(|e| format!("创建周表失败: {e}"))?;
    Ok(WeekPlan {
        id: conn.last_insert_rowid(),
        slot,
        name: name.to_string(),
        day_start_minute: None,
        day_end_minute: None,
    })
}

pub fn rename_plan(conn: &Connection, plan_id: i64, name: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE week_plans SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![name, now_str(), plan_id],
    )
    .map_err(|e| format!("重命名周表失败: {e}"))?;
    Ok(())
}

pub fn delete_plan(conn: &Connection, plan_id: i64) -> Result<(), String> {
    let slot: Option<i64> = conn
        .query_row(
            "SELECT slot FROM week_plans WHERE id = ?1",
            [plan_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("读取周表失败: {e}"))?;
    let Some(slot) = slot else {
        return Err("周表不存在".to_string());
    };
    if slot == 1 {
        return Err("第一个周表不可删除".to_string());
    }
    conn.execute("DELETE FROM week_plans WHERE id = ?1", [plan_id])
        .map_err(|e| format!("删除周表失败: {e}"))?;
    Ok(())
}

pub fn get_full_plan(conn: &Connection, plan_id: i64) -> Result<FullPlan, String> {
    let plan = conn
        .query_row(
            "SELECT id, slot, name, day_start_minute, day_end_minute FROM week_plans WHERE id = ?1",
            [plan_id],
            row_to_plan,
        )
        .optional()
        .map_err(|e| format!("读取周表失败: {e}"))?
        .ok_or_else(|| "周表不存在".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, plan_id, weekday, start_minute, duration_minute, entry_type, title,
                    alarm_file, alarm_mode
             FROM week_entries WHERE plan_id = ?1 ORDER BY weekday, start_minute",
        )
        .map_err(|e| format!("读取事务失败: {e}"))?;
    let rows = stmt
        .query_map([plan_id], |row| {
            let entry_type: String = row.get("entry_type")?;
            let alarm_mode: Option<String> = row.get("alarm_mode")?;
            Ok(WeekEntry {
                id: row.get("id")?,
                weekday: row.get("weekday")?,
                start_minute: row.get("start_minute")?,
                duration_minute: row.get("duration_minute")?,
                entry_type: EntryType::from_db(&entry_type),
                title: row.get("title")?,
                alarm_file: row.get("alarm_file")?,
                alarm_mode: alarm_mode.map(|m| AlarmMode::from_db(&m)),
            })
        })
        .map_err(|e| format!("读取事务失败: {e}"))?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("读取事务失败: {e}"))?);
    }

    let mut stmt = conn
        .prepare(
            "SELECT weekday, day_start_minute, day_end_minute
             FROM week_day_overrides WHERE plan_id = ?1 ORDER BY weekday",
        )
        .map_err(|e| format!("读取日覆盖失败: {e}"))?;
    let rows = stmt
        .query_map([plan_id], |row| {
            Ok(DayOverride {
                weekday: row.get("weekday")?,
                day_start_minute: row.get("day_start_minute")?,
                day_end_minute: row.get("day_end_minute")?,
            })
        })
        .map_err(|e| format!("读取日覆盖失败: {e}"))?;
    let mut overrides = Vec::new();
    for row in rows {
        overrides.push(row.map_err(|e| format!("读取日覆盖失败: {e}"))?);
    }

    Ok(FullPlan {
        plan,
        entries,
        overrides,
    })
}

// ============ 冲突检测 ============

/// 检测同一天内互相重叠的提醒事务（普通/休息）。
/// 纯函数：同时供保存校验与前端标注语义使用（两两配对，可能一个事务与多个冲突）。
pub fn find_conflicts(entries: &[WeekEntry]) -> Vec<Conflict> {
    let mut conflicts = Vec::new();
    for day in 1..=7 {
        let mut day_entries: Vec<&WeekEntry> = entries
            .iter()
            .filter(|e| e.weekday == day)
            .collect();
        day_entries.sort_by_key(|e| e.start_minute);
        for (i, a) in day_entries.iter().enumerate() {
            let a_end = a.start_minute + a.duration_minute;
            for b in &day_entries[i + 1..] {
                if b.start_minute < a_end {
                    conflicts.push(Conflict {
                        a_id: a.id,
                        b_id: b.id,
                        weekday: day,
                    });
                } else {
                    // 按 start 升序，之后的不可能再与 a 重叠
                    break;
                }
            }
        }
    }
    conflicts
}

// ============ 保存 ============

fn validate_entry(entry: &WeekEntry) -> Result<(), String> {
    if !(1..=7).contains(&entry.weekday) {
        return Err(format!("事务 {} 的 weekday 越界", entry.id));
    }
    if !(0..=1435).contains(&entry.start_minute) || entry.start_minute % 5 != 0 {
        return Err(format!("事务 {} 的开始时间必须是 5 的倍数且在当天内", entry.id));
    }
    if entry.duration_minute <= 0 || entry.duration_minute % 5 != 0 {
        return Err(format!("事务 {} 的时长必须是 5 的倍数", entry.id));
    }
    match &entry.alarm_file {
        None => {}
        Some(f) if f == "builtin" || f == "none" => {}
        Some(file) => crate::sound::validate_alarm_file_name(file)?,
    }
    Ok(())
}

fn validate_override(o: &DayOverride) -> Result<(), String> {
    if !(1..=7).contains(&o.weekday) {
        return Err(format!("日覆盖 {} 的 weekday 越界", o.weekday));
    }
    for v in [o.day_start_minute, o.day_end_minute] {
        if let Some(v) = v {
            if !(0..=1439).contains(&v) || v % 5 != 0 {
                return Err(format!("日覆盖 {} 的时间必须是 5 的倍数且在当天内", o.weekday));
            }
        }
    }
    if let (Some(s), Some(e)) = (o.day_start_minute, o.day_end_minute) {
        if s >= e {
            return Err(format!("日覆盖 {} 的开始时间必须早于结束时间", o.weekday));
        }
    }
    Ok(())
}

/// 保存整张周表（元信息 + 事务 + 日覆盖，事务删除重建）。
/// 存在重叠冲突时拒绝写入，返回冲突对（引用前端工作副本的 id）。
pub fn save_plan(conn: &Connection, payload: &SavePlanPayload) -> Result<SaveOutcome, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("周表名称不能为空".to_string());
    }
    for v in [payload.day_start_minute, payload.day_end_minute] {
        if let Some(v) = v {
            if !(0..=1439).contains(&v) || v % 5 != 0 {
                return Err("周表起止时间必须是 5 的倍数且在当天内".to_string());
            }
        }
    }
    if let (Some(s), Some(e)) = (payload.day_start_minute, payload.day_end_minute) {
        if s >= e {
            return Err("周表开始时间必须早于结束时间".to_string());
        }
    }
    for entry in &payload.entries {
        validate_entry(entry)?;
    }
    for o in &payload.overrides {
        validate_override(o)?;
    }

    let conflicts = find_conflicts(&payload.entries);
    if !conflicts.is_empty() {
        return Ok(SaveOutcome {
            saved: false,
            plan: None,
            conflicts,
        });
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("开启事务失败: {e}"))?;
    tx.execute(
        "UPDATE week_plans SET name = ?1, day_start_minute = ?2, day_end_minute = ?3, updated_at = ?4
         WHERE id = ?5",
        params![
            name,
            payload.day_start_minute,
            payload.day_end_minute,
            now_str(),
            payload.id
        ],
    )
    .map_err(|e| format!("保存周表失败: {e}"))?;
    tx.execute("DELETE FROM week_entries WHERE plan_id = ?1", [payload.id])
        .map_err(|e| format!("保存周表失败: {e}"))?;
    for entry in &payload.entries {
        tx.execute(
            "INSERT INTO week_entries
                (plan_id, weekday, start_minute, duration_minute, entry_type, title,
                 alarm_file, alarm_mode, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            params![
                payload.id,
                entry.weekday,
                entry.start_minute,
                entry.duration_minute,
                entry.entry_type.as_db(),
                entry.title,
                entry.alarm_file,
                entry.alarm_mode.map(|m| m.as_db()),
                now_str(),
            ],
        )
        .map_err(|e| format!("保存事务失败: {e}"))?;
    }
    tx.execute("DELETE FROM week_day_overrides WHERE plan_id = ?1", [payload.id])
        .map_err(|e| format!("保存周表失败: {e}"))?;
    for o in &payload.overrides {
        tx.execute(
            "INSERT OR REPLACE INTO week_day_overrides
                (plan_id, weekday, day_start_minute, day_end_minute)
             VALUES (?1, ?2, ?3, ?4)",
            params![payload.id, o.weekday, o.day_start_minute, o.day_end_minute],
        )
        .map_err(|e| format!("保存日覆盖失败: {e}"))?;
    }
    tx.commit().map_err(|e| format!("保存周表失败: {e}"))?;

    Ok(SaveOutcome {
        saved: true,
        plan: Some(get_full_plan(conn, payload.id)?),
        conflicts: Vec::new(),
    })
}

// ============ 当周轮换 ============

/// 轮换纯函数：槽位有序列表 + 锚点位置 + 经过整周数 -> 当前应使用的计划 id。
fn resolve_rotation(plan_ids_by_slot: &[i64], anchor_pos: usize, weeks_elapsed: i64) -> i64 {
    let len = plan_ids_by_slot.len() as i64;
    let idx = (anchor_pos as i64 + weeks_elapsed).rem_euclid(len);
    plan_ids_by_slot[idx as usize]
}

/// 计算"当前周"应使用的周表 id（轮换规则）。
pub fn current_plan_id(
    weeks_conn: &Connection,
    data_conn: &Connection,
) -> Result<i64, String> {
    let plans = list_plans(weeks_conn)?;
    let Some(first) = plans.first() else {
        return Err("没有任何周表".to_string());
    };
    if plans.len() == 1 {
        return Ok(first.id);
    }

    let active_id: Option<i64> = crate::settings::get_setting(data_conn, "activePlanId")
        .map_err(|e| e)?
        .and_then(|s| s.parse().ok());
    let Some(anchor_pos) = plans.iter().position(|p| Some(p.id) == active_id) else {
        // 未设置当周或当周已被删除：回退到第一个周表
        return Ok(first.id);
    };

    let cfg = load_global_config(data_conn)?;
    let today = Local::now().date_naive();
    let this_week_start = cfg.first_day_of_week.week_start(today);
    let weeks_elapsed = crate::settings::get_setting(data_conn, "rotationAnchorDate")
        .map_err(|e| e)?
        .and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
        .map(|anchor| (this_week_start - anchor).num_days().div_euclid(7))
        .unwrap_or(0)
        .max(0);

    let ids: Vec<i64> = plans.iter().map(|p| p.id).collect();
    Ok(resolve_rotation(&ids, anchor_pos, weeks_elapsed))
}

/// 设置"当周"周表：记录 id 与锚点日期（本周第一天，按每周第一天设置）。
pub fn set_active_plan(
    data_conn: &Connection,
    weeks_conn: &Connection,
    plan_id: i64,
) -> Result<(), String> {
    let exists: bool = weeks_conn
        .query_row(
            "SELECT COUNT(*) FROM week_plans WHERE id = ?1",
            [plan_id],
            |r| r.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .map_err(|e| format!("读取周表失败: {e}"))?;
    if !exists {
        return Err("周表不存在".to_string());
    }
    let cfg = load_global_config(data_conn)?;
    let anchor = clock::date_string(cfg.first_day_of_week.week_start(Local::now().date_naive()));
    set_setting(data_conn, "activePlanId", &plan_id.to_string())?;
    set_setting(data_conn, "rotationAnchorDate", &anchor)?;
    Ok(())
}

/// 解析某天的起止时间窗口：天覆盖 → 周表 → 全局。
pub fn resolve_day_window(
    plan: &FullPlan,
    weekday: u32,
    cfg: &GlobalConfig,
) -> (i64, i64) {
    let o = plan
        .overrides
        .iter()
        .find(|o| o.weekday as u32 == weekday);
    let start = o
        .and_then(|o| o.day_start_minute)
        .or(plan.plan.day_start_minute)
        .unwrap_or(cfg.day_start_minute);
    let end = o
        .and_then(|o| o.day_end_minute)
        .or(plan.plan.day_end_minute)
        .unwrap_or(cfg.day_end_minute);
    (start, end)
}

// ============ 命令 ============

#[command]
pub async fn list_week_plans(db: State<'_, Arc<WeeksDb>>) -> Result<Vec<WeekPlan>, String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || db.with_conn(list_plans))
            .await
            .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn create_week_plan(
    name: Option<String>,
    db: State<'_, Arc<WeeksDb>>,
) -> Result<WeekPlan, String> {
    let name = name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| {
                let name = match name {
                    Some(n) => n,
                    None => {
                        // 未提供名称时按槽位自动命名
                        let count: i64 = conn
                            .query_row("SELECT COUNT(*) FROM week_plans", [], |r| r.get(0))
                            .map_err(|e| format!("读取周表失败: {e}"))?;
                        format!("周表 {}", count + 1)
                    }
                };
                create_plan(conn, &name)
            })
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn rename_week_plan(
    id: i64,
    name: String,
    db: State<'_, Arc<WeeksDb>>,
) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("周表名称不能为空".to_string());
    }
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| rename_plan(conn, id, &name))
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn delete_week_plan(id: i64, db: State<'_, Arc<WeeksDb>>) -> Result<(), String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| delete_plan(conn, id))
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn get_week_plan(id: i64, db: State<'_, Arc<WeeksDb>>) -> Result<FullPlan, String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || db.with_conn(|conn| get_full_plan(conn, id)))
            .await
            .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn save_week_plan(
    payload: SavePlanPayload,
    db: State<'_, Arc<WeeksDb>>,
) -> Result<SaveOutcome, String> {
    let db = db.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            db.with_conn(|conn| save_plan(conn, &payload))
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn get_current_week_plan(
    weeks: State<'_, Arc<WeeksDb>>,
    data: State<'_, Arc<crate::db::DataDb>>,
) -> Result<FullPlan, String> {
    let weeks = weeks.inner().clone();
    let data = data.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            weeks.with_conn(|weeks_conn| {
                let current_id =
                    data.with_conn(|data_conn| current_plan_id(weeks_conn, data_conn))?;
                get_full_plan(weeks_conn, current_id)
            })
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[command]
pub async fn set_active_week_plan(
    id: i64,
    weeks: State<'_, Arc<WeeksDb>>,
    data: State<'_, Arc<crate::db::DataDb>>,
) -> Result<(), String> {
    let weeks = weeks.inner().clone();
    let data = data.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            weeks.with_conn(|weeks_conn| {
                data.with_conn(|data_conn| set_active_plan(data_conn, weeks_conn, id))
            })
        })
        .await
        .map_err(|e| e.to_string())??,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_data_schema;
    use crate::settings::{set_setting, FirstDayOfWeek};

    fn weeks_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_weeks_schema(&conn).unwrap();
        conn
    }

    fn data_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_data_schema(&conn).unwrap();
        conn
    }

    fn entry(id: i64, weekday: i64, start: i64, duration: i64) -> WeekEntry {
        WeekEntry {
            id,
            weekday,
            start_minute: start,
            duration_minute: duration,
            entry_type: EntryType::Normal,
            title: String::new(),
            alarm_file: None,
            alarm_mode: None,
        }
    }

    #[test]
    fn conflicts_ignore_adjacent_and_cross_day() {
        let entries = vec![
            entry(1, 1, 360, 60), // 6:00-7:00
            entry(2, 1, 420, 30), // 7:00 起，相邻不算冲突
            entry(3, 2, 360, 30), // 另一天
            entry(4, 2, 375, 30), // 与 3 重叠
        ];
        let conflicts = find_conflicts(&entries);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].a_id, 3);
        assert_eq!(conflicts[0].b_id, 4);
    }

    #[test]
    fn conflicts_report_transitive_overlaps() {
        let entries = vec![
            entry(1, 1, 360, 120), // 6:00-8:00 覆盖下面两个
            entry(2, 1, 420, 30),
            entry(3, 1, 450, 30),
        ];
        let conflicts = find_conflicts(&entries);
        assert_eq!(conflicts.len(), 2); // 1-2 与 1-3
    }

    #[test]
    fn rotation_math() {
        assert_eq!(resolve_rotation(&[10, 20, 30], 1, 0), 20);
        assert_eq!(resolve_rotation(&[10, 20, 30], 1, 1), 30);
        assert_eq!(resolve_rotation(&[10, 20, 30], 2, 1), 10); // 回绕
        assert_eq!(resolve_rotation(&[10, 20], 1, 5), 10);
    }

    #[test]
    fn plan_cap_and_first_plan_protection() {
        let conn = weeks_conn();
        let first = list_plans(&conn).unwrap().remove(0);
        assert_eq!(first.slot, 1);
        for _ in 0..5 {
            create_plan(&conn, "x").unwrap();
        }
        assert!(create_plan(&conn, "y").is_err()); // 第 7 个被拒
        assert!(delete_plan(&conn, first.id).is_err()); // 首表不可删
        let second = list_plans(&conn).unwrap().remove(1);
        delete_plan(&conn, second.id).unwrap();
        let created = create_plan(&conn, "z").unwrap();
        assert_eq!(created.slot, second.slot); // 槽位回收
    }

    #[test]
    fn save_rejects_conflicts_then_persists() {
        let conn = weeks_conn();
        let plan = list_plans(&conn).unwrap().remove(0);
        let payload = SavePlanPayload {
            id: plan.id,
            name: "测试".into(),
            day_start_minute: None,
            day_end_minute: None,
            entries: vec![entry(-1, 1, 360, 60), entry(-2, 1, 390, 30)],
            overrides: vec![],
        };
        let outcome = save_plan(&conn, &payload).unwrap();
        assert!(!outcome.saved);
        assert_eq!(outcome.conflicts.len(), 1);
        assert_eq!(outcome.conflicts[0].a_id, -1);
        assert_eq!(outcome.conflicts[0].b_id, -2);

        let payload = SavePlanPayload {
            entries: vec![entry(-1, 1, 360, 60), entry(-2, 1, 420, 30)],
            ..payload
        };
        let outcome = save_plan(&conn, &payload).unwrap();
        assert!(outcome.saved);
        let full = get_full_plan(&conn, plan.id).unwrap();
        assert_eq!(full.entries.len(), 2);
        assert_eq!(full.plan.name, "测试");
    }

    #[test]
    fn save_validates_entry_fields() {
        let conn = weeks_conn();
        let plan = list_plans(&conn).unwrap().remove(0);
        let payload = SavePlanPayload {
            id: plan.id,
            name: "x".into(),
            day_start_minute: None,
            day_end_minute: None,
            entries: vec![entry(-1, 1, 360, 33)], // 非 5 的倍数
            overrides: vec![],
        };
        assert!(save_plan(&conn, &payload).is_err());
    }

    #[test]
    fn day_window_resolution_chain() {
        let cfg = GlobalConfig::default();
        let mut plan = FullPlan {
            plan: WeekPlan {
                id: 1,
                slot: 1,
                name: "p".into(),
                day_start_minute: Some(480), // 周表级 8:00
                day_end_minute: None,
            },
            entries: vec![],
            overrides: vec![DayOverride {
                weekday: 3,
                day_start_minute: Some(540), // 周三 9:00
                day_end_minute: None,
            }],
        };
        // 未覆盖的天 → 周表级
        assert_eq!(resolve_day_window(&plan, 1, &cfg), (480, 1439));
        // 周三 → 天级覆盖
        assert_eq!(resolve_day_window(&plan, 3, &cfg), (540, 1439));
        // 周表级也没有 → 全局
        plan.plan.day_start_minute = None;
        assert_eq!(resolve_day_window(&plan, 1, &cfg), (360, 1439));
    }

    #[test]
    fn rotation_end_to_end() {
        let weeks = weeks_conn();
        let data = data_conn();
        create_plan(&weeks, "第二周表").unwrap(); // id=2
        // 未设置当周 → 第一个
        assert_eq!(current_plan_id(&weeks, &data).unwrap(), 1);

        let today = Local::now().date_naive();
        let this_week = FirstDayOfWeek::Mon.week_start(today);
        set_setting(&data, "activePlanId", "2").unwrap();
        set_setting(
            &data,
            "rotationAnchorDate",
            &this_week.format("%Y-%m-%d").to_string(),
        )
        .unwrap();
        assert_eq!(current_plan_id(&weeks, &data).unwrap(), 2); // 本周=锚点周

        let last_week = this_week - chrono::Duration::weeks(1);
        set_setting(
            &data,
            "rotationAnchorDate",
            &last_week.format("%Y-%m-%d").to_string(),
        )
        .unwrap();
        assert_eq!(current_plan_id(&weeks, &data).unwrap(), 1); // 过一周回绕到 1
    }
}
