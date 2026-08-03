#!/usr/bin/env bash
# 中文名: 开 PR（向 upstream 提 PR）
# 功能: 对齐「永久记忆·标准代码修改·开 PR」：守卫「当前非 main 分支」，推送当前分支到 origin，
#       再以 --fill 创建 PR（默认 base=main）。公开动作需确认。
# 适用场景: 在 feat/* 分支完成改动后，向 main（或上游）发起合并请求。
# 注意事项: 默认 dry-run，只打印将执行的 push + gh pr create 计划；加 --confirm 才真正执行。
#           绝不对 main 直接开 PR；绝不出现强推/删除 main。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
BASE="$MAIN_BRANCH"
NEED_BASE=0
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; echo "用法: bash sop_pr_create.sh [仓库路径] [--base <分支>] [--confirm]"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    --base) NEED_BASE=1 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *)
      if [ "$NEED_BASE" = "1" ]; then BASE="$a"; NEED_BASE=0; else REPO="$a"; fi
      ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1

cur="$(_sop_current_branch)"
# 守卫: 顶级禁令 — 不对 main 直接开 PR
if [ "$cur" = "$MAIN_BRANCH" ]; then
  echo "⛔ 当前在 [$MAIN_BRANCH] 分支，禁止直接对 main 开 PR（违反顶级全局禁令）。"
  echo "   请切到你的功能分支(如 feat/<topic>)后再执行本脚本。"
  exit 1
fi
if [ "$cur" = "HEAD" ]; then
  echo "⛔ 当前处于分离 HEAD 状态，无法开 PR。请切到一个具名分支。"; exit 1
fi

echo "===== 开 PR（当前分支: $cur → base: $BASE）====="
if ! _sop_is_clean; then
  echo "⚠️ 工作区有未提交改动；PR 仅包含已提交内容。如需一并提交，请先 commit。"
fi

if [ "$CONFIRM" -eq 1 ]; then
  echo "➡️ 执行: git push -u $ORIGIN_REMOTE $cur"
  "$GIT_BIN" push -u "$ORIGIN_REMOTE" "$cur"
  echo "➡️ 执行: gh pr create --fill --base $BASE"
  "$GH_BIN" pr create --fill --base "$BASE"
  echo "✅ 已创建 PR（head=$cur base=$BASE）。"
else
  echo "[dry-run] 将执行:"
  echo "  git push -u $ORIGIN_REMOTE $cur"
  echo "  gh pr create --fill --base $BASE"
  echo "（加 --confirm 真正执行）"
fi
