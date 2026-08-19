#!/usr/bin/env bash
# =============================================================================
# 文件名: gpm-regression/tests/test_gh_fix.sh
# 中文名: gh 封装脚本「显式 --repo」对抗式测试（审计缺陷核心回归）
#
# 【覆盖】
#   - sop_pr_checks.sh：fork 内部 PR 命中 / 跨目录调用 / 游离 HEAD 守卫 / 无 upstream 回退
#   - sop_ci_failed_log.sh：run list 必须带 --repo
#   - sop_ci_rerun.sh：run list / run rerun 必须带 --repo
#   - sop_pr_create.sh：--repo + --head 取值（有 upstream→上游；无 upstream→fork）
#   - sop_sync_upstream.sh：pr list 必须带 --repo
# =============================================================================

# 解析 "up|or|local"
_parse_triple() {
  local t="$1"
  TRIPLE_UP="${t%%|*}"
  local r="${t#*|}"; TRIPLE_OR="${r%%|*}"; TRIPLE_LOCAL="${r#*|}"
}

# 用例1：fork 内部 PR —— 修复后必须显式 --repo+分支 命中
test_pr_checks_fork_internal_pr() {
  local triple; triple="$(setup_triple)"
  _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "X"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/X )
  local out rc log
  out="$(run_script sop_pr_checks.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pr_checks rc=$rc out=$out"; return 1; fi
  log="$(last_call_log)"
  if ! grep -q -- "--repo zhangweildlh/gpm-forkrepo feat/X" "$log"; then
    fail "pr_checks 未显式传 --repo+分支; 调用日志: $(cat "$log")"; return 1
  fi
  if ! assert_contains "All checks have passed" "$out"; then fail "pr_checks 未命中 PR(应为 All checks passed): $out"; return 1; fi
  pass "fork 内部 PR: pr_checks 显式 --repo+分支 命中(不再 no pull requests found)"
}

# 用例2：跨目录调用（失效面 A）—— 从非仓库目录调用，--repo 仍须出现
test_pr_checks_cross_dir() {
  local triple; triple="$(setup_triple)"
  _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "Y"
  local other; other="$(make_fixture)"   # 非 git 目录
  local out rc log
  out="$( cd "$other" && run_script sop_pr_checks.sh "$TRIPLE_LOCAL" 2>&1 )"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pr_checks 跨目录 rc=$rc out=$out"; return 1; fi
  log="$(last_call_log)"
  if ! grep -q -- "--repo zhangweildlh/gpm-forkrepo feat/Y" "$log"; then
    fail "pr_checks 跨目录未传 --repo(失效面A未修): $(cat "$log")"; return 1
  fi
  pass "跨目录调用: pr_checks 仍显式 --repo(失效面A已修)"
}

# 用例3：游离 HEAD 守卫 —— 跳过 PR 检查，run list 不带 --branch
test_pr_checks_detached_head() {
  local triple; triple="$(setup_triple)"
  _parse_triple "$triple"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q "feat/X" 2>/dev/null; "$REAL_GIT" checkout -q "$(git rev-parse HEAD)" )  # 进入游离 HEAD
  local out rc log
  out="$(run_script sop_pr_checks.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pr_checks detached rc=$rc"; return 1; fi
  log="$(last_call_log)"
  if ! assert_contains "分离 HEAD" "$out"; then fail "pr_checks 未报游离 HEAD: $out"; return 1; fi
  if grep -q "pr checks" "$log"; then fail "pr_checks 在游离 HEAD 下仍调用了 pr checks: $(cat "$log")"; return 1; fi
  if ! grep -q -- "run list --repo zhangweildlh/gpm-forkrepo" "$log"; then fail "pr_checks 游离 HEAD 下 run list 未带 --repo: $(cat "$log")"; return 1; fi
  pass "游离 HEAD: 跳过 PR 检查且仅 run list --repo(守卫有效)"
}

# 用例4：无 upstream —— 仅 origin 也应回退 fork 自身并带 --repo
test_pr_checks_no_upstream() {
  local triple; triple="$(setup_triple)"
  _parse_triple "$triple"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" remote remove upstream )
  make_feat_and_push "$TRIPLE_LOCAL" "Z"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/Z )
  local out rc log
  out="$(run_script sop_pr_checks.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pr_checks 无upstream rc=$rc out=$out"; return 1; fi
  log="$(last_call_log)"
  if ! grep -q -- "--repo zhangweildlh/gpm-forkrepo" "$log"; then fail "pr_checks 无upstream 未取 origin 三元组: $(cat "$log")"; return 1; fi
  pass "无 upstream: pr_checks 回退 fork(origin) 自身并带 --repo"
}

# 用例5：ci_failed_log 必须带 --repo
test_ci_failed_log_repo() {
  local triple; triple="$(setup_triple)"
  _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "L"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/L )
  local out rc log
  out="$(run_script sop_ci_failed_log.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "ci_failed_log rc=$rc out=$out"; return 1; fi
  log="$(last_call_log)"
  if ! grep -q -- "run list --repo zhangweildlh/gpm-forkrepo" "$log"; then fail "ci_failed_log run list 未带 --repo: $(cat "$log")"; return 1; fi
  if ! grep -q -- "run view --repo zhangweildlh/gpm-forkrepo" "$log"; then fail "ci_failed_log run view 未带 --repo: $(cat "$log")"; return 1; fi
  pass "ci_failed_log: run list/view 均显式 --repo"
}

# 用例6：ci_rerun dry-run 必须带 --repo
test_ci_rerun_repo() {
  local triple; triple="$(setup_triple)"
  _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "R"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/R )
  local out rc log
  out="$(run_script sop_ci_rerun.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "ci_rerun rc=$rc out=$out"; return 1; fi
  log="$(last_call_log)"
  if ! grep -q -- "run list --repo zhangweildlh/gpm-forkrepo" "$log"; then fail "ci_rerun run list 未带 --repo: $(cat "$log")"; return 1; fi
  pass "ci_rerun: run list 显式 --repo(dry-run)"
}

# 用例7：pr_create 有 upstream → PR 开向上游
test_pr_create_targets_upstream() {
  local triple; triple="$(setup_triple)"
  _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "P"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/P )
  local gl; gl="$(make_fixture)/g.log"
  local out rc
  out="$(GIT_BIN="$REAL_GIT" GH_BIN="$FAKE_GH" GH_CALL_LOG="$gl" bash "$SKILL_SCRIPTS/sop_pr_create.sh" "$TRIPLE_LOCAL" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pr_create rc=$rc out=$out"; return 1; fi
  if ! grep -q -- "--repo upstreamorg/gpm-upstreamrepo" "$gl"; then fail "pr_create 未开向上游: $(cat "$gl")"; return 1; fi
  pass "pr_create: 有 upstream 时 PR 开向上游(--repo upstreamorg/gpm-upstreamrepo)"
}

# 用例8：pr_create 无 upstream → 回退 fork 自身
test_pr_create_fallback_fork() {
  local triple; triple="$(setup_triple)"
  _parse_triple "$triple"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" remote remove upstream )
  make_feat_and_push "$TRIPLE_LOCAL" "Q"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/Q )
  local gl; gl="$(make_fixture)/g.log"
  local out rc
  out="$(GIT_BIN="$REAL_GIT" GH_BIN="$FAKE_GH" GH_CALL_LOG="$gl" bash "$SKILL_SCRIPTS/sop_pr_create.sh" "$TRIPLE_LOCAL" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pr_create rc=$rc out=$out"; return 1; fi
  if ! grep -q -- "--repo zhangweildlh/gpm-forkrepo" "$gl"; then fail "pr_create 无upstream 未回退 fork: $(cat "$gl")"; return 1; fi
  pass "pr_create: 无 upstream 时回退 fork(--repo zhangweildlh/gpm-forkrepo)"
}

# 用例9：sync_upstream pr list 必须带 --repo
# 注：脚本在 M=0 且 K=0(已同步)时于早期退出、不调用 gh；故先 make_local_ahead
#     让 fork 领先上游(M>0)，脚本才会进入 PR 核查分支调用 gh pr list --repo。
test_sync_upstream_pr_list_repo() {
  local triple; triple="$(setup_triple)"
  _parse_triple "$triple"
  make_local_ahead "$TRIPLE_LOCAL"
  local out rc log
  out="$(run_script sop_sync_upstream.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  log="$(last_call_log)"
  if ! grep -q -- "pr list --repo" "$log"; then fail "sync_upstream pr list 未带 --repo: $(cat "$log" 2>/dev/null)"; return 1; fi
  pass "sync_upstream: pr list 显式 --repo"
}

register_test "pr_checks: fork内部PR命中--repo" test_pr_checks_fork_internal_pr
register_test "pr_checks: 跨目录调用--repo" test_pr_checks_cross_dir
register_test "pr_checks: 游离HEAD守卫" test_pr_checks_detached_head
register_test "pr_checks: 无upstream回退fork" test_pr_checks_no_upstream
register_test "ci_failed_log: run list/view --repo" test_ci_failed_log_repo
register_test "ci_rerun: run list --repo" test_ci_rerun_repo
register_test "pr_create: 有upstream开向上游" test_pr_create_targets_upstream
register_test "pr_create: 无upstream回退fork" test_pr_create_fallback_fork
register_test "sync_upstream: pr list --repo" test_sync_upstream_pr_list_repo
