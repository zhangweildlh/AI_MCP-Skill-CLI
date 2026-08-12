#!/usr/bin/env bash
#<!--HELP-START-->
# 文件名: scripts/sop_privacy_gate.sh
# 中文名: 入库隐私闸门（敏感文件/密钥扫描）
#
# 【功能】
#   在「提交(commit)/推送(push) 之前」扫描目标仓库，拦截可能泄露真实手机号、身份证号、
#   家庭住址、令牌(token)/密钥的敏感文件与密钥指纹。属只读门禁，不改动任何文件。
#   命中即 rc=1（闸门拦截，提示勿直接提交/推送）；未命中 rc=0（放行）。
#
#   扫描三类范围（默认全扫）：
#     ① 工作区（未跟踪但未被 .gitignore 排除 + 未暂存改动）；
#     ② 已暂存(staged)区；
#     ③ 已提交区（相对基准分支 committed diff，基准默认 origin/main，缺则回退 main）。
#
#   两类命中规则（全部内置、自包含，无需任何外部记忆）：
#     - 文件名指纹：profile / Login Data / Cookies / favdb / .env / id_rsa / *.pem / *.key / credentials / *.token
#     - 密钥内容指纹（正则，大小写不敏感）：GitHub PAT(pat/fine-grained)、Slack、AWS、OpenAI、
#       GitLab、JWT、PEM 私钥块等高危格式。
#
# 【用途 / 使用场景】
#   1. 工作流四「标准代码修改」中，推送(push) 前必跑，先确认无敏感文件再推；
#   2. 工作流十「清理工区」前对工区做敏感扫描，避免把含密钥的临时目录误提交；
#   3. 任何「准备 git add / commit / push」的可疑场景，先做一道静态闸门。
#
# 【详细用法】
#   基本用法（默认扫全部范围，输出命中明细）:
#     bash scripts/sop_privacy_gate.sh <仓库路径>
#   指定仓库基准（committed diff 的对比基准分支）:
#     bash scripts/sop_privacy_gate.sh <仓库路径> --base origin/main
#   只扫某一范围:
#     bash scripts/sop_privacy_gate.sh <仓库路径> --scope working|staged|committed
#   精简输出（只列命中文件）:
#     bash scripts/sop_privacy_gate.sh <仓库路径> --quiet
#   打印帮助:
#     bash scripts/sop_privacy_gate.sh -h
#
#   退出码: 0=未发现敏感项(放行)；1=发现敏感项(拦截)；2=参数错误；非 git 目录=1。
#
# 【注意事项】
#   - 本脚本为只读门禁，绝不修改/移动/删除任何文件，仅报告命中。
#   - 文件名指纹与密钥内容指纹均于本文件顶部数据段内置（自包含），新增规则只需改数据段。
#   - 二进制文件（grep -I 识别）跳过内容扫描，仅做文件名核查；文本文件无论体积均做内容扫描。
#   - 本脚本不构成「通过就等于绝对安全」的保证：仅覆盖已知高危指纹，人工复核仍必要。
#<!--HELP-END-->
set -u
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

# ---- 选项解析（严格：-h 退出 0；未知选项退出 2）----
BASE=""
SCOPE="all"
QUIET=0
REPO_DIR=""
NEED_BASE=0
NEED_SCOPE=0
for a in "$@"; do
  case "$a" in
    -h|--help) _sop_print_help "${BASH_SOURCE[0]}"; exit 0 ;;
    --base) NEED_BASE=1 ;;
    --scope) NEED_SCOPE=1 ;;
    --quiet) QUIET=1 ;;
    -*) echo "⚠️ 未知选项: $a（用法见 -h）" >&2; exit 2 ;;
    *)
      if [ "$NEED_BASE" = "1" ]; then BASE="$a"; NEED_BASE=0
      elif [ "$NEED_SCOPE" = "1" ]; then SCOPE="$a"; NEED_SCOPE=0
      else REPO_DIR="$a"; fi
      ;;
  esac
done
if [ "$NEED_BASE" = "1" ]; then echo "⚠️ --base 缺少取值" >&2; exit 2; fi
if [ "$NEED_SCOPE" = "1" ]; then echo "⚠️ --scope 缺少取值" >&2; exit 2; fi

# 校验范围取值
case "$SCOPE" in
  all|working|staged|committed) : ;;
  *) echo "⚠️ 非法 --scope 取值: $SCOPE（应为 all|working|staged|committed）" >&2; exit 2 ;;
esac

# 进入并校验目标仓库（非 git 目录 → rc=1 并提示「不是 git 仓库」）
if ! _sop_require_repo "${REPO_DIR:-}"; then
  exit 1
fi

# ---- 内置指纹数据段（自包含，与既有约定一致，本文件独立可运行）----
# 文件名指纹：对 basename 做大小写不敏感匹配
FNAME_PATTERNS=(
  "profile"
  "Login Data"
  "Cookies"
  "favdb"
  "\.env"
  "id_rsa"
  "\.pem$"
  "\.key$"
  "credentials"
  "\.token$"
)
# 密钥内容指纹：对文件内容做大小写不敏感正则匹配（高危格式优先，降低误报）
CONTENT_PATTERNS=(
  "gh[pousr]_[A-Za-z0-9]{30,}"
  "github_pat_[A-Za-z0-9_]{50,}"
  "xox[baprs]-[A-Za-z0-9-]{10,}"
  "AKIA[0-9A-Z]{16}"
  "sk-[A-Za-z0-9]{20,}"
  "glpat-[A-Za-z0-9_-]{20,}"
  "eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"
  "-----BEGIN [A-Z ]*PRIVATE KEY-----"
)

# 解析 committed diff 的基准分支（用户指定 > origin/main > main > 空）
resolve_base() {
  if [ -n "$BASE" ]; then echo "$BASE"; return; fi
  if "$GIT_BIN" rev-parse --verify --quiet "$ORIGIN_REMOTE/$MAIN_BRANCH" >/dev/null 2>&1; then
    echo "$ORIGIN_REMOTE/$MAIN_BRANCH"; return
  fi
  if "$GIT_BIN" rev-parse --verify --quiet "$MAIN_BRANCH" >/dev/null 2>&1; then
    echo "$MAIN_BRANCH"; return
  fi
  echo ""
}

# 收集候选文件清单（合并三类范围，去重）
candidates=""
if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "working" ]; then
  candidates="$candidates"$'\n'"$("$GIT_BIN" ls-files --others --exclude-standard 2>/dev/null)"
  candidates="$candidates"$'\n'"$("$GIT_BIN" diff --name-only 2>/dev/null)"
fi
if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "staged" ]; then
  candidates="$candidates"$'\n'"$("$GIT_BIN" diff --cached --name-only 2>/dev/null)"
fi
if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "committed" ]; then
  b="$(resolve_base)"
  if [ -n "$b" ]; then
    candidates="$candidates"$'\n'"$("$GIT_BIN" diff --name-only "$b"...HEAD 2>/dev/null)"
  fi
fi
candidates="$(printf '%s\n' "$candidates" | sed '/^[[:space:]]*$/d' | sort -u)"

# ---- 扫描 ----
hits=0
scanned=0
if [ "$QUIET" -eq 0 ]; then
  echo "【隐私扫描】范围=$SCOPE  基准=$( [ -n "$BASE" ] && echo "$BASE" || echo "自动(origin/main→main)" )"
fi
while IFS= read -r f; do
  [ -z "$f" ] && continue
  scanned=$((scanned + 1))
  bn="$(basename "$f")"
  fname_hit=""
  for p in "${FNAME_PATTERNS[@]}"; do
    if printf '%s' "$bn" | grep -Eiq -- "$p" 2>/dev/null; then
      fname_hit="$fname_hit $p"
    fi
  done
  content_hit=""
  if [ -f "$f" ]; then
    for p in "${CONTENT_PATTERNS[@]}"; do
      # grep -I 跳过二进制文件；任何体积的文本文件都做内容扫描，避免大文件绕过闸门
      if grep -I -Eiq -- "$p" "$f" 2>/dev/null; then
        content_hit="$content_hit $p"
      fi
    done
  fi
  if [ -n "$fname_hit" ] || [ -n "$content_hit" ]; then
    hits=$((hits + 1))
    if [ "$QUIET" -eq 0 ]; then
      echo "  ⚠️ 命中: $f  [文件名:$fname_hit ][内容:$content_hit ]"
    else
      echo "$f"
    fi
  fi
done <<< "$candidates"

# ---- 结论 ----
if [ "$hits" -gt 0 ]; then
  if [ "$QUIET" -eq 0 ]; then
    echo "【隐私扫描】命中 $hits 处（共扫 $scanned 项）— rc=1 闸门拦截"
    echo "    建议：将命中文件移入 .gitignore，或 git rm --cached 后白名单处理；切勿直接提交/推送。"
  fi
  exit 1
else
  if [ "$QUIET" -eq 0 ]; then
    echo "【隐私扫描】未发现敏感文件/密钥（共扫 $scanned 项）— rc=0 放行"
  fi
  exit 0
fi
