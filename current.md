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
- 2026-09-28 M2.9 追加：标题栏应用标题 `第x周，YYYY-MM-DD - Scheet`（两表=单周/双周；选中≠当周时追加 `(选中: ...)`），同步系统窗口标题（core:window:allow-set-title）。用 titleState 外部存储桥接周表页状态，提交 f0ed4ba
- 2026-09-28 M3.0 完成：右键菜单系统——tab 菜单（周表设置弹窗：名称+周表级起止时间→工作副本；设为当周→setActiveWeekPlan 写锚点；删除→危险模态确认+deleteWeekPlan，首表不显示）；表头菜单（当天设置→日覆盖写工作副本，留空清除）。新增 ContextMenu/PlanSettingsDialog/DaySettingsDialog 组件与时间输入辅助。提交 272b809，应用运行中待验收；继续 M3.1 复制粘贴
- 2026-09-28 M3.0b 修复（用户反馈）：①自动命名按数量派发在删除后重号（两个 周表6）→ 改为按槽位号派生（create_plan 签名改为 Option<&str>）；②表格百分比高度+亚像素累积导致几像素滚动 → 表高显式像素化+overflow-y-hidden+日列裁剪。36 测试绿，提交 713338b，应用运行中待验收；继续 M3.1
- 2026-09-28 M3.1 完成：调度 1000ms + scheet://date-changed 事件 → dateState/useToday（标题栏日期、今天标记跨午夜刷新）；事务选中（单击 ring）+ 复制（Ctrl+C/按钮 → ScheetPlan JSON）+ 粘贴目标（左键表头）+ 粘贴（Ctrl+V/按钮 → 负数临时 id 插入工作副本，冲突实时标红）。提交 186bbcc，应用运行中待验收；下一轮 M3.2 拖拽三件套
- 2026-09-28 M3.2 完成：拖拽三件套（指针状态机：垂直=时长 5 分钟步进、水平=换天、边缘把手=横排复制；目标列高亮、统一光标、抑制误选中；写工作副本）。提交 9439314，HMR 生效待验收；下一轮 M3.3 编辑模态
- 2026-09-28 M3.1b 完成（用户反馈）：粘贴目标以剪贴板嗅探为闸门——聚焦窗口校验 clipboardHasPlan，表头点击/粘贴按钮/Ctrl+V 均以其为条件，失效自动熄灭目标。提交 686cb55；继续 M3.3 编辑模态
- 2026-09-28 M3.3 完成：双击编辑模态（EntryEditDialog）——双击事务编辑全部字段（普通标题必填、开始/时长校验、铃声列表+试听/停止、播放模式、颜色 hex+色板、删除按钮）；双击无安排区域新建（30 分钟默认，取消撤销）。M3.4 冲突保存流程此前已增量实现，M3 全部子任务完成。提交 938dc09，应用运行中待验收 → M3 整体验收点
- 2026-09-28 M3.3b 九项精修（用户反馈截图）：双保存按钮（DialogShell footer 化）、color-scheme dark（原生拨盘）、时长 小时.分钟 解析+2舍3入+humanize、上下边缘把手改开始/结束（ns-resize）、主体拖拽=当天重放、列底起止标记、tooltip 时长、未保存琥珀徽标、继承值展示+来源。拖拽语义重构后提交 9bba668，应用运行中待验收
- 2026-09-28 M3.3c 完成（用户反馈）：cell 布局改绝对定位+冲突泳道并排（layoutDayEntries 区间着色），重叠可见不再推挤；无安排占位 DOM 删除；双击空白按点击位置精确新建。提交 7c3593c，HMR 生效待验收 → M3 整体验收点
- 2026-09-29 M4-part1 完成（用户反馈批次）：①提醒推送改置顶弹窗子窗口 popup.rs（系统通知在勿扰下不可见）；②调度器时间窗触发修"保存后区间内误响铃"（fired-set 改水位线）；③开始/结束铃声独立链（end 字段+迁移+timetable 解析+模态双行选择+试听）；④AlarmSnackbar（循环持续到确认/一次性 30 秒）；⑤继承显示"值（来源）"格式；⑥base-select 圆角深色下拉；⑦循环响铃看护线程+5 秒间隔（弃用 Repeat）；⑧测试用例.md。37 测试绿，提交 98af938，应用运行中待验收；M4 剩余=设置页
- 2026-09-29 M4.2 完成：设置页（/settings）——一天窗口、每周第一天、铃声链六组下拉（三级别×开始/结束，未设置标注回落语义）、窗口按钮位置三选一即时持久化；工作副本+脏标记+保存校验。提交 7ea300d，HMR 生效待验收；M4 仅剩 E2E 验收，M5 待做
- 2026-09-29 M5 完成：右侧当日待办面板（增删/勾选/跨天 useToday 刷新）、todo 区上方剪贴板事务预览浮块（focus 嗅探+cell 样式渲染）；AGENTS/README 收尾；release 构建冒烟通过（14MB exe 独立运行）。提交 b063cc4。M1-M5 全部完成，待用户按 测试用例.md 最终验收
- 2026-09-29 M4-part2 完成（用户反馈批次）：取消更改按钮（恢复快照+确认模态）、Ctrl+S 保存、全局屏蔽默认右键菜单、framer-motion 过渡（snackbar/模态/右键菜单/Toast）、snackbar 缓慢闪烁琥珀 outline。37 测试绿，提交 ee015b5，待用户验收
- 2026-09-29 M4-part3 完成（用户反馈）：Shift 悬停关闭按钮变"退出"（红色加宽），Shift+点击确认模态警告后 exit_application 直接退出。提交 cb1ffd7，应用运行中待验收
- 2026-09-29 i18n 完成：i18next 中英双语（zh 为事实标准、en 镜像），语言偏好进全局设置（auto/zh/en）即时生效；GlobalConfig 提升到应用级上下文；全部组件文案接 t() 并白话化；Rust 推送改结构化数据（kind+fire_minute），文案前端生成；托盘菜单按语言设置。37 测试绿，提交 670984e，待用户验收
- 2026-09-29 首屏优化：index.html 内联静态首屏（纯样式+系统语言文案+旋转动画，不依赖 JS/CSS 资源），React 挂载后自动替换；提交待记（见 git log）
- 2026-09-30 周表名键化：weeks.w1..w6 键入库（旧中文名幂等迁移），usePlanName/isPlanNameKey 解析，全 UI 经 i18n 展示；周表设置预填友好名、键名未编辑保持键。提交 5c9536f
- 2026-09-30 可留空时间设置加清除按钮：周表设置/当天设置的起止时间字段在非空时显示 × 清除按钮（恢复继承/回退上层），文案双语（timeField.clear）。PlanSettingsDialog 主体补齐 i18n（此前漏接，含名称预填友好名）。提交 c2182d5
- 2026-09-30 内置字体批次收口：Maple Mono NF CN Regular（19.7MB，分段断点续传下载+解包验证）gzip 后补入 EMBEDDED_FONTS，五内置字体齐全；前端 BUNDLED_FONTS 全量生效；problems.md 记录 Maple Sans 未发布（只有 Maple Mono 系列）与字体许可证结论。字体批次提交（见 git log）
- 2026-09-30 编辑模态开始时间增强：一键填入现在的时间（TimeField 支持 suffix 操作位）；分钟偏离 5 的倍数时琥珀提示就近建议值，一键改用（确认保持禁用直到修正）。提交 892fd72
- 2026-09-30 设置页动效：路由级 AnimatePresence（mode=wait），设置页淡入上移进入/淡出关闭，周表页返回轻微淡入。提交 702e202，HMR 生效待验收
- 2026-09-30 设置页分 Tab 完成：通用（显示范围/周起点/语言）、提醒铃声（六组）、外观（界面字体/窗口按钮）、关于（logo+简介+协作者 GLM-5.3-Flash）；Tab 切换淡入淡出（AnimatePresence mode=wait）。提交（见 git log），HMR 生效待验收，37 测试绿
- 2026-09-29 周表命名统一：默认周表"第一周表"→"周表 1"（旧数据幂等迁移，用户自改名不触碰）；仅两个周表时 tab 按单周/双周展示，网格顶栏同步。提交 1b8d3c1
- 2026-09-29 新建 problems.md：汇总已知坑与平台待确认项（macOS Dock/弹窗/通知行为、WebView2 首启、时间窗边界等），供真机验收逐项核对
- 修复：设置页 hook 顺序违规（handleSave/闸门顺序）导致点击设置白屏崩溃；全部 hook 移至渲染闸门前，闸门后 draft 收窄为非空；pnpm build + cargo test 37 绿
- ErrorBoundary 错误面板新增"重启窗口"按钮：hash 置回主视图 + 整页 reload，彻底重置前端状态
- 设置页补入场淡入动画（0.15s，与主界面一致）；此前"退出设置有过渡"实为 WeekGridPage 入场动画，路由级 AnimatePresence 包 Routes 无 motion 组件故 exit 从未生效
- 关于页新增"清空数据"三步确认流程：modal1(取消/打开数据文件夹/无需备份下一步) → modal2(输入 AGREE TO CLEAR 全等启用继续) → modal3(确认)；Rust 侧 CLEAR_DATA.flag 标记 + 启动最早期删除整个数据目录 + request_clear_data 重启 + open_app_data_dir
- 清空数据改为原地清空：暂停调度线程→关三库连接→删数据目录→重建+重解压字体→前端整页 reload；修复 app.restart() 在 dev 下被 CLI 进程树连带终止（vite 死亡+WebView2 渲染进程被杀）导致的黑屏无响应
- 清空数据不再删除 fonts/（内置资源非用户数据，且 WebView2 持有句柄时删除会触发堆损坏崩溃）：只删三库文件+WAL/SHM+alarms，重建骨架目录
- 数据目录根新增双语 README.txt（纯文本排版，中文约140字）：说明三库用途/只备份 .db/fonts 无需备份/alarms 可选；启动时缺失或为空自动创建
- 语言设置改为点击立即生效并持久化（合并进已保存配置，不携带其他未保存草稿）；此前仅保存后生效
