#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_resolve_repo.sh
# 中文名: 仓库目录解析与三元组提取
#
# 【功能】
#   给定仓库目录路径（或直接用当前目录），从 git remote -v 一次性提取三项标识并输出：
#     - 用户名(GH_USER)       = origin 远端的拥有者，对 fork 而言即你的 GitHub 登录名
#     - 远端仓库名(REPO_NAME) = origin 远端的仓库名；origin 缺失时回退为仓库目录名
#     - 上游仓库(UPSTREAM)    = upstream 远端的 owner/name，无 upstream 远端时为空
#
# 【用途 / 使用场景】
#   任务首次涉及某个仓库时先跑一次，把三元组固定下来，后续步骤直接套用，
#   免去反复向用户索取用户名与仓库名。每次调用都从远端重新解析，
#   不会因会话中断或上下文丢失而失效，可随时重跑校正。
#   典型场景：日常同步巡检开场、开 PR 前确认上游、CI 排错前确认仓库归属。
#
# 【详细用法】
#   bash sop_resolve_repo.sh [仓库路径] [--quiet]
#   bash sop_resolve_repo.sh -h
#
#   参数说明:
#     [仓库路径]   可选。目标仓库根目录；省略则解析当前所在目录。
#                  必须是仓库根，传入子目录会显式报错（防止误解析为父仓库）。
#     --quiet      可选。静默模式，只输出机器可解析的 key=value 三行，不打印中文说明。
#                  仅当它作为第二个参数出现时生效。
#     -h, --help   打印本帮助并以状态码 0 退出。
#
#   输出格式（末尾三行恒定输出，供后续脚本直接读取）:
#     GH_USER=<用户名>
#     REPO_NAME=<仓库名>
#     UPSTREAM=<上游 owner/name，无则为空>
#
#   退出码: 0=解析成功；1=目标目录不是 git 仓库或不是仓库根。
#
#   使用示例:
#     bash sop_resolve_repo.sh D:/Documents/AI_Work_Temp/dynamic-mcp
#     bash sop_resolve_repo.sh D:/Documents/AI_Work_Temp/dynamic-mcp --quiet
#
# 【注意事项】
#   纯只读，不修改任何分支、不推送、不发起网络写操作。
#   工具路径不硬编码，由 lib/sop-common.sh 经 where.exe 解析；脚本一律用相对路径自定位。
#<!--HELP-END-->
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

case "${1:-}" in
  -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
esac
REPO_PATH="${1:-}"
QUIET=0
[ "${2:-}" = "--quiet" ] && QUIET=1

# 进入仓库并校验是 git 工作树（复用公共函数），随后一次性解析远端三元组（含 GH_USER/UPSTREAM_REPO 补全）
_sop_require_repo "$REPO_PATH" || exit 1
_sop_resolve_remotes

# 映射公共库解析结果到本脚本输出语义（GH_USER 已由 _sop_resolve_remotes 统一补全：origin 拥有者优先于 config 默认值）
REPO_NAME="$SOP_ORIGIN_REPO"
UPSTREAM_OWNER_REPO="$SOP_UPSTREAM_OWNER_REPO"

# 兜底：origin 缺失时仓库名取目录名
if [ -z "$REPO_NAME" ] || [ "$REPO_NAME" = "$GH_USER" ]; then
  REPO_NAME="$(basename "$("$GIT_BIN" rev-parse --show-toplevel 2>/dev/null || pwd)")"
fi

if [ "$QUIET" -eq 0 ]; then
  echo "解析结果（供本任务复用，无需反复向用户索取）："
  echo "  用户名(GH_USER)      ：$GH_USER"
  echo "  远端仓库名(REPO_NAME) ：$REPO_NAME"
  echo "  上游仓库(UPSTREAM)    ：${UPSTREAM_OWNER_REPO:-（无 upstream 远端）}"
fi
# 机器可解析输出（key=value），供脚本/后续步骤直接读取
echo "GH_USER=$GH_USER"
echo "REPO_NAME=$REPO_NAME"
echo "UPSTREAM=$UPSTREAM_OWNER_REPO"
