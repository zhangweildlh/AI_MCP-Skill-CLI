#!/usr/bin/env bash
# github-personal-manager 公共函数库（被 scripts/sop_*.sh source）
# 提供：配置加载、工具探测、仓库守卫、状态探测。
# 注意：_sop_load_config 末尾会探测 git/gh，缺失则直接 exit 1（脚本层防护）。

# 加载配置：优先用仓库内 config/github-sop.config.sh，缺失则回退 PATH 上的 git/gh。
# 调用前须由脚本设置 SOP_SELF_DIR（脚本自身目录）。
_sop_load_config() {
  local self_dir="${SOP_SELF_DIR:?SOP_SELF_DIR 未设置}"
  local root_dir
  root_dir="$(cd "$self_dir/.." && pwd)"
  if [ -f "$root_dir/config/github-sop.config.sh" ]; then
    # shellcheck disable=SC1091
    source "$root_dir/config/github-sop.config.sh"
  fi
  GIT_BIN="${GIT_BIN:-git}"
  GH_BIN="${GH_BIN:-gh}"
  MAIN_BRANCH="${MAIN_BRANCH:-main}"
  ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"
  UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
  UPSTREAM_REPO="${UPSTREAM_REPO:-}"
  GH_USER="${GH_USER:-}"
  SOP_ROOT_DIR="$root_dir"
  # 脚本层工具探查（双层防护之一）：缺失 git/gh 直接退出，避免后续命令报晦涩错误
  if ! _sop_probe_tools; then
    exit 1
  fi
}

# 探测本机是否具备 git 与 gh（双层防护之脚本层）。
# 判定优先级：GIT_BIN/GH_BIN 显式指定且可用 > PATH 自动探测。
# 缺失任一则打印纯中文说明并以 return 1 退出（_sop_load_config 据此 exit 1）。
_sop_probe_tools() {
  local missing=0
  if [ -n "${GIT_BIN:-}" ]; then
    if ! command -v "$GIT_BIN" >/dev/null 2>&1 && [ ! -x "$GIT_BIN" ]; then
      echo "⚠️ 错误：配置里指定的 git 路径不可用：$GIT_BIN" >&2
      missing=1
    fi
  else
    if ! command -v git >/dev/null 2>&1; then
      echo "⚠️ 错误：本机没有找到 git。请先安装 Git（https://git-scm.com），" >&2
      echo "   或在 config/github-sop.config.sh 里把 GIT_BIN 设为 git 的绝对路径。" >&2
      missing=1
    fi
  fi
  if [ -n "${GH_BIN:-}" ]; then
    if ! command -v "$GH_BIN" >/dev/null 2>&1 && [ ! -x "$GH_BIN" ]; then
      echo "⚠️ 错误：配置里指定的 gh 路径不可用：$GH_BIN" >&2
      missing=1
    fi
  else
    if ! command -v gh >/dev/null 2>&1; then
      echo "⚠️ 错误：本机没有找到 gh（GitHub 命令行工具）。请从 https://cli.github.com 安装，" >&2
      echo "   或在 config/github-sop.config.sh 里把 GH_BIN 设为 gh 的绝对路径。" >&2
      missing=1
    fi
  fi
  if [ "$missing" -ne 0 ]; then
    echo "⚠️ 由于缺少必要工具，脚本无法继续。请按上方提示处理后重跑本脚本；" >&2
    echo "   若你是在 Agent（github-personal-manager 技能）中操作，请直接告诉我工具路径或安装方式。" >&2
    return 1
  fi
  return 0
}

# 进入目标仓库：若 $1 是目录则 cd 之，否则用当前目录；校验是 git 工作树。返回 0/1。
_sop_require_repo() {
  if [ -n "${1:-}" ] && [ -d "$1" ]; then
    cd "$1" || { echo "错误：无法进入目录 $1" >&2; return 1; }
  fi
  if ! "$GIT_BIN" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "错误：当前目录不是 git 仓库。请在目标仓库内运行，或传入仓库路径作为第一个参数。" >&2
    return 1
  fi
  return 0
}

_sop_is_clean() {
  [ -z "$("$GIT_BIN" status --porcelain)" ]
}

_sop_current_branch() {
  "$GIT_BIN" rev-parse --abbrev-ref HEAD
}

# 探测 本地 main ↔ origin/main → 输出 "behind ahead"
# git 约定：rev-list --left-right --count A...B 输出 (left,right)，left=A独有=本地领先，right=B独有=本地落后
_sop_detect_local_origin() {
  local left right
  read left right < <("$GIT_BIN" rev-list --left-right --count "$MAIN_BRANCH...$ORIGIN_REMOTE/$MAIN_BRANCH" 2>/dev/null)
  echo "${right:-0} ${left:-0}"
}

# 探测 origin/main ↔ upstream/main → 输出 "M K"（M=fork领先, K=upstream领先）
_sop_detect_origin_upstream() {
  local left right
  read left right < <("$GIT_BIN" rev-list --left-right --count "$ORIGIN_REMOTE/$MAIN_BRANCH...$UPSTREAM_REMOTE/$MAIN_BRANCH" 2>/dev/null)
  echo "${left:-0} ${right:-0}"
}
