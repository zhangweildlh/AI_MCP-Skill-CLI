#!/usr/bin/env bash
# 中文名: --no-ff 普通合并（多工作树并行合并·阶段三）
# 功能: 在主仓库把功能分支 --no-ff 合并入 main，生成双父合并碑；含预检（干净/merge-tree 零冲突预测/分支保护核验）+ 合并碑结构验证。
# 适用场景: 工作流七阶段三。合并必须在主仓库目录执行，绝不在 worktree 内。
# 注意事项: 默认 dry-run（打印预测与将执行命令）；加 --confirm 才真正合并。冲突预测有冲突则列文件并暂停，绝不自动解。
# 用法: bash sop_worktree_merge.sh [主仓库路径] --branch <feat/x> [--verify-rollback] [--confirm]
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
BRANCH=""
VERIFY_ROLLBACK=0
NEED_BRANCH=0
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; echo "用法: bash sop_worktree_merge.sh [主仓库路径] --branch <feat/x> [--verify-rollback] [--confirm]"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    --verify-rollback) VERIFY_ROLLBACK=1 ;;
    --branch) NEED_BRANCH=1 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *) if [ "$NEED_BRANCH" = "1" ]; then BRANCH="$a"; NEED_BRANCH=0; else REPO="$a"; fi ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1
# 解析远端三元组（分支保护核验需要 owner/repo）
_sop_resolve_remotes

# 守卫1: 必须在 main
cur="$(_sop_current_branch)"
if [ "$cur" != "$MAIN_BRANCH" ]; then
  echo "⛔ 当前分支 [$cur] 非 [$MAIN_BRANCH]。合并须在 main 执行（绝不在 worktree 内）。"; exit 1
fi
# 守卫2: 工作区干净
if ! _sop_is_clean; then
  echo "⛔ 主仓库工作区不干净，已硬停止。"; "$GIT_BIN" status --porcelain | head -20; exit 1
fi
# 参数校验 + 合并源引用
if [ -z "$BRANCH" ]; then echo "⛔ 必须指定 --branch <feat/x>。"; exit 2; fi
SRC_REF="$ORIGIN_REMOTE/$BRANCH"
if ! "$GIT_BIN" rev-parse --verify "$SRC_REF" >/dev/null 2>&1; then
  if "$GIT_BIN" rev-parse --verify "$BRANCH" >/dev/null 2>&1; then SRC_REF="$BRANCH"; else
    echo "⛔ 未找到分支 [$BRANCH]（本地或 $ORIGIN_REMOTE 远端）。请先推送或确认分支名。"; exit 1
  fi
fi
TIP="$("$GIT_BIN" rev-parse "$SRC_REF")"

"$GIT_BIN" fetch "$ORIGIN_REMOTE" >/dev/null 2>&1

echo "===== --no-ff 普通合并（多工作树并行合并·阶段三）====="
echo "主仓库: $(pwd)  主线: $MAIN_BRANCH  功能分支: $BRANCH (源 $SRC_REF, 尖端 $TIP)"

# 冲突预测
CONFLICT_OUT="$("$GIT_BIN" merge-tree --write-tree "$MAIN_BRANCH" "$SRC_REF" 2>&1)"
if printf '%s' "$CONFLICT_OUT" | grep -qi "CONFLICT"; then
  echo "🔀 merge-tree 预测存在冲突："
  printf '%s\n' "$CONFLICT_OUT" | grep -i "CONFLICT" | head -20
  echo "⛔ 冲突须手动 Edit 解决（禁用 git checkout --ours/--theirs 全量覆盖）；解决后 git add + git commit，或暂停告知用户。本脚本不自动解冲突。"
  exit 0
fi
echo "✅ merge-tree 零冲突预测（干净树）。"

# 分支保护核验（若可解析远端）
REPO_ID="$SOP_ORIGIN_OWNER/$SOP_ORIGIN_REPO"
[ -n "$UPSTREAM_REPO" ] && REPO_ID="$UPSTREAM_REPO"
if [ -n "$REPO_ID" ] && [ "$REPO_ID" != "/" ]; then
  if "$GH_BIN" api "repos/$REPO_ID/branches/$MAIN_BRANCH/protection" >/dev/null 2>&1; then
    echo "⚠️ 主线 [$MAIN_BRANCH] 已开启分支保护，须走 PR 流程合并，不在此直推。暂停等指令。"
    exit 0
  else
    echo "✅ 分支保护核验：主线无保护（404）或可直推（核验失败已降级，请确认）。"
  fi
else
  echo "（无法解析仓库标识，跳过分支保护核验；若 main 受保护请走 PR。）"
fi

if [ "$CONFIRM" -eq 1 ]; then
  echo "➡️ 执行: git merge --no-ff $SRC_REF （双父合并碑，保留中间提交谱系，不改写历史）"
  if "$GIT_BIN" merge --no-ff "$SRC_REF" -m "merge: $BRANCH" -m "来自 $SRC_REF，尖端 $TIP" -m "整段回滚：git revert -m 1 HEAD"; then
    MERGE_HASH="$("$GIT_BIN" rev-parse HEAD)"
    # 合并碑验证（对照矩阵）
    parents="$("$GIT_BIN" cat-file -p HEAD | grep -c '^parent')"
    if "$GIT_BIN" merge-base --is-ancestor "$TIP" HEAD 2>/dev/null; then ancestor=0; else ancestor=1; fi
    if [ "$parents" = "2" ] && [ "$ancestor" = "0" ]; then
      echo "✅ 合并碑双父(parents=$parents)、Tip 可达(ancestor=$ancestor)、谱系保留。合并碑=$MERGE_HASH"
      echo "   随后须补 CHANGELOG 等变更文档（Tier 1 阻断），再 git push origin $MAIN_BRANCH"
    else
      echo "⛔ 合并碑验证失败：parents=$parents ancestor=$ancestor（期望 2 / 0）。请排查是否误用 fast-forward/squash。"
      exit 1
    fi
    # 可选回滚验证
    if [ "$VERIFY_ROLLBACK" -eq 1 ]; then
      if "$GIT_BIN" revert --no-commit -m 1 "$MERGE_HASH" >/dev/null 2>&1; then
        echo "🔍 回滚验证（非破坏性）：git revert --no-commit -m 1 成功，立即 abort 恢复。"
        "$GIT_BIN" revert --abort >/dev/null 2>&1
      else
        echo "⚠️ 回滚验证产生冲突（预期内，可能因阶段四补充提交也改了变更文档）；请按 CHANGELOG Notes 两步回滚。"
        "$GIT_BIN" revert --abort >/dev/null 2>&1
      fi
    fi
  else
    echo "⛔ 合并失败（可能存在未预测冲突），请 git status 查看并手动解决。"; exit 1
  fi
else
  echo "[dry-run] 将执行: git merge --no-ff $SRC_REF （双父合并碑，保留中间提交谱系，不改写历史）"
  echo "   合并后验证: 双父(grep -c '^parent'=2) + Tip 祖先(merge-base --is-ancestor=0)"
  echo "   随后须补 CHANGELOG 等变更文档（Tier 1 阻断），再 git push origin $MAIN_BRANCH"
fi
