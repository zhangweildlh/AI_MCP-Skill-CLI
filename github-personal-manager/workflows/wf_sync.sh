#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: wf_sync.sh
# 中文名: 日常同步巡检（全套一键走完）
# 用途: 把本地仓库、你的远端(origin)、上游(upstream) 三方对齐，并出更新报告。
# 用法:
#   bash wf_sync.sh [仓库路径]            # 预览：只报告会做什么，不动手
#   bash wf_sync.sh [仓库路径] --confirm  # 真正执行（GUI 按钮一般带这个）
#   bash wf_sync.sh -h                    # 看帮助
# 说明: 运行到需要你拍板的地方（如双向分叉、合并冲突），会当场用大白话告诉你
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
echo "🔄 日常同步巡检（全套）— 仓库：$(pwd)"
echo "══════════════════════════════════════════════════"

# ① 看清现状
wf_run_step "① 看清现状：本地 / 你的远端 / 上游 三方各差多少" \
  "$SOP_SELF_DIR/sop_sync_precheck.sh" "$REPO"
# sop_sync_precheck 是只读，不会停在决策点；若仓库非法会 exit 1 被上面的守卫捕获

# ② 对齐 main（本地 ↔ origin）
args=("$SOP_SELF_DIR/sop_sync_pull_ff.sh" "$REPO")
[ "$CONFIRM" -eq 1 ] && args+=(--confirm)
wf_run_step "② 对齐 main（本地 ↔ 你的远端，只快进）" "${args[@]}"
rc2=$?
if [ "$rc2" -eq 2 ]; then
  echo "👆 第②步需要你拍板（双向分叉）。按上面选项处理完后，再点本流程或单独点『对齐 main』按钮。"
  exit 0
fi
[ "$rc2" -eq 1 ] && exit 1

# ③ 合并上游（origin ↔ upstream）。合并前先记下当前位置，给第④步报告当精确基准
TIP="$(git rev-parse HEAD 2>/dev/null || true)"
args=("$SOP_SELF_DIR/sop_sync_upstream.sh" "$REPO")
[ "$CONFIRM" -eq 1 ] && args+=(--confirm)
wf_run_step "③ 合并上游新内容并推到你的远端" "${args[@]}"
rc3=$?
if [ "$rc3" -eq 2 ]; then
  echo "👆 第③步需要你拍板（冲突或需开 PR）。处理完再继续。"
  exit 0
fi
[ "$rc3" -eq 1 ] && exit 1

# ④ 出报告（把合并前的 TIP 传进去，报告最精确）
wf_run_step "④ 上游更新报告（大白话告诉你改了啥）" \
  "$SOP_SELF_DIR/sop_sync_report.sh" "$REPO" "$TIP"

echo ""
echo "✅ 同步巡检走完。下一步：若你有功能分支要合并，请用『开 PR』流程。"
