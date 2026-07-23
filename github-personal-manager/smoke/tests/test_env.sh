#!/usr/bin/env bash
# L0 环境测试：git/gh 可用性、版本、登录态
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
