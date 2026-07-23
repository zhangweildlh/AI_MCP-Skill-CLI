#!/usr/bin/env bash
# 中文名: 下载失败日志
# 功能: 取最近一次 workflow run，打印其失败步骤日志（gh run view --log-failed）。
# 适用场景: CI 变红时，快速定位失败步骤，无需打开网页。
# 注意事项: 只读下载；需 gh 已登录；若最近 run 无失败步骤则输出可能为空（非错误）。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

_sop_help() {
  sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  echo "用法: bash sop_ci_failed_log.sh [仓库路径]"
}
case "${1:-}" in
  -h|--help) _sop_help; exit 0 ;;
esac
_sop_require_repo "${1:-}" || exit 1

runid="$("$GH_BIN" run list --limit 1 --json databaseId --jq ".[0].databaseId" 2>/dev/null)"
if [ -z "$runid" ]; then
  echo "无 workflow run（可能尚未触发 CI）"
  exit 0
fi
echo "===== 失败日志 (run $runid) ====="
"$GH_BIN" run view "$runid" --log-failed 2>&1 || echo "(该 run 无失败步骤或无法获取)"
