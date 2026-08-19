#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: wf_worktree.sh
# 中文名: 多工作树并行开发（开工作树 / 合并回主线 / 清理工作树）
# 用途: 同仓库开『平行文件夹』同时写不同功能；管理 add(开线) / merge(合回主线) / cleanup(收拾) 三种动作。
# 用法:
#   bash wf_worktree.sh add    --branch feat/x [仓库] [--confirm]
#   bash wf_worktree.sh merge  --branch feat/x [仓库] [--confirm]
#   bash wf_worktree.sh cleanup --branch feat/x [仓库] [--confirm]
#   bash wf_worktree.sh -h
# 说明: merge/cleanup 是写动作，需 --confirm；运行到需要你拍板的地方会当场用大白话告诉你
#       「这是什么 / 为什么需要你决策 / 不做的后果 / 安全底线」。
#<!--HELP-END-->
set -uo pipefail
WF_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOP_SELF_DIR="$(cd "$WF_SELF_DIR/../scripts" && pwd)"
# shellcheck disable=SC1091
source "$WF_SELF_DIR/wf_common.sh"
wf_source_common

SUBCMD=""
CONFIRM=0
REPO=""
BRANCH=""
NEED_BRANCH=0
for a in "$@"; do
  case "$a" in
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    --branch) NEED_BRANCH=1 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *)
      if [ "$NEED_BRANCH" = "1" ]; then BRANCH="$a"; NEED_BRANCH=0
      elif [ -z "$SUBCMD" ]; then SUBCMD="$a"
      else REPO="$a"; fi
      ;;
  esac
done
[ -z "$SUBCMD" ] && { echo "用法: wf_worktree.sh <add|merge|cleanup> --branch feat/x [仓库] [--confirm]"; exit 2; }
_sop_require_repo "${REPO:-}" || exit 1

args=()
case "$SUBCMD" in
  add)
    [ -z "$BRANCH" ] && { echo "⛔ 必须 --branch <feat/x>"; exit 2; }
    args=("$SOP_SELF_DIR/sop_worktree_add.sh" "$REPO" --branch "$BRANCH")
    [ "$CONFIRM" -eq 1 ] && args+=(--confirm)
    wf_run_step "开工作树：基于主线拉出平行开发线（$BRANCH）" "${args[@]}"
    ;;
  merge)
    [ -z "$BRANCH" ] && { echo "⛔ 必须 --branch <feat/x>"; exit 2; }
    args=("$SOP_SELF_DIR/sop_worktree_merge.sh" "$REPO" --branch "$BRANCH")
    [ "$CONFIRM" -eq 1 ] && args+=(--confirm)
    wf_run_step "合并回主线：把 $BRANCH 以 --no-ff 合入 main（保留历史）" "${args[@]}"
    ;;
  cleanup)
    [ -z "$BRANCH" ] && { echo "⛔ 必须 --branch <feat/x>"; exit 2; }
    args=("$SOP_SELF_DIR/sop_worktree_cleanup.sh" "$REPO" --branch "$BRANCH")
    [ "$CONFIRM" -eq 1 ] && args+=(--confirm)
    wf_run_step "清理工作树 + 分支：$BRANCH" "${args[@]}"
    ;;
  *) echo "⛔ 未知子命令: $SUBCMD（应为 add / merge / cleanup）"; exit 2 ;;
esac
