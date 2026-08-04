#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_sync_precheck.sh
# 中文名: 巡检前置预检
#
# 【功能】
#   只读汇报目标仓库当前的同步态势，共五段输出：
#     1. remotes            —— 全部远端及其地址
#     2. main 上游跟踪      —— 主分支是否已设置上游跟踪，跟踪谁
#     3. 工作区             —— 是否干净；不干净则列出前 20 条改动
#     4. 本地 main ↔ origin/main    —— 落后数与领先数
#     5. origin/main ↔ upstream/main —— fork 领先数 M 与 upstream 领先数 K
#        （无 upstream 远端时自动跳过该段并给出提示）
#
# 【用途 / 使用场景】
#   任何同步动作之前的「先看清状态」步骤，是日常同步巡检工作流的起点。
#   也可在不确定当前仓库与远端关系时随时单独运行，用于快速体检。
#   本脚本只负责看清现状，不做任何决策与操作；后续动作由同步类脚本执行。
#
# 【详细用法】
#   bash sop_sync_precheck.sh [仓库路径]
#   bash sop_sync_precheck.sh -h
#
#   参数说明:
#     [仓库路径]   可选。目标仓库根目录；不带参数则对当前目录操作。
#                  必须是仓库根，传入子目录会显式报错。
#     -h, --help   打印本帮助并以状态码 0 退出。
#
#   退出码: 0=预检完成正常输出；1=目标目录不是 git 仓库或不是仓库根。
#
#   使用示例:
#     bash sop_sync_precheck.sh D:/Documents/AI_Work_Temp/dynamic-mcp
#     cd D:/Documents/AI_Work_Temp/dynamic-mcp && bash /路径/sop_sync_precheck.sh
#
# 【注意事项】
#   纯只读，无任何副作用：不切分支、不拉取、不推送、不合并。
#   领先/落后计数基于本地已有的远端跟踪引用，若引用陈旧请先做一次抓取再看。
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

echo "===== 巡检前置预检 (仓库: $(pwd)) ====="
echo "--- remotes ---"
"$GIT_BIN" remote -v
echo "--- main 上游跟踪 ---"
if "$GIT_BIN" rev-parse --abbrev-ref "$MAIN_BRANCH@{upstream}" >/dev/null 2>&1; then
  echo "$MAIN_BRANCH -> $("$GIT_BIN" rev-parse --abbrev-ref "$MAIN_BRANCH@{upstream}")"
else
  echo "(main 未设置上游跟踪)"
fi
echo "--- 工作区 ---"
if _sop_is_clean; then echo "干净（无未提交改动）"; else "$GIT_BIN" status --porcelain | head -20; fi
read -r b a <<< "$(_sop_detect_local_origin)"
echo "--- 本地 main ↔ origin/main: 落后=$b 领先=$a ---"
if "$GIT_BIN" remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  read -r M K <<< "$(_sop_detect_origin_upstream)"
  echo "--- origin/main ↔ upstream/main: fork领先=M=$M upstream领先=K=$K ---"
else
  echo "--- 无 upstream 远程，跳过 origin↔upstream 探测 ---"
fi
