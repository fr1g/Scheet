# 执行进度日志

> 每完成一个子任务记一笔（一行即可），避免上下文膨胀。新条目追加在文件末尾。
> 详细计划见 [plan.md](plan.md)，需求见 [fn-req.md](fn-req.md)。

- 2026-09-27 计划批准并落盘（plan.md / current.md 建立）。下一子任务：M1.1
- 2026-09-27 M1.1 完成：db.rs 重构为 LazyDb（按文件名惰性打开+各自 schema 初始化），DataDb 包装类型，全部引用点更新，14 测试绿
- 2026-09-27 M1.2 完成：weeks.rs（week_plans/week_entries/week_day_overrides 三表、CRUD 命令、保存冲突检测拒绝写入、当周轮换 current_plan_id/set_active_plan、日窗口解析链）+ 8 个单测
- 2026-09-27 M1.3 完成：timetable.rs 纯函数事件计算（开始铃/链式结束铃/溢出钳制/铃声解析链 none|builtin|文件名）+ 5 个单测
- 2026-09-27 M1.4 完成：todo.rs（todos+todo_meta、CRUD 命令、ensure_rollover 跨天滚动支持补齐缺失天数且不重复复制）+ 4 个单测
- 2026-09-27 M1.5 完成：settings.rs 扩展（get/set_setting、FirstDayOfWeek、GlobalConfig 含铃声链三组、get/set_global_config 命令带校验）
- 2026-09-27 M1.6 完成：clipboard.rs（arboard 读写 + list_alarm_sounds 枚举 alarms 目录）；arboard 依赖已加
- 2026-09-27 M1.7 完成：scheduler.rs 统一调度线程（手动提醒含补发 / 周课表事件首轮只标记不触发 / 日切触发 todo 滚动）；31 测试全绿；冒烟验证三库自动创建、默认周表"第一周表"、todo 日切游标。M1 达到验收点，等待验收后进入 M2
- 2026-09-28 M1.8（验收反馈）：新增 clock.rs 时间存储约定——时间点统一 UTC RFC3339（原 weeks.rs 用了本地偏移时间戳，已修），日历日保持本地日期文本，时刻表时间保持分钟数；AGENTS.md 增补约定章节；全库审计无遗漏；34 测试绿
- 2026-09-28 UI 对齐：用户提供 Tailwind Play 原型——表体改为 flex 顺排方案（替代原绝对定位计划）：可见事务 cell + opacity-0 无安排 cell，cell 三段式（起止时间/标题），普通=蓝 休息=琥珀 圆角，space-y-0.5；tab 列去固定 7 槽（第 6 表创建后添加按钮消失）；新增右键菜单（tab：周表设置/设为当周/删除[模态确认]；表头：当天设置）；普通事务标题必填（前端校验）；cell 高度不足时时间标签降级 tooltip。plan.md M2/M3 已同步
- 2026-09-28 M2 完成：类型/IPC 镜像、路由（/ 周表页 + /settings 占位）、tab 列（动态+满员隐藏添加+当周点标+切换脏确认）、网格按原型渲染（flex 顺排、时间标签阈值 72px、3.2px/min、深色 15% 蓝/琥珀、今天标记、sticky 表头、纵向滚动）、红/黄 outline 实时计算、保存流程（Rust 权威校验+toast）。修复 Vite 监视 EBUSY（ignore src-tauri/**）。34 测试绿、pnpm build 过、dev 实例运行中待验收
- 2026-09-28 M2 验收反馈修复：①settings/reminders 的 State 参数错配（Arc<LazyDb>→Arc<DataDb>，此前冒烟"三库已建"实为调度线程所为、前端停在错误屏——冒烟盲区教训）；②AppShell 加载/错误态保留标题栏（修复窗口无法拖动/关闭）；③事务自定义颜色（week_entries.color #RRGGBB+15% 透明度，默认蓝/琥珀）。git 初始提交 cf94a1e + 修复提交 68b243a；35 测试绿，debug 探针确认设置加载成功
- 2026-09-28 M2.8 精修：表占满窗口高度+cell 动态比例（ResizeObserver、7 天统一比例、垫片对齐）、全局窄半透明滚动条、tab 六分高+笔记本式选中连通、右侧 todo 预留区、最小窗口 1080x700。提交 19e70d4，HMR 已生效待验收
