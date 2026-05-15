#!/usr/bin/env bash
set -euo pipefail

COMMAND="${1:-start}"
MODE="${2:-all}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

IMAGE="${OPENWRT_PREVIEW_IMAGE:-luci-theme-m3e-preview:latest}"
CONTAINER="${OPENWRT_PREVIEW_CONTAINER:-luci-theme-m3e-preview}"
HTTP_PORT="${OPENWRT_PREVIEW_PORT:-8080}"
THEME="${OPENWRT_THEME:-m3e}"

usage() {
  cat <<'EOF'
Usage: scripts/preview-openwrt.sh [start|stop|restart|sync|watch|status|logs|shell|url] [assets|templates|all|root|register]

Runs a Docker OpenWrt LuCI preview at http://127.0.0.1:8080 without building an ipk.

Commands:
  start      Build image if needed, start container, sync theme sources.
  stop       Stop and remove the preview container.
  restart    Stop, start and sync again.
  sync       Sync theme sources into the running container.
  watch      Watch sources with fswatch and sync after each save.
  status     Show container status.
  logs       Follow container logs.
  shell      Open a shell in the container.
  url        Print preview URL.

Modes for start/sync/watch:
  assets     CSS, JS and images only; fastest.
  templates  Assets plus ucode templates; clears LuCI cache and restarts uhttpd.
  all        Assets, templates and root overlay; also registers the theme.
  root       Root overlay and theme registration only.
  register   Register M3E theme variants only.

Environment:
  OPENWRT_PREVIEW_PORT=8080
  OPENWRT_PREVIEW_CONTAINER=luci-theme-m3e-preview
  OPENWRT_PREVIEW_IMAGE=luci-theme-m3e-preview:latest
  OPENWRT_THEME=m3e
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd docker

container_running() {
  docker container inspect -f '{{.State.Running}}' "${CONTAINER}" >/dev/null 2>&1 && [[ "$(docker container inspect -f '{{.State.Running}}' "${CONTAINER}")" == "true" ]]
}

container_exists() {
  docker container inspect "${CONTAINER}" >/dev/null 2>&1
}

build_image() {
  docker build --platform linux/amd64 -t "${IMAGE}" -f "${REPO_ROOT}/scripts/openwrt-preview.Dockerfile" "${REPO_ROOT}"
}

start_container() {
  build_image

  if container_running; then
    echo "Container already running: ${CONTAINER}"
    return
  fi

  if container_exists; then
    docker rm "${CONTAINER}" >/dev/null
  fi

  docker run -d \
    --name "${CONTAINER}" \
    --platform linux/amd64 \
    -p "127.0.0.1:${HTTP_PORT}:80" \
    -e "OPENWRT_THEME=${THEME}" \
    "${IMAGE}" >/dev/null

  wait_ready
}

wait_ready() {
  local tries=0

  until docker exec "${CONTAINER}" sh -c 'ubus list 2>/dev/null | grep -q "^system$" && pgrep uhttpd >/dev/null 2>&1'; do
    tries=$((tries + 1))
    if [[ "${tries}" -ge 30 ]]; then
      echo "Timed out waiting for OpenWrt services to become ready." >&2
      docker logs --tail 80 "${CONTAINER}" >&2 || true
      exit 1
    fi
    sleep 1
  done
}

exec_in_container() {
  docker exec "${CONTAINER}" sh -c "$*"
}

copy_dir() {
  local src="$1"
  local dst="$2"
  local dst_parent="${dst%/*}"

  if [[ ! -d "${REPO_ROOT}/${src}" ]]; then
    return
  fi

  exec_in_container "mkdir -p '${dst_parent}' && rm -rf '${dst}'"
  docker cp "${REPO_ROOT}/${src}" "${CONTAINER}:${dst_parent}/"
}

copy_file() {
  local src="$1"
  local dst="$2"
  local dst_parent="${dst%/*}"

  if [[ ! -f "${REPO_ROOT}/${src}" ]]; then
    return
  fi

  exec_in_container "mkdir -p '${dst_parent}'"
  docker cp "${REPO_ROOT}/${src}" "${CONTAINER}:${dst}"
}

sync_assets() {
  local theme
  for theme in m3e m3e-blue m3e-green m3e-red; do
    copy_dir "htdocs/luci-static/${theme}" "/www/luci-static/${theme}"
  done

  copy_file "htdocs/luci-static/resources/menu-m3e.js" "/www/luci-static/resources/menu-m3e.js"
  copy_dir "htdocs/luci-static/resources/view/m3e" "/www/luci-static/resources/view/m3e"
}

sync_templates() {
  local theme
  for theme in m3e m3e-blue m3e-green m3e-red; do
    copy_dir "ucode/template/themes/${theme}" "/usr/share/ucode/luci/template/themes/${theme}"
  done
}

sync_root_overlay() {
  if [[ -d "${REPO_ROOT}/root" ]]; then
    docker cp "${REPO_ROOT}/root/." "${CONTAINER}:/"
  fi
}

register_theme() {
  exec_in_container "uci set uhttpd.main.rfc1918_filter=0; uci set uhttpd.main.listen_http='0.0.0.0:80'; uci set uhttpd.main.max_requests=20; uci set uhttpd.main.max_connections=200; uci commit uhttpd; if [ -x /etc/uci-defaults/30_luci-theme-m3e ]; then /etc/uci-defaults/30_luci-theme-m3e; else uci set luci.themes.M3E=/luci-static/m3e; uci set luci.themes.M3EBlue=/luci-static/m3e-blue; uci set luci.themes.M3EGreen=/luci-static/m3e-green; uci set luci.themes.M3ERed=/luci-static/m3e-red; fi; uci set luci.main.mediaurlbase=/luci-static/${THEME}; uci commit luci"
}

clear_luci_cache() {
  exec_in_container "rm -rf /tmp/luci-indexcache /tmp/luci-modulecache"
}

restart_uhttpd() {
  exec_in_container "/etc/init.d/uhttpd restart >/dev/null 2>&1 || true"
}

sync_mode() {
  local mode="$1"

  if ! container_running; then
    echo "Preview container is not running. Start it with: scripts/preview-openwrt.sh start" >&2
    exit 1
  fi

  case "${mode}" in
    assets)
      sync_assets
      ;;
    templates)
      sync_assets
      sync_templates
      clear_luci_cache
      restart_uhttpd
      ;;
    all)
      sync_assets
      sync_templates
      sync_root_overlay
      register_theme
      clear_luci_cache
      restart_uhttpd
      ;;
    root)
      sync_root_overlay
      register_theme
      clear_luci_cache
      restart_uhttpd
      ;;
    register)
      register_theme
      clear_luci_cache
      restart_uhttpd
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

watch_mode() {
  local mode="$1"

  if ! command -v fswatch >/dev/null 2>&1; then
    echo "Missing required command: fswatch" >&2
    echo "Install on macOS with: brew install fswatch" >&2
    exit 1
  fi

  start_container
  sync_mode "${mode}"

  local watch_paths=("${REPO_ROOT}/htdocs")
  case "${mode}" in
    templates)
      watch_paths+=("${REPO_ROOT}/ucode")
      ;;
    all)
      watch_paths+=("${REPO_ROOT}/ucode" "${REPO_ROOT}/root")
      ;;
  esac

  echo "Preview URL: http://127.0.0.1:${HTTP_PORT}/"
  echo "Watching ${mode} sources. Press Ctrl-C to stop."

  fswatch -0 -o "${watch_paths[@]}" | while IFS= read -r -d '' _; do
    printf '\n[%s] Change detected. Syncing...\n' "$(date '+%H:%M:%S')"
    sync_mode "${mode}"
  done
}

case "${COMMAND}" in
  -h|--help|help)
    usage
    ;;
  start)
    start_container
    sync_mode "${MODE}"
    echo "Preview URL: http://127.0.0.1:${HTTP_PORT}/"
    ;;
  stop)
    if container_exists; then
      docker rm -f "${CONTAINER}" >/dev/null
    fi
    ;;
  restart)
    if container_exists; then
      docker rm -f "${CONTAINER}" >/dev/null
    fi
    start_container
    sync_mode "${MODE}"
    echo "Preview URL: http://127.0.0.1:${HTTP_PORT}/"
    ;;
  sync)
    sync_mode "${MODE}"
    echo "Synced. Refresh http://127.0.0.1:${HTTP_PORT}/"
    ;;
  watch)
    watch_mode "${MODE}"
    ;;
  status)
    docker ps -a --filter "name=^/${CONTAINER}$"
    ;;
  logs)
    docker logs -f "${CONTAINER}"
    ;;
  shell)
    docker exec -it "${CONTAINER}" sh
    ;;
  url)
    echo "http://127.0.0.1:${HTTP_PORT}/"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac