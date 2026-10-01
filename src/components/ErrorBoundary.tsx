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

  /** 整页重载并强制回到主视图：清空路由 hash 后 reload，彻底重置前端状态。 */
  handleRestart = (): void => {
    void invoke("debug_log", { msg: "渲染错误: 用户点击重启窗口" }).catch(() => undefined);
    window.location.hash = "/";
    window.location.reload();
  };

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
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded px-4 py-1.5 text-sm transition-colors hover:bg-zinc-600"
            >
              重试
            </button>
            <button
              type="button"
              onClick={this.handleRestart}
              title="重新打开界面并回到主视图"
              className="rounded px-4 py-1.5 text-sm transition-colors hover:bg-zinc-600"
            >
              重启窗口
            </button>
          </div>
        </div>
      );
    }
    return children;
  }
}
