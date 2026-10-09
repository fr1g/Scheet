import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddIcon, ChevronRightIcon, CloseIcon, PinIcon } from "tdesign-icons-react";
import { useToday } from "../../state/dateState";
import {
  addTodoForToday,
  deleteTodo,
  listTodosForToday,
  setTodoDone,
} from "../../lib/todo";
import type { Todo } from "../../types/todo";

/** 右侧当日待办面板：增删/勾选；跨天（useToday 驱动）自动刷新（后端负责滚动复制）。
 * onPin/onCollapse 由宿主按三态模式注入（隐藏态暂时展开时显示图钉，常驻态显示收起）。 */
export default function TodoPanel({
  onCollapse,
  onPin,
}: {
  onCollapse?: () => void;
  onPin?: () => void;
}) {
  const { t } = useTranslation();
  const { date } = useToday();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState("");

  const reload = useCallback(async () => {
    try {
      setTodos(await listTodosForToday());
    } catch (e: unknown) {
      console.error("读取待办失败", e);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, date]);

  const handleAdd = async () => {
    const content = draft.trim();
    if (!content) return;
    try {
      const created = await addTodoForToday(content);
      setDraft("");
      setTodos((prev) => [...prev, created]);
    } catch (e: unknown) {
      console.error("添加待办失败", e);
    }
  };

  const toggle = async (todo: Todo) => {
    try {
      await setTodoDone(todo.id, !todo.done);
      setTodos((prev) =>
        prev.map((x) => (x.id === todo.id ? { ...x, done: !x.done } : x)),
      );
    } catch (e: unknown) {
      console.error("更新待办失败", e);
    }
  };

  const remove = async (todo: Todo) => {
    try {
      await deleteTodo(todo.id);
      setTodos((prev) => prev.filter((x) => x.id !== todo.id));
    } catch (e: unknown) {
      console.error("删除待办失败", e);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="text-xs text-zinc-400">{t("todo.title")}</span>
        <span className="flex items-center gap-0.5">
          <span className="text-[10px] text-zinc-500 mr-1.5">{date}</span>
          {onPin && (
            <button
              type="button"
              onClick={onPin}
              title={t("todo.pin")}
              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-600 hover:text-zinc-100"
            >
              <PinIcon size="13px" />
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title={t("todo.collapse")}
              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-600 hover:text-zinc-100"
            >
              <ChevronRightIcon size="13px" />
            </button>
          )}
        </span>
      </div>
      <div className="mt-2 flex gap-1 px-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd();
          }}
          placeholder={t("todo.placeholder")}
          className="min-w-0 flex-1 rounded-lg border border-zinc-600 bg-zinc-700 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-zinc-400"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          title={t("todo.title")}
          className="flex? h-7 w-7 shrink-0 items-center justify-center rounded-lg hidden text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          {/* 要不不用这个按钮了吧。主要是字装不下了 */}
          <AddIcon size="14px" />
        </button>
      </div>
      <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-3">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-600/50"
          >
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => void toggle(todo)}
              className="accent-blue-500"
            />
            <span
              title={todo.content}
              className={`min-w-0 flex-1 truncate text-xs ${todo.done ? "text-zinc-500 line-through" : "text-zinc-100"
                }`}
            >
              {todo.content}
            </span>
            <button
              type="button"
              onClick={() => void remove(todo)}
              title={t("todo.delete")}
              className="shrink-0 text-zinc-400 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            >
              <CloseIcon size="12px" />
            </button>
          </li>
        ))}
        {todos.length === 0 && (
          <li className="pt-4 text-center text-[10px] text-zinc-500">
            {t("todo.empty")}
          </li>
        )}
      </ul>
    </div>
  );
}
