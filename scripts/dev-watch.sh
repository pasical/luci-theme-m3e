#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-templates}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/dev-watch.sh [assets|templates|all]

Watch local theme sources and run scripts/dev-sync.sh after changes.
Requires fswatch. On macOS: brew install fswatch
EOF
}

case "${MODE}" in
  -h|--help|help)
    usage
    exit 0
    ;;
  assets|templates|all)
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if ! command -v fswatch >/dev/null 2>&1; then
  echo "Missing required command: fswatch" >&2
  echo "Install on macOS with: brew install fswatch" >&2
  exit 1
fi

WATCH_PATHS=("${REPO_ROOT}/htdocs")
case "${MODE}" in
  templates)
    WATCH_PATHS+=("${REPO_ROOT}/ucode")
    ;;
  all)
    WATCH_PATHS+=("${REPO_ROOT}/ucode" "${REPO_ROOT}/root")
    ;;
esac

echo "Watching ${MODE} sources. Press Ctrl-C to stop."
printf 'Target: %s\n' "${OPENWRT_HOST:-root@192.168.1.1}"

"${SCRIPT_DIR}/dev-sync.sh" "${MODE}"

fswatch -0 -o "${WATCH_PATHS[@]}" | while IFS= read -r -d '' _; do
  printf '\n[%s] Change detected. Syncing...\n' "$(date '+%H:%M:%S')"
  "${SCRIPT_DIR}/dev-sync.sh" "${MODE}"
done