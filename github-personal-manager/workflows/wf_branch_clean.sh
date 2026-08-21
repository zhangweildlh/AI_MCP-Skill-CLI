#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: wf_branch_clean.sh
# 中文名: 批量回收已合并的本地分支（一键清理）
# 用途: 把『已合入主线、没用了』的本地分支一次性收拾掉，仓库不再一长串。
# 用法:
#   bash wf_branch_clean.sh [仓库路径]             # 预览：列出将要删哪些，不动手
#   bash wf_branch_clean.sh [仓库路径] --confirm   # 真正删除（GUI 一键按钮一般带这个）
#   bash wf_branch_clean.sh -h                     # 看帮助
# 说明: 运行到『是否真删』这一确认点时，会当场用大白话告诉你
#       「这是什么 / 为什么需要你决策 / 不做的后果 / 安全底线」。
#<!--HELP-END-->
set -uo pipefail
WF_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOP_SELF_DIR="$(cd "$WF_SELF_DIR/../scripts" && pwd)"
# shellcheck disable=SC1091
source "$WF_SELF_DIR/wf_common.sh"
wf_source_common

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
[ -n "$REPO" ] && cd "$REPO" || true
# 解析远端三元组：供下方 gh pr list 安全显式传 --repo（与 P-GPM-1/2 修复后 scripts/ 的统一约定一致）
_sop_resolve_remotes

echo "══════════════════════════════════════════════════"
echo "🧹 批量回收已合并的本地分支 — 仓库：$(pwd)"
echo "══════════════════════════════════════════════════"

# 先让远端跟踪引用变新鲜（这样『已合并』判断最准）
args=("$SOP_SELF_DIR/sop_fetch_prune.sh" "$REPO")
[ "$CONFIRM" -eq 1 ] && args+=(--confirm)
wf_run_step "清理过时远程跟踪引用（让『已合并』判断最准）" "${args[@]}"

# 列出可安全删除的本地分支（已合入主线、非 main、非当前分支）
current="$("$GIT_BIN" rev-parse --abbrev-ref HEAD)"
merged="$("$GIT_BIN" branch --merged "$MAIN_BRANCH" | sed 's/[*+ ]//g' | grep -vE "^$MAIN_BRANCH$" | grep -vE "^$current$")"
candidates=()
for b in $merged; do
  [ -z "$b" ] && continue
  candidates+=("$b")
done

# 跳过仍有未关闭 PR 的分支（gh 可用且能解析出 owner/repo 时才查）
# 与 scripts/（及 SKILL.md 约定）一致：gh 调用一律显式带 --repo，避免依赖 cwd 推断在
# fork 内部 PR / 跨目录场景下误判。仅当能解析出 origin 的 owner/repo 才查，否则跳过（不阻塞清理）。
if command -v "$GH_BIN" >/dev/null 2>&1 && [ -n "${SOP_ORIGIN_REPO:-}" ]; then
  _repo_id="${SOP_ORIGIN_OWNER:-$GH_USER}/$SOP_ORIGIN_REPO"
  open_heads="$("$GH_BIN" pr list --repo "$_repo_id" --state open --json headRefName -q '.[].headRefName' 2>/dev/null | sort -u)"
  filtered=()
  for b in "${candidates[@]}"; do
    if printf '%s\n' "$open_heads" | grep -qx "$b"; then
      echo "  ⏭️  保留 $b（仍有未合并的开放 PR）"
    else
      filtered+=("$b")
    fi
  done
  candidates=("${filtered[@]}")
fi

if [ "${#candidates[@]}" -eq 0 ]; then
  echo "✅ 没有可安全回收的本地分支（都已删，或都还有未合并工作）。"
  exit 0
fi

echo "将回收以下『已合入主线』的本地分支："
for b in "${candidates[@]}"; do echo "  - $b"; done

if [ "$CONFIRM" -ne 1 ]; then
  echo ""
  echo "🔍 [预览] 上面列出的分支『将要被删除』，但还没动手。"
  wf_decide \
    "上面这些本地分支都已经合进主线、没用了，删除它们只是给仓库『瘦身』。" \
    "删除是『写动作』，纯图形界面没有 Agent 替你确认，所以由你拍板是否真删。" \
    "不删只是分支列表长一点、切换时多翻几下，不影响任何功能，也不丢代码。" \
    "只删『已合入主线、非 main、非你当前所在、且没有未关闭 PR』的分支；git 还会用 -d 二次保护仍有未合并提交的分支，绝不删 main、绝不碰网上远端。"
  exit 0
fi

echo ""
for b in "${candidates[@]}"; do
  if "$GIT_BIN" branch -d "$b" 2>/dev/null; then
    echo "✅ 已删本地分支 $b"
  else
    echo "⛔ 删 $b 被 git 拒绝（可能仍含未合并提交，已自动保护）。"
  fi
done
echo ""
echo "✅ 本地分支回收完成。远端分支未动（远端删除属公开动作，请走『多工作树·清理』或手动处理）。"
