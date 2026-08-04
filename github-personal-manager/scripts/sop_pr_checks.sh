#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_pr_checks.sh
# 中文名: 轮询 CI 状态
#
# 【功能】
#   一次性输出当前分支的持续集成（CI）状态，共两段：
#     1. PR 检查        —— 当前分支关联的合并请求（PR）各项检查结论（gh pr checks）
#     2. 最近 5 条运行  —— 仓库最近 5 次工作流运行记录及其状态（gh run list --limit 5）
#   任一段查询失败（无关联 PR、未登录、无权限）都会打印中文提示而不中断，脚本仍正常结束。
#
# 【用途 / 使用场景】
#   推送功能分支或开 PR 之后，确认 CI 是否全绿的首选命令，省去打开网页。
#   也用于合并前的证据核对：先看这里的检查结论，再决定是否进入合并步骤。
#   若发现变红，改用 sop_ci_failed_log.sh 拉取失败步骤日志定位原因。
#
# 【详细用法】
#   bash sop_pr_checks.sh [仓库路径]
#   bash sop_pr_checks.sh -h
#
#   参数说明:
#     [仓库路径]   可选。目标仓库根目录；省略则对当前目录操作。
#                  必须是仓库根，传入子目录会显式报错。
#     -h, --help   打印本帮助并以状态码 0 退出。
#
#   退出码: 0=查询完成（含「无关联 PR」这类正常情形）；1=目标目录不是 git 仓库或不是仓库根。
#
#   使用示例:
#     bash sop_pr_checks.sh D:/Documents/AI_Work_Temp/dynamic-mcp
#
# 【前置条件】
#   需要本机已安装 gh 并完成 github.com 登录；未登录时对应段落会提示而非报错中止。
#
# 【注意事项】
#   纯只读：只查询状态，不重跑、不取消、不修改任何工作流与分支。
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

branch="$(_sop_current_branch)"
echo "===== 轮询 CI 状态 (分支: $branch) ====="
echo "--- PR 检查 (gh pr checks) ---"
"$GH_BIN" pr checks 2>&1 || echo "(无关联 PR 或 gh 未登录)"
echo "--- 最近 5 条 workflow run (gh run list) ---"
"$GH_BIN" run list --limit 5 2>&1 || echo "(无法获取 run 列表)"
