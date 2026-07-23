#!/usr/bin/env bash
# github-personal-manager 冒烟测试框架（轻量，无外部依赖）
# 提供：用例注册、断言、夹具创建、汇总。被测脚本缺失时用例以 SKIP 标记，基座本身不因此变红。

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
