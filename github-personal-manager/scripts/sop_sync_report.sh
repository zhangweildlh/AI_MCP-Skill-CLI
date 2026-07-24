#!/usr/bin/env bash
# 中文名: 上游更新结构化报告
# 功能: 以"合并前本地 tip"（可选第二参数）为基准，生成上游相对上次同步的新增提交结构化报告。
#       报告含：新增功能 / 改进与优化 / Bug 修复 / 破坏性变更 / 其他 + 详细提交记录表。
#       未提供 tip 时，取 upstream/main 最近 20 条作为参考（与"报告基准点规则"一致）。
# 适用场景: 日常同步巡检（工作流一）第四步；用户想一眼看清上游这次改了啥。
# 注意: 分类为基于提交信息的启发式（conventional commits 关键词匹配），仅供参考；
#       冲突/分叉由 sop_sync_upstream.sh 处理，本脚本只做只读报告，无需 --confirm。
# 记忆映射: 日常同步巡检·第四步（吸收 github-repo-sync 步骤6 的"报告基准点规则"）
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

REPO=""
BASE=""
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; echo "用法: bash sop_sync_report.sh [仓库路径] [合并前tip]"; exit 0 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *) if [ -z "$REPO" ]; then REPO="$a"; else BASE="$a"; fi ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1

# 守卫1: 必须在 main
cur="$(_sop_current_branch)"
if [ "$cur" != "$MAIN_BRANCH" ]; then
  echo "⚠️ 当前分支 [$cur] 非 [$MAIN_BRANCH]。本脚本基于 main 同步生成报告，请先切回 main。"; exit 1
fi
# 守卫2: 需 upstream 远程
if ! "$GIT_BIN" remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  echo "⚠️ 未配置 [$UPSTREAM_REMOTE] 远程，无法生成上游更新报告。"; exit 1
fi

"$GIT_BIN" fetch "$UPSTREAM_REMOTE" >/dev/null 2>&1

# 确定对比基准与范围
BASE_DESC=""
if [ -n "${BASE:-}" ] && "$GIT_BIN" rev-parse --quiet --verify "$BASE" >/dev/null 2>&1; then
  BASE_DESC="$BASE"
  RANGE="$BASE..$UPSTREAM_REMOTE/$MAIN_BRANCH"
else
  BASE_DESC="upstream/$MAIN_BRANCH 最近 20 条（未提供合并前 tip）"
  RANGE="$UPSTREAM_REMOTE/$MAIN_BRANCH"
  LIMIT=20
fi

# 取提交列表：哈希\x1f作者\x1f信息
if [ -n "${LIMIT:-}" ]; then
  commits="$("$GIT_BIN" log "$RANGE" -"$LIMIT" --pretty=format:"%h%x1f%an%x1f%s")"
else
  commits="$("$GIT_BIN" log "$RANGE" --pretty=format:"%h%x1f%an%x1f%s")"
fi

total="$(printf '%s\n' "$commits" | grep -c .)"
if [ "$total" -eq 0 ]; then
  echo "✅ 上游 [$UPSTREAM_REMOTE/$MAIN_BRANCH] 相对基准 [$BASE_DESC] 无新增提交，已是最新。"
  exit 0
fi

# 启发式分类（基于提交信息首词）
feat=(); improve=(); fix=(); breaking=(); other=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  msg="$(printf '%s' "$line" | cut -d $'\x1f' -f3)"
  low="$(printf '%s' "$msg" | tr '[:upper:]' '[:lower:]')"
  case "$low" in
    feat*|feature*|新增*|add*) feat+=("$msg") ;;
    fix*|修复*|bug*) fix+=("$msg") ;;
    perf*|refactor*|优化*|improve*|重构*) improve+=("$msg") ;;
    break*|breaking*|破坏性*) breaking+=("$msg") ;;
    *) other+=("$msg") ;;
  esac
done <<< "$commits"

# 仓库名
repo_name="$("$GIT_BIN" rev-parse --show-toplevel 2>/dev/null)"
repo_name="$(basename "$repo_name")"

# 输出报告
echo "📊 上游更新分析报告"
echo ""
echo "- 仓库：${repo_name:-未知}"
echo "- 同步分支：$MAIN_BRANCH"
echo "- 对比基准：$BASE_DESC"
echo "- 新增提交数：$total 个"
echo "- 更新概要（基于提交信息启发式分类，仅供参考）："
if [ "${#feat[@]}" -gt 0 ]; then IFS='；'; echo "  - 新增功能：${feat[*]}"; else echo "  - 新增功能：无"; fi
if [ "${#improve[@]}" -gt 0 ]; then IFS='；'; echo "  - 改进与优化：${improve[*]}"; else echo "  - 改进与优化：无"; fi
if [ "${#fix[@]}" -gt 0 ]; then IFS='；'; echo "  - Bug 修复：${fix[*]}"; else echo "  - Bug 修复：无"; fi
if [ "${#breaking[@]}" -gt 0 ]; then IFS='；'; echo "  - 破坏性变更：${breaking[*]}"; else echo "  - 破坏性变更：无"; fi
if [ "${#other[@]}" -gt 0 ]; then IFS='；'; echo "  - 其他：${other[*]}"; else echo "  - 其他：无"; fi
echo "- 详细提交记录："
echo "  | 提交哈希 | 作者 | 提交信息 |"
echo "  | :--- | :--- | :--- |"
while IFS=$'\x1f' read -r h a m; do
  [ -z "$h" ] && continue
  echo "  | $h | $a | $m |"
done <<< "$commits"
echo ""
echo "提示：如需更精确分类，可查阅上游仓库的 Release 说明或 CHANGELOG.md。"
