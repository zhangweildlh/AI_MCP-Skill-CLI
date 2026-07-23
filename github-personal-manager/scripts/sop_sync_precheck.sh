#!/usr/bin/env bash
# 中文名: 巡检前置预检
# 功能: 只读输出 remote 列表、main 的上游跟踪关系、工作区是否干净、本地↔origin 的领先/落后计数，
#       以及 origin↔upstream 的领先/落后计数（若存在 upstream 远程）。用于任何同步操作前的"看清状态"。
# 适用场景: 每日同步巡检的起点；或你想快速了解当前仓库与远端关系时。
# 注意事项: 纯只读，无任何副作用；不修改分支、不推送、不合并。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

_sop_help() {
  sed -n '2,6p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  echo "用法: bash sop_sync_precheck.sh [仓库路径]   (不带参数则对当前目录操作)"
}
case "${1:-}" in
  -h|--help) _sop_help; exit 0 ;;
esac
_sop_require_repo "${1:-}" || exit 1

echo "===== 巡检前置预检 (仓库: $(pwd)) ====="
echo "--- remotes ---"
"$GIT_BIN" remote -v
echo "--- main 上游跟踪 ---"
if "$GIT_BIN" rev-parse --abbrev-ref "$MAIN_BRANCH@{upstream}" >/dev/null 2>&1; then
  echo "$MAIN_BRANCH -> $("$GIT_BIN" rev-parse --abbrev-ref "$MAIN_BRANCH@{upstream}")"
else
  echo "(main 未设置上游跟踪)"
fi
echo "--- 工作区 ---"
if _sop_is_clean; then echo "干净（无未提交改动）"; else "$GIT_BIN" status --porcelain | head -20; fi
read -r b a <<< "$(_sop_detect_local_origin)"
echo "--- 本地 main ↔ origin/main: 落后=$b 领先=$a ---"
if "$GIT_BIN" remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  read -r M K <<< "$(_sop_detect_origin_upstream)"
  echo "--- origin/main ↔ upstream/main: fork领先=M=$M upstream领先=K=$K ---"
else
  echo "--- 无 upstream 远程，跳过 origin↔upstream 探测 ---"
fi
