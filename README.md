# SMC-Web-Agent

中山大学计算机学院 SMCLab 日常事务管理系统的 Web 版。数据源为飞书开放平台（通讯录、多维表格、考勤、IM），运行形态为「Next.js 客户端 + FastAPI 服务端 + Celery 异步任务」，Docker dev/prod 双栈部署。

## 功能

- **人员主数据**：通讯录与组会表按飞书账号合并，标记需要考勤的人员，行内编辑，导出签名表。
- **组会管理与预告**：按学期与周次维护组会日程与讲者 Track，渲染预告文案并推送到飞书。
- **周报统计**：按周统计已提交/未提交名单与文档链接，推送总结，并可按导师把周报链接私聊给各位老师。
- **推送历史**：所有飞书消息的发送记录与失败原因。

考勤统计与小组会议排班（BILP）为后续模块，接口位已预留（返回 501）。

## 快速开始

```bash
cp .env.example .env.local     # 填写数据库密码、飞书凭据、本地登录账号
bash ./dev.sh dev-build        # 首次启动：构建并启动开发栈
bash ./dev.sh dev-migrate      # 应用数据库迁移
```

打开 http://dev.smc.localhost:3002，用 `.env.local` 里的 `LOCAL_AUTH_EMAIL` / `LOCAL_AUTH_PASSWORD` 登录。

> 开发栈默认占用 3002，是为了和 Sunlight 等其他本地栈共存；生产栈仍用 3001。端口在 `docker/dev.env` 的 `SMC_PORT` 里改。

Windows（PowerShell）需要先设置 `HOME`，并显式调用 Git 自带的 bash（系统 `bash.exe` 指向 WSL，会报 `execvpe(/bin/bash) failed`）：

```powershell
$env:HOME = $env:USERPROFILE
& "D:\Install0\Git\bin\bash.exe" ./dev.sh dev-build
```

> 上面是本机的 Git bash 路径（Git 装在 `D:\Install0\Git`）。换机器时用 `(Get-Command git).Source` 得到 `...\Git\cmd\git.exe`，去掉尾部 `cmd\git.exe` 后拼 `bin\bash.exe` 即可。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 客户端 | Next.js 15（App Router）、TypeScript、Tailwind v4、shadcn/ui |
| 服务端 | FastAPI、SQLAlchemy 2、Alembic、Pydantic |
| 异步任务 | Celery（RabbitMQ broker + Redis 结果后端） |
| 存储 | PostgreSQL、MinIO |
| 网关 | Caddy |
| 编排 | Docker Compose（dev/prod 双栈） |

## 文档

- [docs/architecture.md](docs/architecture.md)：三应用边界与飞书同步链路
- [docs/deployment.md](docs/deployment.md)：dev/prod 双栈、日常操作与数据安全红线
- [docs/feishu-integration.md](docs/feishu-integration.md)：飞书应用权限与凭据配置
- [client/design.md](client/design.md)：客户端设计指南
- [CONTRIBUTING.md](CONTRIBUTING.md)：代码约定与提交规范
- [src_doc/](src_doc/)：核心模块实现原理（人员合并 / 组会预告 / 周报统计）

## 许可

内部项目，未附开源许可。
