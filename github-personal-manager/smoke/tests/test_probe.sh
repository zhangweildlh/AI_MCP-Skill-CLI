#!/usr/bin/env bash
# 工具探测（_sop_probe_tools）专项测试
# 直接 source 公共库（不经 _sop_load_config，避免其在缺失时直接 exit 影响测试框架）。
# 验证：工具齐全返回 0；git 或 gh 缺失返回非0 并打印纯中文说明。
# 对应需求：指令1（阶段0探测）与指令5（脚本层 _sop_probe_tools 加固）。

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
