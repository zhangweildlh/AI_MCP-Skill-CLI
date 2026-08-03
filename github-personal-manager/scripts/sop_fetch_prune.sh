#!/usr/bin/env bash
# 中文名: 清理过时远程跟踪引用
# 功能: 执行 git fetch --prune，清理本地过时的远程跟踪引用（如远端已删除分支对应的 origin/xxx）。
# 适用场景: 日常巡检或分支清理时，让本地远程跟踪引用与远端保持一致。
# 注意事项: 只清理本地过时引用，不改动任何远程分支；删除远程分支属强门禁，请勿用本脚本。
#   默认 dry-run（打印将执行命令，不实际发起网络 fetch）；加 --confirm 才真正执行 git fetch --prune。
#   未知选项直接报错退出（rc=2），不会把选项误当作仓库路径。
# 用法: bash sop_fetch_prune.sh [仓库路径] [--confirm] [-h]
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; echo "用法: bash sop_fetch_prune.sh [仓库路径] [--confirm]"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *) REPO="$a" ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1

echo "===== 清理过时远程跟踪引用 ====="
if [ "$CONFIRM" -ne 1 ]; then
  echo "[dry-run] 将执行: git fetch --prune （仅清理本地过时引用，不改动任何远程分支，不实际发起网络请求）"
  echo "   （加 --confirm 真正执行）"
  exit 0
fi
"$GIT_BIN" fetch --prune
echo "已完成 git fetch --prune（仅清理本地过时引用，未改动任何远程分支）"
