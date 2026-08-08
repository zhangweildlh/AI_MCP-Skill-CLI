#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_worktree_cleanup.sh
# 中文名: 回收工作树与已合并分支（多工作树并行·阶段五/六）
#
# 【功能】
#   站在主线(main) 视角，把已经完成普通合并的功能分支及其工作树整体回收，按四步执行：
#     1. 合并校验：确认功能分支尖端已是当前主线提交的祖先；未合并则硬停止，绝不清理，防止丢提交；
#     2. 工作树回收：自动判定该工作树是「活跃登记」还是「游离残留」，分别用登记接口移除或直接删目录；
#     3. 本地分支回收：使用「仅删已合并分支」的安全删除方式，未合并会被 git 自身拒绝；
#     4. 远端分支回收：属公开动作，脚本会醒目提示，必须显式授权后才执行。
#
# 【用途 / 使用场景】
#   1. 工作流五「多工作树并行开发」阶段五/六：功能分支合入主线后，回收占位的工作树与冗余分支。
#   2. 定期清理仓库：批量收敛长期堆积的已合并特性分支，保持分支列表整洁。
#   3. 清理前的风险评估：不加 --confirm 时可单独用作「将删什么、是否已合并」的预演清单。
#
# 【详细用法】
#   基本用法:
#     bash sop_worktree_cleanup.sh --branch feat/login                       # 预览模式(dry-run)
#     bash sop_worktree_cleanup.sh --branch feat/login --confirm             # 真正执行回收
#     bash sop_worktree_cleanup.sh /path/to/repo --branch feat/login --worktree-path D:/wt/login --confirm
#     bash sop_worktree_cleanup.sh --branch feat/x --discard-uncommitted --confirm  # 授权丢弃未提交内容
#     bash sop_worktree_cleanup.sh -h                                        # 查看本帮助
#
#   参数说明:
#     [主仓库路径]            可选。主仓库「根目录」（须含 .git）；缺省取当前工作目录。传子目录会被拒绝。
#     --branch <feat/x>       必填。待回收的功能分支名。
#     --worktree-path <dir>   可选。工作树目录；缺省由分支名与默认工作树根推断。
#     --discard-uncommitted   可选。授权丢弃工作树内的未提交改动；不加则遇未提交改动直接拒绝移除。
#     --confirm               真正执行回收。不加则只预览，不删除任何东西。
#     --dry-run               显式声明预览模式（默认行为）。
#     -h|--help               打印本帮助并退出。
#
#   环境变量 / 配置项（取自 config/github-sop.config.sh）:
#     GIT_BIN         git 可执行文件路径
#     MAIN_BRANCH     主分支名，作为合并校验的基准
#     ORIGIN_REMOTE   你的远端仓库名（通常为 origin）
#
#   退出码:
#     0  正常完成（打印预览 / 成功回收）
#     1  守卫未通过（当前分支非 main / 主仓库工作区脏 / 未合并 / 工作树含未提交改动且未授权丢弃）
#     2  参数错误（未指定 --branch，或传入未知选项）
#
# 【注意事项】
#   - 清理必须在主仓库的主线上执行，绝不在工作树目录内执行。
#   - 默认走预览模式(dry-run)，必须显式加 --confirm 才会真正删除。
#   - 合并校验不通过一律硬停止，避免误删尚未合入主线的开发成果。
#   - 工作树内若有未提交改动，默认拒绝移除；只有显式加 --discard-uncommitted 才视为授权丢弃。
#     ⚠️ 唯一例外：工作树若已「游离」（gitdir 丢失），git 无法再探测其未提交改动，
#        回收只能走 rm -rf，将无条件删除目录全部内容且不可恢复；
#        --discard-uncommitted 在该路径不提供任何保护。dry-run 会对此情形给出高危提示，
#        请先手工备份该目录，再加 --confirm。
#   - 回收远端分支前，请先在 GitHub 上核对是否仍有处于开放状态的合并请求(PR)（本脚本不自动查询）；
#     开放中的 PR 对应的分支被清理后，该 PR 会被自动关闭。
#   - 本脚本只回收功能分支，不会触碰主线分支本身。
#<!--HELP-END-->
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
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
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

# 先同步远端再做合并校验（关键安全前提）：
#   若 Tip 取自陈旧的远端跟踪引用，合并校验会基于旧 Tip「假通过」，随后 push --delete
#   会无条件删除远端分支（该操作不像 push 有 non-fast-forward 保护），
#   导致远端上尚未合并的新提交丢失。--prune 同时清理远端已消失的跟踪引用。
"$GIT_BIN" fetch "$ORIGIN_REMOTE" --prune >/dev/null 2>&1

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

echo "===== 清理工作树 + 分支（多工作树并行合并·阶段五/六）====="
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
      echo "     ⚠️ 高危：游离状态下 gitdir 已丢失，无法探测该目录内是否存在未提交改动，"
      echo "        rm -rf 将无条件删除目录全部内容且不可恢复（--discard-uncommitted 在此路径不提供保护）。"
      echo "        若该目录可能存有未提交工作，请先手工备份，再加 --confirm。"
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
    echo "   - git branch -d -r $ORIGIN_REMOTE/$BRANCH （远端删除成功后，兜底清理本地远程跟踪引用）"
  fi
  echo "   （加 --confirm 真正清理）"
  exit 0
fi

# ---- --confirm 真正清理 ----
echo "➡️ 执行清理（已获 --confirm 授权）："
# 1. 工作树
if [ "$WT_EXISTS" = "1" ]; then
  if [ "$WT_ORPHAN" = "1" ]; then
    echo "   ⚠️ rm -rf $WTPATH （游离 worktree，gitdir 丢失）"
    echo "      无法探测该目录内的未提交改动，其全部内容将被不可恢复地删除。"
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
    # 兜底清理本地远程跟踪引用（与 MEMORY 第17章 17.14 口径一致；失败忽略）。
    # 置于此处而非本地分支块内：跟踪引用只应在远端分支「确实删除成功」后才回收；
    # 若远端删除失败（无权限等），远端分支仍在，跟踪引用必须保留，否则本地状态失真。
    # 多数 git 版本 push --delete 会自动清理该引用，此处仅作残留兜底。
    "$GIT_BIN" branch -d -r "$ORIGIN_REMOTE/$BRANCH" 2>/dev/null || true
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
