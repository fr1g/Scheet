Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinEnum2 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  public static List<string> ListAll(uint targetPid) {
    var result = new List<string>();
    EnumWindows((hWnd, lp) => {
      uint pid; GetWindowThreadProcessId(hWnd, out pid);
      if (pid == targetPid) {
        var sb = new StringBuilder(256);
        GetWindowText(hWnd, sb, 256);
        string title = sb.ToString();
        bool vis = IsWindowVisible(hWnd);
        if (title.Length > 0 || vis) result.Add("[" + title + "] visible=" + vis);
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
"@
$scheet = Get-Process scheet -ErrorAction SilentlyContinue | Select-Object -First 1
[WinEnum2]::ListAll($scheet.Id) | ForEach-Object { Write-Output $_ }
