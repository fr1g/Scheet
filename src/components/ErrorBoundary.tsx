import { Component, type ErrorInfo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** 渲染错误边界：捕获子树的渲染异常，避免整窗空白（标题栏保持可用）。 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("渲染错误", error, info.componentStack);
    // 转发到 stderr，dev 模式可在控制台看到（生产无副作用）
    invoke("debug_log", {
      msg: `渲染错误: ${error.message}\n${info.componentStack ?? ""}`,
    }).catch(() => undefined);
  }

  render(): ReactNode {
    const { error } = this.state;
    const { children } = this.props;
    if (error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-700 p-6 text-zinc-100">
          <p className="text-sm">页面渲染出错了</p>
          <p className="max-w-lg text-center text-xs break-all text-zinc-300">
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded px-4 py-1.5 text-sm transition-colors hover:bg-zinc-600"
          >
            重试
          </button>
        </div>
      );
    }
    return children;
  }
}
