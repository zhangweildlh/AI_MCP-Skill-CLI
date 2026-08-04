#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/lib/harness.sh
# 中文名: 冒烟测试框架（轻量实现，无外部依赖）
#
# 【功能】
#   为本技能的冒烟测试提供最小可用的测试基座，共四组能力：
#     1. 用例注册：register_test <用例名> <函数名>，把用例登记进待执行队列；
#     2. 结果输出：pass / fail / skip 三个打印函数，统一 [PASS] / [FAIL] / [SKIP] 前缀；
#     3. 断言原语：assert_eq（值相等）、assert_true（返回码为 0）、
#        assert_false（返回码非 0）、assert_contains（输出包含指定子串，按字面量匹配）；
#     4. 夹具与调度：make_fixture 创建唯一临时目录，init_fixture_repo 初始化本地测试仓库，
#        run_all 顺序执行全部用例并汇总三类计数。
#   用例函数的返回码约定：0 表示通过，2 表示跳过，其他非 0 值表示失败。
#
# 【用途 / 使用场景】
#   1. 被 run-smoke.sh 自动载入，作为所有 tests/test_*.sh 的公共基座。
#   2. 新增测试用例时，直接调用本文件提供的断言与夹具函数，无需自行造轮子。
#   3. 被测脚本尚未实现时，用例返回 2 记为跳过，让基座本身不因此变红。
#
# 【详细用法】
#   本文件不单独执行，由 run-smoke.sh 以 source 方式载入。
#   编写一个用例的标准写法:
#     test_demo() {
#       local d; d="$(make_fixture)"        # 建临时夹具目录
#       init_fixture_repo "$d"              # 初始化本地测试仓库
#       local out; out="$(some_command)"
#       if assert_contains "期望片段" "$out"; then pass "用例说明"; return 0; fi
#       fail "实际输出: $out"; return 1
#     }
#     register_test "用例显示名" test_demo   # 文件末尾统一注册
#
#   依赖的外部变量（由 run-smoke.sh 预先准备）:
#     TEST_TMP      夹具临时目录根
#     GIT_BIN       git 可执行文件路径
#     MAIN_BRANCH   初始化夹具仓库时使用的主分支名
#
# 【注意事项】
#   - 每个用例在子 shell 中执行，用例内的变量与目录切换不会污染后续用例。
#   - 夹具目录名带时间戳与随机数，可安全并发创建，不会互相覆盖。
#   - 夹具仓库会写入独立的提交身份，不会读取或改动你的 git 全局配置。
#   - 本框架刻意保持轻量、零外部依赖，请勿在此引入第三方测试库。
# =============================================================================

SMOKE_PASS=0
SMOKE_FAIL=0
SMOKE_SKIP=0
declare -a _T_NAMES=()
declare -a _T_FUNCS=()

register_test() { _T_NAMES+=("$1"); _T_FUNCS+=("$2"); }

pass() { echo "  [PASS] $*"; }
fail() { echo "  [FAIL] $*"; }
skip() { echo "  [SKIP] $*"; }

assert_eq() {
  if [ "$1" = "$2" ]; then return 0; fi
  echo "    assert_eq 失败: 实际[$1] 期望[$2]"; return 1
}
assert_true() {
  if [ "$1" = "0" ]; then return 0; fi
  echo "    assert_true 失败(rc=$1)"; return 1
}
assert_false() {
  if [ "$1" != "0" ]; then return 0; fi
  echo "    assert_false 失败(rc=0)"; return 1
}
assert_contains() {
  if printf '%s' "$2" | grep -qF -- "$1"; then return 0; fi
  echo "    assert_contains 失败: [$1] 不在输出中"; return 1
}

# 创建一个临时夹具目录，返回其路径
make_fixture() {
  local d="$TEST_TMP/fx_$(date +%s%N)_$RANDOM"
  mkdir -p "$d"
  echo "$d"
}

# 在给定目录初始化一个本地 git 仓库（含测试用 user 身份）
init_fixture_repo() {
  local d="$1"
  ( cd "$d" && "$GIT_BIN" init -q -b "$MAIN_BRANCH" \
    && "$GIT_BIN" config user.email smoke@example.com \
    && "$GIT_BIN" config user.name smoke )
}

# 运行所有已注册用例；rc: 0=通过(无失败), 非0=有失败
run_all() {
  local i n=${#_T_FUNCS[@]}
  for ((i = 0; i < n; i++)); do
    echo "▶ ${_T_NAMES[$i]}"
    ( "${_T_FUNCS[$i]}" )
    local rc=$?
    case $rc in
      0) SMOKE_PASS=$((SMOKE_PASS + 1)) ;;
      2) SMOKE_SKIP=$((SMOKE_SKIP + 1)) ;;
      *) SMOKE_FAIL=$((SMOKE_FAIL + 1)) ;;
    esac
  done
  echo "=========================================="
  echo "冒烟汇总: PASS=$SMOKE_PASS  SKIP=$SMOKE_SKIP  FAIL=$SMOKE_FAIL"
  echo "=========================================="
  [ "$SMOKE_FAIL" -eq 0 ]
}
