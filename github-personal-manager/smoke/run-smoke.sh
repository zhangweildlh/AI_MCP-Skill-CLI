#!/usr/bin/env bash
# github-personal-manager 冒烟测试入口
# 用法: bash smoke/run-smoke.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Windows 下将 POSIX 路径(/d/...)转为 Windows 形式(D:/...)，否则 git/gh(Windows 二进制)
# 无法识别路径参数，导致 clone 等静默失败。cygpath 不存在时（Linux/macOS）保持原样。
if command -v cygpath >/dev/null 2>&1; then
  SCRIPT_DIR="$(cygpath -m "$SCRIPT_DIR")"
  ROOT_DIR="$(cygpath -m "$ROOT_DIR")"
fi

# 加载本机配置（若存在）
if [ -f "$ROOT_DIR/config/github-sop.config.sh" ]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/config/github-sop.config.sh"
fi

# 默认值（配置留空时回退 PATH）
GIT_BIN="${GIT_BIN:-git}"
GH_BIN="${GH_BIN:-gh}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
TEST_TMP="${TEST_REPO_DIR:-$SCRIPT_DIR/tmp}"
mkdir -p "$TEST_TMP"

# 加载框架与用例
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/harness.sh"
for t in "$SCRIPT_DIR"/tests/test_*.sh; do
  # shellcheck disable=SC1091
  source "$t"
done

echo "=== github-personal-manager 冒烟测试 ==="
echo "GIT_BIN=$GIT_BIN"
echo "GH_BIN=$GH_BIN"
echo "MAIN_BRANCH=$MAIN_BRANCH"
echo "TEST_TMP=$TEST_TMP"
echo

run_all
