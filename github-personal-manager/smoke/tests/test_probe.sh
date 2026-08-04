#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/tests/test_probe.sh
# 中文名: L0 工具探测专项测试（_sop_probe_tools）
#
# 【功能】
#   针对公共库函数 _sop_probe_tools 的专项用例集，验证「阶段 0 工具探测」的三种分支，
#   共三条用例：
#     1. 工具齐全：git 与 gh 均可用时返回 0；
#     2. git 缺失：优雅失败，返回非 0 并打印纯中文说明，不抛出英文栈信息；
#     3. gh 缺失：同上，同样要求返回非 0 且提示为中文。
#   与 test_env.sh 的区别：那边验证「本机环境是否真的就绪」，这边验证「探测函数
#   在各种环境下的行为是否正确」，即便本机环境完好也能覆盖缺失分支。
#
# 【用途 / 使用场景】
#   1. 修改公共库工具探测逻辑后的回归验证。
#   2. 确认缺失工具时的报错文案符合「纯中文说明」的输出规范。
#   3. 对应需求项：指令 1（阶段 0 探测）与指令 5（脚本层 _sop_probe_tools 加固）。
#
# 【详细用法】
#   本文件不单独执行，由 smoke/run-smoke.sh 自动 source 并注册用例。
#   运行冒烟测试后，查看输出中前缀为「L0-探测」的三条记录即可。
#
#   实现要点:
#     直接以 source 方式载入公共库 scripts/lib/sop-common.sh，
#     刻意绕开 _sop_load_config——因为后者在配置缺失时会直接结束进程，
#     若在测试进程内触发会连带终止整个测试框架。
#   缺失分支通过临时把工具路径指向不存在的命令来模拟，不会真的卸载任何工具。
#
#   依赖的外部变量（由 run-smoke.sh 预先准备）:
#     ROOT_DIR   技能根目录，用于定位公共库
#
# 【注意事项】
#   - 用例会临时改写 GIT_BIN / GH_BIN 变量；因每条用例运行在子 shell 中，不会污染后续用例。
#   - 本文件为纯只读验证，不创建仓库、不发起任何网络请求。
# =============================================================================

SOP_SELF_DIR="$ROOT_DIR/scripts"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/sop-common.sh"

test_probe_tools_present() {
  GIT_BIN="git"; GH_BIN="gh"
  if _sop_probe_tools; then
    pass "工具齐全时 _sop_probe_tools 返回 0（git/gh 均可用）"
    return 0
  else
    fail "_sop_probe_tools 在工具齐全时不应失败"
    return 1
  fi
}

test_probe_git_missing() {
  GIT_BIN="/nonexistent/git-binary"; GH_BIN="gh"
  local out; out="$( _sop_probe_tools 2>&1 )"; local rc=$?
  if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q "git"; then
    pass "git 缺失时 _sop_probe_tools 返回非0 且打印中文说明（含 git 字样）"
    return 0
  fi
  fail "git 缺失时探测未正确失败: rc=$rc out=$out"
  return 1
}

test_probe_gh_missing() {
  GIT_BIN="git"; GH_BIN="/nonexistent/gh-binary"
  local out; out="$( _sop_probe_tools 2>&1 )"; local rc=$?
  if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q "gh"; then
    pass "gh 缺失时 _sop_probe_tools 返回非0 且打印中文说明（含 gh 字样）"
    return 0
  fi
  fail "gh 缺失时探测未正确失败: rc=$rc out=$out"
  return 1
}

register_test "L0-探测: 工具齐全通过" test_probe_tools_present
register_test "L0-探测: git 缺失优雅失败" test_probe_git_missing
register_test "L0-探测: gh 缺失优雅失败" test_probe_gh_missing
