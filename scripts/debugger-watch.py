# -*- coding: utf-8 -*-
"""scheet.exe 崩溃诊断调试器：
   python scripts/debugger-watch.py                  # 启动 target\\debug\\scheet.exe 并附加
   python scripts/debugger-watch.py scheet.exe      # 按进程名附加到已运行实例
   python scripts/debugger-watch.py <pid>           # 附加到指定 PID
第二次Chance异常时打印 异常代码/地址/所属模块（堆损坏 0xc0000374 即可定位出错 DLL）。
package.json 入口：pnpm debug:attach（按名附加 dev 实例）/ pnpm debug:run（自启动）。
"""
import ctypes
import os
import struct
import sys
import time
from ctypes import wintypes

k32 = ctypes.WinDLL("kernel32", use_last_error=True)

DEBUG_ALL_ACCESS = 0x1F03F
INFINITE = 0xFFFFFFFF
DBG_CONTINUE = 0x00010002
DBG_EXCEPTION_NOT_HANDLED = 0x80010001
EXCEPTION_DEBUG_EVENT = 1
CREATE_PROCESS_DEBUG_EVENT = 3
EXIT_THREAD_DEBUG_EVENT = 4
EXIT_PROCESS_DEBUG_EVENT = 5
LOAD_DLL_DEBUG_EVENT = 6
TH32CS_SNAPMODULE = 0x8


class DEBUG_EVENT(ctypes.Structure):
    """x64 布局：联合体前有 4 字节 padding（8 字节对齐）。
    联合体内 EXCEPTION_RECORD 的字段偏移（相对 u 起点）：
    code=0x00, flags=0x04, address=0x10, NumberParameters=0x18,
    ExceptionInformation=0x20..0x98, EXCEPTION_DEBUG_INFO.dwFirstChance=0x98。"""

    _fields_ = [
        ("dwDebugEventCode", ctypes.c_uint32),
        ("dwProcessId", ctypes.c_uint32),
        ("dwThreadId", ctypes.c_uint32),
        ("_pad", ctypes.c_uint32),
        ("u", ctypes.c_byte * 512),
    ]


class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("cntUsage", ctypes.c_uint32),
        ("th32ProcessID", ctypes.c_uint32),
        ("th32DefaultHeap", ctypes.c_uint64),
        ("th32ModuleID", ctypes.c_uint32),
        ("cntThreads", ctypes.c_uint32),
        ("th32ParentProcessID", ctypes.c_uint32),
        ("pcPriClassBase", ctypes.c_int32),
        ("dwFlags", ctypes.c_uint32),
        ("szExeFile", ctypes.c_char * 260),
    ]


class MODULEENTRY32(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("th32ModuleID", ctypes.c_uint32),
        ("th32ProcessID", ctypes.c_uint32),
        ("GlblcntUsage", ctypes.c_uint32),
        ("ProccntUsage", ctypes.c_uint32),
        ("modBaseAddr", ctypes.c_uint64),
        ("modBaseSize", ctypes.c_uint32),
        ("hModule", ctypes.c_uint64),
        ("szModule", ctypes.c_wchar * 256),
        ("szExePath", ctypes.c_wchar * 260),
    ]


k32.DebugActiveProcess.argtypes = [wintypes.DWORD]
k32.WaitForDebugEvent.argtypes = [ctypes.POINTER(DEBUG_EVENT), wintypes.DWORD]
k32.ContinueDebugEvent.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.DWORD]
k32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
k32.Module32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(MODULEENTRY32)]
k32.Module32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(MODULEENTRY32)]


def modules_of(pid):
    snap = k32.CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, pid)
    if snap == -1 or snap is None:
        return []
    mods = []
    me = MODULEENTRY32()
    me.dwSize = ctypes.sizeof(MODULEENTRY32)
    ok = k32.Module32FirstW(snap, ctypes.byref(me))
    while ok:
        mods.append(
            (
                str(me.szModule),
                me.modBaseAddr,
                me.modBaseSize,
                str(me.szExePath),
            )
        )
        ok = k32.Module32NextW(snap, ctypes.byref(me))
    ctypes.windll.kernel32.CloseHandle(snap)
    return mods


def locate(addr, mods):
    for name, base, size, full in mods:
        if base <= addr < base + size:
            return f"{name}+0x{addr - base:x} ({full})"
    return f"unknown module (addr 0x{addr:x})"


TH32CS_SNAPPROCESS = 0x2
k32.Process32First.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32)]
k32.Process32Next.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32)]


def find_pids_by_name(name):
    """按进程名列出所有 PID（不区分大小写，.exe 后缀可省略）。"""
    name = name.lower()
    if not name.endswith(".exe"):
        name += ".exe"
    pids = []
    snap = k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snap in (-1, None):
        return pids
    entry = PROCESSENTRY32()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
    ok = k32.Process32First(snap, ctypes.byref(entry))
    while ok:
        if entry.szExeFile.decode("utf-8", "replace").lower() == name:
            pids.append(entry.th32ProcessID)
        ok = k32.Process32Next(snap, ctypes.byref(entry))
    ctypes.windll.kernel32.CloseHandle(snap)
    return pids


def attach(pid):
    if not k32.DebugActiveProcess(pid):
        print("attach failed:", ctypes.get_last_error())
        return False
    print(f"attached to {pid}")
    return True


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    if arg is not None:
        if arg.isdigit():
            if not attach(int(arg)):
                return
        else:
            pids = find_pids_by_name(arg)
            if not pids:
                print(f"no process named {arg!r} (start the app first)")
                return
            if len(pids) > 1:
                print(f"multiple instances {pids}, attaching to the first")
            if not attach(pids[0]):
                return
    else:
        exe = os.path.abspath("src-tauri/target/debug/scheet.exe")
        if not os.path.exists(exe):
            print("exe not found:", exe)
            return
        cmd = ctypes.create_string_buffer(exe.encode())
        ok = k32.DebugActiveProcess  # noqa
        pi = ctypes.create_string_buffer(0)
        # 直接 CreateProcessA 带 DEBUG_PROCESS
        class STARTUPINFO(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_uint32),
                ("lpReserved", ctypes.c_wchar_p),
                ("lpDesktop", ctypes.c_wchar_p),
                ("lpTitle", ctypes.c_wchar_p),
                ("dwX", ctypes.c_uint32),
                ("dwY", ctypes.c_uint32),
                ("dwXSize", ctypes.c_uint32),
                ("dwYSize", ctypes.c_uint32),
                ("dwXCountChars", ctypes.c_uint32),
                ("dwYCountChars", ctypes.c_uint32),
                ("dwFillAttribute", ctypes.c_uint32),
                ("dwFlags", ctypes.c_uint32),
                ("wShowWindow", ctypes.c_uint16),
                ("cbReserved2", ctypes.c_uint16),
                ("lpReserved2", ctypes.c_void_p),
                ("hStdInput", ctypes.c_void_p),
                ("hStdOutput", ctypes.c_void_p),
                ("hStdError", ctypes.c_void_p),
            ]

        class PROCESS_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("hProcess", ctypes.c_void_p),
                ("hThread", ctypes.c_void_p),
                ("dwProcessId", ctypes.c_uint32),
                ("dwThreadId", ctypes.c_uint32),
            ]

        si = STARTUPINFO()
        si.cb = ctypes.sizeof(STARTUPINFO)
        pi = PROCESS_INFORMATION()
        DEBUG_PROCESS_FLAG = 0x1
        cmd_buf = ctypes.create_unicode_buffer(exe)
        ok = k32.CreateProcessW(
            None,
            cmd_buf,
            None,
            None,
            False,
            DEBUG_PROCESS_FLAG,
            None,
            None,
            ctypes.byref(si),
            ctypes.byref(pi),
        )
        if not ok:
            print("CreateProcess failed:", ctypes.get_last_error())
            return
        pid = pi.dwProcessId
        print(f"launched under debugger: pid {pid} {exe}")

    evt = DEBUG_EVENT()
    mods_cache = []
    fatal_seen = False
    while True:
        if not k32.WaitForDebugEvent(ctypes.byref(evt), 10000):
            err = ctypes.get_last_error()
            if err == 121:  # ERROR_SEM_TIMEOUT 无事件
                if not k32.DebugActiveProcess:
                    pass
                continue
            continue
        code = evt.dwDebugEventCode
        status = DBG_CONTINUE

        if code == EXCEPTION_DEBUG_EVENT:
            u = bytes(evt.u)
            exc_code = struct.unpack_from("<I", u, 0x00)[0]
            exc_flags = struct.unpack_from("<I", u, 0x04)[0]
            exc_addr = struct.unpack_from("<Q", u, 0x10)[0]
            first_chance = struct.unpack_from("<I", u, 0x98)[0]
            if exc_code == 0x80000003:
                # 断点（attach 初始断点 / 目标 DebugBreak）：DBG_CONTINUE 放行，
                # 二次机会断点杀进程是调试器误杀
                k32.ContinueDebugEvent(evt.dwProcessId, evt.dwThreadId, DBG_CONTINUE)
                continue
            mods_cache = modules_of(evt.dwProcessId) or mods_cache
            tag = "FIRST" if first_chance else "SECOND"
            # 常见良性一_chance：断点/OutputDebugString/WoW64/C++ EH/.NET EH
            interesting = exc_code in (0xC0000374, 0xC0000409, 0xC0000005)
            detail = f"code=0x{exc_code:08X} addr=0x{exc_addr:x} -> {locate(exc_addr, mods_cache)}"
            if interesting and first_chance:
                # AV 附带读写方向与目标地址（ExceptionInformation[0]/[1]）
                info0 = struct.unpack_from("<Q", u, 0x20)[0]
                info1 = struct.unpack_from("<Q", u, 0x28)[0]
                kind = {0: "READ", 1: "WRITE", 8: "DEP"}.get(info0, "?")
                detail += f" [{kind} @0x{info1:x}]"
            if not first_chance or interesting:
                print(f"EXC {tag} tid={evt.dwThreadId} {detail} flags=0x{exc_flags:x}")
            if not first_chance:
                if interesting:
                    fatal_seen = True
                    print("=== 崩溃定位完成（上方模块即出错模块）===")
                status = DBG_EXCEPTION_NOT_HANDLED  # 二次机会：交由系统终止进程
            else:
                # 一_chance 一律交还应用自身处理（良性/未知由其 SEH 吞掉）
                status = DBG_EXCEPTION_NOT_HANDLED
        elif code == EXIT_PROCESS_DEBUG_EVENT:
            exit_code = struct.unpack_from("<I", evt.u, 0)[0]
            print(f"process exited, code=0x{exit_code:08X}")
            k32.ContinueDebugEvent(
                evt.dwProcessId, evt.dwThreadId, DBG_CONTINUE
            )
            break

        k32.ContinueDebugEvent(evt.dwProcessId, evt.dwThreadId, status)
        if fatal_seen:
            time.sleep(0.3)
            k32.DebugActiveProcessStop(evt.dwProcessId)
            break


if __name__ == "__main__":
    main()
