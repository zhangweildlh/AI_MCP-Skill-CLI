#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_worktree_merge.sh
# 中文名: 普通合并(--no-ff) 功能分支入主线（多工作树并行·阶段三）
#
# 【功能】
#   在主仓库把功能分支以「普通合并(--no-ff)」方式合入 main，生成双父合并碑(merge commit)，
#   完整保留中间提交谱系、不改写历史，从而支持整段回滚。全流程分四步：
#     1. 预检：当前须在 main、工作区须干净、功能分支须可解析（优先取远端引用）；
#     2. 冲突预测：用 merge-tree 试算，命中冲突则列出文件并暂停，绝不自动解冲突；
#     3. 分支保护核验：主线若已开启分支保护，则提示改走 PR 流程并暂停，不在本地直推；
#     4. 合并碑验证：校验父提交数为 2、功能分支尖端是合并碑的祖先，二者皆通过才算成功。
#   合并信息会自动写入三段：合并说明、来源分支与尖端哈希、整段回滚提示。
#
# 【用途 / 使用场景】
#   1. 工作流七「多工作树并行开发」阶段三：把并行开发完成的功能分支逐条合入主线。
#   2. 需要保留完整开发谱系、且要求「一条合并碑即可整段回滚」的场景。
#   3. 合并前的安全评估：不加 --confirm 时可单独用作冲突与分支保护的预演工具。
#
# 【详细用法】
#   基本用法:
#     bash sop_worktree_merge.sh --branch feat/login                        # 预览模式(dry-run)
#     bash sop_worktree_merge.sh --branch feat/login --confirm              # 真正执行合并
#     bash sop_worktree_merge.sh /path/to/repo --branch feat/login --confirm
#     bash sop_worktree_merge.sh --branch feat/x --verify-rollback --confirm # 合并后附加回滚验证
#     bash sop_worktree_merge.sh -h                                         # 查看本帮助
#
#   参数说明:
#     [主仓库路径]        可选。主仓库「根目录」（须含 .git）；缺省取当前工作目录。传子目录会被拒绝。
#     --branch <feat/x>   必填。待合并的功能分支名；优先使用远端引用，找不到时回退本地分支。
#     --verify-rollback   可选。合并成功后做一次非破坏性回滚演练，随即撤销，用于确认可整段回滚。
#     --confirm           真正执行合并。不加则只预览，不改动仓库。
#     --dry-run           显式声明预览模式（默认行为）。
#     -h|--help           打印本帮助并退出。
#
#   环境变量 / 配置项（取自 config/github-sop.config.sh，运行时会自动补全）:
#     GIT_BIN         git 可执行文件路径
#     GH_BIN          gh 可执行文件路径（用于分支保护核验）
#     MAIN_BRANCH     主分支名
#     ORIGIN_REMOTE   你的远端仓库名（通常为 origin）
#     UPSTREAM_REPO   上游仓库 owner/repo；存在时优先用它核验分支保护
#
#   退出码:
#     0  正常完成（打印预览 / 合并成功 / 因冲突或分支保护而主动暂停）
#     1  守卫未通过（当前分支非 main / 工作区脏 / 分支不存在 / 合并失败 / 合并碑验证不通过）
#     2  参数错误（未指定 --branch，或传入未知选项）
#
# 【注意事项】
#   - 合并必须在主仓库目录执行，绝不在工作树目录内执行。
#   - 默认走预览模式(dry-run)，必须显式加 --confirm 才会真正合并。
#   - 冲突一律交由人工用编辑器逐处解决，禁止用整份取我方/取对方的方式全量覆盖；
#     解决后正常暂存并提交，或暂停告知用户。
#   - 合并后仍需按 Tier 1 文档门禁补齐变更记录(CHANGELOG 等)，再推送主线。
#   - 若合并碑验证提示父提交数不为 2，通常意味着误用了快进合并或压缩合并，须排查后重做。
#<!--HELP-END-->
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
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
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
