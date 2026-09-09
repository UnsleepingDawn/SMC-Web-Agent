# 部署

## 1. 双栈设计

同一套 `compose.local.yml` 由 `docker/dev.env` 或 `docker/prod.env` 提供栈身份，两个栈完全隔离（容器名、数据卷、数据目录、端口、镜像 tag）。

| | 开发栈 | 生产栈 |
| --- | --- | --- |
| 启动命令 | `bash ./dev.sh dev-build` | `bash ./dev.sh prod-deploy` |
| project name | `smc-dev` | `smc-prod` |
| 访问地址 | http://dev.smc.localhost:3002 | http://prod.smc.localhost:3001 |
| 数据目录 | `~/.smc-dev` | `~/.smc` |
| 镜像 tag | `dev` | `prod` |
| 源码挂载 | 是（热更新） | 否 |

不同 hostname 是有意的：cookie 以 host 隔离，dev 的登录态不会污染 prod。

只有 gateway（Caddy）对宿主机发布端口。路由规则：

- `/api/*` → `server:8000`
- `/storage/*` → `minio:9000`（剥离前缀）
- 其余 → `client:3000`

## 2. 首次配置

```bash
cp .env.example .env.local
```

必须替换的占位值：

| 变量 | 说明 |
| --- | --- |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | 两处密码必须一致 |
| `RABBITMQ_DEFAULT_PASS` / `CELERY_BROKER_URL` | 两处密码必须一致 |
| `MINIO_ROOT_PASSWORD` | MinIO 管理密码 |
| `SMC_ENCRYPTION_KEY` | 加密飞书 app_secret 的密钥，随机生成并妥善保存 |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 飞书自建应用凭据 |
| `LOCAL_AUTH_EMAIL` / `LOCAL_AUTH_PASSWORD` | 首个登录账号，密码至少 12 位 |

`.env.local` 已被 `.gitignore` 排除，绝不提交。

## 3. 日常操作

```bash
bash ./dev.sh dev-build      # 首次启动或 Dockerfile / Python 依赖变化后构建并启动
bash ./dev.sh dev-up         # 启动已有容器，不构建
bash ./dev.sh dev-migrate    # 应用数据库迁移
bash ./dev.sh dev-client     # 改前端源码后重启 client
bash ./dev.sh dev-restart    # 改后端或 jobs 源码后重启相关进程
bash ./dev.sh dev-deps       # package.json / yarn.lock 变化后重建前端依赖

bash ./dev.sh prod-deploy    # 构建并替换生产容器
bash ./dev.sh prod-up        # 启动已有生产镜像

bash ./dev.sh ps dev         # 查看容器状态
bash ./dev.sh logs dev server # 跟踪日志
bash ./dev.sh down dev       # 停止并移除开发栈
```

Windows（PowerShell）必须先设置 `HOME`，否则 `${HOME}` 会展开成错误的数据目录，并且要用 Git 自带的 bash（系统 `bash.exe` 指向 WSL，会报 `execvpe(/bin/bash) failed`）：

```powershell
$env:HOME = $env:USERPROFILE
& "C:\Program Files\Git\bin\bash.exe" ./dev.sh dev-build
```

> 上面的 bash 路径只是示例，按本机 Git 的实际安装位置改（用 `Get-Command git` 看安装目录，比如装在 D 盘时可能是 `D:\Install0\Git\bin\bash.exe`）。

## 4. 数据安全红线

生产栈的数据在 `~/.smc`（PostgreSQL 数据卷）。**重建生产容器前**：

1. 比对 `server/app/database/models.py` 与 `server/migrations/versions/`，确认迁移齐全。
2. 先备份，再迁移：

   ```bash
   docker compose --project-name smc-prod --env-file .env.local \
     --env-file docker/prod.env -f compose.local.yml \
     exec -T postgres pg_dump -U smc smc > backup-$(date +%Y%m%d).sql
   ```

3. `bash ./dev.sh prod-up` 启动迁移容器，确认日志无报错后再 `prod-deploy`。

不要用 `down -v`：`-v` 会删除数据卷。

## 5. 常见问题

| 现象 | 排查 |
| --- | --- |
| 前端 502 | `bash ./dev.sh logs dev client`，多半是 `yarn install` 未完成 |
| `/api/*` 404 | 确认 gateway 与 server 都在运行，`logs dev server` 看是否有启动异常 |
| 登录后立刻掉线 | 检查 `SESSION_COOKIE_DOMAIN` 是否与访问的 hostname 匹配 |
| 同步任务一直 running | `logs dev jobs-worker`，多半是飞书凭据或权限问题 |
| 消息推送失败 | 查看「推送历史」页的 error 列，或 `logs dev jobs-worker` |

## 6. 相关文档

- [architecture.md](architecture.md) — 三应用边界与链路
- [feishu-integration.md](feishu-integration.md) — 飞书权限与凭据
