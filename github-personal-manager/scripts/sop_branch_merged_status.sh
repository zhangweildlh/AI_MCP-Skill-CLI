#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_branch_merged_status.sh
# 中文名: 只读合并状态
#
# 【功能】
#   分三段列出分支相对主线的合并状态，供分支清理决策：
#     1. 本地已合并主线的分支   —— 提交已进入主线，回收这些分支不会丢工作
#     2. 本地未合并主线的分支   —— 仍含未并入主线的提交，属于「勿删」名单
#     3. origin 远端已合并主线的分支 —— 远端侧可回收的候选
#
# 【用途 / 使用场景】
#   分支清理工作流的第一步：先看清全貌，再决定回收哪些分支。
#   合并请求（PR）合并完成后的例行收尾，也用它确认功能分支是否确实已并入主线。
#   看清之后，工作树类分支用 sop_worktree_cleanup.sh 连同工作树一并回收。
#
# 【详细用法】
#   bash sop_branch_merged_status.sh [仓库路径]
#   bash sop_branch_merged_status.sh -h
#
#   参数说明:
#     [仓库路径]   可选。目标仓库根目录；省略则对当前目录操作。
#                  必须是仓库根，传入子目录会显式报错。
#     -h, --help   打印本帮助并以状态码 0 退出。
#
#   退出码: 0=列出完成；1=目标目录不是 git 仓库或不是仓库根。
#
#   使用示例:
#     bash sop_branch_merged_status.sh D:/Documents/AI_Work_Temp/dynamic-mcp
#
# 【注意事项】
#   纯只读：本脚本只列状态，不做任何删除。分支删除属不可逆动作，须另行显式授权执行。
#   远端一段依据本地缓存的远端跟踪引用判断，结果可能滞后；必要时先做一次抓取再看。
#<!--HELP-END-->
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

case "${1:-}" in
  -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
esac
_sop_require_repo "${1:-}" || exit 1

echo "===== 只读合并状态 (仓库: $(pwd)) ====="
echo "--- 本地已合并 $MAIN_BRANCH 的分支（可安全删）---"
"$GIT_BIN" branch --merged "$MAIN_BRANCH"
echo "--- 本地未合并 $MAIN_BRANCH 的分支（含未完成工作，勿删）---"
"$GIT_BIN" branch --no-merged "$MAIN_BRANCH"
echo "--- origin 远程已合并 $MAIN_BRANCH 的分支 ---"
"$GIT_BIN" branch -r --merged "$ORIGIN_REMOTE/$MAIN_BRANCH"
