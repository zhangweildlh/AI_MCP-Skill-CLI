#!/usr/bin/env bash
# 中文名: 清理工作树 + 分支（多工作树并行合并·阶段七）
# 功能: 在主线(main)把已 --no-ff 合并的功能分支的 worktree 与分支回收。
#   校验已合并(merge-base --is-ancestor <Tip> HEAD=0)；自动判定活跃(git worktree remove)/游离(rm -rf);
#   删本地分支(小写 -d 仅删已合并);删远端分支(公开动作,需 --confirm 授权)。
# 适用场景: 工作流七阶段七。与主仓库的 add/merge 脚本同属一个工作流。
# 注意事项: 默认 dry-run（列出将删工作树 + 本地/远端分支、判定活跃/游离、合并校验结论）；加 --confirm 才真正清理。
#   删远端分支属公开动作，脚本内醒目提示「⚠️ 公开动作」；合并校验失败则硬停止，绝不清理未合并工作以防丢提交。
#   工作树含未提交改动时默认拒绝移除（--force 会丢弃未提交内容）；须显式加 --discard-uncommitted 才授权丢弃。
#   删除分支前请先在 GitHub 核对 open PR（本脚本不自动查询）；open PR 仍开放的分支被清理会使对应 PR 被自动关闭。
# 用法: bash sop_worktree_cleanup.sh [主仓库路径] --branch <feat/x> [--worktree-path <dir>] [--confirm]
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
BRANCH=""
WTPATH=""
DISCARD=0
NEED_BRANCH=0
NEED_WTPATH=0
for a in "$@"; do
  case "$a" in
    -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; echo "用法: bash sop_worktree_cleanup.sh [主仓库路径] --branch <feat/x> [--worktree-path <dir>] [--confirm] [--discard-uncommitted]"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    --discard-uncommitted) DISCARD=1 ;;
    --branch) NEED_BRANCH=1 ;;
    --worktree-path) NEED_WTPATH=1 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *)
      if [ "$NEED_BRANCH" = "1" ]; then BRANCH="$a"; NEED_BRANCH=0
      elif [ "$NEED_WTPATH" = "1" ]; then WTPATH="$a"; NEED_WTPATH=0
      else REPO="$a"; fi
      ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1

# 守卫1: 必须在 main（清理须在主线视角下判断合并与删分支，绝不在 worktree 内执行）
cur="$(_sop_current_branch)"
if [ "$cur" != "$MAIN_BRANCH" ]; then
  echo "⛔ 当前分支 [$cur] 非 [$MAIN_BRANCH]。清理须在 main 执行（绝不在 worktree 内）。"; exit 1
fi
# 守卫2: 工作区干净
if ! _sop_is_clean; then
  echo "⛔ 主仓库工作区不干净，已硬停止。请先处理未提交改动。"; "$GIT_BIN" status --porcelain | head -20; exit 1
fi
# 参数校验
if [ -z "$BRANCH" ]; then echo "⛔ 必须指定 --branch <feat/x>。"; exit 2; fi

# 解析 TIP（功能分支尖端）：优先本地分支，其次远端跟踪分支，再次 worktree 当前 HEAD
TIP=""
if "$GIT_BIN" rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  TIP="$("$GIT_BIN" rev-parse "$BRANCH")"
elif "$GIT_BIN" rev-parse --verify "$ORIGIN_REMOTE/$BRANCH" >/dev/null 2>&1; then
  TIP="$("$GIT_BIN" rev-parse "$ORIGIN_REMOTE/$BRANCH")"
elif [ -n "$WTPATH" ] && "$GIT_BIN" -C "$WTPATH" rev-parse HEAD >/dev/null 2>&1; then
  TIP="$("$GIT_BIN" -C "$WTPATH" rev-parse HEAD)"
fi
if [ -z "$TIP" ]; then
  echo "⛔ 无法定位分支 [$BRANCH] 的尖端(Tip)：本地/远端分支均不存在，且未提供有效工作树路径。请确认分支名或加 --worktree-path。"
  exit 1
fi

# 合并校验：Tip 须可达主线 HEAD（merge-base --is-ancestor = 0）；否则硬停止，拒绝清理未合并工作
if "$GIT_BIN" merge-base --is-ancestor "$TIP" HEAD 2>/dev/null; then
  echo "✅ 合并校验通过：Tip($TIP) 已并入主线 HEAD（merge-base --is-ancestor=0）。"
else
  echo "⛔ 合并校验失败：Tip($TIP) 尚未并入主线 HEAD（merge-base --is-ancestor≠0）。该分支仍有未合并工作，拒绝清理以防丢失提交。请先 --no-ff 合并后再清理。"
  exit 1
fi

# 自动探测 worktree 路径（用户未显式提供时）：从 git worktree list 找 checkout 了该分支的 worktree
if [ -z "$WTPATH" ]; then
  WTPATH="$("$GIT_BIN" worktree list --porcelain | awk -v br="refs/heads/$BRANCH" '
    /^worktree /{wt=substr($0, index($0, " ")+1)}
    /^branch /{ if($2==br) print wt }')"
fi

# 判定 worktree 状态：存在 / 干净 / 活跃或游离（gitdir 丢失）
WT_EXISTS=0
WT_DIRTY=0
WT_ORPHAN=0
if [ -n "$WTPATH" ] && [ -e "$WTPATH" ]; then
  WT_EXISTS=1
  if [ -n "$("$GIT_BIN" -C "$WTPATH" status --porcelain 2>/dev/null)" ]; then WT_DIRTY=1; fi
  # 游离判定：worktree 的 .git 文件指向的 gitdir 是否还存在（丢失则为游离，须 rm -rf）
  # git 默认将 gitdir 写成绝对路径（如 D:/.../mainrepo/.git/worktrees/<name>），直接判定存在性
  if [ -f "$WTPATH/.git" ]; then
    gdir="$(sed 's/^gitdir: //' "$WTPATH/.git")"
    if [ ! -e "$gdir" ]; then WT_ORPHAN=1; fi
  fi
fi

# 本地/远端分支存在性
LOCAL_BRANCH_EXISTS=0
if "$GIT_BIN" show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then LOCAL_BRANCH_EXISTS=1; fi
REMOTE_BRANCH_EXISTS=0
if "$GIT_BIN" show-ref --verify --quiet "refs/remotes/$ORIGIN_REMOTE/$BRANCH" 2>/dev/null; then REMOTE_BRANCH_EXISTS=1; fi

echo "===== 清理工作树 + 分支（多工作树并行合并·阶段七）====="
echo "主仓库: $(pwd)  主线: $MAIN_BRANCH  功能分支: $BRANCH"
echo "合并校验: Tip=$TIP 已并入主线"
echo "工作树: ${WTPATH:-（无，可能已手动移除）}  存在=$WT_EXISTS  状态=$([ "$WT_DIRTY" = "1" ] && echo 脏 || echo 干净)  判定=$([ "$WT_ORPHAN" = "1" ] && echo 游离 || echo 活跃)"
echo "本地分支[$BRANCH]: $([ "$LOCAL_BRANCH_EXISTS" = "1" ] && echo 存在待删 || echo 不存在)"
echo "远端分支[$ORIGIN_REMOTE/$BRANCH]: $([ "$REMOTE_BRANCH_EXISTS" = "1" ] && echo 存在待删-公开动作 || echo 不存在)"

if [ "$CONFIRM" -ne 1 ]; then
  echo "[dry-run] 将执行:"
  if [ "$WT_EXISTS" = "1" ]; then
    if [ "$WT_ORPHAN" = "1" ]; then
      echo "   - rm -rf $WTPATH + git worktree prune （游离 worktree，gitdir 丢失）"
    elif [ "$WT_DIRTY" = "1" ] && [ "$DISCARD" -ne 1 ]; then
      echo "   - git worktree remove $WTPATH （⚠️ 含未提交改动，需加 --discard-uncommitted 才移除，否则拒绝以防丢失）"
    else
      echo "   - git worktree remove --force $WTPATH （$([ "$WT_DIRTY" = "1" ] && echo 含未提交改动-已授权丢弃 || echo 干净)）"
    fi
  else
    echo "   - （工作树不存在，跳过移除）"
  fi
  echo "   - ⚠️ 提醒：删除分支前请先在 GitHub 确认该分支无未关闭的 open PR（本脚本不自动查询）。"
  [ "$LOCAL_BRANCH_EXISTS" = "1" ] && echo "   - git branch -d $BRANCH （小写 -d 仅删已合并）"
  if [ "$REMOTE_BRANCH_EXISTS" = "1" ]; then
    echo "   - git push --delete $ORIGIN_REMOTE $BRANCH （⚠️ 公开动作：删除远端分支，须 --confirm 授权）"
  fi
  echo "   （加 --confirm 真正清理）"
  exit 0
fi

# ---- --confirm 真正清理 ----
echo "➡️ 执行清理（已获 --confirm 授权）："
# 1. 工作树
if [ "$WT_EXISTS" = "1" ]; then
  if [ "$WT_ORPHAN" = "1" ]; then
    echo "   rm -rf $WTPATH （游离 worktree，gitdir 丢失）"
    rm -rf "$WTPATH"
    "$GIT_BIN" worktree prune >/dev/null 2>&1
  else
    if [ "$WT_DIRTY" = "1" ] && [ "$DISCARD" -ne 1 ]; then
      echo "⛔ 工作树 [$WTPATH] 含未提交改动，--force 将丢弃未提交内容。拒绝移除（加 --discard-uncommitted 显式授权丢弃未提交改动，以防丢失）。"
      echo "   （本次清理中止：未移除工作树、未删除分支，以免丢失未提交改动。请先提交/储藏改动后再清理。）"
      exit 1
    fi
    if [ "$WT_DIRTY" = "1" ]; then
      echo "   git worktree remove --force $WTPATH （⚠️ 含未提交改动，--discard-uncommitted 已授权丢弃）"
    else
      echo "   git worktree remove --force $WTPATH"
    fi
    if ! "$GIT_BIN" worktree remove --force "$WTPATH" 2>/dev/null; then
      echo "   （worktree remove 失败，回退 rm -rf + prune）"
      rm -rf "$WTPATH"
      "$GIT_BIN" worktree prune >/dev/null 2>&1
    fi
  fi
  echo "✅ 工作树已移除"
fi
# 2. 本地分支（小写 -d 仅删已合并；若有残留未合并则拒绝，安全）
if [ "$LOCAL_BRANCH_EXISTS" = "1" ]; then
  echo "   git branch -d $BRANCH"
  if "$GIT_BIN" branch -d "$BRANCH" >/dev/null 2>&1; then
    echo "✅ 本地分支已删"
  else
    echo "⚠️ 本地分支 [$BRANCH] 删除被拒（可能仍有未合并提交），请核查。"
  fi
fi
# 3. 远端分支（公开动作，醒目提示）
if [ "$REMOTE_BRANCH_EXISTS" = "1" ]; then
  echo "   ⚠️ 公开动作：git push --delete $ORIGIN_REMOTE $BRANCH"
  if "$GIT_BIN" push --delete "$ORIGIN_REMOTE" "$BRANCH" >/dev/null 2>&1; then
    echo "✅ 远端分支已删"
  else
    echo "⚠️ 远端分支删除失败（可能无权限或已删除），请手动核查。"
  fi
fi

# 删后校验：提交未丢失（Tip 仍可达主线 HEAD）
if "$GIT_BIN" merge-base --is-ancestor "$TIP" HEAD 2>/dev/null; then
  echo "✅ 删后校验：Tip($TIP) 仍可达主线 HEAD，提交未丢失。"
else
  echo "⛔ 删后校验异常：Tip 不再可达 main，疑似误删未合并提交！请立即核查。"
  exit 1
fi
echo "🎉 清理完成（工作树 + 本地/远端分支回收，提交已安全保留于主线）。"
