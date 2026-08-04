#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_pr_create.sh
# 中文名: 创建合并请求(PR)
#
# 【功能】
#   对齐「永久记忆·标准代码修改·开 PR」流程，按三步执行：
#     1. 守卫校验：当前必须处于非 main 的具名分支（禁止对 main 直接开 PR，禁止分离 HEAD）；
#     2. 推送分支：把当前分支推送到你的远端仓库(origin) 并建立上游跟踪关系；
#     3. 创建 PR：以 gh pr create --fill 自动填充标题与正文，默认目标分支(base) 为 main。
#   工作区若有未提交改动，会给出提醒（PR 只包含已提交内容），但不阻断流程。
#
# 【用途 / 使用场景】
#   1. 标准代码修改工作流最后一步：在 feat/* 分支完成改动并提交后，发起合并请求。
#   2. 向上游仓库贡献代码：配合 --base 指定目标分支，把 fork 的改动提给上游评审。
#   3. 多工作树并行开发：每条特性分支完成后各自开 PR，互不干扰。
#
# 【详细用法】
#   基本用法:
#     bash sop_pr_create.sh                                   # 预览模式(dry-run)，只打印执行计划
#     bash sop_pr_create.sh /path/to/repo                     # 指定仓库根目录，仍为预览模式
#     bash sop_pr_create.sh --base develop                    # 指定目标分支为 develop
#     bash sop_pr_create.sh /path/to/repo --confirm           # 真正推送分支并创建 PR
#     bash sop_pr_create.sh -h                                # 查看本帮助
#
#   参数说明:
#     [仓库路径]      可选。仓库「根目录」（须含 .git）；缺省取当前工作目录。传入子目录会被拒绝。
#     --base <分支>   可选。PR 的目标分支；缺省取配置项 MAIN_BRANCH（通常为 main）。
#     --confirm       真正执行推送与创建 PR。不加则只预览，不产生任何远端副作用。
#     --dry-run       显式声明预览模式（默认行为）。
#     -h|--help       打印本帮助并退出。
#
#   环境变量 / 配置项（取自 config/github-sop.config.sh）:
#     GIT_BIN         git 可执行文件路径
#     GH_BIN          gh 可执行文件路径
#     MAIN_BRANCH     主分支名，同时作为 --base 的默认值
#     ORIGIN_REMOTE   你的远端仓库名（通常为 origin）
#
#   退出码:
#     0  正常完成（打印预览 / 成功创建 PR）
#     1  守卫未通过（当前在 main / 分离 HEAD / 仓库路径非法）
#     2  传入了未知选项
#
# 【注意事项】
#   - 属于公开动作，默认走预览模式(dry-run)，必须显式加 --confirm 才会真正推送与建 PR。
#   - 分支只推送到你的远端仓库(origin)，绝不推送上游仓库(upstream)。
#   - 严守全局硬禁令：本脚本不会对 main 做任何改写历史类操作。
#   - 若 PR 已存在，gh 会给出提示；本脚本不做重复创建的兜底，请按提示自行处理。
#<!--HELP-END-->
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

CONFIRM=0
REPO=""
BASE="$MAIN_BRANCH"
NEED_BASE=0
for a in "$@"; do
  case "$a" in
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
    --confirm) CONFIRM=1 ;;
    --dry-run) CONFIRM=0 ;;
    --base) NEED_BASE=1 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *)
      if [ "$NEED_BASE" = "1" ]; then BASE="$a"; NEED_BASE=0; else REPO="$a"; fi
      ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1

cur="$(_sop_current_branch)"
# 守卫: 顶级禁令 — 不对 main 直接开 PR
if [ "$cur" = "$MAIN_BRANCH" ]; then
  echo "⛔ 当前在 [$MAIN_BRANCH] 分支，禁止直接对 main 开 PR（违反顶级全局禁令）。"
  echo "   请切到你的功能分支(如 feat/<topic>)后再执行本脚本。"
  exit 1
fi
if [ "$cur" = "HEAD" ]; then
  echo "⛔ 当前处于分离 HEAD 状态，无法开 PR。请切到一个具名分支。"; exit 1
fi

echo "===== 开 PR（当前分支: $cur → base: $BASE）====="
if ! _sop_is_clean; then
  echo "⚠️ 工作区有未提交改动；PR 仅包含已提交内容。如需一并提交，请先 commit。"
fi

if [ "$CONFIRM" -eq 1 ]; then
  echo "➡️ 执行: git push -u $ORIGIN_REMOTE $cur"
  "$GIT_BIN" push -u "$ORIGIN_REMOTE" "$cur"
  echo "➡️ 执行: gh pr create --fill --base $BASE"
  "$GH_BIN" pr create --fill --base "$BASE"
  echo "✅ 已创建 PR（head=$cur base=$BASE）。"
else
  echo "[dry-run] 将执行:"
  echo "  git push -u $ORIGIN_REMOTE $cur"
  echo "  gh pr create --fill --base $BASE"
  echo "（加 --confirm 真正执行）"
fi
