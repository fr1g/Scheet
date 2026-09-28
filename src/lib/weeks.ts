import { invoke } from "@tauri-apps/api/core";
import type {
  FullPlan,
  SaveOutcome,
  SavePlanPayload,
  WeekPlan,
} from "../types/weeks";

export function listWeekPlans(): Promise<WeekPlan[]> {
  return invoke<WeekPlan[]>("list_week_plans");
}

export function createWeekPlan(name?: string): Promise<WeekPlan> {
  return invoke<WeekPlan>("create_week_plan", name ? { name } : {});
}

export function renameWeekPlan(id: number, name: string): Promise<void> {
  return invoke<void>("rename_week_plan", { id, name });
}

export function deleteWeekPlan(id: number): Promise<void> {
  return invoke<void>("delete_week_plan", { id });
}

export function getWeekPlan(id: number): Promise<FullPlan> {
  return invoke<FullPlan>("get_week_plan", { id });
}

export function saveWeekPlan(payload: SavePlanPayload): Promise<SaveOutcome> {
  return invoke<SaveOutcome>("save_week_plan", { payload });
}

/** 当前轮换周应使用的周表。 */
export function getCurrentWeekPlan(): Promise<FullPlan> {
  return invoke<FullPlan>("get_current_week_plan");
}

export function setActiveWeekPlan(id: number): Promise<void> {
  return invoke<void>("set_active_week_plan", { id });
}

/** 枚举 alarms 目录下的提示音文件名。 */
export function listAlarmSounds(): Promise<string[]> {
  return invoke<string[]>("list_alarm_sounds");
}
