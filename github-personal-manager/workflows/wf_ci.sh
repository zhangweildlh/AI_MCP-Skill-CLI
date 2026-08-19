#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: wf_ci.sh
# 中文名: CI 失败排错（看日志 → 看检查 → 重跑）
# 用途: 帮你看 CI 失败日志、查 PR 检查状态；确认代码修好后，再触发 GitHub 重新质检。
# 用法:
#   bash wf_ci.sh [仓库路径]             # 只看日志和检查状态（推荐先这样）
#   bash wf_ci.sh [仓库路径] --confirm   # 看完确认修好了，再重跑
#   bash wf_ci.sh -h                     # 看帮助
# 说明: ①② 只读随便点；③『是否重跑』这一确认点会当场用大白话告诉你
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

echo "══════════════════════════════════════════════════"
echo "🧪 CI 失败排错 — 仓库：$(pwd)"
echo "══════════════════════════════════════════════════"

# ① 看失败日志
wf_run_step "① 看失败日志：是哪一步挂了、报了什么错" \
  "$SOP_SELF_DIR/sop_ci_failed_log.sh" "$REPO"

# ② 看 PR 检查状态
wf_run_step "② 看 PR 检查状态：是测试没过，还是规范不达标" \
  "$SOP_SELF_DIR/sop_pr_checks.sh" "$REPO"

# ③ 重跑 CI（仅 --confirm）
if [ "$CONFIRM" -eq 1 ]; then
  wf_run_step "③ 重跑 CI：让 GitHub 再质检一次" \
    "$SOP_SELF_DIR/sop_ci_rerun.sh" "$REPO" --confirm
else
  echo ""
  echo "🔍 [预览] 第③步『重跑 CI』未执行（它是写动作）。"
  wf_decide \
    "重跑 = 让 GitHub 把你最新提交的代码再自动编译、跑测试一遍（像重新叫一次质检）。" \
    "重跑是『写动作』，纯图形界面没有 Agent 替你确认，所以由你拍板是否触发。" \
    "不重跑只是 CI 还停在旧结果；但若你代码其实已经修好却没重跑，PR 会一直卡在红的状态合不进去。" \
    "先按上面 ① ② 的日志把代码修好并提交，再加 --confirm 点一次本流程，才会真正触发重跑。误点重跑也只是多跑一遍质检，不会丢代码。"
fi
