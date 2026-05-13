#!/usr/bin/env bash
set -euo pipefail

# One-click local build for luci-theme-m3e via OpenWrt SDK.
# Usage examples:
#   ./scripts/local-build.sh 24.10
#   ./scripts/local-build.sh snapshot
#   TARGET_PATH=ramips/mt7621 ./scripts/local-build.sh 24.10
#   SDK_DIR=/path/to/openwrt-sdk ./scripts/local-build.sh snapshot
#   USE_DOCKER=1 ./scripts/local-build.sh 24.10
#   FEEDS="base luci" ./scripts/local-build.sh 24.10
#   FEEDS=all ./scripts/local-build.sh 24.10

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

MODE="${1:-24.10}"
HOST_ARCH="${2:-x86_64}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

detect_pkg_dir_name() {
  local line pkg_name
  while IFS= read -r line; do
    case "${line}" in
      "define Package/"*)
        pkg_name="${line#define Package/}"
        pkg_name="${pkg_name%%/*}"
        pkg_name="${pkg_name%% *}"
        if [[ -n "${pkg_name}" ]]; then
          echo "${pkg_name}"
          return
        fi
        ;;
    esac
  done <"${REPO_ROOT}/Makefile"

  basename "${REPO_ROOT}"
}

PKG_DIR_NAME="${PKG_DIR_NAME:-$(detect_pkg_dir_name)}"

TARGET_PATH="${TARGET_PATH:-x86/64}"
CACHE_DIR="${SDK_CACHE_DIR:-${REPO_ROOT}/.sdk-cache}"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"
FEEDS="${FEEDS:-base luci}"

case "${MODE}" in
  24.10|openwrt-24.10)
    MODE="24.10"
    BASE_URL="https://downloads.openwrt.org/releases/24.10.0/targets/${TARGET_PATH}"
    ;;
  snapshot|SNAPSHOT)
    MODE="snapshot"
    BASE_URL="https://downloads.openwrt.org/snapshots/targets/${TARGET_PATH}"
    ;;
  *)
    echo "Unsupported mode: ${MODE}"
    echo "Use: 24.10 or snapshot"
    exit 1
    ;;
esac

if [[ "${LOCAL_BUILD_IN_DOCKER:-}" != "1" ]]; then
  USE_DOCKER="${USE_DOCKER:-auto}"
  if [[ "${USE_DOCKER}" == "1" || ( "${USE_DOCKER}" == "auto" && "$(uname -s)" != "Linux" ) ]]; then
    need_cmd docker

    IMAGE_NAME="${LOCAL_BUILD_IMAGE:-luci-theme-m3e-openwrt-sdk:bookworm}"
    DOCKERFILE="${SCRIPT_DIR}/openwrt-sdk.Dockerfile"
    case "${HOST_ARCH}" in
      x86_64) DOCKER_PLATFORM="${LOCAL_BUILD_PLATFORM:-linux/amd64}" ;;
      aarch64|arm64) DOCKER_PLATFORM="${LOCAL_BUILD_PLATFORM:-linux/arm64}" ;;
      *) DOCKER_PLATFORM="${LOCAL_BUILD_PLATFORM:-linux/amd64}" ;;
    esac

    docker build --platform "${DOCKER_PLATFORM}" -t "${IMAGE_NAME}" -f "${DOCKERFILE}" "${SCRIPT_DIR}"

    docker_args=(
      --rm
      --platform "${DOCKER_PLATFORM}"
      -u "$(id -u):$(id -g)"
      -v "${REPO_ROOT}:/work"
      -w /work
      -e LOCAL_BUILD_IN_DOCKER=1
    )

    for env_name in TARGET_PATH SDK_CACHE_DIR SDK_DIR JOBS FEEDS PKG_DIR_NAME; do
      if [[ -n "${!env_name:-}" ]]; then
        docker_args+=("-e" "${env_name}=${!env_name}")
      fi
    done

    exec docker run "${docker_args[@]}" "${IMAGE_NAME}" ./scripts/local-build.sh "${MODE}" "${HOST_ARCH}"
  fi
fi

need_cmd curl
need_cmd tar
need_cmd make
need_cmd grep

remote_size() {
  curl -fsIL "${1}" \
    | tr -d '\r' \
    | awk 'tolower($1) == "content-length:" { size = $2 } END { if (size) print size }'
}

local_size() {
  if [[ -f "$1" ]]; then
    wc -c <"$1" | tr -d ' '
  else
    echo 0
  fi
}

find_sdk_filename() {
  local index
  index="$(curl -fsSL "${BASE_URL}/")"
  echo "${index}" \
    | grep -Eo "openwrt-sdk-[^\"']*\.Linux-${HOST_ARCH}\.(tar\.xz|tar\.zst)" \
    | sort -u \
    | tail -n 1
}

prepare_sdk() {
  mkdir -p "${CACHE_DIR}"

  local sdk_filename sdk_archive sdk_extract_dir
  sdk_filename="$(find_sdk_filename || true)"

  if [[ -z "${sdk_filename}" ]]; then
    echo "Cannot locate SDK archive under: ${BASE_URL}/"
    echo "You can manually download SDK and run with:"
    echo "  SDK_DIR=/absolute/path/to/openwrt-sdk ./scripts/local-build.sh ${MODE}"
    exit 1
  fi

  sdk_archive="${CACHE_DIR}/${sdk_filename}"
  sdk_extract_dir="${CACHE_DIR}/${sdk_filename%.tar.xz}"
  sdk_extract_dir="${sdk_extract_dir%.tar.zst}"
  sdk_url="${BASE_URL}/${sdk_filename}"

  local expected_size current_size
  expected_size="$(remote_size "${sdk_url}" || true)"
  current_size="$(local_size "${sdk_archive}")"

  if [[ -n "${expected_size}" && -f "${sdk_archive}" && "${current_size}" -gt "${expected_size}" ]]; then
    echo "Removing oversized SDK archive cache: ${sdk_archive}"
    rm -f "${sdk_archive}"
    current_size=0
  fi

  if [[ ! -f "${sdk_archive}" || ( -n "${expected_size}" && "${current_size}" -lt "${expected_size}" ) ]]; then
    echo "Downloading SDK: ${sdk_filename}"
    curl --http1.1 -fL -C - --retry 5 --retry-delay 3 --retry-all-errors "${sdk_url}" -o "${sdk_archive}"
  fi

  if [[ -d "${sdk_extract_dir}" && ( ! -d "${sdk_extract_dir}/scripts" || ! -f "${sdk_extract_dir}/Makefile" ) ]]; then
    echo "Removing incomplete SDK extraction: ${sdk_extract_dir}"
    rm -rf "${sdk_extract_dir}"
  fi

  if [[ ! -d "${sdk_extract_dir}" ]]; then
    echo "Extracting SDK: ${sdk_filename}"
    rm -rf "${sdk_extract_dir}"
    tar -xf "${sdk_archive}" -C "${CACHE_DIR}"
  fi

  SDK_DIR="${sdk_extract_dir}"
}

if [[ -n "${SDK_DIR:-}" ]]; then
  if [[ ! -d "${SDK_DIR}" ]]; then
    echo "SDK_DIR does not exist: ${SDK_DIR}"
    exit 1
  fi
else
  prepare_sdk
fi

if [[ ! -d "${SDK_DIR}/scripts" || ! -f "${SDK_DIR}/Makefile" ]]; then
  echo "Invalid SDK directory: ${SDK_DIR}"
  exit 1
fi

echo "Using SDK: ${SDK_DIR}"
echo "Build mode: ${MODE}"
echo "Target path: ${TARGET_PATH}"
echo "SDK host arch: ${HOST_ARCH}"
echo "Feeds: ${FEEDS}"
echo "Package dir: ${PKG_DIR_NAME}"

PKG_LINK_PATH="${SDK_DIR}/package/${PKG_DIR_NAME}"
rm -rf "${PKG_LINK_PATH}"
mkdir -p "${PKG_LINK_PATH}"

for entry in Makefile htdocs luasrc root src ucode; do
  if [[ -e "${REPO_ROOT}/${entry}" ]]; then
    ln -s "${REPO_ROOT}/${entry}" "${PKG_LINK_PATH}/${entry}"
  fi
done

pushd "${SDK_DIR}" >/dev/null

if [[ "${FEEDS}" == "all" || "${FEEDS}" == "-a" ]]; then
  ./scripts/feeds update -a
  ./scripts/feeds install -a
else
  ./scripts/feeds update ${FEEDS}
  ./scripts/feeds install lua luci-base csstidy
fi

make defconfig
make "package/${PKG_DIR_NAME}/compile" V=s -j"${JOBS}"

echo

echo "Build complete. Candidate artifacts:"
find "${SDK_DIR}/bin/packages" -type f \( -name "${PKG_DIR_NAME}_*.ipk" -o -name "${PKG_DIR_NAME}_*.apk" \) | sort

popd >/dev/null
