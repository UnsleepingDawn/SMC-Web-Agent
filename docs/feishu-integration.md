# 飞书集成

所有飞书网络调用都发生在 `jobs` 服务内，凭据通过 `.env` 或数据库（加密）注入。本文档说明需要开通的权限、凭据获取方式与常见限制。

## 1. 应用类型与凭据

需要一个**企业自建应用**（不是商店应用），因为要读取通讯录与考勤数据。

1. 打开[飞书开放平台](https://open.feishu.cn/app)，创建「企业自建应用」。
2. 在「凭证与基础信息」页复制 `App ID` 与 `App Secret`。
3. 填入 `.env.local` 的 `FEISHU_APP_ID` / `FEISHU_APP_SECRET`；也可以在「设置 → 飞书应用凭据」页面填写，后者会加密存进 `runtime_configs` 表。
4. 在「权限管理」页按 §2 勾选权限，然后**发布版本并等待管理员审批**，权限才真正生效。

凭据优先级：数据库里的值优先于 `.env`，便于不重新部署就轮换密钥。

## 2. 权限清单

| 模块 | 权限 | 用途 |
| --- | --- | --- |
| 通讯录 | `contact:department.base:readonly` | 遍历部门树 |
| 通讯录 | `contact:user.base:readonly`、`contact:user.employee_id:readonly` | 读取成员姓名、工号、邮箱、手机、部门 |
| 通讯录 | `contact:user.id:readonly` | 拿到 `open_id` / `union_id` / `user_id` 三种 ID |
| 多维表格 | `bitable:app:readonly`、`bitable:app` | 读取组会表、周报表、请假表、课表 |
| 考勤 | `attendance:task:readonly`、`attendance:rule:readonly` | 读取考勤组与打卡流水（考勤模块预留） |
| 消息与群组 | `im:message:send_as_bot`、`im:message` | 发送组会预告与周报总结 |
| 消息与群组 | `im:resource` | 上传/发送图片（如需带图预告） |

用不到的能力不要开，权限越多审批越慢。

## 3. 多维表格信息

`semesters` 表里每张表存三个值：`app_token`、`table_id`、`url`。

- 打开多维表格，URL 形如 `https://xxx.feishu.cn/base/<app_token>?table=<table_id>`。
- `app_token` 是 `base/` 后面那段，`table_id` 是 `table=` 后面那段。
- 表字段名必须与代码里的常量一致（见 `jobs/src/parsers/*.py` 顶部的 `FIELD_*`），否则同步会得到空值。

需要配置的四张表：

| 字段前缀 | 用途 |
| --- | --- |
| `seminar_*` | 组会表：姓名、年级、导师、培养类型、在读情况、飞书账号、学号、`_Track`、分享主题、摘要、上次/近期讲组会时间、是否确认、会议室、线下指导老师 |
| `weekly_report_*` | 周报表：汇报人、附件、文档链接、`_Week`、`WeekdayValid` |
| `seminar_leave_*` | 请假表（考勤模块预留） |
| `schedule_*` | 课表（考勤模块预留） |

同步周报时用到了 `_Week` 与 `WeekdayValid` 两个筛选条件，字段名区分大小写。

## 4. Token 与限流

- `tenant_access_token` 有效期 7200 秒，`FeishuClient` 在进程内缓存并在 7000 秒时提前刷新，避免边界失败。
- 飞书对多数接口有 QPS 限制（常见 20 次/秒、部分 5 次/秒）。同步任务按页串行拉取，单页默认 100 条，不会触发限流。
- 分页统一走 `FeishuClient.paginate`，`has_more` 为真就继续，`page_token` 为空也停止，避免死循环。
- 遇到 `code != 0` 抛 `FeishuAPIError`，任务捕获后回传 `sync_runs.error`，前端可见。

## 5. 考勤组的特殊作用

`FEISHU_ATTENDANCE_GROUP_NAME`（默认 `SMC考勤`）指定考勤组名称。同步人员时用它确定 `need_attendance`，周报统计用它确定「应提交」集合。

`FEISHU_TEACHER_DEPARTMENT_NAME`（默认 `Tenure`）指定老师所在的通讯录部门。周报的「推送给老师」按同步下来的 `member.department` 取老师名单，不单独维护花名册；部门改名后同步一次人员即可。

如果应用没有考勤权限，`sync_members` 会跳过考勤组查询并继续（记一条 warning），此时 `need_attendance` 全部为 `false`，周报统计会没有「应提交」名单。落地考勤模块前请先确认权限与测试数据。

## 6. 排查

| 现象 | 可能原因 |
| --- | --- |
| `code=99991663` / `99991661` | token 无效或应用未发布，重新发布并等待审批 |
| `code=91402` | 多维表 `app_token`/`table_id` 错误，或应用未加为该表协作者 |
| 同步成功但字段为空 | 多维表字段名与 `FIELD_*` 常量不一致 |
| 预告里所有人都变成 Track 1 | `_Track` 列名对不上（例如误写成 `顺序`），整列取不到值后被补位；看 jobs 日志里的 `check the bitable column name` |
| 发送消息 `code=230002` | 机器人不在目标群内 |
| 通讯录只拿到部分人 | 部门权限只授权了子部门，或成员未加入可见范围 |
