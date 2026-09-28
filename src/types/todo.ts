/** 待办事项——与 src-tauri/src/todo.rs 的 serde camelCase 输出保持同步。 */
export interface Todo {
  id: number;
  /** 本地日期 YYYY-MM-DD。 */
  date: string;
  content: string;
  done: boolean;
  createdAt: string;
}
