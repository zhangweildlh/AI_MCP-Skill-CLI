#!/usr/bin/env bash
# =============================================================================
# 文件名: gpm-regression/harness.sh
# 中文名: 本地回归测试框架（零外部依赖，自包含）
#
# 【功能】
#   为 github-personal-manager 技能的全部 sop_*.sh 脚本提供本地、离线、确定性的
#   回归测试基座。核心能力：
#     1. 用例注册：register_test <用例名> <函数名>；
#     2. 结果输出：pass / fail / skip（统一前缀）；
#     3. 断言原语：assert_eq / assert_rc / assert_true / assert_false /
#        assert_contains / assert_not_contains；
#     4. 夹具：make_fixture 建唯一临时目录；init_fixture_repo 初始化本地测试仓库；
#     5. 调度：run_all 顺序执行并汇总计数。
#
#   调用约定（与技能脚本契约一致）：
#     - 测试通过注入 GIT_BIN（真实 git）+ GH_BIN（fake gh）环境变量驱动被测脚本，
#       不依赖真实网络与 GitHub 鉴权；
#     - 每个用例在子 shell 中执行，互不污染；
#     - 用例返回码：0=通过，2=跳过，其他=失败。
#
#   依赖外部变量（由 run.sh 准备）：
#     REAL_GIT        真实 git 可执行文件路径
#     FAKE_GH         fake gh 脚本路径
#     SKILL_SCRIPTS   技能 scripts/ 目录绝对路径
#     TEST_TMP        夹具临时目录根
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
assert_rc() {
  if [ "$1" = "$2" ]; then return 0; fi
  echo "    assert_rc 失败: 实际rc[$1] 期望[$2]"; return 1
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
assert_not_contains() {
  if printf '%s' "$2" | grep -qF -- "$1"; then
    echo "    assert_not_contains 失败: [$1] 意外出现在输出中"; return 1
  fi
  return 0
}

# 建唯一临时夹具目录并返回路径
make_fixture() {
  local d="$TEST_TMP/fx_$(date +%s%N)_$RANDOM"
  mkdir -p "$d"
  echo "$d"
}

# 初始化本地 git 仓库（含测试身份，不污染全局配置）
init_fixture_repo() {
  local d="$1"
  ( cd "$d" && "$REAL_GIT" init -q -b main \
    && "$REAL_GIT" config user.email regression@example.com \
    && "$REAL_GIT" config user.name regression )
}

# 运行被测脚本（注入 fake gh + 真实 git），把 gh 调用记入 CALL_LOG
# 用法: run_script <脚本名.sh> [参数...]  -> 输出到 stdout，rc 透传
# 注意：为避免命令替换子 shell 隔离导致 CALL_LOG 无法回传，日志路径写入磁盘
#       $TEST_TMP/.last_call_log，last_call_log() 从磁盘读取。
run_script() {
  local script="$1"; shift
  CALL_LOG="$(make_fixture)/gh_calls.log"
  echo "$CALL_LOG" > "$TEST_TMP/.last_call_log"
  GH_CALL_LOG="$CALL_LOG" GIT_BIN="$REAL_GIT" GH_BIN="$FAKE_GH" \
    bash "$SKILL_SCRIPTS/$script" "$@"
}

# 仅取最近一次 run_script 的 gh 调用日志路径（供断言）
last_call_log() { cat "$TEST_TMP/.last_call_log" 2>/dev/null; }

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
  echo "回归汇总: PASS=$SMOKE_PASS  SKIP=$SMOKE_SKIP  FAIL=$SMOKE_FAIL"
  echo "=========================================="
  [ "$SMOKE_FAIL" -eq 0 ]
}
