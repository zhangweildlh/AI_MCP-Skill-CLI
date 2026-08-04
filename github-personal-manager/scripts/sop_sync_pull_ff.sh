#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_sync_pull_ff.sh
# 中文名: 快进拉取 main（本地 ↔ 你的远端仓库(origin) 同步）
#
# 【功能】
#   对齐「永久记忆·日常同步巡检」的本地 ↔ origin 同步策略，按四种状态分别处置：
#     - 工作区脏（有未提交改动） → 硬停止，打印前 20 条脏文件，等你的指令；
#     - 仅落后（本地少于远端）   → 以快进方式拉取 origin main；
#     - 仅领先（本地多于远端）   → 以快进方式推送到 origin main；
#     - 双向分叉（互有对方没有的提交） → 打印 A–E 处置选项并退出，绝不自动改写历史。
#
# 【用途 / 使用场景】
#   1. 日常同步巡检（工作流一）第一步：把本地 main 与你的远端仓库(origin) 对齐。
#   2. 停在特性分支(feat) 且工作区干净、main 有未推送提交时，单独同步 main（不触碰 feat 分支）。
#   3. 开新分支前的准备动作：确保 main 是最新基线，避免后续分支落后。
#
# 【详细用法】
#   基本用法:
#     bash sop_sync_pull_ff.sh                          # 预览模式(dry-run)，只打印将执行的动作
#     bash sop_sync_pull_ff.sh /path/to/repo            # 指定仓库根目录，仍为预览模式
#     bash sop_sync_pull_ff.sh /path/to/repo --confirm  # 真正执行拉取或推送
#     bash sop_sync_pull_ff.sh -h                       # 查看本帮助
#
#   参数说明:
#     [仓库路径]   可选。仓库「根目录」（须含 .git）；缺省取当前工作目录。传入子目录会被拒绝。
#     --confirm    真正执行 git 拉取 / 推送动作。不加则只预览，不产生任何远端副作用。
#     --dry-run    显式声明预览模式（默认行为）；与 --confirm 互斥，后者出现在后面时以后者为准。
#     -h|--help    打印本帮助并退出。
#
#   环境变量 / 配置项（取自 config/github-sop.config.sh）:
#     GIT_BIN         git 可执行文件路径
#     MAIN_BRANCH     主分支名（通常为 main）
#     ORIGIN_REMOTE   你的远端仓库名（通常为 origin）
#
#   退出码:
#     0  正常完成（已同步 / 打印预览 / 执行成功 / 双向分叉已列选项）
#     1  守卫未通过（工作区脏 / 当前分支非 main / 仓库路径非法）
#     2  传入了未知选项
#
# 【注意事项】
#   - 涉及推送的公开动作，默认走预览模式(dry-run)，必须显式加 --confirm 才会真正执行。
#   - 严守全局硬禁令：本脚本只做快进推送，绝不对 main 做强制推送或删除分支的动作。
#   - 遇双向分叉一律暂停并列出 A–E 选项，由你决策，脚本自身不会自动选择任何一项。
#   - 特性分支(feat) 的同步请走 sop_pr_create.sh 的 PR 流程，切勿直接推 main。
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

# 守卫1: 工作区脏 → 硬停止
if ! _sop_is_clean; then
  echo "⛔ 工作区不干净，已硬停止。请先处理未提交改动，再执行同步。"
  "$GIT_BIN" status --porcelain | head -20
  exit 1
fi

# 守卫2: 当前必须在 main（本脚本只同步 main）
cur="$(_sop_current_branch)"
if [ "$cur" != "$MAIN_BRANCH" ]; then
  echo "⛔ 当前分支为 [$cur]，非 [$MAIN_BRANCH]。本脚本只同步 main；请先切回 main 再执行。"
  echo "   （feat 分支的同步请用 sop_pr_create 走 PR 流程，切勿直接推 main。）"
  exit 1
fi

"$GIT_BIN" fetch "$ORIGIN_REMOTE" >/dev/null 2>&1
read -r b a <<< "$(_sop_detect_local_origin)"
echo "===== 快进拉取 main（本地 main ↔ origin/main）====="
echo "状态: 落后=$b 领先=$a"

if [ "$b" -gt 0 ] && [ "$a" -gt 0 ]; then
  echo "🔀 双向分叉（本地与 origin 都有对方没有的提交）。按「永久记忆」策略：暂停，列 A–E，绝不自动处理。"
  echo "  A: 以 origin 为准  → git reset --hard origin/main"
  echo "  B: 以本地为准      → 经 feat 分支走 PR 合入后再同步（禁止强推 main）"
  echo "  C: 合并保留双方    → git merge origin/main"
  echo "  D: 变基            → git rebase origin/main"
  echo "  E: 中止不动"
  echo "请告诉我选哪项（疑似验证残留建议 A，但仍需你确认）。本脚本不会自动执行以上任一操作。"
  exit 0
fi

if [ "$b" -gt 0 ]; then
  if [ "$CONFIRM" -eq 1 ]; then
    echo "➡️ 执行: git pull --ff-only $ORIGIN_REMOTE $MAIN_BRANCH"
    "$GIT_BIN" pull --ff-only "$ORIGIN_REMOTE" "$MAIN_BRANCH"
    echo "✅ 已快进拉取。"
  else
    echo "🔍 [dry-run] 将执行: git pull --ff-only $ORIGIN_REMOTE $MAIN_BRANCH  （加 --confirm 真正执行）"
  fi
  exit 0
fi

if [ "$a" -gt 0 ]; then
  if [ "$CONFIRM" -eq 1 ]; then
    echo "➡️ 执行: git push $ORIGIN_REMOTE $MAIN_BRANCH"
    "$GIT_BIN" push "$ORIGIN_REMOTE" "$MAIN_BRANCH"
    echo "✅ 已推送（快进）。"
  else
    echo "🔍 [dry-run] 将执行: git push $ORIGIN_REMOTE $MAIN_BRANCH  （加 --confirm 真正执行）"
  fi
  exit 0
fi

echo "✅ 已同步（落后=0 领先=0），无需操作。"
