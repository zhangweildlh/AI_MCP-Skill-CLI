#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: wf_pr.sh
# 中文名: 开合并请求(PR) 全套（含两道安全门禁）
# 用途: 把你写好的功能分支安全地推到远端并向原作者发合并请求，动手前先过文档闸门和隐私闸门。
# 用法:
#   bash wf_pr.sh [仓库路径]                        # 预览：跑两道闸门 + 打印将执行的 PR 计划
#   bash wf_pr.sh [仓库路径] --base main            # 指定 PR 要合进的目标分支（默认 main）
#   bash wf_pr.sh [仓库路径] --confirm              # 真正创建 PR（GUI 一键按钮一般带这个）
#   bash wf_pr.sh -h                                # 看帮助
# 说明: 文档/隐私闸门没过、以及『是否真发 PR』的确认点，都会当场用大白话告诉你
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
BASE="$MAIN_BRANCH"
NEED_BASE=0
for a in "$@"; do
  case "$a" in
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
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

echo "══════════════════════════════════════════════════"
echo "📨 开 PR 全套（含两道安全门禁）— 仓库：$(pwd)"
echo "══════════════════════════════════════════════════"

# ① 文档闸门（提交前）：代码改了，文档跟上了吗？
wf_run_step "① 文档闸门：代码改动有没有配套的说明文档要一起存？" \
  "$SOP_SELF_DIR/sop_docs_sync_check.sh" "$REPO"
rc1=$?
if [ "$rc1" -eq 1 ] || [ "$rc1" -eq 2 ]; then
  echo "👆 文档闸门没过：上面列出了需要同步的文档。请先补好文档并提交，"
  echo "   再重新点本流程。（若确认无需文档，可在终端加 --strict 之外的其他方式跳过，但建议补上。）"
  exit 1
fi

# ② 隐私闸门（推送前）：有没有私密文件要泄露？
wf_run_step "② 隐私闸门：有没有密码/密钥/身份证号混进来了？" \
  "$SOP_SELF_DIR/sop_privacy_gate.sh" "$REPO" --base "$ORIGIN_REMOTE/$MAIN_BRANCH" --scope all
rc2=$?
if [ "$rc2" -ne 0 ]; then
  echo "👆 隐私闸门拦下了！上面列出的是疑似私密文件。请先把它们从提交里移除"
  echo "   （或移入 .gitignore），确认干净后再点本流程。这一步绝不为你放行。"
  exit 1
fi

# ③ 开 PR
args=("$SOP_SELF_DIR/sop_pr_create.sh" "$REPO" --base "$BASE")
[ "$CONFIRM" -eq 1 ] && args+=(--confirm)
wf_run_step "③ 开 PR：把功能分支推到你的远端，并向原作者发合并请求（目标分支=$BASE）" "${args[@]}"
echo ""
if [ "$CONFIRM" -ne 1 ]; then
  wf_decide \
    "上面是『将要发出』的合并请求计划：把你的功能分支推到你的远端(origin)，并向原作者申请合进主线。" \
    "发 PR 是『公开动作』，纯图形界面没有 Agent 替你确认，所以由你拍板是否真发。" \
    "不发只是改动停在你本地和你的远端，原作者还看不到；不影响代码安全，只是功能还没提请合并。" \
    "只推到你的远端(origin)，绝不碰上游(upstream)；且前面两道闸门（文档/隐私）没过绝不会走到这一步。想真发就加 --confirm 再点一次。"
fi
echo "✅ PR 流程结束。若第③步只是预览，请加 --confirm 再点一次真正发出。"
