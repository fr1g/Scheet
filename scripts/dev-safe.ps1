# 安全启动开发实例：将 WebView2 运行时钉在已知稳定的 154.0.4258.37，
# 规避 154.0.4258.48 的宿主堆损坏缺陷（0xc0000374）。
# 运行时修复（.49+）后可直接使用 pnpm tauri dev。
$fallback = "C:\Program Files (x86)\Microsoft\EdgeWebView\Application\154.0.4258.37"
if (Test-Path $fallback) {
  $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = $fallback
  Write-Host "[dev:safe] WebView2 pinned to 154.0.4258.37" -ForegroundColor Green
} else {
  Write-Host "[dev:safe] fallback runtime folder missing - using system default" -ForegroundColor Yellow
}
pnpm tauri dev
