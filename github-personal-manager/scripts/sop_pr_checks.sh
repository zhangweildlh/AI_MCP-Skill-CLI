#!/usr/bin/env bash
# 中文名: 轮询 CI 状态
# 功能: 输出当前分支关联 PR 的检查状态（gh pr checks）与最近 5 条 workflow run（gh run list）。
# 适用场景: 推送 feat 分支或开 PR 后，确认 CI 是否全绿。
# 注意事项: 纯只读；需 gh 已登录 github.com；若无关联 PR 会提示，不影响脚本退出。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

_sop_help() {
  sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  echo "用法: bash sop_pr_checks.sh [仓库路径]"
}
case "${1:-}" in
  -h|--help) _sop_help; exit 0 ;;
esac
_sop_require_repo "${1:-}" || exit 1

branch="$(_sop_current_branch)"
echo "===== 轮询 CI 状态 (分支: $branch) ====="
echo "--- PR 检查 (gh pr checks) ---"
"$GH_BIN" pr checks 2>&1 || echo "(无关联 PR 或 gh 未登录)"
echo "--- 最近 5 条 workflow run (gh run list) ---"
"$GH_BIN" run list --limit 5 2>&1 || echo "(无法获取 run 列表)"
