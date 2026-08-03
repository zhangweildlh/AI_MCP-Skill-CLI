#!/usr/bin/env bash
# 中文名: 重跑失败 CI
# 功能: 取当前仓库最近的失败 CI run，重跑其中的失败 job。对齐「永久记忆·CI 排错·重跑」：
#       公开动作（重跑 CI）需确认。
# 适用场景: CI 某 job 因环境/抖动失败、代码本身正确，需重跑验证。
# 注意事项: 默认 dry-run，只打印将执行的 gh run rerun 命令；加 --confirm 才真正重跑。
#           绝不自动重跑全部、绝不删除/强推任何分支。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; echo "用法: bash sop_ci_rerun.sh [仓库路径] [--confirm]"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *) REPO="$a" ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1

echo "===== 重跑失败 CI ====="
# 依赖 gh 在当前仓库(已 cd 进目标仓库)的自动探测，不再把完整 remote URL 传给 --repo
# （gh --repo 期望 owner/repo 格式，传完整 URL 可能查不到 run；与 sop_pr_checks / sop_ci_failed_log 保持一致）
runs="$("$GH_BIN" run list --limit 1 --json databaseId,status,conclusion 2>/dev/null)"
id="$(printf '%s' "$runs" | grep -o '"databaseId":[0-9]*' | head -1 | grep -o '[0-9]*')"

if [ -z "$id" ]; then
  echo "未找到最近的 CI run（或当前目录不是 gh 仓库 / 无权限）。"
  echo "[dry-run] 若存在失败 run，将执行: gh run rerun <run-id> --failed  （加 --confirm 真正执行）"
  exit 0
fi

if [ "$CONFIRM" -eq 1 ]; then
  echo "➡️ 执行: gh run rerun $id --failed"
  "$GH_BIN" run rerun "$id" --failed
  echo "✅ 已请求重跑 run #$id 的失败 job。"
else
  echo "[dry-run] 将执行: gh run rerun $id --failed  （加 --confirm 真正执行）"
  echo "  当前 run #$id 状态: $(printf '%s' "$runs" | grep -o '"status":"[A-Z]*"' | head -1)"
fi
