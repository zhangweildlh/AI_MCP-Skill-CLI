#!/usr/bin/env bash
# =============================================================================
# 文件名: gpm-regression/tests/test_sync_pull_ff.sh
# 中文名: 快进拉取 main 四状态 + 守卫全边界回归
#
# 【覆盖】
#   sop_sync_pull_ff.sh —— 已同步 / 落后(pull) / 领先(push) / 双向分叉 / 脏工作区 /
#                         非 main / 未知选项
# =============================================================================

# 往 origin 裸仓推独立提交，使 local 相对 origin 落后
_make_origin_ahead_ff() {
  local origin="$1"; local local="$2"
  local tw="$TEST_TMP/oa_$(date +%s%N)_$RANDOM"; mkdir -p "$tw"
  "$REAL_GIT" init -q -b main "$tw"
  ( cd "$tw" \
    && "$REAL_GIT" config user.email r@e.com \
    && "$REAL_GIT" config user.name r \
    && "$REAL_GIT" remote add origin "$origin" \
    && "$REAL_GIT" fetch -q origin \
    && "$REAL_GIT" checkout -q -b main "origin/main" \
    && echo "origin ahead" > oa.txt \
    && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "origin ahead" \
    && "$REAL_GIT" push -q origin main )
  rm -rf "$tw"
  ( cd "$local" && "$REAL_GIT" fetch -q origin )
}

# 在 local 提交但不推送 origin → 真正“本地领先”
_make_local_ahead_only() {
  local local="$1"
  ( cd "$local" \
    && "$REAL_GIT" checkout -q main \
    && echo "local change" > local.txt \
    && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "local ahead" )
}

test_pullff_synced() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_sync_pull_ff.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pull_ff 已同步 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "已同步" "$out"; then fail "pull_ff 未报已同步: $out"; return 1; fi
  pass "sync_pull_ff: 已同步(落后0领先0) → rc=0"
}

test_pullff_behind_dryrun() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  _make_origin_ahead_ff "$TRIPLE_OR" "$TRIPLE_LOCAL"
  local out rc
  out="$(run_script sop_sync_pull_ff.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pull_ff 落后 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "git pull --ff-only" "$out"; then fail "pull_ff 落后未打印 pull: $out"; return 1; fi
  if ! assert_contains "[dry-run]" "$out"; then fail "pull_ff 落后未标记 dry-run: $out"; return 1; fi
  pass "sync_pull_ff: 落后 → dry-run 打印 pull --ff-only"
}

test_pullff_behind_confirm() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  _make_origin_ahead_ff "$TRIPLE_OR" "$TRIPLE_LOCAL"
  local out rc
  out="$(run_script sop_sync_pull_ff.sh "$TRIPLE_LOCAL" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pull_ff 落后确认 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "已快进拉取" "$out"; then fail "pull_ff 落后确认未拉取: $out"; return 1; fi
  pass "sync_pull_ff: 落后 → --confirm 真正快进拉取"
}

test_pullff_ahead_dryrun() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  _make_local_ahead_only "$TRIPLE_LOCAL"
  local out rc
  out="$(run_script sop_sync_pull_ff.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pull_ff 领先 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "git push" "$out"; then fail "pull_ff 领先未打印 push: $out"; return 1; fi
  pass "sync_pull_ff: 领先 → dry-run 打印 push"
}

test_pullff_ahead_confirm() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  _make_local_ahead_only "$TRIPLE_LOCAL"
  local out rc
  out="$(run_script sop_sync_pull_ff.sh "$TRIPLE_LOCAL" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pull_ff 领先确认 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "已推送" "$out"; then fail "pull_ff 领先确认未推送: $out"; return 1; fi
  pass "sync_pull_ff: 领先 → --confirm 真正快进推送"
}

test_pullff_diverged() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  _make_local_ahead_only "$TRIPLE_LOCAL"          # local 领先 origin
  _make_origin_ahead_ff "$TRIPLE_OR" "$TRIPLE_LOCAL"  # origin 也前进 → 双向分叉
  local out rc
  out="$(run_script sop_sync_pull_ff.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "pull_ff 分叉 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "双向分叉" "$out"; then fail "pull_ff 未识别双向分叉: $out"; return 1; fi
  pass "sync_pull_ff: 双向分叉 → 列 A-E 选项并 exit 0（不自动改写）"
}

test_pullff_dirty() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  echo "dirty" > "$TRIPLE_LOCAL/dirty.txt"
  local out rc
  out="$(run_script sop_sync_pull_ff.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "pull_ff 脏工作区应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "sync_pull_ff: 工作区脏 → rc=1 硬停止"
}

test_pullff_not_main() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "X"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/X )
  local out rc
  out="$(run_script sop_sync_pull_ff.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "pull_ff 非main 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "sync_pull_ff: 非 main 分支 → rc=1"
}

test_pullff_unknown_opt() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_sync_pull_ff.sh "$TRIPLE_LOCAL" --bogus 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "pull_ff 未知选项应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "sync_pull_ff: 未知选项 → rc=2"
}

register_test "pull_ff: 已同步" test_pullff_synced
register_test "pull_ff: 落后-dryrun" test_pullff_behind_dryrun
register_test "pull_ff: 落后-confirm" test_pullff_behind_confirm
register_test "pull_ff: 领先-dryrun" test_pullff_ahead_dryrun
register_test "pull_ff: 领先-confirm" test_pullff_ahead_confirm
register_test "pull_ff: 双向分叉" test_pullff_diverged
register_test "pull_ff: 脏工作区→rc1" test_pullff_dirty
register_test "pull_ff: 非main→rc1" test_pullff_not_main
register_test "pull_ff: 未知选项→rc2" test_pullff_unknown_opt
