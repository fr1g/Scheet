# Scheet 周课表实现计划

> 依据 fn-req.md 整理，2026-09-27 批准。执行进度日志见 [current.md](current.md)。
> 推进方式：按里程碑验收——每个里程碑完成即 `cargo test` + `pnpm build` + 冒烟，暂停等验收后再继续。

## 已确认决策

- 编辑弹窗 = **单页模态窗**（HeadlessUI Dialog，与主窗共用加载/设置上下文）
- 冲突语义 = **拒绝保存**：编辑/粘贴可临时产生冲突（红 outline + 临时 snackbar），保存时若有冲突则拒绝并提示消除；消除后红 outline 消失，若该项需黄 outline 则替换为黄
- 执行节奏 = 按里程碑验收，每阶段带测试

## 需求解读（fn-req.md → 设计映射）

- 以周为单位、5 分钟最小粒度编排事务；7 天横排为列，每列从上到下 = 表头单元格（周几）+ 表体单元格（顺排的事务列）；**不为每个 5 分钟建单元格**（无安排空隙合并为视觉隐藏 cell，随事务 cell 顺排；高度∝时长）
- 事务三类：普通/休息（提醒事务，需设时长）、无安排（由空隙自动派生，不入库）
- 一天起止时间解析链：天覆盖 → 周表 → 全局设置（默认 06:00–23:59）
- 周表：至多 6 个（首表默认存在不可删），左侧纵向 tab 列 7 槽位（6 表 + 添加按钮）；"当周"设置后按槽位顺序循环轮换
- 提醒链：事务开始/结束 → 系统通知 + 铃声 + 右下角 snackbar【确认】停止；铃声与播放模式按 **事务→事务类型→全局** fallback；取值 ∈ {未设置(继承), builtin 内置铃声, none 不提醒, 文件名}；"不提醒"= 静音+不推送但仍弹 snackbar
- 链式结束铃：相邻无空隔的一串提醒事务只播开始铃，最后一个（其后是空隙/无安排/日末）才在结束时播结束铃；超出当天空余的事务在当天结束时间播结束铃（黄 outline 警告，不算冲突）
- 交互：单击选中 → Ctrl+C/按钮复制事务 JSON（首键固定 `"objectType":"ScheetPlan"`）；点表头选目标天 → Ctrl+V/按钮粘贴同时段；悬浮 cell 边缘横向拖拽快速排到其他天；上下拖拽调时长（5 分钟步进）、左右拖拽换天；双击编辑
- 右侧：当日 todo list（todo-list.db 按天存，日切自动复制昨日未完成）+ 悬浮剪贴板预览块（窗口聚焦时读取嗅探）

## 总体架构

- **三库分工**（同在 Documents/scheet/）：`data.db`（app_settings/flags + 手动 reminders 表）、`weeks.db`（周表+事务+日覆盖）、`todo-list.db`（todos+meta）。通知/铃声/托盘/webview2 模块原样复用。
- **db.rs 重构**：Db 泛化为 `LazyDb`（按文件名惰性打开 + 各自建表/迁移），manage 三个实例；alarms 目录随 data.db 初始化。
- **时间模型**：事务存 `start_minute`(0–1439) + `duration_minute`（5 的倍数）；渲染时相对当天窗口偏移换算像素。
- **轮换**：app_settings 存 `activePlanId` + `rotationAnchorDate`（设定当周时的"每周第一天"日期）；Rust 读取时计算 `(锚点序 + 整周数) % 周表数`。
- **剪贴板**：Rust 侧 arboard 读写文本，前端只在 focus/粘贴时经命令读取。

## M1 后端地基（weeks.db + todo-list.db + 事件计算）

- [x] M1.1 db.rs → LazyDb 三库重构（data.db schema 不变，alarms 逻辑保留）
- [x] M1.2 weeks.rs：week_plans / week_entries / week_day_overrides 表 + CRUD、保存冲突检测（拒绝写入）、轮换计算命令
- [x] M1.3 timetable.rs：今日提醒事件计算（开始铃/链式结束铃/溢出钳制/铃声解析链）+ 调度线程集成 + scheet://alarm 事件
- [x] M1.4 todo.rs：todos 表 + 命令 + 跨天滚动（启动与日切）
- [x] M1.5 settings.rs 扩展：全局起止时间、每周第一天、铃声解析链三组键
- [x] M1.6 clipboard.rs：arboard 读写 + list_alarm_sounds
- [x] M1.7 cargo test 全绿（31 个）+ tauri dev 冒烟回归（三库/默认周表/日切游标验证通过）→ **已到验收点**
- [x] M1.8（验收反馈加固）clock.rs 时间存储约定：时间点统一 UTC RFC3339（解析保留偏移、落库转 UTC）、日历日本地日期、时刻表时间用分钟数；weeks/todo/reminders 全部切换并审计，34 测试绿

## M2 周表网格渲染

- [x] M2.1 前端类型镜像 + IPC 封装（types/weeks、types/global-config、lib/weeks、lib/global-config、lib/weekgrid 纯函数）
- [x] M2.2 路由与页面骨架（/ WeekGridPage、/settings 占位页）
- [x] M2.3 左侧纵向 tab 列（动态 1~6 槽 + 添加按钮满员消失 + 当周绿点标记 + 切换脏确认模态）
- [x] M2.4 7 天列渲染：flex 顺排（可见事务 cell + 隐藏无安排 cell）、cell 三段式（时间标签阈值 72px、中部标题）、3.2px/分钟、深色适配（蓝/琥珀 15% 透明度）、今天列标记
- [x] M2.5 冲突红 outline（前端实时计算）+ 溢出黄 outline + tooltip、保存按钮/脏标记/保存流程（Rust 权威校验 + toast）、表体纵向滚动 + 天表头 sticky
- [x] M2.6 pnpm build 通过 + 34 测试绿 + tauri dev 冒烟（修复 Vite 监视 EBUSY：ignore src-tauri/**）→ **已到验收点，dev 实例留运行中供查看**
- [x] M2.7（验收反馈修复）① State 类型错配：settings/reminders 命令参数 Arc<LazyDb>→Arc<DataDb>（错误屏根因）；② AppShell 加载/错误态保留标题栏（窗口可拖动/关闭）；③ week_entries.color 列（#RRGGBB 校验+迁移），渲染叠加 15% 透明度、默认蓝/琥珀。35 测试绿，探针确认设置加载成功。git：cf94a1e（全量）+ 68b243a（修复）
- [x] M2.8（验收反馈精修）① 表格占满窗口高度、cell 高度按窗口高度动态比例（ResizeObserver，7 天统一比例+透明垫片对齐）；② 全局窄/半透明滚动条样式；③ tab 列每项 1/6 窗口高、选中项与表区连通（笔记本标签风格）；④ 布局右侧预留 todo 面板；⑤ 窗口最小尺寸 1080x700。git：19e70d4
- [x] M2.9（追加）标题栏应用标题：`{当周}，{日期} - Scheet`（两表时显示 单周/双周），选中周表≠当周时追加 `(选中: ...)`，同步系统窗口标题（需 core:window:allow-set-title 权限）

## M3 交互与冲突

- [x] M3.0 右键菜单系统：tab 右键（周表设置[名称+周表级起止时间→工作副本]、设为当周[写轮换锚点]、删除[危险模态确认，首表不显示]）；表头右键（当天设置[日覆盖，留空清除]）。提交 272b809
- [x] M3.0b（验收反馈修复）①自动命名跟随槽位号（原 COUNT+1 在删除后重号，如两个 周表6）；②表格高度显式像素化+overflow 裁剪，消除几像素的滚动区域。36 测试绿。提交 713338b
- [x] M3.1 选中/复制/粘贴：单击 cell 选中（ring 高亮）、Ctrl+C/按钮复制 ScheetPlan JSON（首键 objectType）、左键表头设粘贴目标（高亮+"粘贴目标"标记）、Ctrl+V/按钮解析剪贴板插入工作副本（负数临时 id、冲突实时标红）；调度 500ms→1000ms；日期切换 emit scheet://date-changed → dateState/useToday（标题栏日期与今天标记跨午夜自动刷新）。提交 186bbcc
- [x] M3.1b（验收反馈）粘贴目标以剪贴板嗅探为闸门：聚焦窗口（含启动）读剪贴板校验事务 JSON（clipboardHasPlan），无内容/非事务时表头点击不激活、粘贴按钮/Ctrl+V 禁用、失效自动熄灭目标。提交 686cb55
- [x] M3.2 拖拽三件套：指针状态机（按下判轴向，阈值 6px）——垂直=时长 5 分钟步进实时更新、水平=换天（elementFromPoint+data-day 目标列表头高亮）、cell 左右边缘把手=复制安排到其他天同时段；拖拽统一光标、抑制误选中；全部写工作副本。提交 9439314
- [x] M3.3 双击编辑模态（类型/标题[普通必填]/时长/铃声选择+试听/模式/颜色 hex/删除按钮；双击无安排区域新建）。提交 938dc09
- [x] M3.3b（验收反馈九项）①DialogShell 自定义页脚修双保存按钮；②:root color-scheme dark 修原生时间拨盘黑图标/白底/空格；③时长支持 小时.分钟 输入+提交 2舍3入+label 实时 humanize；④cell 上下边缘把手（ns-resize）拖顶改开始/拖底改结束；⑤主体拖拽=保持时长当天任意重放；⑥每列底层标记起止时间；⑦tooltip 追加时长；⑧未保存徽标琥珀脉动；⑨铃声/模式下拉展示继承值+来源标注，试听按继承解析。git 9bba668
- [x] M3.3c（验收反馈）事务 cell 全部改绝对定位 + 冲突泳道并排（layoutDayEntries：区间着色 first-fit、连通簇共享泳道宽度），重叠不再推挤；无安排占位 DOM 删除、双击空白按位置精确新建。git 7c3593c
- [x] M3.3d/M4-part1（验收反馈批次）：①提醒推送改为置顶弹窗子窗口（popup.rs，右下角+秒表时钟，点击/主窗聚焦关闭，notify.rs 转备用）；②调度器时间窗触发修复保存后误响铃；③开始/结束铃声独立链（end 字段+迁移+校验），未设置回落开始链；④应用内提醒 snackbar（循环持续到确认/一次性 30 秒）；⑤继承显示格式"值（来源）"；⑥下拉 base-select 圆角深色；⑦循环响铃修为看护线程驱动+每轮间隔 5 秒。git 98af938
- [x] M3.5 测试用例库：测试用例.md（黑白盒用例按功能域组织，供后续验收勾选）
- [x] M3.4 保存冲突拒绝 + 临时 snackbar + outline 切换规则（已在 M2/M3.1 增量实现：保存时 Rust 权威校验拒绝+toast、冲突红 outline 实时计算、消除后红消失/被黄替换）
- [ ] M3.5 验收 → **暂停验收（M3 全部子任务完成，应用运行中）**

## M4 提醒链路与设置页

- [x] M4.1 前端监听 scheet://alarm → 右下角 snackbar +【确认】停止铃声（loop 持续/once 30s 自动消退）——已随 M3.3d 提前完成（提交 98af938）
- [ ] M4.2 设置页（全局起止时间、每周第一天、铃声解析链三组[含结束铃声]、窗口控制按钮组位置）
- [ ] M4.3 E2E 提醒验收（2 分钟后事务：弹窗+铃声+snackbar；none 只弹 snackbar；循环确认即停）→ **暂停验收**

## M5 todo + 剪贴板预览 + 收尾

- [ ] M5.1 右侧当日 todo 面板（增删/勾选）+ 日切自动复制
- [ ] M5.2 todo 区上方剪贴板预览浮块（focus 嗅探 objectType:ScheetPlan）
- [ ] M5.3 AGENTS.md / README 实现地图更新 + release 构建冒烟 → **最终验收**

## 明确不做（后续升级项）

- 事务独立窗口编辑（本期模态窗，结构上预留升级）
- 周表/数据导入导出、轮换手动跳转、事务颜色自定义

## 设计备注

- 事务"标题"为合理推断字段（需求未明说，但编辑/通知/snackbar 需要名称承载）
- 周表内 weekday 统一存 ISO 周一=1..周日=7，显示顺序由"每周第一天"设置决定
- todo 滚动按需求原文取"上一天"（日历上的昨天）
