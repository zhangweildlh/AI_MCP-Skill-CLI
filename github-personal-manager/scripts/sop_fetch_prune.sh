#!/usr/bin/env bash
# 中文名: 清理过时远程跟踪引用
# 功能: 执行 git fetch --prune，清理本地过时的远程跟踪引用（如远端已删除分支对应的 origin/xxx）。
# 适用场景: 日常巡检或分支清理时，让本地远程跟踪引用与远端保持一致。
# 注意事项: 只清理本地过时引用，不改动任何远程分支；删除远程分支属强门禁，请勿用本脚本。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

_sop_help() {
  sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  echo "用法: bash sop_fetch_prune.sh [仓库路径]"
}
case "${1:-}" in
  -h|--help) _sop_help; exit 0 ;;
esac
_sop_require_repo "${1:-}" || exit 1

echo "===== 清理过时远程跟踪引用 ====="
"$GIT_BIN" fetch --prune
echo "已完成 git fetch --prune（仅清理本地过时引用，未改动任何远程分支）"
