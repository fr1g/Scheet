import { Component, type ErrorInfo, type ReactNode } from "react";
import { appLog } from "../lib/logger";

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
    console.error("render error", error, info.componentStack);
    // Forward to stderr / log file (harmless in production)
    appLog(
      "error",
      `React render error: ${error.message}\n${info.componentStack ?? ""}`,
    );
  }

  /** 整页重载并强制回到主视图：清空路由 hash 后 reload，彻底重置前端状态。 */
  handleRestart = (): void => {
    appLog("info", "User clicked restart from render error panel");
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
