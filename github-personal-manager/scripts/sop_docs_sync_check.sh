#!/usr/bin/env bash
#<!--HELP-START-->
# 中文名: 提交前文档同步检查（分层检查清单·检测）
# 功能: 在标准代码修改提交流程中，基于本次仓库代码与文件的"真实变化"（git status/diff 实际改动），
#       依据 references/docs-sync-checklist.md 的「分层检查清单」（改动类型 × Tier 1/2/3），
#       先查仓库是否存在清单文件 → 分析是否需改 → 输出同步状态。
#       只读、dry-run，不修改任何文件；由智能体依据输出"实际修改"文档内容。
# 适用场景: 工作流二「提交(commit)动作之前」的硬门禁检测（见 SKILL.md / 永久记忆·第四模块）。
# 语义: Tier 1 未同步 → 阻断（exit 2）；Tier 2 未同步 → 强建议（默认 exit 0，--strict 时 exit 2）；Tier 3 → 仅提示。
# 选项: [仓库路径] [--strict] 让 Tier 2 未同步同样阻断。
# 退出码: 0=已同步/无真实变化；2=未同步（Tier 1，或 --strict 下的 Tier 2）。
# 用法: bash sop_docs_sync_check.sh [仓库路径] [--strict]
#<!--HELP-END-->
set -uo pipefail
SOP_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SOP_SELF_DIR/lib/sop-common.sh"
_sop_load_config

REPO=""
STRICT=0
for a in "$@"; do
  case "$a" in
    -h|--help)
      sed -n '/<!--HELP-START-->/,/<!--HELP-END-->/p' "${BASH_SOURCE[0]}" \
        | grep -v -e '<!--HELP-START-->' -e '<!--HELP-END-->' \
        | sed 's/^# \{0,1\}//'
      exit 0 ;;
    --strict) STRICT=1 ;;
    -*) echo "未知选项: $a" >&2; exit 2 ;;
    *) REPO="$a" ;;
  esac
done
_sop_require_repo "${REPO:-}" || exit 1

# ---------- 0. 读取分层检查清单数据块 ----------
CHECKLIST_FILE="$SOP_SELF_DIR/../references/docs-sync-checklist.md"
declare -a ENTRIES=()
if [ -f "$CHECKLIST_FILE" ]; then
  while IFS= read -r line; do
    # 仅取 START 与 END 标记之间的数据行（跳过空行；grep 已过滤非数字行，标记行不进循环）
    [ -z "$(echo "$line" | tr -d '[:space:]')" ] && continue
    ENTRIES+=("$line")
  done < <(sed -n '/<!--SYNC-CHECKLIST-START-->/,/<!--SYNC-CHECKLIST-END-->/p' "$CHECKLIST_FILE" | grep -E '^[0-9][|]')
fi
# 若 references 文件缺失或损坏，回退最小内置清单（保证脚本不失效）
if [ "${#ENTRIES[@]}" -eq 0 ]; then
  ENTRIES=(
    "1|README.md|*|doc|根级说明文档"
    "1|README_EN.md|*|doc|英文说明文档"
    "1|CHANGELOG*.md|*|doc|版本变更日志"
  )
  echo "⚠️ 提示：未读取到 references/docs-sync-checklist.md，已回退内置最小清单（仅 Tier 1）。" >&2
fi

# ---------- 1. 取真实变化文件（已暂存 + 未暂存 + 未跟踪，去重） ----------
CHANGED=()
declare -A _cseen=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if [ -z "${_cseen[$f]:-}" ]; then _cseen[$f]=1; CHANGED+=("$f"); fi
done < <("$GIT_BIN" diff --cached --name-only 2>/dev/null; "$GIT_BIN" diff --name-only 2>/dev/null; "$GIT_BIN" ls-files --others --exclude-standard 2>/dev/null)

in_changed() { [ -n "${_cseen[$1]:-}" ]; }

# ---------- 2. 探测单个 glob 是否存在（输出相对路径，每行一个） ----------
_resolve_glob() {
  local g="$1"
  if [[ "$g" == "**/"* ]]; then                        # **/X → 从仓库根递归
    local base="${g#"**/"}"
    while IFS= read -r p; do [ -n "$p" ] && echo "${p#./}"; done < <(find . -name "$base" ! -path . 2>/dev/null)
  elif [[ "$g" == *"/**/"* ]]; then                     # DIR/**/X → 从 DIR 递归
    local dir="${g%/**/*}" base="${g##*/}"
    [ -z "$dir" ] && dir="."
    while IFS= read -r p; do [ -n "$p" ] && echo "${p#./}"; done < <(find "$dir" -name "$base" ! -path "$dir" 2>/dev/null)
  elif [[ "$g" == *"/**" ]]; then                       # DIR/** → 整个 DIR
    local dir="${g%/**}"
    [ -z "$dir" ] && dir="."
    while IFS= read -r p; do [ -n "$p" ] && echo "${p#./}"; done < <(find "$dir" ! -path "$dir" 2>/dev/null)
  elif [[ "$g" == *"/"* ]]; then                        # DIR/X → DIR 下一层（不含 **）
    local dir="${g%/*}" base="${g##*/}"
    while IFS= read -r p; do [ -n "$p" ] && echo "${p#./}"; done < <(find "$dir" -maxdepth 1 -name "$base" 2>/dev/null)
  else                                                  # 仓库根一层
    while IFS= read -r p; do [ -n "$p" ] && echo "${p#./}"; done < <(find . -maxdepth 1 -name "$g" 2>/dev/null)
  fi
}

# 取某条目的全部现有文件（合并其多个 glob，去重），每行一个；空则无
_entry_existing() {
  local globs="$1" g
  local IFS=';'
  for g in $globs; do
    g="$(echo "$g" | tr -d ' ')"
    [ -z "$g" ] && continue
    _resolve_glob "$g"
  done | sort -u
}

# ---------- 3. 推导改动类型（Change Type） ----------
TYPES_SET=""
has_type() { [[ " $TYPES_SET " == *" $1 "* ]]; }
add_type() { has_type "$1" || TYPES_SET="$TYPES_SET $1"; }

for f in "${CHANGED[@]:-}"; do
  [ -z "$f" ] && continue
  b="$(basename "$f")"
  lf="$(echo "$f" | tr '[:upper:]' '[:lower:]')"
  # 测试
  case "$f" in test/*|tests/*|spec/*) add_type test ;; esac
  case "$b" in *_test.py|*.test.ts|*.spec.ts) add_type test ;; esac
  # 依赖 / 包清单 / 锁文件
  case "$b" in
    package.json|Cargo.toml|pyproject.toml|go.mod|*.csproj|pom.xml) add_type dependency ;;
    requirements*.txt) add_type dependency ;;
    package-lock.json|Cargo.lock|uv.lock|yarn.lock|go.sum|pnpm-lock.yaml|poetry.lock) add_type dependency ;;
  esac
  # 配置
  if [[ "$f" == *.example.* || "$b" == .env.example || "$lf" == *config* || "$lf" == *.env* || "$lf" == *settings* ]]; then
    add_type config
  fi
  # 文案 / 国际化
  case "$f" in locales/*|i18n/*) add_type copy ;; esac
  case "$b" in *.po|*.i18n.json) add_type copy ;; esac
  # 示例
  case "$f" in examples/*) add_type example ;; esac
  # 文档类 md
  case "$b" in
    *.md)
      case "$f" in README*.md|CHANGELOG*.md|CONTRIBUTING*.md|docs/*) add_type docs ;; esac
      ;;
  esac
  # 源码（非测试）→ 功能 + 行为
  case "$b" in
    *.py|*.js|*.ts|*.tsx|*.jsx|*.go|*.rs|*.java|*.c|*.cpp|*.h|*.hpp|*.cs|*.rb|*.php|*.swift|*.kt|*.scala|*.sh|*.bat|*.ps1)
      case "$f" in test/*|tests/*|spec/*) ;; *_test.py|*.test.ts|*.spec.ts) ;; *)
        add_type feature; add_type behavior ;;
      esac
      ;;
  esac
done
[ -z "$TYPES_SET" ] && TYPES_SET=" UNKNOWN"   # 无具体类型 → 保守触发全部 Tier 2

entry_triggered() {
  local triggers="$1"
  [[ "$triggers" == "*" ]] && return 0
  has_type UNKNOWN && return 0
  local t
  local IFS=','
  for t in $triggers; do
    [ -z "$t" ] && continue
    has_type "$t" && return 0
  done
  return 1
}

# ---------- 4. 收集文档类(KIND=doc)现有文件，计算"真实变化(NONDOC)" ----------
declare -A _docclass=()
for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r tier globs triggers kind desc <<< "$entry"
  [ "$kind" = "doc" ] || continue
  while IFS= read -r ef; do
    [ -z "$ef" ] && continue
    _docclass["$ef"]=1
  done < <(_entry_existing "$globs")
done

NONDOC=()
for f in "${CHANGED[@]:-}"; do
  [ -z "$f" ] && continue
  [ -n "${_docclass[$f]:-}" ] && continue
  NONDOC+=("$f")
done

# ---------- 5. 输出头部与改动类型 ----------
echo "===== 提交前文档同步检查（分层） ====="
echo ""
echo "【检测依据】分层检查清单：references/docs-sync-checklist.md"
echo "【改动类型】$(echo "$TYPES_SET" | sed 's/^ //')   （由真实变化推导）"
echo ""

if [ "${#NONDOC[@]}" -eq 0 ]; then
  echo "【文档同步状态】✅ 已同步（本次无代码/文件真实变化，或仅为文档类变更，无需额外同步）"
  echo ""
  echo "👉 可直接进入标准流程的提交(commit)步骤。"
  exit 0
fi

echo "【本次真实变化文件】（非文档类，触发门禁的，共 ${#NONDOC[@]} 个）:"
for f in "${NONDOC[@]}"; do echo "  - $f"; done
echo ""

# ---------- 6. 逐条目分析（Tier 1 / 2 / 3） ----------
t1_unsynced=(); t2_unsynced=(); t2_synced=(); t1_synced=(); t3_notes=()

for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r tier globs triggers kind desc <<< "$entry"
  entry_triggered "$triggers" || continue          # 本次改动类型未触发该条目 → 跳过
  exist_raw="$(_entry_existing "$globs")"
  [ -z "$exist_raw" ] && continue                   # 仓库不存在该文件 → 不强制新建，跳过
  # 该条目现有文件是否任一已纳入变更
  inc=0; inc_list=(); total=0
  while IFS= read -r ef; do
    [ -z "$ef" ] && continue
    total=$((total+1))
    if in_changed "$ef"; then inc=1; inc_list+=("$ef"); fi
  done < <(printf '%s\n' "$exist_raw")

  label="$desc"
  if [ "$inc" -eq 1 ]; then
    case "$tier" in
      1) t1_synced+=("$label") ;;
      2) t2_synced+=("$label") ;;
    esac
  else
    case "$tier" in
      1) t1_unsynced+=("$label") ;;
      2) t2_unsynced+=("$label") ;;
      3) t3_notes+=("$label") ;;
    esac
  fi
done

# Tier 1 区块
echo "【Tier 1｜根级门面文档（阻断）】"
if [ "${#t1_synced[@]}" -gt 0 ]; then
  for x in "${t1_synced[@]}"; do echo "  ✅ $x 已纳入变更"; done
fi
if [ "${#t1_unsynced[@]}" -gt 0 ]; then
  for x in "${t1_unsynced[@]}"; do echo "  ❌ $x 未纳入变更  ← 阻断"; done
fi
if [ "${#t1_synced[@]}" -eq 0 ] && [ "${#t1_unsynced[@]}" -eq 0 ]; then
  echo "  （无可触发的 Tier 1 文档）"
fi
echo ""

# Tier 2 区块
echo "【Tier 2｜次级文档/契约（强建议）】"
if [ "${#t2_synced[@]}" -gt 0 ]; then
  for x in "${t2_synced[@]}"; do echo "  ✅ $x 已纳入变更"; done
fi
if [ "${#t2_unsynced[@]}" -gt 0 ]; then
  for x in "${t2_unsynced[@]}"; do echo "  ⚠️ $x 存在，本次改动未同步更新 → 建议确认是否需更新相关文件"; done
fi
if [ "${#t2_synced[@]}" -eq 0 ] && [ "${#t2_unsynced[@]}" -eq 0 ]; then
  echo "  （无可触发的 Tier 2 文档）"
fi
echo ""

# Tier 3 区块
echo "【Tier 3｜测试/清单（提示）】"
if [ "${#t3_notes[@]}" -gt 0 ]; then
  for x in "${t3_notes[@]}"; do echo "  ℹ️ $x 存在，本次含相关改动 → 建议确认是否需补测试/同步清单"; done
else
  echo "  （无可触发的 Tier 3 提示项）"
fi
echo ""

# ---------- 7. 结论与退出码 ----------
block=0
if [ "${#t1_unsynced[@]}" -gt 0 ]; then block=1; fi
if [ "$STRICT" -eq 1 ] && [ "${#t2_unsynced[@]}" -gt 0 ]; then block=1; fi

if [ "$block" -eq 1 ]; then
  echo "【文档同步状态】⚠️ 未同步："
  [ "${#t1_unsynced[@]}" -gt 0 ] && echo "  - Tier 1 阻断项：${t1_unsynced[*]}"
  if [ "$STRICT" -eq 1 ] && [ "${#t2_unsynced[@]}" -gt 0 ]; then
    echo "  - Tier 2 阻断项（--strict）：${t2_unsynced[*]}"
  fi
  echo ""
  echo "👉 请先基于真实变化更新上述未同步文档相应章节（README/README_EN 体现命令·配置·依赖·接口·功能·目录结构等；"
  echo "   功能性/可见行为变化在 CHANGELOG 顶部追加条目；Tier 2 按需更新 docs/·契约·i18n·examples 等），"
  echo "   并把文档一并 git add 进同一次提交(commit)，再执行提交。严禁在文档未同步时直接 git commit 代码。"
  exit 2
else
  echo "【文档同步状态】✅ 已同步（Tier 1 均已纳入变更）"
  if [ "${#t2_unsynced[@]}" -gt 0 ]; then
    echo "  注：存在 Tier 2 强建议项未同步（见上），提交(commit)前须处理或显式说明为何不改。"
  fi
  echo ""
  echo "👉 可进入标准流程的提交(commit)步骤（Tier 2 建议项请按上提示处理）。"
  exit 0
fi
