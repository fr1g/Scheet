Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class PopCap {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  public static IntPtr FindPopup(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, lp) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid) {
        var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
        string title = sb.ToString();
        // popup title = "Scheet <xxxx>" (starts with "Scheet", no CJK date prefix)
        if (title.StartsWith("Scheet") && !title.Contains("\uFF0C")) { found = h; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static RECT GetRect(IntPtr hwnd) { RECT r; GetWindowRect(hwnd, out r); return r; }
}
"@
Add-Type -AssemblyName System.Drawing
$scheet = (Get-Process scheet | Select-Object -First 1).Id
$h = [PopCap]::FindPopup([uint32]$scheet)
if ($h -eq [IntPtr]::Zero) { Write-Output "POPUP-NOT-FOUND"; exit }
$r = [PopCap]::GetRect($h)
$w = $r.R - $r.L; $ht = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
[PopCap]::PrintWindow($h, $dc, 2)
$g.ReleaseHdc($dc)
$bmp.Save("$PSScriptRoot\..\popup-render.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output ("captured ${w}x${ht}")
