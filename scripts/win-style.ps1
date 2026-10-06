Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinStyle2 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
  public static List<string> List(uint pid) {
    var result = new List<string>();
    EnumWindows((h, lp) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid) {
        var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
        string title = sb.ToString();
        int style = GetWindowLong(h, -16);
        int ex = GetWindowLong(h, -20);
        RECT r; GetWindowRect(h, out r);
        bool vis = IsWindowVisible(h);
        IntPtr owner = GetWindow(h, 4); // GW_OWNER
        result.Add(string.Format("title=[{0}] vis={1} style=0x{2:X8} ex=0x{3:X8} rect=({4},{5})-({6},{7}) owner={8}", title, vis, style, ex, r.L, r.T, r.R, r.B, owner));
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
"@
$scheet = (Get-Process scheet -ErrorAction SilentlyContinue | Select-Object -First 1)
if (-not $scheet) { Write-Output "no scheet"; exit }
[WinStyle2]::List([uint32]$scheet.Id) | ForEach-Object { Write-Output $_ }
