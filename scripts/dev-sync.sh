#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-all}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

OPENWRT_HOST="${OPENWRT_HOST:-root@192.168.1.1}"
OPENWRT_PORT="${OPENWRT_PORT:-22}"
OPENWRT_THEME="${OPENWRT_THEME:-m3e}"
DRY_RUN="${DRY_RUN:-0}"
RESTART_UHTTPD="${RESTART_UHTTPD:-auto}"
CLEAR_LUCI_CACHE="${CLEAR_LUCI_CACHE:-auto}"

usage() {
  cat <<'EOF'
Usage: scripts/dev-sync.sh [all|assets|templates|root|register]

Fast preview against a real OpenWrt/LuCI environment without building an ipk.

Modes:
  all        Sync htdocs, ucode and root; register theme; clear cache; restart uhttpd.
  assets     Sync htdocs only. Best for CSS, JS and image tweaks.
  templates  Sync htdocs and ucode templates; clear LuCI cache; restart uhttpd.
  root       Sync root overlay and run theme registration.
  register   Register M3E theme variants through UCI only.

Environment:
  OPENWRT_HOST=root@192.168.1.1   SSH target.
  OPENWRT_PORT=22                 SSH port.
  OPENWRT_SSH_OPTS="..."          Extra ssh options.
  OPENWRT_THEME=m3e               Theme variant to set as active mediaurlbase.
  RESTART_UHTTPD=auto|1|0         Restart policy. auto restarts except assets mode.
  CLEAR_LUCI_CACHE=auto|1|0       Cache cleanup policy. auto clears except assets mode.
  DRY_RUN=1                       Show rsync changes without writing files.
EOF
}

case "${MODE}" in
  -h|--help|help)
    usage
    exit 0
    ;;
  all|assets|templates|root|register)
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd ssh
need_cmd rsync

SSH_ARGS=(-p "${OPENWRT_PORT}")
if [[ -n "${OPENWRT_SSH_OPTS:-}" ]]; then
  read -r -a EXTRA_SSH_ARGS <<< "${OPENWRT_SSH_OPTS}"
  SSH_ARGS+=("${EXTRA_SSH_ARGS[@]}")
fi

RSYNC_SSH="ssh"
for arg in "${SSH_ARGS[@]}"; do
  RSYNC_SSH+=" $(printf '%q' "${arg}")"
done

RSYNC_ARGS=(-az --delete --exclude='.DS_Store' --exclude='._*')
if [[ "${DRY_RUN}" == "1" ]]; then
  RSYNC_ARGS+=(--dry-run --itemize-changes)
fi

remote() {
  ssh "${SSH_ARGS[@]}" "${OPENWRT_HOST}" "$@"
}

check_remote_rsync() {
  if ! remote "command -v rsync >/dev/null 2>&1"; then
    echo "Remote target is missing rsync." >&2
    echo "Install it once on OpenWrt with: opkg update && opkg install rsync" >&2
    exit 1
  fi
}

sync_dir_to() {
  local src="$1"
  local dst="$2"

  if [[ ! -d "${REPO_ROOT}/${src}" ]]; then
    return
  fi

  remote "mkdir -p '${dst}'"
  rsync "${RSYNC_ARGS[@]}" -e "${RSYNC_SSH}" "${REPO_ROOT}/${src}" "${OPENWRT_HOST}:${dst}"
}

sync_file_to() {
  local src="$1"
  local dst="$2"
  local dst_dir="${dst%/*}"

  if [[ ! -f "${REPO_ROOT}/${src}" ]]; then
    return
  fi

  remote "mkdir -p '${dst_dir}'"
  rsync -az --exclude='.DS_Store' --exclude='._*' ${DRY_RUN:+--dry-run --itemize-changes} -e "${RSYNC_SSH}" "${REPO_ROOT}/${src}" "${OPENWRT_HOST}:${dst}"
}

sync_assets() {
  local theme
  remote "mkdir -p /www/luci-static/resources/view"

  for theme in m3e m3e-blue m3e-green m3e-red; do
    sync_dir_to "htdocs/luci-static/${theme}/" "/www/luci-static/${theme}/"
  done

  sync_file_to "htdocs/luci-static/resources/menu-m3e.js" "/www/luci-static/resources/menu-m3e.js"
  sync_dir_to "htdocs/luci-static/resources/view/m3e/" "/www/luci-static/resources/view/m3e/"
}

sync_templates() {
  local theme
  remote "mkdir -p /usr/share/ucode/luci/template/themes"

  for theme in m3e m3e-blue m3e-green m3e-red; do
    sync_dir_to "ucode/template/themes/${theme}/" "/usr/share/ucode/luci/template/themes/${theme}/"
  done
}

sync_root_overlay() {
  sync_dir_to "root/" "/"
}

register_theme() {
  remote "if [ -x /etc/uci-defaults/30_luci-theme-m3e ]; then /etc/uci-defaults/30_luci-theme-m3e; else uci set luci.themes.M3E=/luci-static/m3e; uci set luci.themes.M3EBlue=/luci-static/m3e-blue; uci set luci.themes.M3EGreen=/luci-static/m3e-green; uci set luci.themes.M3ERed=/luci-static/m3e-red; fi; uci set luci.main.mediaurlbase=/luci-static/${OPENWRT_THEME}; uci commit luci"
}

clear_luci_cache() {
  remote "rm -rf /tmp/luci-indexcache /tmp/luci-modulecache"
}

restart_uhttpd() {
  remote "if [ -x /etc/init.d/uhttpd ]; then /etc/init.d/uhttpd restart; fi"
}

should_clear_cache() {
  [[ "${CLEAR_LUCI_CACHE}" == "1" || ( "${CLEAR_LUCI_CACHE}" == "auto" && "${MODE}" != "assets" ) ]]
}

should_restart() {
  [[ "${RESTART_UHTTPD}" == "1" || ( "${RESTART_UHTTPD}" == "auto" && "${MODE}" != "assets" ) ]]
}

echo "Sync target: ${OPENWRT_HOST}"
echo "Mode: ${MODE}"

if [[ "${MODE}" != "register" ]]; then
  check_remote_rsync
fi

case "${MODE}" in
  all)
    sync_assets
    sync_templates
    sync_root_overlay
    register_theme
    ;;
  assets)
    sync_assets
    ;;
  templates)
    sync_assets
    sync_templates
    ;;
  root)
    sync_root_overlay
    register_theme
    ;;
  register)
    register_theme
    ;;
esac

if should_clear_cache; then
  clear_luci_cache
fi

if should_restart; then
  restart_uhttpd
fi

echo "Done. Refresh LuCI in the browser."