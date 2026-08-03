#!/usr/bin/env bash
# 中文名: 只读合并状态
# 功能: 输出本地已合并 main 的分支、本地未合并 main 的分支、以及 origin 远程已合并 main 的分支。
# 适用场景: 分支清理前，先看清哪些分支可安全删除（已合并）、哪些含未完成工作（勿删）。
# 注意事项: 纯只读；实际删除分支属不可逆强门禁动作，本脚本不做删除，仅列出状态供你判断。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

_sop_help() {
  sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  echo "用法: bash sop_branch_merged_status.sh [仓库路径]"
}
case "${1:-}" in
  -h|--help) _sop_help; exit 0 ;;
esac
_sop_require_repo "${1:-}" || exit 1

echo "===== 只读合并状态 (仓库: $(pwd)) ====="
echo "--- 本地已合并 $MAIN_BRANCH 的分支（可安全删）---"
"$GIT_BIN" branch --merged "$MAIN_BRANCH"
echo "--- 本地未合并 $MAIN_BRANCH 的分支（含未完成工作，勿删）---"
"$GIT_BIN" branch --no-merged "$MAIN_BRANCH"
echo "--- origin 远程已合并 $MAIN_BRANCH 的分支 ---"
"$GIT_BIN" branch -r --merged "$ORIGIN_REMOTE/$MAIN_BRANCH"
