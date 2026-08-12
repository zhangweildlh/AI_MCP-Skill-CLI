#!/usr/bin/env bash
#<!--HELP-START-->
# 脚本名: sop_status_all.sh
# 中文名: 批量巡检目录树（multi-git-status 思路移植）
#
# 【功能】
#   一键扫描 REPO_ROOT（默认 D:/Documents/AI_Work_Temp）下所有 fork 仓库，
#   汇总每个仓库的「落后 / 领先 / 工作区脏 / 未推送」状态，输出结构化中文总览，
#   解决 7 个 fork 逐个巡检繁琐的问题。每个仓库输出一行：路径、落后数、领先数、
#   工作区是否脏、是否有未推送提交。
#
# 【用途 / 使用场景】
#   日常巡检所有 fork 仓库的同步态势，快速看清哪些仓库落后上游、哪些有未提交改动、
#   哪些有本地提交尚未推送。只读、零副作用，是批量体检的起点。
#
# 【详细用法】
#   bash sop_status_all.sh [--root <目录>] [--fetch] [--confirm] [--help]
#
#   参数说明:
#     --root <目录>   覆盖 REPO_ROOT，扫描该目录下的第一级子目录。
#                     默认值：D:/Documents/AI_Work_Temp
#     --fetch         尝试联网抓取（git fetch）以刷新远端跟踪引用。
#                     默认【不抓取，不联网】；只基于本地已有引用汇报。
#                     单独使用为 dry-run：仅打印「将对 X 执行 git fetch」，不真正执行。
#     --confirm       与 --fetch 配合，才真正执行 git fetch。
#                     缺少 --fetch 时 --confirm 被忽略并给出提示。
#     -h, --help      打印本帮助并以状态码 0 退出。
#
#   退出码: 0=巡检完成；1=REPO_ROOT 不存在或无法访问。
#
#   使用示例:
#     bash sop_status_all.sh
#     bash sop_status_all.sh --root D:/Documents/AI_Work_Temp
#     bash sop_status_all.sh --fetch            # 仅打印将抓取什么，不联网
#     bash sop_status_all.sh --fetch --confirm  # 真正联网刷新各仓库远端引用
#
# 【注意事项】
#   - 纯只读、零副作用：仅做本地状态汇报；绝不 push 到任何远端。
#   - dry-run 优先：涉及联网 fetch 的动作默认只打印将执行什么，加 --confirm 才真正执行。
#   - 默认不 fetch（不联网），仅当显式 --fetch 才尝试联网；远端引用陈旧时建议 --fetch --confirm。
#   - 复用 scripts/lib/sop-common.sh 的状态探测逻辑，不重复实现配置加载与状态探测。
#   - 扫描前先确认 REPO_ROOT 存在；对每个候选子目录先确认含 .git 才是 git 仓库，
#     跳过非仓库目录；自动排除 .mimocode / .workbuddy 目录。
#<!--HELP-END-->
set -uo pipefail

# 第一步：计算脚本自身目录（_sop_load_config 依赖它定位仓库根）
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 第二步：载入公共函数库（配置加载 / 工具探测 / 仓库守卫 / 状态探测）
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
# 第三步：加载配置（读取 config/github-sop.config.sh，补全默认值，探测 git/gh）
_sop_load_config

# ---------------------------------------------------------------------------
# 参数解析
# ---------------------------------------------------------------------------
REPO_ROOT_DEFAULT="D:/Documents/AI_Work_Temp"
REPO_ROOT="${REPO_ROOT:-$REPO_ROOT_DEFAULT}"
FETCH=0
CONFIRM=0

while [ $# -gt 0 ]; do
  case "$1" in
    --root)
      [ $# -ge 2 ] || { echo "错误：--root 需要一个目录参数。" >&2; exit 1; }
      REPO_ROOT="$2"; shift 2 ;;
    --fetch)  FETCH=1; shift ;;
    --confirm) CONFIRM=1; shift ;;
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
    *)
      echo "错误：未知参数 $1（使用 --help 查看用法）。" >&2
      exit 1 ;;
  esac
done

# --confirm 必须与 --fetch 配合才有意义
if [ "$CONFIRM" -eq 1 ] && [ "$FETCH" -eq 0 ]; then
  echo "提示：--confirm 仅在配合 --fetch 时生效，本次未指定 --fetch，将跳过抓取。"
fi

# ---------------------------------------------------------------------------
# 路径核验：REPO_ROOT 必须存在
# ---------------------------------------------------------------------------
if [ ! -d "$REPO_ROOT" ]; then
  echo "错误：REPO_ROOT 不存在或不可访问：$REPO_ROOT" >&2
  echo "   请检查路径，或用 --root <目录> 指定正确的仓库根目录。" >&2
  exit 1
fi

# 绝对化 REPO_ROOT：find 输出绝对路径，且 process_repo 会 cd 进子目录后再 cd 回 REPO_ROOT，
# 若 REPO_ROOT 为相对路径，从子目录回 cd 会解析失败（BUG）。此处统一转绝对，避免该隐患。
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"

# 排除列表（逗号分隔的目录名）
EXCLUDE=".mimocode,.workbuddy"

# 模式描述
if [ "$FETCH" -eq 1 ]; then
  if [ "$CONFIRM" -eq 1 ]; then
    MODE_DESC="抓取并刷新远端引用（git fetch 已真正执行）"
  else
    MODE_DESC="抓取 dry-run（仅打印将对各仓库执行的 git fetch，不联网）"
  fi
else
  MODE_DESC="仅本地状态（未抓取，不联网；远端引用可能陈旧）"
fi

echo "===== 批量巡检目录树 (REPO_ROOT: $REPO_ROOT) ====="
echo "模式: $MODE_DESC"
echo "--- 仓库状态总览 ---"

# 计数器
SCAN_COUNT=0
DIRTY_COUNT=0
UNPUSHED_COUNT=0
BEHIND_COUNT=0
AHEAD_COUNT=0
SKIP_COUNT=0

# 处理单个仓库：进入目录 -> 探测 -> （可选抓取）-> 返回 REPO_ROOT
process_repo() {
  local dir="$1"
  local rel="${dir#"$REPO_ROOT"/}"

  # 路径核验：先确认含 .git 才是 git 仓库，否则跳过并提示
  if ! command ls -d "$dir/.git" >/dev/null 2>&1; then
    echo "  · 跳过（非 git 仓库目录）：$rel"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    return 0
  fi
  if ! cd "$dir" 2>/dev/null; then
    echo "  · 跳过（无法进入目录）：$rel"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    return 0
  fi

  # 复用公共库状态探测逻辑（不重复实现）
  local behind ahead dirty unpushed
  read -r behind ahead <<< "$(_sop_detect_local_origin)"
  behind="${behind:-0}"; ahead="${ahead:-0}"
  # 未推送提交数 = 本地领先 origin 的提交数（与 _sop_detect_local_origin 的 ahead 同源，复用不重复计算）
  unpushed="$ahead"
  if _sop_is_clean; then dirty=0; else dirty=1; fi

  # 抓取处理：默认不抓取；--fetch 单独为 dry-run；--fetch --confirm 才真正执行
  if [ "$FETCH" -eq 1 ]; then
    if [ "$CONFIRM" -eq 1 ]; then
      echo "  (fetch) 正在对 $rel 执行 git fetch ..."
      # 抓取所有已配置远端，刷新 origin/main 与 upstream/main 跟踪引用
      if "$GIT_BIN" fetch --quiet 2>/dev/null; then
        # 抓取后重新探测落后/领先，使汇报反映最新远端状态
        read -r behind ahead <<< "$(_sop_detect_local_origin)"
        behind="${behind:-0}"; ahead="${ahead:-0}"
        unpushed="$ahead"
      else
        echo "  (fetch) 警告：$rel 抓取失败（可能无网络或远端不可达），沿用本地已有引用。" >&2
      fi
    else
      echo "  (dry-run) 将对 $rel 执行: git fetch（不联网，未真正执行）"
    fi
  fi

  # 输出该仓库一行结构化总览
  local dirty_txt unpushed_txt
  [ "$dirty" -eq 1 ] && dirty_txt="脏" || dirty_txt="干净"
  [ "$unpushed" -gt 0 ] && unpushed_txt="${unpushed}笔" || unpushed_txt="无"
  echo "[$(($SCAN_COUNT + 1))] $rel  落后=$behind 领先=$ahead 工作区=$dirty_txt 未推送=$unpushed_txt"

  # 汇总计数
  SCAN_COUNT=$((SCAN_COUNT + 1))
  [ "$dirty" -eq 1 ] && DIRTY_COUNT=$((DIRTY_COUNT + 1))
  [ "$unpushed" -gt 0 ] && UNPUSHED_COUNT=$((UNPUSHED_COUNT + 1))
  [ "$behind" -gt 0 ] && BEHIND_COUNT=$((BEHIND_COUNT + 1))
  [ "$ahead" -gt 0 ] && AHEAD_COUNT=$((AHEAD_COUNT + 1))

  # 返回 REPO_ROOT，避免污染后续循环的 cwd
  cd "$REPO_ROOT" || exit 1
}

# 遍历 REPO_ROOT 下第一级子目录（含点目录，再用排除列表过滤）
while IFS= read -r -d '' sub; do
  name="$(basename "$sub")"
  # 排除 .mimocode / .workbuddy
  case ",$EXCLUDE," in
    *",$name,"*) continue ;;
  esac
  # 仅处理目录
  [ -d "$sub" ] || continue
  process_repo "$sub"
done < <(find "$REPO_ROOT" -maxdepth 1 -mindepth 1 -print0)

echo "--- 汇总 ---"
echo "扫描仓库数=$SCAN_COUNT  跳过(非仓库)=$SKIP_COUNT  脏工作区=$DIRTY_COUNT  有未推送=$UNPUSHED_COUNT  落后>0=$BEHIND_COUNT  领先>0=$AHEAD_COUNT"
echo "（提示：远端引用陈旧时，可加 --fetch --confirm 联网刷新后再看。）"
