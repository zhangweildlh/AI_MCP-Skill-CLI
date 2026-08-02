#!/usr/bin/env bash
# 中文名: 只读合并状态
# 功能: 输出本地已合并 main 的分支、本地未合并 main 的分支、origin 远程已合并 main 的分支，以及仍挂开放(open) PR 的分支（删除会令 PR 被 GitHub 自动关闭，须先暂停）。
# 适用场景: 分支清理前，先看清哪些分支可安全删除（已合并）、哪些含未完成工作（勿删）、哪些仍挂 open PR（删前须先暂停确认）。
# 注意事项: 纯只读；实际删除分支属不可逆强门禁动作，本脚本不做删除，仅列出状态供你判断。open PR 信息用于反向门禁，防止误删导致 PR 悬空/被关闭。
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

_sop_help() {
  sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  echo "用法: bash sop_branch_merged_status.sh [仓库路径]"
}
case "${1:-}" in
  -h|--help) _sop_help; exit 0 ;;
esac
_sop_require_repo "${1:-}" || exit 1
# M2 修复：遵守 _sop_resolve_remotes 的 return 1 契约，解析失败时跳过 open PR 查询段（本地合并状态仍正常列出）。
if _sop_resolve_remotes; then
  SOP_REMOTES_OK=1
else
  SOP_REMOTES_OK=0
  echo "⚠️ 无法解析 GH_USER（远端三元组解析失败），跳过 open PR 查询段；本地分支合并状态仍正常列出。" >&2
fi

# 查询某仓库仍挂开放(open) PR 的分支（删除源分支会令 PR 被 GitHub 自动关闭，须先暂停）。
# 入参：$1=owner/repo；$2=标签（上游/fork 内部）。仓库为空或查询失败均容错不中断。
# 边界说明：基于 `--author "$GH_USER"` 查询「我创建的 open PR」；若他人以本分支为 head 开了 PR
# （个人 fork 工作流罕见），不在此列——删除前仍需以脚本输出人工核对，不可仅凭本列表判定「无 PR」。
_sop_pr_open_list() {
  local repo="$1" label="$2"
  # M3 修复：守卫强化——repo 为空，或 owner/repo 任一部分缺失（形如 "/" 或 "owner/"），均视为不可解析而跳过，
  # 避免空 owner 时调用畸形 `gh pr list --repo /`。
  if [ -z "$repo" ] || [ -z "${repo%%/*}" ] || [ -z "${repo##*/}" ]; then
    echo "（无 $label 远端或远端解析不完整，跳过 PR 查询）"
    return
  fi
  local out
  if ! out="$("$GH_BIN" pr list --repo "$repo" --author "$GH_USER" --state open 2>/dev/null)"; then
    echo "（查询 $label PR 失败，请手动确认：gh pr list --repo $repo --author $GH_USER --state open）"
    return
  fi
  if [ -z "$out" ]; then
    echo "（无 $label 开放 PR）"
  else
    printf '%s\n' "$out"
  fi
}

echo "===== 只读合并状态 (仓库: $(pwd)) ====="
echo "--- 本地已合并 $MAIN_BRANCH 的分支（可安全删）---"
"$GIT_BIN" branch --merged "$MAIN_BRANCH"
echo "--- 本地未合并 $MAIN_BRANCH 的分支（含未完成工作，勿删）---"
"$GIT_BIN" branch --no-merged "$MAIN_BRANCH"
echo "--- origin 远程已合并 $MAIN_BRANCH 的分支 ---"
"$GIT_BIN" branch -r --merged "$ORIGIN_REMOTE/$MAIN_BRANCH"
echo "--- 仍挂开放(open) PR 的分支（删除会令 PR 被 GitHub 自动关闭，须先暂停）---"
if [ "$SOP_REMOTES_OK" -eq 1 ]; then
  if [ -n "$UPSTREAM_REPO" ]; then
    echo "[上游仓库(upstream): $UPSTREAM_REPO]"
    _sop_pr_open_list "$UPSTREAM_REPO" "上游"
  else
    echo "（无上游仓库(upstream) 远端，跳过 PR 查询）"
  fi
  echo "[fork 内部: $SOP_ORIGIN_OWNER/$SOP_ORIGIN_REPO]"
  _sop_pr_open_list "$SOP_ORIGIN_OWNER/$SOP_ORIGIN_REPO" "fork 内部"
else
  echo "（跳过 PR 查询：远端三元组解析失败）"
fi
echo "⚠️ 以上 open PR 列表中的分支：删除源分支将使对应 PR 被 GitHub 自动标记为 Closed（PR 悬空）。删除前须先合并/关闭 PR，或明确废弃该分支连带关闭 PR，再进入清理。"
