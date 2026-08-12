#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_ci_rerun.sh
# 中文名: 重跑失败的持续集成(CI)任务
#
# 【功能】
#   取当前仓库最近一次的持续集成(CI) 运行记录(run)，只重跑其中失败的作业(job)。
#   对齐「工作流六·CI 失败排错·重跑」约定：重跑属于公开动作，必须显式确认。
#   若探测不到任何 run（例如当前目录不是 GitHub 仓库或无权限），会给出提示并正常退出。
#
# 【用途 / 使用场景】
#   1. CI 某个作业因网络抖动、缓存失效、依赖源不稳定等环境问题失败，代码本身没问题时重跑验证。
#   2. 修复推送后 CI 仍显示旧的失败结论，需要重新触发以刷新状态。
#   3. CI 排错工作流中，与 sop_ci_failed_log.sh（看失败日志）配套使用：先看日志，再决定是否重跑。
#
# 【详细用法】
#   基本用法:
#     bash sop_ci_rerun.sh                          # 预览模式(dry-run)，只打印将执行的命令
#     bash sop_ci_rerun.sh /path/to/repo            # 指定仓库根目录，仍为预览模式
#     bash sop_ci_rerun.sh /path/to/repo --confirm  # 真正请求重跑失败作业
#     bash sop_ci_rerun.sh -h                       # 查看本帮助
#
#   参数说明:
#     [仓库路径]   可选。仓库「根目录」（须含 .git）；缺省取当前工作目录。传入子目录会被拒绝。
#     --confirm    真正向 GitHub 发起重跑请求。不加则只预览，不产生任何远端副作用。
#     --dry-run    显式声明预览模式（默认行为）。
#     -h|--help    打印本帮助并退出。
#
#   环境变量 / 配置项（取自 config/github-sop.config.sh）:
#     GH_BIN   gh 可执行文件路径
#
#   退出码:
#     0  正常完成（打印预览 / 成功发起重跑 / 未找到 run 时的友好提示）
#     1  守卫未通过（仓库路径非法）
#     2  传入了未知选项
#
# 【注意事项】
#   - 只重跑「失败的作业」，不会重跑整个流水线的全部作业，避免浪费 CI 额度。
#   - 属于公开动作，默认走预览模式(dry-run)，必须显式加 --confirm 才会真正触发。
#   - 本脚本不改动任何分支与提交历史，只调用 GitHub 的重跑接口。
#   - 依赖 gh 在当前仓库目录下的自动仓库探测，不向 --repo 传入完整远端地址
#     （与 sop_pr_checks.sh、sop_ci_failed_log.sh 保持一致的口径）。
#<!--HELP-END-->
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

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
