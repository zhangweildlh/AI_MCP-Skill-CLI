#!/usr/bin/env bash
# 中文名: 快进拉取 main（本地↔origin 同步）
# 功能: 对齐「永久记忆·日常同步巡检」本地↔origin 策略：
#   - 工作区脏 → 硬停止，等指令；
#   - 仅落后 → pull --ff-only origin main；
#   - 仅领先 → push origin main（快进）；
#   - 双向分叉 → 打印 A–E 选项并退出，绝不自动 reset/merge/rebase。
# 适用场景: 在 main 上做日常同步；或停在 feat 干净、有未推送提交时同步 main（不碰 feat）。
# 注意事项: 涉及 push 的公开动作，默认只打印将执行的操作（dry-run）；加 --confirm 才真正执行。
#   绝不出现强推/删除 main；遇双向分叉一律暂停，由你决策。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; echo "用法: bash sop_sync_pull_ff.sh [仓库路径] [--confirm]"; exit 0 ;;
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
