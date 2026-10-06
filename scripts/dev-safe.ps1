# Safe dev launch: pin WebView2 runtime to the known-good 154.0.4258.37
# (154.0.4258.48 has a host heap-corruption defect, 0xc0000374).
$fallback = "C:\Program Files (x86)\Microsoft\EdgeWebView\Application\154.0.4258.37"
if (Test-Path $fallback) {
  $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = $fallback
  Write-Host "[dev:safe] WebView2 pinned to 154.0.4258.37" -ForegroundColor Green
} else {
  Write-Host "[dev:safe] fallback runtime folder missing - using system default" -ForegroundColor Yellow
}
pnpm tauri dev
