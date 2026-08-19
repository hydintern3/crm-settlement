#!/usr/bin/env bash

set -Eeuo pipefail

readonly IMAGE="ghcr.io/hydintern3/crm-settlement:latest"
readonly PROJECT_DIR="/opt/crm-settlement"
readonly ENV_FILE="${PROJECT_DIR}/.env"
readonly SERVICE="crm-platform"
readonly HEALTH_URL="http://127.0.0.1:3100/crm/api/health"
readonly DEFAULT_ARCHIVE="/home/dev03/crm-settlement-linux-amd64.tar.gz"

ENV_TMP=""

cleanup() {
  if [[ -n "${ENV_TMP}" && -e "${ENV_TMP}" ]]; then
    rm -f -- "${ENV_TMP}"
  fi
}
trap cleanup EXIT

fail() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

if [[ ${EUID} -ne 0 ]]; then
  fail "请使用 sudo bash $0 [镜像压缩包路径] 运行。"
fi

for command_name in docker sha256sum awk curl readlink mktemp grep chmod chown mv dirname basename; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "缺少命令：${command_name}"
done

[[ -d "${PROJECT_DIR}" ]] || fail "项目目录不存在：${PROJECT_DIR}"
[[ -f "${PROJECT_DIR}/compose.yaml" ]] || fail "缺少 ${PROJECT_DIR}/compose.yaml"
[[ -f "${ENV_FILE}" ]] || fail "缺少 ${ENV_FILE}，请先按部署文档完成管理员凭据配置。"

archive_input="${1:-${DEFAULT_ARCHIVE}}"
[[ -f "${archive_input}" ]] || fail "镜像压缩包不存在：${archive_input}"
archive="$(readlink -f -- "${archive_input}")"
checksum_file="${archive}.sha256"
[[ -f "${checksum_file}" ]] || fail "校验文件不存在：${checksum_file}"

printf '1/5 校验离线镜像……\n'
(
  cd "$(dirname -- "${archive}")"
  sha256sum -c "$(basename -- "${checksum_file}")"
)

printf '2/5 加载镜像……\n'
docker load -i "${archive}"
docker image inspect "${IMAGE}" >/dev/null 2>&1 || \
  fail "压缩包中没有 ${IMAGE} 标签，请重新下载最新的 CI 离线镜像。"

if ! grep -qxF "CRM_IMAGE=${IMAGE}" "${ENV_FILE}"; then
  printf '3/5 将 Compose 镜像固定为 latest（其他环境变量保持不变）……\n'
  ENV_TMP="$(mktemp "${PROJECT_DIR}/.env.tmp.XXXXXX")"
  awk -v image="${IMAGE}" '
    BEGIN { found = 0 }
    /^CRM_IMAGE=/ {
      if (!found) {
        print "CRM_IMAGE=" image
        found = 1
      }
      next
    }
    { print }
    END {
      if (!found) print "CRM_IMAGE=" image
    }
  ' "${ENV_FILE}" > "${ENV_TMP}"
  chmod --reference="${ENV_FILE}" "${ENV_TMP}"
  chown --reference="${ENV_FILE}" "${ENV_TMP}"
  mv -f -- "${ENV_TMP}" "${ENV_FILE}"
  ENV_TMP=""
else
  printf '3/5 Compose 已使用 latest，无需修改环境变量。\n'
fi

printf '4/5 重建应用容器（不拉取远端镜像，不删除数据卷）……\n'
cd "${PROJECT_DIR}"
docker compose config --quiet
docker compose up -d --no-build --pull never --force-recreate "${SERVICE}"

printf '5/5 等待健康检查……\n'
healthy=0
for ((attempt = 1; attempt <= 60; attempt++)); do
  if curl --fail --silent "${HEALTH_URL}" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ ${healthy} -ne 1 ]]; then
  docker compose ps "${SERVICE}" || true
  docker compose logs --tail=100 "${SERVICE}" || true
  fail "应用在 60 秒内未通过健康检查，请根据以上日志排查。"
fi

docker compose ps "${SERVICE}"
printf '健康检查：'
curl --fail --silent --show-error "${HEALTH_URL}"
printf '\n部署完成。当前镜像：%s\n' "${IMAGE}"
