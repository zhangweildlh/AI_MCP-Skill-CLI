#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_fetch_prune.sh
# 中文名: 清理过时远程跟踪引用
#
# 【功能】
#   执行 git fetch --prune，清理本地那些已经失效的远程跟踪引用——
#   即远端早已删除、本地却还留着的 origin/xxx 之类的影子引用。
#   清理后 branch -r 等命令看到的远端分支列表才与远端真实状态一致。
#
# 【用途 / 使用场景】
#   日常同步巡检或分支清理时使用，消除「远端分支明明删了、本地还看得见」的错觉。
#   合并请求（PR）合并后远端自动删除来源分支的场景尤其常见，跑一次即可对齐。
#   建议在 sop_branch_merged_status.sh 之前跑，让后者读到的远端状态是新鲜的。
#
# 【详细用法】
#   bash sop_fetch_prune.sh [仓库路径] [--confirm]
#   bash sop_fetch_prune.sh -h
#
#   参数说明:
#     [仓库路径]   可选。目标仓库根目录；省略则对当前目录操作。
#                  必须是仓库根，传入子目录会显式报错。
#     --confirm    真正执行清理。不加则为预览模式，只打印将要执行的命令。
#     --dry-run    显式声明预览模式（默认行为，可用于覆盖前面出现的 --confirm）。
#     -h, --help   打印本帮助并以状态码 0 退出。
#
#   两种模式:
#     预览模式（默认）—— 打印将执行的命令，不发起任何网络请求，不改动本地引用。
#     执行模式（--confirm）—— 真正抓取远端并清理本地失效引用。
#
#   退出码: 0=预览完成或清理完成；1=目标目录不是 git 仓库或不是仓库根；2=传入了未知选项。
#
#   使用示例:
#     bash sop_fetch_prune.sh D:/Documents/AI_Work_Temp/dynamic-mcp
#     bash sop_fetch_prune.sh D:/Documents/AI_Work_Temp/dynamic-mcp --confirm
#
# 【注意事项】
#   本脚本只清理本地的过时引用，绝不触碰远端上的任何分支，属安全操作。
#   若你要删除远端分支，那属于不可逆的公开动作，须另行显式授权，不要用本脚本。
#   未知选项一律报错退出（状态码 2），不会被误当成仓库路径处理。
#<!--HELP-END-->
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
for a in "$@"; do
  case "$a" in
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
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
