//! Windows 下 WebView2 Evergreen 运行时的绿色版兜底逻辑。
//!
//! 便携单文件 exe 不经过安装器，`tauri.conf.json` 的 `webviewInstallMode`
//! 只对 NSIS/WiX 安装包生效，因此这里在创建窗口前自行检测运行时：
//! 缺失时弹原生对话框询问，用户同意则下载微软官方 Evergreen 引导器并
//! 静默安装；拒绝或失败则打开官方下载页后退出。
//! 前端资源已嵌入二进制并由 Tauri 在内存中服务，运行时不会解压出任何应用文件。

use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;

/// WebView2 Evergreen 运行时的 EdgeUpdate 注册表客户端 ID（微软官方检测方式）。
const WEBVIEW2_CLIENT_ID: &str =
    r"Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
/// 微软官方 Evergreen Bootstrapper（约 2MB，联网安装最新运行时）。
const BOOTSTRAPPER_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
const DOWNLOAD_PAGE: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";
/// 隐藏 curl/powershell 子进程的控制台窗口。
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 检测 WebView2 运行时是否已安装：依次探测
/// HKCU/HKLM（含 WOW6432Node）下 Microsoft\EdgeUpdate\Clients\{id} 的 `pv` 值。
pub fn runtime_installed() -> bool {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let candidates = [
        (HKEY_CURRENT_USER, format!(r"SOFTWARE\{WEBVIEW2_CLIENT_ID}")),
        (HKEY_LOCAL_MACHINE, format!(r"SOFTWARE\{WEBVIEW2_CLIENT_ID}")),
        (
            HKEY_LOCAL_MACHINE,
            format!(r"SOFTWARE\WOW6432Node\{WEBVIEW2_CLIENT_ID}"),
        ),
    ];
    for (hive, path) in candidates {
        if let Ok(key) = RegKey::predef(hive).open_subkey(path) {
            if let Ok(pv) = key.get_value::<String, _>("pv") {
                if !pv.trim().is_empty() {
                    return true;
                }
            }
        }
    }
    false
}

/// 弹出原生 Yes/No 消息框，返回用户是否选择了“是”。
fn prompt(message: &str) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONWARNING, MB_YESNO, IDYES,
    };

    let text: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
    let caption: Vec<u16> = "Scheet".encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_ICONWARNING | MB_YESNO,
        ) == IDYES
    }
}

/// 下载 WebView2 引导器到临时目录：优先 Win10 1803+ 自带的 curl.exe，回退 PowerShell。
fn download_bootstrapper(dest: &Path) -> Result<(), String> {
    let curl = Command::new("curl")
        .args(["-L", "--fail", "-sS", "-o"])
        .arg(dest)
        .arg(BOOTSTRAPPER_URL)
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    if matches!(curl, Ok(status) if status.success()) {
        return Ok(());
    }

    let script = format!(
        "Invoke-WebRequest -UseBasicParsing -Uri '{BOOTSTRAPPER_URL}' -OutFile '{}'",
        dest.display()
    );
    let status = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("启动下载工具失败: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("下载 WebView2 引导器失败".to_string())
    }
}

/// 静默安装运行时（引导器自行请求 UAC 提权）。
fn install_bootstrapper(installer: &Path) -> Result<(), String> {
    let status = Command::new(installer)
        .args(["/silent", "/install"])
        .status()
        .map_err(|e| format!("运行安装器失败: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("WebView2 安装器返回非零退出码".to_string())
    }
}

fn open_download_page() {
    let _ = Command::new("explorer").arg(DOWNLOAD_PAGE).status();
}

/// 在应用启动前确保 WebView2 可用；缺失时下载/引导安装，最终失败则退出进程。
pub fn ensure_runtime() {
    if runtime_installed() {
        match tauri::webview_version() {
            Ok(v) => crate::logging::log(
                crate::logging::LEVEL_INFO,
                "INFO",
                "[WV]",
                &format!("WebView2 runtime present, version {v}"),
            ),
            Err(e) => crate::logging::warn(&format!(
                "[wv] WebView2 runtime present, version query failed: {e}"
            )),
        }
        return;
    }
    crate::logging::log(
            crate::logging::LEVEL_WARN,
            "WARN",
            "[WV]",
            "WebView2 runtime missing, prompting for installation",
        );

    let agreed = prompt(
        "未检测到 Microsoft WebView2 运行时，Scheet 需要它才能显示界面。\n\n\
         是否立即下载并静默安装？（约 2MB 官方引导器，需要联网并同意 UAC 提权）",
    );
    if !agreed {
        open_download_page();
        std::process::exit(1);
    }

    let installer = std::env::temp_dir().join("MicrosoftEdgeWebview2Setup.exe");
    let install_error = download_bootstrapper(&installer)
        .and_then(|_| install_bootstrapper(&installer))
        .err();

    // 引导器静默安装可能异步收尾，轮询注册表等待其落盘
    let mut installed = false;
    for _ in 0..6 {
        if runtime_installed() {
            installed = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    if installed {
        return;
    }

    let detail = install_error.unwrap_or_else(|| "安装流程结束但未检测到运行时".to_string());
    prompt(&format!(
        "自动安装 WebView2 未成功（{detail}）。\n\
         即将打开官方下载页，安装完成后请重新启动 Scheet。"
    ));
    open_download_page();
    std::process::exit(1);
}
