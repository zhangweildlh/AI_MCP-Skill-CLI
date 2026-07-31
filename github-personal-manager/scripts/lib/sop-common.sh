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
  GIT_BIN="${GIT_BIN:-}"
  GH_BIN="${GH_BIN:-}"
  MAIN_BRANCH="${MAIN_BRANCH:-main}"
  ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"
  UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
  UPSTREAM_REPO="${UPSTREAM_REPO:-}"
  GH_USER="${GH_USER:-}"
  GH_EMAIL="${GH_EMAIL:-}"
  REPO_ROOT="${REPO_ROOT:-}"
  SOP_ROOT_DIR="$root_dir"
  # 脚本层工具探查（双层防护之一）：缺失 git/gh 直接退出，避免后续命令报晦涩错误
  if ! _sop_probe_tools; then
    exit 1
  fi
}

# 探测本机是否具备 git 与 gh（双层防护之脚本层）。
# 判定优先级：config 显式指定 GIT_BIN/GH_BIN 且可用 > where.exe 解析实际路径 > bare git/gh(PATH)。
# 缺失任一则打印纯中文说明并以 return 1 退出（_sop_load_config 据此 exit 1）。
# 注意：工具路径不得硬编码；每次调用本技能都先 where.exe 取实际路径（见 SKILL.md 阶段 0）。
_sop_probe_tools() {
  local missing=0
  if [ -n "${GIT_BIN:-}" ]; then
    if ! command -v "$GIT_BIN" >/dev/null 2>&1 && [ ! -x "$GIT_BIN" ]; then
      echo "⚠️ 错误：config 指定的 git 路径不可用：$GIT_BIN" >&2
      missing=1
    fi
  else
    # 优先 where.exe 取实际路径（Windows 首选）；非 Windows 回退 command -v
    if command -v where.exe >/dev/null 2>&1; then
      local wgit
      wgit="$(where.exe git 2>/dev/null | head -n1)"
      if [ -n "$wgit" ]; then GIT_BIN="$wgit"; fi
    fi
    if [ -z "${GIT_BIN:-}" ]; then
      if command -v git >/dev/null 2>&1; then
        GIT_BIN="git"
      else
        echo "⚠️ 错误：本机没有找到 git。请先安装 Git（https://git-scm.com），" >&2
        echo "   或把 git 加入 PATH，或在 config/github-sop.config.sh 里把 GIT_BIN 设为 git 的绝对路径。" >&2
        missing=1
      fi
    fi
  fi
  if [ -n "${GH_BIN:-}" ]; then
    if ! command -v "$GH_BIN" >/dev/null 2>&1 && [ ! -x "$GH_BIN" ]; then
      echo "⚠️ 错误：config 指定的 gh 路径不可用：$GH_BIN" >&2
      missing=1
    fi
  else
    if command -v where.exe >/dev/null 2>&1; then
      local wgh
      wgh="$(where.exe gh 2>/dev/null | head -n1)"
      if [ -n "$wgh" ]; then GH_BIN="$wgh"; fi
    fi
    if [ -z "${GH_BIN:-}" ]; then
      if command -v gh >/dev/null 2>&1; then
        GH_BIN="gh"
      else
        echo "⚠️ 错误：本机没有找到 gh（GitHub 命令行工具）。请从 https://cli.github.com 安装，" >&2
        echo "   或把 gh 加入 PATH，或在 config/github-sop.config.sh 里把 GH_BIN 设为 gh 的绝对路径。" >&2
        missing=1
      fi
    fi
  fi
  if [ "$missing" -ne 0 ]; then
    echo "⚠️ 由于缺少必要工具，脚本无法继续。请按上方提示处理后重跑本脚本；" >&2
    echo "   若你是在 Agent（github-personal-manager 技能）中操作，请直接告诉我工具路径或安装方式。" >&2
    return 1
  fi
  return 0
}

# 进入目标仓库：若 $1 是目录则 cd 之，否则用当前目录；校验是 git 工作树，且（传入目录时）必须为 git 仓库根。返回 0/1。
_sop_require_repo() {
  if [ -n "${1:-}" ] && [ -d "$1" ]; then
    # 在改变 cwd 之前，于当前 cwd 基准下把 $1 规范化为绝对真实路径（处理相对路径/带尾斜杠/符号链接）。
    # 用子 shell cd，避免污染主 shell 的 cwd；pwd -P 解析符号链接并去尾斜杠。
    # 此步必须在 cd "$1" 之前完成，否则相对路径会基于已切换的 cwd 被错误解析（BUG-GPM-4）。
    local abs_in
    abs_in="$(cd "$1" 2>/dev/null && pwd -P)" || { echo "错误：无法解析目录 $1 的绝对路径。" >&2; return 1; }
    cd "$1" || { echo "错误：无法进入目录 $1" >&2; return 1; }
    # 校验传入目录是否为 git 仓库根：取真实 git 根，与传入目录规范路径比对。
    # 若传入的是某仓库的子目录（而非仓库根），后续 remote -v / diff 会静默指向父仓库，
    # 导致三元组误解析为父仓库（BUG-GPM-1）或变化集扩大到整个父仓库（BUG-GPM-2）。
    # 此处显式报错，优于静默误判。
    local toplevel
    if ! toplevel="$("$GIT_BIN" rev-parse --show-toplevel 2>/dev/null)"; then
      echo "错误：目录 $1 不是 git 仓库（无法解析 git 根）。" >&2
      return 1
    fi
    # 统一路径格式：Windows(Git Bash) 下 git.exe 的 --show-toplevel 输出 Windows 形式(D:/...)，
    # 而 abs_in(pwd -P) 为 POSIX 形式(/d/...)；用 cygpath -u 把 toplevel 转 POSIX 形式再比对。
    # 非 Windows 下 cygpath 不存在，二者本就同为 POSIX 形式，无需转换。
    if command -v cygpath >/dev/null 2>&1; then
      toplevel="$(cygpath -u "$toplevel")"
    fi
    if [ "$abs_in" != "$toplevel" ]; then
      echo "错误：传入目录 $1 不是 git 仓库根（其 git 仓库根为 $toplevel）。" >&2
      echo "   请传入 git 仓库根目录；若目标本就是子目录且非独立仓库，请改用正确的仓库根。" >&2
      return 1
    fi
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

# 从远端 URL 提取 owner/repo（支持 https 与 ssh 两种形式）。纯函数，输出 owner/repo 或空串。
# 同时去除 .git 后缀、兼容 github.com 域的两种写法。非 GitHub 域名输出空串。
# 入参容错：优先取 $1；若 $1 为空（常见于被管道末端调用）则从 stdin 读取，避免 set -u 下 $1 未绑定报错。
_sop_parse_owner_repo() {
  local url="${1:-}"
  if [ -z "$url" ]; then
    url="$(cat)"                                     # 从管道/stdin 读取（容错）
  fi
  [ -z "$url" ] && { echo ""; return; }
  url="${url%.git}"                                  # 去 .git 后缀
  local owner_repo=""
  case "$url" in
    *github.com/*) owner_repo="${url#*github.com/}" ;;     # https://github.com/owner/repo
    *github.com:*) owner_repo="${url#*github.com:}" ;;     # git@github.com:owner/repo
    *) owner_repo="" ;;
  esac
  owner_repo="${owner_repo%/}"                       # 去尾部斜杠，避免 repo 名含 /（P-GPM-2）
  echo "$owner_repo"
}

# 解析远端三元组：从 `git remote -v` 提取 origin/upstream 的 owner/repo。
# 设置全局变量：SOP_ORIGIN_OWNER / SOP_ORIGIN_REPO / SOP_UPSTREAM_OWNER_REPO
# 并补全（当 config 为空时）：GH_USER（← origin owner，再回退允许的硬编码默认值 zhangweildlh）、UPSTREAM_REPO（← upstream owner/repo）。
# 调用前须已 _sop_load_config（确保 GIT_BIN/ORIGIN_REMOTE/UPSTREAM_REMOTE 就绪），且已 cd 进目标仓库。
_sop_resolve_remotes() {
  local remotes_raw owner_repo line
  remotes_raw="$("$GIT_BIN" remote -v 2>/dev/null || true)"
  # origin owner/repo（取首个匹配行，fetch/push 均可）
  line="$(printf '%s\n' "$remotes_raw" | grep -m1 "^[[:space:]]*${ORIGIN_REMOTE}[[:space:]]" || true)"
  owner_repo="$(printf '%s\n' "$line" | awk '{print $2}' | _sop_parse_owner_repo)"
  SOP_ORIGIN_OWNER="${owner_repo%%/*}"
  SOP_ORIGIN_REPO="${owner_repo##*/}"
  # upstream owner/repo
  line="$(printf '%s\n' "$remotes_raw" | grep -m1 "^[[:space:]]*${UPSTREAM_REMOTE}[[:space:]]" || true)"
  owner_repo="$(printf '%s\n' "$line" | awk '{print $2}' | _sop_parse_owner_repo)"
  SOP_UPSTREAM_OWNER_REPO="$owner_repo"

  # 补全 config 空值（脚本层，不写死——仅用解析结果与允许的硬编码默认值 zhangweildlh）
  if [ -z "${GH_USER:-}" ] && [ -n "$SOP_ORIGIN_OWNER" ]; then
    GH_USER="$SOP_ORIGIN_OWNER"
  fi
  if [ -z "${GH_USER:-}" ]; then
    GH_USER="zhangweildlh"
  fi
  if [ -z "${UPSTREAM_REPO:-}" ] && [ -n "$SOP_UPSTREAM_OWNER_REPO" ]; then
    UPSTREAM_REPO="$SOP_UPSTREAM_OWNER_REPO"
  fi
}
