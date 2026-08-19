#!/usr/bin/env bash
# ============================================================================
# 文件: scripts/lib/sop-common.sh
# 中文名: github-personal-manager 公共函数库
#
# 【功能】
#   为 scripts/ 下全部 sop_*.sh 业务脚本提供统一的底层能力，共六类：
#     1) 配置加载  _sop_load_config     读取 config/github-sop.config.sh 并补全默认值
#     2) 工具探测  _sop_probe_tools     探测本机 git/gh，缺失则中止（脚本层防护）
#     3) 纪律探测  _sop_probe_agents_md 探测目标仓库 AGENTS.md（有则提示读、强制列表缺失则暂停）
#     4) 帮助打印  _sop_print_help      从调用者头部标记块提取帮助文本
#     5) 仓库守卫  _sop_require_repo    进入目标仓库并校验其为 git 仓库根
#     6) 状态探测  _sop_is_clean / _sop_current_branch / _sop_detect_local_origin /
#                  _sop_detect_origin_upstream / _sop_parse_owner_repo / _sop_resolve_remotes
#
# 【用途 / 使用场景】
#   本文件不可独立执行，只能被业务脚本以 source 方式载入，是整套技能的地基。
#   任何新增 sop_*.sh 都应复用此处函数，禁止各自重复实现配置加载与仓库校验逻辑。
#
# 【详细用法】
#   在业务脚本中固定按以下三步载入（顺序不可颠倒）：
#     1. 计算脚本自身目录并赋给 SOP_SELF_DIR（_sop_load_config 依赖它定位仓库根）
#     2. source 本文件
#     3. 调用 _sop_load_config 完成配置加载与工具探测
#
#   载入后可直接调用的函数与其契约：
#     _sop_print_help <文件路径>        打印该文件头部标记块内的帮助文本（去掉行首井号）
#     _sop_require_repo [目录]          目录非空则进入并校验为 git 仓库根；成功 0 / 失败 1
#     _sop_probe_agents_md [仓库根]     探测纪律文件：AGENTS.md 存在返回 0 并提示先阅读；
#                                       缺失且仓库在 AGENTS_MD_REQUIRED_REPOS 强制列表 → 返回 1
#                                       （打印中文错误 + 恢复命令）；否则静默返回 0
#     _sop_is_clean                     工作区干净返回 0，有未提交改动返回 1
#     _sop_current_branch               输出当前分支名（分离 HEAD 时输出 HEAD）
#     _sop_detect_local_origin          输出 "落后数 领先数"（本地 main 相对 origin/main）
#     _sop_detect_origin_upstream       输出 "M K"（M=fork 领先数, K=upstream 领先数）
#     _sop_parse_owner_repo <远端URL>   输出 owner/repo；支持 https 与 ssh，URL 可从标准输入传入
#     _sop_resolve_remotes              解析远端三元组并设置 SOP_ORIGIN_OWNER /
#                                       SOP_ORIGIN_REPO / SOP_UPSTREAM_OWNER_REPO
#
# 【前置条件】
#   调用 _sop_load_config 前必须已设置 SOP_SELF_DIR，否则脚本以「未设置」错误中止。
#   调用仓库类函数前必须已完成 _sop_load_config（依赖其导出的 GIT_BIN 等变量）。
#
# 【注意事项】
#   - _sop_load_config 末尾会探测 git/gh，任一缺失则直接以状态码 1 中止（脚本层防护）。
#   - 工具路径一律不写死：优先 config 显式指定，其次 where.exe 解析，最后回退 PATH 命令名。
#   - _sop_require_repo 拒绝仓库子目录（只接受仓库根），以防误解析父仓库（BUG-GPM-1/2/4 回归）。
# ============================================================================

# 从指定脚本文件的头部标记块中提取帮助文本并打印。
# 入参 $1：目标脚本路径，通常由调用方传入自身路径。
# 提取规则：截取 HELP-START 与 HELP-END 两个标记行之间的内容，剔除两行标记本身，
#           再去掉每行行首的井号与紧随的一个空格，得到纯净帮助文本。
# 设计原因：早期各脚本用固定行号（如第 2 至 9 行）截取帮助，一旦头部注释增删即整体错位，
#           输出会截断或混入代码行（P-GPM-1）。改用标记块后与行号彻底解耦，增删注释均安全。
_sop_print_help() {
  local src="${1:-${BASH_SOURCE[1]}}"
  sed -n '/<!--HELP-START-->/,/<!--HELP-END-->/p' "$src" \
    | grep -v -e '<!--HELP-START-->' -e '<!--HELP-END-->' \
    | sed 's/^# \{0,1\}//'
}

# 加载配置：优先用仓库内 config/github-sop.config.sh，缺失则回退 PATH 上的 git/gh。
# 调用前须由脚本设置 SOP_SELF_DIR（脚本自身目录）。
_sop_load_config() {
  local self_dir="${SOP_SELF_DIR:?SOP_SELF_DIR 未设置}"
  local root_dir
  root_dir="$(cd "$self_dir/.." && pwd)"
  # 捕获调用方通过环境显式注入的工具路径（最高优先级，用于测试注入、临时覆盖等）。
  # config 文件只应「补全默认值」，不得覆盖调用方已有的环境覆盖——否则会影响
  # 用 GIT_BIN=/GH_BIN 注入 fake 工具的失败注入测试，以及任何临时覆盖需求。
  # 优先级定为：调用方环境变量 > config 显式值 > where.exe/PATH 自动探测。
  local _env_git="${GIT_BIN:-}" _env_gh="${GH_BIN:-}"
  if [ -f "$root_dir/config/github-sop.config.sh" ]; then
    # shellcheck disable=SC1091
    source "$root_dir/config/github-sop.config.sh"
  fi
  # 仅当调用方显式设置时才恢复环境值，避免 config 覆盖测试/调用方注入
  if [ -n "$_env_git" ]; then GIT_BIN="$_env_git"; fi
  if [ -n "$_env_gh" ]; then GH_BIN="$_env_gh"; fi
  GIT_BIN="${GIT_BIN:-}"
  GH_BIN="${GH_BIN:-}"
  MAIN_BRANCH="${MAIN_BRANCH:-main}"
  ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"
  UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
  UPSTREAM_REPO="${UPSTREAM_REPO:-}"
  GH_USER="${GH_USER:-}"
  GH_EMAIL="${GH_EMAIL:-}"
  REPO_ROOT="${REPO_ROOT:-}"
  # 纪律文件(AGENTS.md)相关配置：config 显式值优先，缺失时回退默认（默认含本仓库，保证即使
  # 无 config 也能按方案 Y 对 D:/Documents/AI_MCP-Skill-CLI 强制纪律文件探测）。
  AGENTS_MD_REQUIRED_REPOS="${AGENTS_MD_REQUIRED_REPOS:-D:/Documents/AI_MCP-Skill-CLI}"
  AGENTS_MD_MODE="${AGENTS_MD_MODE:-required}"
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

# 探测目标仓库是否存在纪律文件 AGENTS.md（方案 Y：多 Agent 并发 scope 纪律）。
# 入参 $1：目标仓库根目录（Windows 形态 D:/... 或 POSIX 形态 /d/... 均可）。
# 行为分三支：
#   - AGENTS.md 存在 → 打印中文提示「检测到纪律文件 AGENTS.md，请先阅读」，返回 0（不阻断）；
#   - 不存在但仓库根匹配 AGENTS_MD_REQUIRED_REPOS（逗号分隔，config 读取，lib 有默认值）
#     → 打印中文错误 + 恢复命令（git checkout main -- AGENTS.md），返回 1（强制暂停）；
#   - 不存在且不在强制列表 → 静默跳过，返回 0（其它普通仓库不打扰）。
# 依赖：须已 _sop_load_config（确保 AGENTS_MD_REQUIRED_REPOS / AGENTS_MD_MODE 就绪）。
# 【调用约定】在 _sop_require_repo 进入目标仓库（此时 cwd 即仓库根）之后、任何写操作之前调用：
#     _sop_probe_agents_md "$(pwd)" || exit 1
# 该顺序与 SKILL.md「阶段 0 · 第 3 步：纪律文件探测」及「顶级全局禁令第 1.5 条」一致。
_sop_probe_agents_md() {
  local repo_root="${1:-}"
  if [ -z "$repo_root" ]; then
    echo "错误：_sop_probe_agents_md 缺少仓库根参数。" >&2
    return 1
  fi
  # 统一路径形态：Git Bash 下把 /d/... 转为 D:/...，便于与 config 中的 D:/... 条目比对。
  # 非 Windows 环境无 cygpath，原样保留（本就同为 POSIX 形态）。
  local normalized="$repo_root"
  if command -v cygpath >/dev/null 2>&1; then
    normalized="$(cygpath -m "$repo_root" 2>/dev/null || echo "$repo_root")"
  fi
  # 分支一：纪律文件存在 → 提示先阅读，不阻断。
  if [ -f "$repo_root/AGENTS.md" ]; then
    echo "📋 检测到纪律文件 AGENTS.md，请先阅读并遵循其中全部规则。"
    return 0
  fi
  # 分支二/三：文件不存在 → 仅当仓库在强制列表内才暂停，否则静默跳过。
  local need=0 item item_norm oldifs="$IFS"
  IFS=','
  # 注意：此处故意不加引号，利用 IFS 把逗号分隔列表拆成多个词（列表为空则整体为空串、不进入循环）。
  for item in ${AGENTS_MD_REQUIRED_REPOS:-}; do
    item="$(printf '%s' "$item" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -n "$item" ] || continue
    item_norm="$item"
    if command -v cygpath >/dev/null 2>&1; then
      item_norm="$(cygpath -m "$item" 2>/dev/null || echo "$item")"
    fi
    if [ "$normalized" = "$item_norm" ]; then need=1; break; fi
  done
  IFS="$oldifs"
  if [ "$need" -eq 1 ]; then
    echo "⛔ 错误：目标仓库缺少纪律文件 AGENTS.md。该仓库在 AGENTS_MD_REQUIRED_REPOS 强制列表中，缺失时按纪律方案必须暂停，绝不继续后续写操作。" >&2
    echo "   恢复命令：git checkout main -- AGENTS.md（把 AGENTS.md 恢复到仓库根后重跑本脚本）。" >&2
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

  # 补全 GH_USER：origin 拥有者优先于 config 默认值（避免 config 非空默认值锁死跨账号身份）。
  # 仅当 origin 无法解析且 config 也未显式设定时才回退允许的硬编码默认值，并打印可观测告警。
  if [ -n "$SOP_ORIGIN_OWNER" ]; then
    GH_USER="$SOP_ORIGIN_OWNER"
  elif [ -z "${GH_USER:-}" ]; then
    echo "⚠️ 警告：未从 origin 远端解析到拥有者，且 config 未显式设定 GH_USER，回退默认值 zhangweildlh（若非本人账号，请配置 config GH_USER 或检查 origin 远端）。" >&2
    GH_USER="zhangweildlh"
  fi
  if [ -z "${UPSTREAM_REPO:-}" ] && [ -n "$SOP_UPSTREAM_OWNER_REPO" ]; then
    UPSTREAM_REPO="$SOP_UPSTREAM_OWNER_REPO"
  fi
}

# ============================================================================
# 分支保护核验（直推 main 前的 fail-safe 闸门）
# ----------------------------------------------------------------------------
# 用途：sop_sync_pull_ff.sh / sop_sync_upstream.sh / 其它可能直推 main 的脚本，
#       在 push 到 main 前检测目标仓库主线是否受保护（旧式分支保护 或 ruleset），
#       受保护 → 提示改走 PR（sop_pr_create.sh --base main）并暂停，不硬推。
# 模式（复用 sop_worktree_merge.sh 的 fail-safe 语义）：
#   0  可直推（确认无保护）或保护存在但被当前账号豁免（admin bypass）
#   1  主线受保护且当前账号不可绕过 → 应走 PR（调用方据此暂停）
#   2  核验失败（非 404 错误 / 无法确认），fail-safe 暂停
# 同时检查两类保护：
#   a. 旧式分支保护  GET repos/{owner}/{repo}/branches/{main}/protection
#   b. ruleset        GET repos/{owner}/{repo}/rulesets            （2026-08-19 转公开后生效）
# 任一命中保护 → 走 PR。调用前须已 _sop_load_config 且已 cd 进目标仓库。
# ============================================================================
_sop_check_main_protection() {
  local repo_id prot_out prot_rc rs_out rs_rc protected=0
  # 自包含：内部解析远端三元组（不依赖调用方预先调用 _sop_resolve_remotes）
  if [ -z "${SOP_ORIGIN_OWNER:-}" ] || [ -z "${SOP_ORIGIN_REPO:-}" ]; then
    _sop_resolve_remotes 2>/dev/null || true
  fi
  repo_id="${SOP_ORIGIN_OWNER:-}/${SOP_ORIGIN_REPO:-}"
  if [ -z "$repo_id" ] || [ "$repo_id" = "/" ]; then
    echo "⚠️ 无法解析仓库标识，跳过分支保护核验；若 main 受保护请改走 PR。" >&2
    return 0
  fi

  # a. 旧式分支保护
  prot_out="$("$GH_BIN" api "repos/$repo_id/branches/$MAIN_BRANCH/protection" 2>&1)"
  prot_rc=$?
  if [ "$prot_rc" -eq 0 ]; then
    protected=1   # 旧式保护开启
  elif printf '%s' "$prot_out" | grep -qiE 'HTTP 404|Not Found|Branch not protected'; then
    :             # 确认无旧式保护
  else
    echo "⛔ 分支保护核验失败（非 404）：无法确认主线保护状态，fail-safe 暂停。原始返回：" >&2
    printf '%s\n' "$prot_out" | head -5 >&2
    return 2
  fi

  # b. ruleset 保护（转公开后可能用 ruleset 而非旧式 API）
  if [ "$protected" -eq 0 ]; then
    rs_out="$("$GH_BIN" api "repos/$repo_id/rulesets" 2>&1)"
    rs_rc=$?
    if [ "$rs_rc" -eq 0 ]; then
      if printf '%s' "$rs_out" | grep -qiE '"name"[[:space:]]*:[[:space:]]*"' ; then
        # 有 ruleset 即视为保护（含 non_fast_forward/update/deletion/required_status_checks 等）
        # 命中保护但当前账号可能是 admin（bypass 生效），需进一步确认能否绕过：
        # 无 bypass 信息时保守按「受保护」处理，提示改走 PR（fail-safe，宁严勿宽）。
        if printf '%s' "$rs_out" | grep -qi "main"; then
          protected=1
        fi
      fi
    elif ! printf '%s' "$rs_out" | grep -qiE 'HTTP 404|Not Found'; then
      echo "⚠️ ruleset 核验失败（非 404），按 fail-safe 保守视为受保护。" >&2
      protected=1
    fi
  fi

  if [ "$protected" -eq 1 ]; then
    echo "⚠️ 主线 [$MAIN_BRANCH] 已开启分支保护（旧式保护 或 ruleset），直推 main 会被拒。"
    echo "   请改走 PR：在 feat 分支提交后运行 bash scripts/sop_pr_create.sh <仓库> --base $MAIN_BRANCH --confirm。"
    echo "   （若你确认为仓库管理员且 ruleset 已设 bypass，可忽略此提示；否则请勿直推。）"
    return 1
  fi
  echo "✅ 分支保护核验：主线 [$MAIN_BRANCH] 未受保护，可直推。"
  return 0
}

