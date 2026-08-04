#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_worktree_add.sh
# 中文名: 开独立工作树(worktree)，支持多任务并行
#
# 【功能】
#   在主仓库中，基于 main 一次性开出「独立工作树 + 新功能分支」，实现多任务的物理隔离并行开发。
#   工作树是同一个仓库在磁盘上的第二份工作目录，各自 checkout 不同分支，互不干扰。
#   执行 --confirm 时还会做两件配套动作：
#     1. 先拉取你的远端仓库(origin) 最新引用，保证新分支基于最新 main；
#     2. 若工作树根目录位于仓库内部，把它写入本地忽略清单，
#        避免主仓库把工作树目录当成未跟踪文件、导致后续「工作区须干净」守卫误触发。
#
# 【用途 / 使用场景】
#   1. 工作流七「多工作树并行开发 + 普通合并 + 清理」阶段一：为每个任务开一棵独立工作树。
#   2. 同时推进多个特性 / 修复，且各自依赖不同（每棵工作树需独立安装依赖），避免频繁切分支。
#   3. 需要在不打断当前开发的前提下，另起一份干净环境做验证或对照实验。
#
# 【详细用法】
#   基本用法:
#     bash sop_worktree_add.sh --branch feat/login                          # 预览模式(dry-run)
#     bash sop_worktree_add.sh --branch feat/login --confirm                # 真正创建工作树与分支
#     bash sop_worktree_add.sh /path/to/repo --topic login --branch feat/login --confirm
#     bash sop_worktree_add.sh --branch feat/x --worktree-root D:/wt --confirm
#     bash sop_worktree_add.sh -h                                           # 查看本帮助
#
#   参数说明:
#     [主仓库路径]           可选。主仓库「根目录」（须含 .git）；缺省取当前工作目录。传子目录会被拒绝。
#     --branch <feat/x>      必填。要创建的新功能分支名；已存在（本地或远端）时会被拒绝。
#     --topic <topic>        可选。工作树子目录名；缺省取分支名的最后一段。
#     --worktree-root <dir>  可选。工作树根目录；缺省为主仓库下的 .worktrees。
#     --confirm              真正创建工作树。不加则只预览，不改动磁盘。
#     --dry-run              显式声明预览模式（默认行为）。
#     -h|--help              打印本帮助并退出。
#
#   环境变量 / 配置项（取自 config/github-sop.config.sh）:
#     GIT_BIN         git 可执行文件路径
#     MAIN_BRANCH     主分支名，新分支以它为基点
#     ORIGIN_REMOTE   你的远端仓库名（通常为 origin）
#
#   退出码:
#     0  正常完成（打印预览 / 成功创建工作树）
#     1  守卫未通过（当前分支非 main / 工作区脏 / 分支已存在 / 工作树路径已占用 / 创建失败）
#     2  参数错误（未指定 --branch，或传入未知选项）
#
# 【注意事项】
#   - 默认走预览模式(dry-run)，必须显式加 --confirm 才会真正创建。
#   - 四道守卫：主仓库须处于 main 且工作区干净；分支名不得与现有冲突；工作树路径不得已存在；
#     遵循「一分支一工作树」，不同工作树必须检出不同分支。
#   - 每棵工作树是独立的工作目录，依赖需各自安装（例如 node_modules 不共享）。
#   - 合并回主线请回到主仓库执行 sop_worktree_merge.sh，绝不在工作树目录内做合并。
#<!--HELP-END-->
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
TOPIC=""
BRANCH=""
WTROOT=""
NEED_TOPIC=0
NEED_BRANCH=0
NEED_WTROOT=0
for a in "$@"; do
  case "$a" in
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    --topic) NEED_TOPIC=1 ;;
    --branch) NEED_BRANCH=1 ;;
    --worktree-root) NEED_WTROOT=1 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *)
      if [ "$NEED_TOPIC" = "1" ]; then TOPIC="$a"; NEED_TOPIC=0
      elif [ "$NEED_BRANCH" = "1" ]; then BRANCH="$a"; NEED_BRANCH=0
      elif [ "$NEED_WTROOT" = "1" ]; then WTROOT="$a"; NEED_WTROOT=0
      else REPO="$a"; fi
      ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1

# 守卫1: 必须在 main
cur="$(_sop_current_branch)"
if [ "$cur" != "$MAIN_BRANCH" ]; then
  echo "⛔ 当前分支 [$cur] 非 [$MAIN_BRANCH]。开工作树须基于 main，请先切回 main。"; exit 1
fi
# 守卫2: 工作区干净
if ! _sop_is_clean; then
  echo "⛔ 主仓库工作区不干净，已硬停止。请先处理未提交改动。"; "$GIT_BIN" status --porcelain | head -20; exit 1
fi
# 参数校验
if [ -z "$BRANCH" ]; then echo "⛔ 必须指定 --branch <feat/x>。"; exit 2; fi
# 守卫3: 分支不已存在（本地或远端跟踪）
if "$GIT_BIN" show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null || "$GIT_BIN" show-ref --verify --quiet "refs/remotes/$ORIGIN_REMOTE/$BRANCH" 2>/dev/null; then
  echo "⛔ 分支 [$BRANCH] 已存在（本地或 $ORIGIN_REMOTE 远端），请换名或先清理。"; exit 1
fi
# 工作树路径
if [ -z "$TOPIC" ]; then TOPIC="$(basename "$BRANCH")"; fi
WTROOT="${WTROOT:-$(pwd)/.worktrees}"
WTPATH="$WTROOT/$TOPIC"
if [ -e "$WTPATH" ]; then echo "⛔ 工作树路径 [$WTPATH] 已存在，请换 --topic 或 --worktree-root。"; exit 1; fi

echo "===== 开独立工作树（多任务并行）====="
echo "主仓库: $(pwd)"
echo "工作树路径: $WTPATH"
echo "功能分支: $BRANCH （基于 $MAIN_BRANCH）"

if [ "$CONFIRM" -eq 1 ]; then
  "$GIT_BIN" fetch "$ORIGIN_REMOTE" >/dev/null 2>&1
  mkdir -p "$WTROOT"
  # 让主仓库 git status 不把工作树根视为未跟踪：否则阶段三/七的「主仓库须干净」守卫会误触发，
  # 导致本次 add 之后无法合并(merge)/清理(cleanup)。把工作树根（相对仓库根、锚定根目录）写入
  # .git/info/exclude（本地、不入版本库，不影响他人）。仅当工作树根位于仓库内时才写入；
  # 工作树根在仓库外时主仓库本就干净，无需写入。
  _gitdir="$("$GIT_BIN" rev-parse --git-dir 2>/dev/null)"
  _repo_abs="$(pwd -P)"
  _wtroot_abs="$(cd "$WTROOT" 2>/dev/null && pwd -P)"
  if [ -n "$_gitdir" ] && [ -n "$_wtroot_abs" ] && [ -n "$_repo_abs" ] \
     && [ "${_wtroot_abs#$_repo_abs/}" != "$_wtroot_abs" ]; then
    _wtrel="${_wtroot_abs#$_repo_abs/}"
    if [ -f "$_gitdir/info/exclude" ] && ! grep -qxF "/$_wtrel/" "$_gitdir/info/exclude" 2>/dev/null; then
      echo "/$_wtrel/" >> "$_gitdir/info/exclude"
    fi
  fi
  echo "➡️ 执行: git worktree add $WTPATH -b $BRANCH $MAIN_BRANCH"
  if "$GIT_BIN" worktree add "$WTPATH" -b "$BRANCH" "$MAIN_BRANCH"; then
    echo "✅ 已创建工作树。请 cd 至 $WTPATH 开发；每个 worktree 需独立安装依赖。"
    echo "   合并回主线请用: bash scripts/sop_worktree_merge.sh $(pwd) --branch $BRANCH"
  else
    echo "⛔ 创建工作树失败，请检查路径与分支名。"; exit 1
  fi
else
  echo "[dry-run] 将执行: git worktree add $WTPATH -b $BRANCH $MAIN_BRANCH （加 --confirm 真正创建）"
  echo "[dry-run] 预览: 将先拉取 origin 最新、创建目录 $WTROOT、并把工作树根（仓库内时）写入主仓库 .git/info/exclude"
fi
