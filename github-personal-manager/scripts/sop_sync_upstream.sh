#!/usr/bin/env bash
# 中文名: 合并上游并推 fork（origin↔upstream 同步）
# 功能: 对齐「永久记忆·日常同步巡检·第二步」origin(fork)↔upstream 决策树：
#   - M=0,K=0 → 已同步；
#   - M=0,K>0 → 自动 merge upstream/main + push origin main；
#   - M>0 → 用 --author 口径查 PR：有 open PR 报「PR 待审」继续；无 PR 报「向 upstream 开 PR」并暂停；
#   - M>0,K>0 → merge-tree 干净则自动合并+推送，冲突则暂停列 A–D。
# 适用场景: fork 仓库跟随上游更新；日常巡检第二步。
# 注意事项: 涉及 merge+push 的公开动作，默认 dry-run；加 --confirm 才执行。冲突一律暂停，绝不自动选。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; echo "用法: bash sop_sync_upstream.sh [仓库路径] [--confirm]"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *) REPO="$a" ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1

# 守卫1: 工作区脏 → 硬停止
if ! _sop_is_clean; then
  echo "⛔ 工作区不干净，已硬停止。请先处理未提交改动。"; "$GIT_BIN" status --porcelain | head -20; exit 1
fi
# 守卫2: 必须在 main
cur="$(_sop_current_branch)"
if [ "$cur" != "$MAIN_BRANCH" ]; then
  echo "⛔ 当前分支 [$cur] 非 [$MAIN_BRANCH]。本脚本只同步 main。请先切回 main。"; exit 1
fi
# 守卫3: 需 upstream 远程
if ! "$GIT_BIN" remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  echo "⛔ 未配置 [$UPSTREAM_REMOTE] 远程，无法执行 upstream 同步。"; exit 1
fi

"$GIT_BIN" fetch "$ORIGIN_REMOTE" "$UPSTREAM_REMOTE" >/dev/null 2>&1
read -r M K <<< "$(_sop_detect_origin_upstream)"
echo "===== 合并上游并推 fork（origin/main ↔ upstream/main）====="
echo "状态: fork领先=M=$M upstream领先=K=$K"

if [ "$M" -eq 0 ] && [ "$K" -eq 0 ]; then
  echo "✅ 已与 upstream 同步，无需操作。"; exit 0
fi

# M>0 → 查 PR（--author 口径）
if [ "$M" -gt 0 ]; then
  if [ -n "$UPSTREAM_REPO" ] && [ -n "$GH_USER" ]; then
    prs="$("$GH_BIN" pr list --repo "$UPSTREAM_REPO" --author "$GH_USER" --state all --json number,state,title,headRefName 2>/dev/null)"
    open_pr="$(printf '%s' "$prs" | grep -o '"state":"OPEN"' | head -1)"
    if [ -n "$open_pr" ]; then
      echo "📋 存在 open PR（PR 待审）。按记忆：继续，不重复开、不覆盖、不暂停。"
    else
      echo "📋 无 open PR。"
      if [ "$K" -gt 0 ]; then
        echo "⚠️ 同时 K>0，PR 可能落后上游，建议 rebase feat 后更新 PR。暂停等指令。"
        exit 0
      fi
      echo "📋 按记忆「问题三」：应向 upstream 开 PR，但暂停等指令，不自动开。"
      exit 0
    fi
  else
    echo "⚠️ 未配置 UPSTREAM_REPO/GH_USER，跳过 PR 核查。按记忆 M>0 需人工判断，暂停等指令。"
    exit 0
  fi
fi

# K>0 → 合并 upstream/main 并推送
if [ "$K" -gt 0 ]; then
  if [ "$M" -gt 0 ]; then
    # M>0,K>0 → 先测冲突
    if ! "$GIT_BIN" merge-tree --write-tree "$ORIGIN_REMOTE/$MAIN_BRANCH" "$UPSTREAM_REMOTE/$MAIN_BRANCH" >/dev/null 2>&1; then
      echo "🔀 合并将产生冲突。按记忆：暂停列 A–D，绝不自动选。"
      echo "  A: 我方为准（保持 fork 领先，回退 upstream 部分）"
      echo "  B: upstream 为准（reset 到 upstream/main，fork 领先将丢）"
      echo "  C: 手动解决冲突后提交"
      echo "  D: 中止不动"
      exit 0
    fi
  fi
  if [ "$CONFIRM" -eq 1 ]; then
    echo "➡️ 执行: git merge $UPSTREAM_REMOTE/$MAIN_BRANCH --no-edit"
    "$GIT_BIN" merge "$UPSTREAM_REMOTE/$MAIN_BRANCH" --no-edit
    echo "➡️ 执行: git push $ORIGIN_REMOTE $MAIN_BRANCH"
    "$GIT_BIN" push "$ORIGIN_REMOTE" "$MAIN_BRANCH"
    echo "✅ 已合并 upstream 并推送 origin/main。"
  else
    echo "[dry-run] 将执行: git merge $UPSTREAM_REMOTE/$MAIN_BRANCH --no-edit && git push $ORIGIN_REMOTE $MAIN_BRANCH （加 --confirm 执行）"
  fi
  exit 0
fi

# 兜底：M>0 但存在 open PR 且 K=0 的情况已 continue 至此，无操作
echo "✅ 处理完成（fork 领先且存在 open PR，保持现状）。"
