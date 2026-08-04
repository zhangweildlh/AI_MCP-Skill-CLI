#!/usr/bin/env bash
# =============================================================================
# 脚本名: smoke/run-smoke.sh
# 中文名: 冒烟测试统一入口
#
# 【功能】
#   本技能全部冒烟测试的唯一执行入口，按五步串起整条测试链路：
#     1. 解析自身与技能根目录；在 Windows 下把 POSIX 风格路径转成盘符风格，
#        否则 Windows 版 git / gh 无法识别路径参数，会导致克隆等操作静默失败；
#     2. 载入本机配置 config/github-sop.config.sh（存在时）；
#     3. 补齐默认值：工具路径优先用 where.exe 解析，其次回退到 PATH 上的裸命令，
#        与 SKILL.md「阶段 0·工具路径不硬编码」契约保持一致；
#     4. 载入测试框架 lib/harness.sh，并自动 source tests/ 下全部 test_*.sh 完成用例注册；
#     5. 打印本次运行环境摘要，执行 run_all 汇总通过 / 失败 / 跳过数量。
#
# 【用途 / 使用场景】
#   1. 修改任意 SOP 脚本后的回归验证：确认改动没有破坏既有契约。
#   2. 换机器部署本技能后的自检：确认 git / gh 可用、配置正确。
#   3. 提交前的门禁自查：与文档同步检查配合，构成提交前的双重保障。
#
# 【详细用法】
#   基本用法:
#     bash smoke/run-smoke.sh          # 在技能根目录执行，跑完全部用例
#
#   参数说明:
#     本入口不接受命令行参数；运行行为完全由配置文件与环境变量决定。
#
#   环境变量 / 配置项（可由 config/github-sop.config.sh 提供，均有回退默认值）:
#     GIT_BIN           git 可执行文件路径；留空时自动解析
#     GH_BIN            gh 可执行文件路径；留空时自动解析
#     MAIN_BRANCH       主分支名，默认 main
#     ORIGIN_REMOTE     你的远端仓库别名，默认 origin
#     UPSTREAM_REMOTE   上游远端别名，默认 upstream
#     TEST_REPO_DIR     夹具仓库根目录；留空则用 smoke/tmp
#
#   输出说明:
#     每条用例打印 [PASS] / [FAIL] / [SKIP]，结尾给出三类计数汇总。
#     被测脚本缺失时用例记为 SKIP，不会让整体变红。
#
# 【注意事项】
#   - 全部用例都在临时夹具仓库上运行，不会改动任何真实仓库，也不产生远端副作用。
#   - 需要 GitHub 交互的用例采用桩(stub)方式模拟，不依赖真实网络与鉴权。
#   - 若大量用例显示 SKIP，通常是被测脚本路径不对或配置未载入，请先核对技能根目录。
# =============================================================================
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

# 默认值（配置留空时回退）：优先 where.exe 解析实际路径（Windows 首选），否则 PATH 上的裸命令。
# 与 SKILL.md「阶段 0」「工具路径不硬编码」契约保持一致——不得写死 git/gh 路径。
if [ -z "${GIT_BIN:-}" ]; then
  if command -v where.exe >/dev/null 2>&1; then
    GIT_BIN="$(where.exe git 2>/dev/null | head -n1)"
  fi
  [ -z "${GIT_BIN:-}" ] && GIT_BIN="git"
fi
if [ -z "${GH_BIN:-}" ]; then
  if command -v where.exe >/dev/null 2>&1; then
    GH_BIN="$(where.exe gh 2>/dev/null | head -n1)"
  fi
  [ -z "${GH_BIN:-}" ] && GH_BIN="gh"
fi
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
