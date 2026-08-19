#!/bin/sh
# sop_scope_check.sh —— worktree 分支 scope 合规检查（可单独运行）。
#
# 用途：在 worktree 分支提交前 / CI 中检查「暂存文件是否全部属于当前分支声明的 scope」，
#       与 .githooks/pre-commit 中的 scope 校验共用同一套 AGENTS.md 第 2 章解析规则。
#
# 用法：
#   bash scripts/sop_scope_check.sh [<仓库路径>]
#     <仓库路径> 可选，默认当前目录；仓库根或仓库内任意子目录均可。
#
# 输入：
#   1. 当前分支名（git symbolic-ref --short HEAD）
#   2. AGENTS.md 第 2 章 scope 清单（简单 grep，不依赖 YAML 解析库）
#   3. 暂存文件清单（git diff --cached --name-only）
#
# 分支名解析：feat/<name>-<topic>-<YYYYMMDDHHMMSS>，取 <name> 段；
#   <name> 取自 AGENTS.md 第 2 章已知集合（2.1 目录型 `dir/<目录名>`、2.2 文件型表格 name 列、字面 meta），
#   采用最长前缀匹配（name 与 topic 都可能含连字符）。
#
# scope 类型：
#   dir   —— 分支属于某目录型 Skill，允许路径 = <目录名>/*
#   file  —— 分支属于某根级 Skill 文件，允许路径 = 对应根级文件名
#   meta  —— 分支属于共享/元 scope，允许路径 = scripts/、.github/、README.md、
#            CHANGELOG.md、AGENTS.md、Memory-Data/
#   unknown —— 分支匹配 feat/<...>-<时间戳> 格式但 <name> 无法解析（分支命名不合规或清单未同步）
#
# 输出：scope 标识（name）、scope 类型、暂存文件是否全部合规（否则列出违规文件）。
# 退出码：0 = 合规或非 worktree 分支；1 = 混入违规；2 = 参数/解析错误。
set -e

# ---------- 0. 解析仓库路径参数 ----------
if [ "$#" -gt 1 ]; then
  echo "❌ 用法：bash scripts/sop_scope_check.sh [<仓库路径>]" >&2
  exit 2
fi

TARGET_DIR="${1:-$(pwd)}"
if ! cd "$TARGET_DIR" 2>/dev/null; then
  echo "❌ 无法进入路径: $TARGET_DIR" >&2
  exit 2
fi

REPO_ROOT_MSYS=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -z "$REPO_ROOT_MSYS" ]; then
  echo "❌ 路径 '$TARGET_DIR' 不在 git 仓库内" >&2
  exit 2
fi

# ---------- 1. 读取分支 ----------
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ -z "$BRANCH" ]; then
  echo "⚠️ 无法获取当前分支（detached HEAD？），跳过 scope 检查" >&2
  exit 0
fi

# ---------- 2. 解析 <name> 段 ----------
AGENTS="$REPO_ROOT_MSYS/AGENTS.md"
if [ ! -f "$AGENTS" ]; then
  echo "⚠️ 未找到 AGENTS.md，跳过 scope 检查" >&2
  exit 2
fi

SCOPE_NAME=""
BRANCH_IS_FEAT=0
if echo "$BRANCH" | grep -Eq '^feat/[A-Za-z0-9._-]+-[0-9]{14}$'; then
  BRANCH_IS_FEAT=1
  # 去掉 feat/ 前缀与尾部 -<14位时间戳>，得到 "<name>-<topic>" 候选串
  CAND=$(echo "$BRANCH" | sed -E 's/^feat\///; s/-[0-9]{14}$//')
  # 收集 AGENTS.md 第 2 章已知 name（2.1 目录名 + 2.2 表格 name 列，外加字面 meta）
  KNOWN_NAMES=$(grep -E '^[[:space:]]*-[[:space:]]*`dir/' "$AGENTS" \
                 | sed -E 's/.*`dir\/([^`]+)`.*/\1/')
  KNOWN_NAMES="$KNOWN_NAMES $(grep -E '^[[:space:]]*\| .+ \| `[a-z0-9-]+` \|$' "$AGENTS" \
                 | sed -E 's/.*\| `([a-z0-9-]+)` \|$/\1/')"
  # 最长前缀匹配
  for n in $KNOWN_NAMES meta; do
    case "$CAND" in
      "$n"|"$n-"*)
        if [ "${#n}" -gt "${#SCOPE_NAME}" ]; then
          SCOPE_NAME="$n"
        fi
        ;;
    esac
  done
fi

if [ "$BRANCH_IS_FEAT" -eq 1 ] && [ -z "$SCOPE_NAME" ]; then
  # 分支符合 feat/<name>-<topic>-<timestamp> 命名，但 <name> 无法在 AGENTS.md 第 2 章解析出已知 scope
  echo "❌ 无法从分支名解析所属 scope（分支: $BRANCH）。" >&2
  echo "   请检查分支命名是否符合 feat/<name>-<topic>-<timestamp>，" >&2
  echo "   或运行 scripts/sync-scope-manifest.py --update 同步 AGENTS.md 第 2 章清单。" >&2
  exit 2
fi

if [ -z "$SCOPE_NAME" ]; then
  echo "ℹ️ 分支 '$BRANCH' 非 worktree 纪律分支（feat/<name>-<topic>-<timestamp>），scope 检查跳过"
  exit 0
fi

# ---------- 3. 判定 scope 类型与允许路径 ----------
SCOPE_TYPE="unknown"
SCOPE_DIR=""
FILE_PATH=""

if grep -Eq "^[[:space:]]*-[[:space:]]*\`dir/$SCOPE_NAME\`" "$AGENTS"; then
  SCOPE_TYPE="dir"
  SCOPE_DIR="$SCOPE_NAME"
elif [ "$SCOPE_NAME" = "meta" ]; then
  SCOPE_TYPE="meta"
elif grep -Eq "^[[:space:]]*\| .* \| \`$SCOPE_NAME\` \|$" "$AGENTS"; then
  FILE_PATH=$(grep -E "^[[:space:]]*\| .* \| \`$SCOPE_NAME\` \|$" "$AGENTS" \
               | sed -E 's/^[[:space:]]*\| (.*) \| `[a-z0-9-]+` \|$/\1/' | sed 's/[[:space:]]*$//')
  if [ -n "$FILE_PATH" ]; then
    SCOPE_TYPE="file"
  fi
fi

if [ "$SCOPE_TYPE" = "unknown" ]; then
  echo "❌ 无法从分支名解析所属 scope（分支: $BRANCH，候选 name: $SCOPE_NAME）。" >&2
  echo "   请检查分支命名是否符合 feat/<name>-<topic>-<timestamp>，" >&2
  echo "   或运行 scripts/sync-scope-manifest.py --update 同步 AGENTS.md 第 2 章清单。" >&2
  exit 2
fi

# ---------- 4. 校验暂存文件 ----------
echo "=== scope 检查报告 ==="
echo "仓库路径 : $REPO_ROOT_MSYS"
echo "当前分支 : $BRANCH"
echo "scope    : $SCOPE_NAME"
echo "scope 类型: $SCOPE_TYPE"

STAGED=$(git diff --cached --name-only)
if [ -z "$STAGED" ]; then
  echo "暂存文件 : （无）"
  echo "结果     : ✅ 合规（无暂存文件）"
  exit 0
fi

VIOL_COUNT=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  ok=0
  case "$SCOPE_TYPE" in
    dir)
      case "$f" in
        "$SCOPE_DIR/"*) ok=1 ;;
      esac
      ;;
    file)
      [ "$f" = "$FILE_PATH" ] && ok=1
      ;;
    meta)
      case "$f" in
        scripts/*|.github/*|README.md|CHANGELOG.md|AGENTS.md|Memory-Data/*) ok=1 ;;
      esac
      ;;
  esac
  if [ "$ok" -eq 0 ]; then
    [ "$VIOL_COUNT" -eq 0 ] && echo "违规文件 :"
    echo "   - $f"
    VIOL_COUNT=$((VIOL_COUNT + 1))
  fi
done <<EOF
$STAGED
EOF

if [ "$VIOL_COUNT" -gt 0 ]; then
  echo "结果     : ❌ 暂存文件未全部属于 scope '$SCOPE_NAME'（$VIOL_COUNT 个违规文件）"
  exit 1
fi

echo "结果     : ✅ 暂存文件全部属于 $SCOPE_TYPE/$SCOPE_NAME"
exit 0
