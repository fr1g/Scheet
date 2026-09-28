import { invoke } from "@tauri-apps/api/core";
import type { Todo } from "../types/todo";

export function listTodosForToday(): Promise<Todo[]> {
  return invoke<Todo[]>("list_todos_for_today");
}

export function addTodoForToday(content: string): Promise<Todo> {
  return invoke<Todo>("add_todo_for_today", { content });
}

export function setTodoDone(id: number, done: boolean): Promise<void> {
  return invoke<void>("set_todo_done_command", { id, done });
}

export function deleteTodo(id: number): Promise<void> {
  return invoke<void>("delete_todo_command", { id });
}
