#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_ci_failed_log.sh
# 中文名: 下载失败日志
#
# 【功能】
#   取仓库最近一次工作流运行（run）的编号，再拉取该次运行中失败步骤的完整日志
#   （等价于 gh run view <编号> --log-failed），直接打印到终端。
#   若仓库尚无任何工作流运行，打印「无 workflow run」提示并正常结束。
#
# 【用途 / 使用场景】
#   CI 变红后的第一手排错工具：无需打开网页，直接在终端拿到失败步骤的原始日志，
#   用于定位编译错误、格式检查不通过、测试用例失败、审批闸门拦截等具体原因。
#   建议与 sop_pr_checks.sh 配合：前者看「哪一项红了」，本脚本看「为什么红」。
#   定位到原因并修复推送后，若判断属环境抖动可用 sop_ci_rerun.sh 重跑。
#
# 【详细用法】
#   bash sop_ci_failed_log.sh [仓库路径]
#   bash sop_ci_failed_log.sh -h
#
#   参数说明:
#     [仓库路径]   可选。目标仓库根目录；省略则对当前目录操作。
#                  必须是仓库根，传入子目录会显式报错。
#     -h, --help   打印本帮助并以状态码 0 退出。
#
#   退出码: 0=查询完成（含「无运行记录」「该次运行无失败步骤」这类正常情形）；
#           1=目标目录不是 git 仓库或不是仓库根。
#
#   使用示例:
#     bash sop_ci_failed_log.sh D:/Documents/AI_Work_Temp/dynamic-mcp
#
# 【前置条件】
#   需要本机已安装 gh 并完成登录；仓库归属由 gh 依据当前目录自动探测。
#
# 【注意事项】
#   只读下载，不重跑、不取消、不修改任何工作流。
#   仅覆盖「最近一次」运行；若要看更早的运行，请改用 gh 命令指定运行编号。
#   最近一次运行本身是成功的时候，失败日志为空属正常现象，不是错误。
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

# 解析远端三元组：gh 调用必须显式 --repo（审计契约）
_sop_resolve_remotes 2>/dev/null || true
REPO_ID="${SOP_ORIGIN_OWNER:-$GH_USER}/${SOP_ORIGIN_REPO:-}"

runid="$("$GH_BIN" run list --repo "$REPO_ID" --limit 1 --json databaseId --jq ".[0].databaseId" 2>/dev/null)"
if [ -z "$runid" ]; then
  echo "无 workflow run（可能尚未触发 CI）"
  exit 0
fi
echo "===== 失败日志 (run $runid) ====="
"$GH_BIN" run view "$runid" --repo "$REPO_ID" --log-failed 2>&1 || echo "(该 run 无失败步骤或无法获取)"
