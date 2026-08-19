#!/usr/bin/env bash
# =============================================================================
# 文件名: gpm-regression/run.sh
# 中文名: 回归测试统一入口
#
# 【职责】解析工具路径、加载框架与全部用例、执行并汇总。
#   全部用例在本地三层夹具(上游/远端fork/本地) + fake gh 下离线运行，不触网。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 真实 git：优先用 POSIX 路径（command -v 在 Git Bash 下返回 /mingw64/bin/git），
# 保证夹具路径(POSIX)与 git 二进制路径(POSIX)一致；where.exe 返回的是 Windows 路径，
# 会被 cygpath 转为 POSIX 作为回退。
REAL_GIT="$(command -v git 2>/dev/null || true)"
if [ -z "$REAL_GIT" ] && command -v where.exe >/dev/null 2>&1; then
  REAL_GIT="$(cygpath -u "$(where.exe git 2>/dev/null | head -n1)" 2>/dev/null || true)"
fi
[ -z "$REAL_GIT" ] && { echo "❌ 找不到 git"; exit 1; }

FAKE_GH="$SCRIPT_DIR/fakebin/gh"
chmod +x "$FAKE_GH"

# 被测技能根目录：框架可放在 <技能根>/regression/（CI 内）或任意临时目录（本地调试）。
# 优先按「框架与 scripts/ 平级」自定位，避免写死安装路径；不在技能仓库内时回退已知路径。
if [ -f "$SCRIPT_DIR/../scripts/lib/sop-common.sh" ]; then
  SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  SKILL_ROOT="D:/Documents/AI_MCP-Skill-CLI/github-personal-manager"
fi
SKILL_SCRIPTS="$SKILL_ROOT/scripts"

# 夹具临时目录：必须转为 Windows 盘符形态(D:/...)，而非 POSIX(/d/...)。
# 根因：本机 git.exe(Git for Windows) 会把 POSIX 形态 /d/... 当作相对路径，
# 错误地建到 D:/d/...；而技能脚本(及本框架)对 Windows 形态 D:/... 原生兼容。
# 故全部夹具/日志路径统一用 D:/... 形态，确保 git.exe 正确解析。
TEST_TMP_RAW="$SCRIPT_DIR/tmp"
mkdir -p "$TEST_TMP_RAW"
TEST_TMP="$(cygpath -w "$TEST_TMP_RAW" 2>/dev/null | tr '\\' '/')"
[ -z "$TEST_TMP" ] && TEST_TMP="$TEST_TMP_RAW"
mkdir -p "$TEST_TMP"
# CI / 离线环境健壮性：确保 TEST_TMP 可写（夹具仓库与日志均落此目录，否则回归无法运行）
if ! touch "$TEST_TMP/.writetest" 2>/dev/null; then
  echo "❌ 夹具临时目录不可写：$TEST_TMP（请检查 CI 运行器对该目录的写权限）"; exit 1
fi
rm -f "$TEST_TMP/.writetest"

export REAL_GIT FAKE_GH SKILL_SCRIPTS SKILL_ROOT TEST_TMP

source "$SCRIPT_DIR/harness.sh"
source "$SCRIPT_DIR/lib/fixtures.sh"
for t in "$SCRIPT_DIR"/tests/test_*.sh; do
  # shellcheck disable=SC1090
  source "$t"
done

echo "=== github-personal-manager 本地离线回归 ==="
echo "REAL_GIT=$REAL_GIT"
echo "FAKE_GH=$FAKE_GH"
echo "SKILL_SCRIPTS=$SKILL_SCRIPTS"
echo "TEST_TMP=$TEST_TMP"
echo

run_all
