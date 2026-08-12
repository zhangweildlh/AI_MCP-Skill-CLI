#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_sync_upstream.sh
# 中文名: 合并上游并推你的远端仓库（你的远端仓库(origin) ↔ 上游仓库(upstream) 同步）
#
# 【功能】
#   对齐「工作流三·日常同步巡检·第二步」的 origin(fork) ↔ upstream 决策树。
#   先统计两个差值：M = 你的 fork 领先上游的提交数，K = 上游领先你的 fork 的提交数，
#   再按四种组合分别处置：
#     - M=0, K=0  → 已同步，无需操作；
#     - M=0, K>0  → 合并 upstream/main 后推送 origin main（需 --confirm）；
#     - M>0       → 以 --author 口径核查 PR：存在 open PR 则报「PR 待审」并继续；
#                   无 open PR 则报「应向上游开 PR」并暂停，不自动开 PR；
#     - M>0, K>0  → 先用 merge-tree 试算：干净则合并并推送，冲突则暂停并列 A–D 选项。
#
# 【用途 / 使用场景】
#   1. 日常同步巡检（工作流三）第二步：让你的 fork 跟随上游仓库的最新更新。
#   2. 提 PR 前的基线对齐：确认 fork 与上游的领先/落后关系，避免 PR 带上陈旧提交。
#   3. 判断是否需要 rebase 特性分支：当 M>0 且 K>0 时脚本会给出明确提示。
#
# 【详细用法】
#   基本用法:
#     bash sop_sync_upstream.sh                          # 预览模式(dry-run)，只打印将执行的动作
#     bash sop_sync_upstream.sh /path/to/repo            # 指定仓库根目录，仍为预览模式
#     bash sop_sync_upstream.sh /path/to/repo --confirm  # 真正执行合并与推送
#     bash sop_sync_upstream.sh -h                       # 查看本帮助
#
#   参数说明:
#     [仓库路径]   可选。仓库「根目录」（须含 .git）；缺省取当前工作目录。传入子目录会被拒绝。
#     --confirm    真正执行合并上游与推送 origin 的动作。不加则只预览，不产生远端副作用。
#     --dry-run    显式声明预览模式（默认行为）。
#     -h|--help    打印本帮助并退出。
#
#   环境变量 / 配置项（取自 config/github-sop.config.sh，运行时会自动补全）:
#     GIT_BIN           git 可执行文件路径
#     GH_BIN            gh 可执行文件路径（用于 PR 核查）
#     MAIN_BRANCH       主分支名（通常为 main）
#     ORIGIN_REMOTE     你的远端仓库名（通常为 origin）
#     UPSTREAM_REMOTE   上游远端名（通常为 upstream）
#     GH_USER           你的 GitHub 用户名；运行时由远端地址自动解析
#     UPSTREAM_REPO     上游仓库 owner/repo；运行时由远端地址自动解析，无需手填
#
#   退出码:
#     0  正常完成（已同步 / 打印预览 / 执行成功 / 已暂停并列出选项）
#     1  守卫未通过（工作区脏 / 当前分支非 main / 未配置 upstream 远端 / 仓库路径非法）
#     2  传入了未知选项
#
# 【注意事项】
#   - 涉及合并与推送的公开动作，默认走预览模式(dry-run)，必须显式加 --confirm 才会执行。
#   - 只推送到你的远端仓库(origin)，绝不推送上游仓库(upstream)。
#   - 冲突一律暂停并列出 A–D 选项，由你决策，脚本自身不会自动选择任何一项。
#   - 运行时通过 _sop_resolve_remotes 解析远端三元组，PR 核查不再依赖配置文件是否手填上游仓库。
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
# 运行时解析远端三元组（origin/upstream 的 owner/repo），补全 GH_USER 与 UPSTREAM_REPO，
# 使 M>0 的 PR 核查不再依赖 config 是否手填 UPSTREAM_REPO，而是直接用仓库实际 upstream 远端。
_sop_resolve_remotes

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

if ! "$GIT_BIN" fetch "$ORIGIN_REMOTE" "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  echo "⚠️ 远端抓取(fetch)失败，以下领先/落后计数可能基于陈旧引用，请核查网络或鉴权。" >&2
fi
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
      echo "📋 存在 open PR（PR 待审）。按本技能规则：继续，不重复开、不覆盖、不暂停。"
    else
      echo "📋 无 open PR。"
      if [ "$K" -gt 0 ]; then
        echo "⚠️ 同时 K>0，PR 可能落后上游，建议 rebase feat 后更新 PR。暂停等指令。"
        exit 0
      fi
      echo "📋 按工作流三规则：应向 upstream 开 PR，但暂停等指令，不自动开。"
      exit 0
    fi
  else
    echo "⚠️ 未检测到 upstream 远端（或 UPSTREAM_REPO 为空），跳过 PR 核查。按工作流三规则 M>0 需人工判断，暂停等指令。"
    echo "   提示：本脚本已尝试从 git remote -v 解析 upstream；若确无 upstream 远端，请按工作流三规则补充上游地址。"
    exit 0
  fi
fi

# K>0 → 合并 upstream/main 并推送
if [ "$K" -gt 0 ]; then
  if [ "$M" -gt 0 ]; then
    # M>0,K>0 → 先测冲突
    if ! "$GIT_BIN" merge-tree --write-tree "$ORIGIN_REMOTE/$MAIN_BRANCH" "$UPSTREAM_REMOTE/$MAIN_BRANCH" >/dev/null 2>&1; then
      echo "🔀 合并将产生冲突。按本技能规则：暂停列 A–D，绝不自动选。"
      echo "  A: 我方为准（保持 fork 领先，回退 upstream 部分）"
      echo "  B: upstream 为准（reset 到 upstream/main，fork 领先将丢）"
      echo "  C: 手动解决冲突后提交"
      echo "  D: 中止不动"
      exit 0
    fi
  fi
  if [ "$CONFIRM" -eq 1 ]; then
    echo "➡️ 执行: git merge $UPSTREAM_REMOTE/$MAIN_BRANCH --no-edit"
    if "$GIT_BIN" merge "$UPSTREAM_REMOTE/$MAIN_BRANCH" --no-edit; then
      echo "➡️ 执行: git push $ORIGIN_REMOTE $MAIN_BRANCH"
      if "$GIT_BIN" push "$ORIGIN_REMOTE" "$MAIN_BRANCH"; then
        echo "✅ 已合并 upstream 并推送 origin/main。"
      else
        echo "⛔ 推送 origin/main 失败（网络/非快进被拒/权限）。合并已在本地完成但未推送，请核查后重试。" >&2
        exit 1
      fi
    else
      echo "⛔ 合并 upstream/main 失败（冲突或本地异常）。请核查后重试。" >&2
      exit 1
    fi
  else
    echo "[dry-run] 将执行: git merge $UPSTREAM_REMOTE/$MAIN_BRANCH --no-edit && git push $ORIGIN_REMOTE $MAIN_BRANCH （加 --confirm 执行）"
  fi
  exit 0
fi

# 兜底：M>0 但存在 open PR 且 K=0 的情况已 continue 至此，无操作
echo "✅ 处理完成（fork 领先且存在 open PR，保持现状）。"
