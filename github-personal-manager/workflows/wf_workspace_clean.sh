#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: wf_workspace_clean.sh
# 中文名: 清理工区（一键把杂物安全收起来，可恢复）
# 用途: 把文件夹里『还没正式存进 git 的杂物』收进 stash 临时抽屉，文件夹瞬间变干净且可倒回。
# 用法:
#   bash wf_workspace_clean.sh [仓库路径]             # 预览：列出将要收起哪些，不动手
#   bash wf_workspace_clean.sh [仓库路径] --confirm   # 真正执行（GUI 一键按钮一般带这个）
#   bash wf_workspace_clean.sh -h                     # 看帮助
# 说明: 执行前会先过『隐私闸门』；运行到『是否真收』这一确认点时，会当场用大白话告诉你
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

echo "══════════════════════════════════════════════════"
echo "🧹 清理工区（收进临时抽屉，可恢复）— 仓库：$(pwd)"
echo "══════════════════════════════════════════════════"

# 隐私闸门前置（按技能约定：清理工区前先扫一遍私密）
wf_run_step "隐私闸门：清理前确认没有私密文件混入" \
  "$SOP_SELF_DIR/sop_privacy_gate.sh" "$REPO" --scope all
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "👆 隐私闸门拦下了。请先移除私密文件再清理工区，避免把密钥收进 stash 后思路混乱。"
  exit 1
fi

echo "=== 当前工区状态（预览）==="
echo "--- 未提交的改动（已跟踪文件）---"
"$GIT_BIN" status --porcelain | head -30
echo "--- 会被收起的未跟踪 / 被忽略文件 ---"
"$GIT_BIN" clean -ndx | head -30

if [ "$CONFIRM" -ne 1 ]; then
  echo ""
  echo "🔍 [预览] 上面就是『将要被收起』的杂物，但还没动手。"
  wf_decide \
    "这些是你文件夹里『还没正式存进 git』的东西：改到一半的文件、临时下载的、被忽略的构建垃圾（如 node_modules）。" \
    "收起是『写动作』，纯图形界面没有 Agent 替你确认，所以由你拍板是否执行。" \
    "不收只是文件夹乱一点、切分支可能被 git 拦一下；收起后若你忘了曾有改动，可能一时找不到（但都还在抽屉里）。" \
    "这是『收进临时抽屉(stash)』不是删除——可逆！随时『git stash pop』倒回来；绝不会动你已经正式提交的历史。执行前已过的隐私闸门也保证了密钥不会被误收。"
  exit 0
fi

echo ""
if "$GIT_BIN" stash push -a -m "wf_workspace_clean 自动清理 $(date '+%Y-%m-%d %H:%M')"; then
  echo "✅ 工区已清理（所有改动 / 未跟踪 / 忽略文件已收进 stash）。"
  echo "   想恢复：终端执行  git stash pop"
  echo "   想彻底丢弃收起的内容（谨慎，丢弃不可恢复）：先确认无误后  git stash drop"
else
  echo "⛔ 清理未执行（可能工区本来就是干净的，没有东西可收）。"
fi
