#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: wf_release.sh
# 中文名: 发版前体检 + 生成发版命令（向导式，不自动发版）
# 用途: 先给项目做发版前体检（主线干净、与上游对齐、PR 检查全绿），再生成可复制的发版命令。
# 用法:
#   bash wf_release.sh [仓库路径]                  # 体检 + 出命令（推荐先这样）
#   bash wf_release.sh [仓库路径] --tag v1.2.3 --confirm  # 体检通过后真正打标签 + 发版
#   bash wf_release.sh -h                          # 看帮助
# 说明: 发版是重大公开动作；『是否真发版』这一确认点会当场用大白话告诉你
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
TAG=""
NEED_TAG=0
for a in "$@"; do
  case "$a" in
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    --tag) NEED_TAG=1 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *)
      if [ "$NEED_TAG" = "1" ]; then TAG="$a"; NEED_TAG=0; else REPO="$a"; fi
      ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1
_sop_resolve_remotes

echo "══════════════════════════════════════════════════"
echo "🚀 发版前体检 — 仓库：$(pwd)"
echo "══════════════════════════════════════════════════"

# ① 体检：主线状态 + 上游对齐 + PR 检查
wf_run_step "① 体检：主线是否干净、与上游是否对齐" \
  "$SOP_SELF_DIR/sop_sync_precheck.sh" "$REPO"
wf_run_step "② 体检：PR 检查是否全绿" \
  "$SOP_SELF_DIR/sop_pr_checks.sh" "$REPO"

# ② 生成发版命令（向导式）
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 发版命令（复制粘贴到终端执行；把 v1.2.3 换成你的版本号）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
REPO_ID="${UPSTREAM_REPO:-${SOP_ORIGIN_OWNER:-$GH_USER}/$SOP_ORIGIN_REPO}"
cat <<EOF
  # 第 1 步：在主线上打一个版本标签（标签=版本快照，可随时回到这一刻）
  git tag v1.2.3
  git push origin v1.2.3

  # 第 2 步：用 GitHub 发版（自动以标签名当标题，内容从最近的提交生成）
  gh release create v1.2.3 --repo $REPO_ID --generate-notes
EOF

if [ "$CONFIRM" -eq 1 ]; then
  if [ -z "$TAG" ]; then
    echo "⛔ 加了 --confirm 但没给 --tag <版本号>（如 --tag v1.2.3），不发版。"
    exit 2
  fi
  # 守卫：必须在 main 且干净
  cur="$("$GIT_BIN" rev-parse --abbrev-ref HEAD)"
  if [ "$cur" != "$MAIN_BRANCH" ]; then echo "⛔ 必须在 main 分支发版，当前在 $cur。"; exit 1; fi
  if ! _sop_is_clean; then echo "⛔ 工作区不干净，先提交/清理再发版。"; "$GIT_BIN" status --porcelain | head; exit 1; fi
  echo "➡️ 真正发版：$TAG"
  "$GIT_BIN" tag "$TAG" && "$GIT_BIN" push "$ORIGIN_REMOTE" "$TAG" \
    && "$GH_BIN" release create "$TAG" --repo "$REPO_ID" --generate-notes \
    && echo "✅ 已发版 $TAG" \
    || echo "⛔ 发版失败（网络/权限/标签已存在）。请核查后重试。"
else
  echo ""
  echo "🔍 [预览] 发版命令已生成，但尚未执行。"
  wf_decide \
    "发版 = 给项目打一个『正式版本』标签(vX.Y.Z)并写更新说明，相当于对外发布一个正式版本，所有人都能看到、能下载。" \
    "发版是『重大公开动作』，纯图形界面没有 Agent 替你确认，所以由你拍板是否真发。" \
    "不发只是多一个本地标签计划；若带病发版（主线有脏改动或 CI 还红），用户装上会崩，损害信誉且要紧急修复。" \
    "默认只『生成命令』不执行；体检全绿、版本号想好了，加 --tag v1.2.3 --confirm 再点一次才真发。误发也只是多一个版本标签，可后续处理。"
fi
