# -*- coding: utf-8 -*-
# 扫描 zh.ts 中值完全相同的翻译键（潜在冗余）
import io, re
from collections import defaultdict

t = io.open("src/i18n/zh.ts", encoding="utf-8").read()
seen = defaultdict(list)
# 匹配 key: "value" 或 key: `value`（叶子层）
for m in re.finditer(r'(\w+):\s*"([^"\n]+)"', t):
    seen[m.group(2)].append(m.group(1))
for m in re.finditer(r'(\w+):\s*`([^`\n]+)`', t):
    seen[m.group(2)].append(m.group(1))

for v, ks in sorted(seen.items(), key=lambda x: -len(x[1])):
    if len(ks) >= 2 and len(v) >= 2:
        print(repr(v), "->", ", ".join(ks))
