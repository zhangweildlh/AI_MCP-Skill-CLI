#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_sync_report.sh
# 中文名: 上游更新结构化报告（只读）
#
# 【功能】
#   以「合并前本地 tip」（可选第二参数）为基准，统计上游仓库(upstream)相对上次同步的新增提交，
#   并输出结构化 Markdown 报告，含五类启发式归类与详细提交记录表：
#     - 新增功能 / 改进与优化 / Bug 修复 / 破坏性变更 / 其他
#     - 详细提交记录表（提交哈希 | 作者 | 提交信息）
#   未提供 tip 时，退化为取 upstream/main 最近 20 条提交作为参考基准
#   （与「报告基准点规则」保持一致）。
#
# 【用途 / 使用场景】
#   1. 日常同步巡检（工作流三）第四步：合并上游后，一眼看清上游这次改了什么。
#   2. 合并前预研：先跑本脚本看清上游改动范围，再决定是否合并、是否需要评估影响面。
#   3. 汇报材料取数：报告为 Markdown 表格格式，可直接粘贴进同步巡检结论。
#
# 【详细用法】
#   基本用法:
#     bash sop_sync_report.sh                         # 对当前目录仓库生成报告（最近 20 条）
#     bash sop_sync_report.sh /path/to/repo           # 指定仓库根目录
#     bash sop_sync_report.sh /path/to/repo abc1234   # 以合并前本地 tip 为精确基准
#     bash sop_sync_report.sh -h                      # 查看本帮助
#
#   参数说明:
#     [仓库路径]   可选。仓库「根目录」（须含 .git）；缺省取当前工作目录。传入子目录会被拒绝。
#     [合并前tip]  可选。任意可被 git rev-parse 解析的引用（提交哈希/分支名/标签）。
#                  提供后对比范围为 <tip>..upstream/main，统计结果最精确。
#     -h|--help    打印本帮助并退出。
#
#   环境变量 / 配置项（取自 config/github-sop.config.sh）:
#     GIT_BIN           git 可执行文件路径
#     MAIN_BRANCH       主分支名（通常为 main）
#     UPSTREAM_REMOTE   上游远端名（通常为 upstream）
#
#   退出码:
#     0  正常输出报告，或上游无新增提交
#     1  守卫未通过（当前分支非 main / 未配置 upstream 远端 / 仓库路径非法）
#     2  传入了未知选项
#
# 【注意事项】
#   - 本脚本为「只读」操作：仅执行 git fetch 与 git log，不改动工作区，无需 --confirm。
#   - 分类为基于提交信息首词的启发式匹配（conventional commits 关键词），仅供参考，
#     精确分类请查阅上游 Release 说明或 CHANGELOG.md。
#   - 冲突 / 双向分叉的处理不属于本脚本职责，请交由 sop_sync_upstream.sh。
#   - 对应 工作流三·第四步（吸收 github-repo-sync 步骤 6 的「报告基准点规则」）。
#<!--HELP-END-->
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

REPO=""
BASE=""
for a in "$@"; do
  case "$a" in
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
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
