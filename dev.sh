#!/bin/bash
# SMC-Web-Agent 本地 dev/prod 双栈控制器。凭据留在 .env.local，栈身份由 docker/*.env 提供。

set -euo pipefail

DEV=(docker compose --project-name smc-dev --env-file .env.local --env-file docker/dev.env -f compose.local.yml -f compose.dev.yml)
PROD=(docker compose --project-name smc-prod --env-file .env.local --env-file docker/prod.env -f compose.local.yml)

stack() {
  case "$1" in
    dev) printf '%s\0' "${DEV[@]}" ;;
    prod) printf '%s\0' "${PROD[@]}" ;;
    *) echo "栈必须是 dev 或 prod" >&2; exit 1 ;;
  esac
}

run_stack() {
  local target="$1"
  shift
  local -a command=()
  while IFS= read -r -d '' argument; do
    command+=("$argument")
  done < <(stack "$target")
  "${command[@]}" "$@"
}

case "${1:-}" in
  dev-up)
    run_stack dev up -d
    ;;
  dev-build)
    run_stack dev up -d --build
    ;;
  dev-client)
    run_stack dev restart client
    ;;
  dev-restart)
    run_stack dev restart server jobs-api jobs-worker jobs-beat
    ;;
  dev-migrate)
    run_stack dev up -d migrate
    ;;
  dev-deps)
    run_stack dev rm -sf client
    docker volume rm smc-dev_client_dev_node_modules smc-dev_client_dev_next 2>/dev/null || true
    run_stack dev up -d --build
    ;;
  prod-deploy)
    run_stack prod up -d --build --force-recreate
    # 清理被新镜像替换后遗留的无 tag 镜像（tag 固定为 :prod，重建后旧镜像变 dangling）
    docker image prune -f
    ;;
  prod-up)
    run_stack prod up -d
    ;;
  down)
    run_stack "${2:-}" down
    ;;
  ps)
    run_stack "${2:-}" ps
    ;;
  logs)
    target="${2:-}"
    shift 2
    run_stack "$target" logs -f "$@"
    ;;
  config)
    run_stack "${2:-}" config
    ;;
  *)
    cat <<'EOF'
用法: ./dev.sh <命令>

开发栈（http://dev.smc.localhost:3002，数据在 ~/.smc-dev）：
  dev-up       启动已有开发容器，不构建镜像
  dev-build    首次启动或 Dockerfile/Python 依赖变化后构建并启动
  dev-client   前端源码改动后重启 client
  dev-restart  后端或 jobs 源码改动后重启相关进程
  dev-migrate  对开发数据执行迁移
  dev-deps     client package.json/yarn.lock 改动后重建并重置开发依赖缓存

生产栈（http://prod.smc.localhost:3001，数据在 ~/.smc）：
  prod-deploy  重新构建生产镜像并替换生产容器
  prod-up      启动已有生产镜像，不构建

检查与停止：
  ps <dev|prod>
  logs <dev|prod> [服务...]
  config <dev|prod>
  down <dev|prod>
EOF
    exit 1
    ;;
esac
