# -*- coding: utf-8 -*-
"""修复 weeks.rs CREATE TABLE 的 notes 列 + timetable.rs 字面量（一次性诊断脚本）。"""
import io

P1 = "src-tauri/src/weeks.rs"
P2 = "src-tauri/src/timetable.rs"

t = io.open(P1, encoding="utf-8").read()
probe = (
    "end_alarm_mode TEXT CHECK (end_alarm_mode IN ('once', 'loop')),\n"
    "            created_at TEXT NOT NULL,"
)
print("probe in file:", probe in t)
if not probe in t:
    i = t.index("end_alarm_mode TEXT CHECK")
    print("actual:", repr(t[i : i + 130]))
else:
    t = t.replace(
        probe,
        probe.replace(
            "created_at TEXT NOT NULL,", "notes TEXT,\n            created_at TEXT NOT NULL,", 1
        ),
        1,
    )
    io.open(P1, "w", encoding="utf-8", newline="").write(t)
    print("create column: applied")

t2 = io.open(P2, encoding="utf-8").read()
j = t2.index("WeekEntry {")
print("timetable ctx:", repr(t2[j : j + 420]))
