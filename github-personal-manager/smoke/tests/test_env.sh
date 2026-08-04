#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/tests/test_env.sh
# 中文名: L0 环境层测试（工具可用性与登录态）
#
# 【功能】
#   冒烟测试的最底层（L0）用例集，验证运行本技能所需的外部环境是否就绪，共三条用例：
#     1. git 可用：能正常执行并返回版本号；
#     2. gh 可用：能正常执行并返回版本号；
#     3. gh 登录态：GitHub 命令行已完成认证，具备调用接口的权限。
#   任一条不通过，都意味着后续的契约层用例即使失败也无法定位到脚本自身，应先修环境。
#
# 【用途 / 使用场景】
#   1. 换机器部署本技能后的第一道自检：确认工具链齐全。
#   2. 大批用例集体失败时的分诊入口：先看 L0 是否变红，判断是环境问题还是脚本问题。
#   3. 定期巡检：确认 GitHub 命令行的登录凭据尚未过期。
#
# 【详细用法】
#   本文件不单独执行，由 smoke/run-smoke.sh 自动 source 并注册用例。
#   如需只关注本层结果，运行冒烟测试后查看输出中前缀为「L0-环境」的三条记录即可。
#
#   依赖的外部变量（由 run-smoke.sh 预先准备）:
#     GIT_BIN   git 可执行文件路径
#     GH_BIN    gh 可执行文件路径
#
# 【注意事项】
#   - 本层用例只做只读探测，不改动任何仓库、不发起写操作。
#   - 登录态用例依赖网络与既有凭据；离线环境下该条失败属预期，不代表脚本有问题。
# =============================================================================
test_env_git_available() {
  if "$GIT_BIN" --version >/dev/null 2>&1; then
    pass "git 可用: $("$GIT_BIN" --version)"
    return 0
  else
    fail "git 不可用 (GIT_BIN=$GIT_BIN)"
    return 1
  fi
}

test_env_gh_available() {
  if "$GH_BIN" --version >/dev/null 2>&1; then
    pass "gh 可用: $("$GH_BIN" --version | head -1)"
    return 0
  else
    fail "gh 不可用 (GH_BIN=$GH_BIN)"
    return 1
  fi
}

test_env_gh_auth() {
  if "$GH_BIN" auth status --hostname github.com >/dev/null 2>&1; then
    pass "gh 已登录 github.com"
    return 0
  else
    skip "gh 未登录 github.com（仅影响需鉴权用例；L0 不强制）"
    return 2
  fi
}

register_test "L0-环境: git 可用" test_env_git_available
register_test "L0-环境: gh 可用" test_env_gh_available
register_test "L0-环境: gh 登录态" test_env_gh_auth
