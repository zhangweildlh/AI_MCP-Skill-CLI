#!/usr/bin/env bash
# 中文名: 仓库目录解析与三元组提取
# 功能: 给定仓库目录路径（或当前目录），从 `git remote -v` 一次性提取三项并复用：
#   - 用户名(GH_USER)   = origin 远端的拥有者（fork 即你的登录名）
#   - 远端仓库名(REPO_NAME) = origin 远端的仓库名
#   - 上游仓库(UPSTREAM) = upstream 远端的 owner/name（无 upstream 则空）
# 用途: 让 Agent 在任务首次涉及某仓库时一次性提取，后续步骤直接套用，免用户反复输出三项。
#       脚本自身也具备"重解析"能力——每次调用都从 remote 重新提取，不会因会话遗忘失效。
# 注意: 工具路径不硬编码，由 lib/sop-common.sh 经 where.exe 解析；脚本一律用相对路径自定位。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

# 支持 -h/--help（与其他 sop_*.sh 保持一致）
for _a in "$@"; do
  case "$_a" in
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; echo "用法: bash sop_resolve_repo.sh [仓库路径] [--quiet]"; exit 0 ;;
  esac
done
REPO_PATH="${1:-}"
QUIET=0
[ "${2:-}" = "--quiet" ] && QUIET=1

# 进入仓库并校验是 git 工作树（复用公共函数），随后一次性解析远端三元组（含 GH_USER/UPSTREAM_REPO 补全）
_sop_require_repo "$REPO_PATH" || exit 1
# L2 修复：遵守 _sop_resolve_remotes 的 return 1 契约——GH_USER 无法解析时给出明确告警（不再静默输出空 GH_USER= 误导调用方），
# 但 REPO_NAME 等仍可输出，由调用方据告警自行决定是否中止。
if ! _sop_resolve_remotes; then
  echo "⚠️ 无法解析 GH_USER（远端非 github.com 域名或 config 未设置）；REPO_NAME 等仍输出，但 GH_USER 为空，调用方需自行处理。" >&2
fi

# 映射公共库解析结果到本脚本输出语义
GH_USER="${SOP_ORIGIN_OWNER:-$GH_USER}"
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
