#!/usr/bin/env bash
# =============================================================================
# 文件名: gpm-regression/tests/test_worktree.sh
# 中文名: 多工作树并行开发全链路回归（add / merge / cleanup）
#
# 【覆盖】
#   sop_worktree_add.sh     —— dry-run / --confirm / 缺--branch / 分支已存在 /
#                             非 main / 脏工作区 / 未知选项
#   sop_worktree_merge.sh   —— dry-run / --confirm(合并碑验证) / 缺--branch /
#                             非 main / 冲突预测 / 未知选项
#   sop_worktree_cleanup.sh —— dry-run(已合并) / --confirm(真删) / 未合并(校验失败) /
#                             缺--branch / 未知选项
# =============================================================================

# 全链路：add --confirm → 在 worktree 内提交 → merge --confirm
_worktree_flow() {
  local repo="$1"; local branch="$2"
  local o rc commit_out
  o="$(run_script sop_worktree_add.sh "$repo" --branch "$branch" --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then echo "  [FLOW] ADD FAIL rc=$rc: $o"; return 1; fi
  local wt="$repo/.worktrees/${branch##*/}"
  if ! commit_out="$(cd "$wt" && echo "wt work" > "wt_${branch##*/}.txt" \
    && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "work on $branch" 2>&1)"; then
    echo "  [FLOW] WT COMMIT FAIL: $commit_out"; return 1
  fi
  o="$(run_script sop_worktree_merge.sh "$repo" --branch "$branch" --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then echo "  [FLOW] MERGE FAIL rc=$rc: $o"; return 1; fi
  return 0
}

# ---------------- sop_worktree_add.sh ----------------
test_wt_add_dryrun() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/wt 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_add dry-run rc=$rc out=$out"; return 1; fi
  if ! assert_contains "工作树路径" "$out"; then fail "wt_add 未打印路径: $out"; return 1; fi
  if ! assert_contains "[dry-run]" "$out"; then fail "wt_add 未标记 dry-run: $out"; return 1; fi
  pass "worktree_add: dry-run 打印预览"
}

test_wt_add_confirm() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/wt --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_add confirm rc=$rc out=$out"; return 1; fi
  local wl; wl="$("$REAL_GIT" -C "$TRIPLE_LOCAL" worktree list 2>/dev/null)"
  if ! assert_contains "feat/wt" "$wl"; then fail "wt_add 工作树未建立: $wl"; return 1; fi
  pass "worktree_add: --confirm 真正创建工作树与分支"
}

test_wt_add_no_branch() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "wt_add 缺--branch 应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "worktree_add: 未指定 --branch → rc=2"
}

test_wt_add_branch_exists() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q -b feat/wt )
  local out rc
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/wt --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "wt_add 分支已存在应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "worktree_add: 分支已存在 → rc=1"
}

test_wt_add_not_main() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "X"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/X )
  local out rc
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/wt --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "wt_add 非main 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "worktree_add: 非 main → rc=1"
}

test_wt_add_dirty() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  echo "dirty" > "$TRIPLE_LOCAL/dirty.txt"
  local out rc
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/wt --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "wt_add 脏工作区应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "worktree_add: 脏工作区 → rc=1"
}

test_wt_add_unknown_opt() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/wt --bogus 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "wt_add 未知选项应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "worktree_add: 未知选项 → rc=2"
}

# ---------------- sop_worktree_merge.sh ----------------
test_wt_merge_dryrun() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "M"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q main )
  local out rc
  out="$(run_script sop_worktree_merge.sh "$TRIPLE_LOCAL" --branch feat/M 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_merge dry-run rc=$rc out=$out"; return 1; fi
  if ! assert_contains "合并碑" "$out"; then fail "wt_merge 未打印合并碑预览: $out"; return 1; fi
  pass "worktree_merge: dry-run 打印合并碑预览"
}

test_wt_merge_confirm() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "M"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q main )
  local out rc
  out="$(run_script sop_worktree_merge.sh "$TRIPLE_LOCAL" --branch feat/M --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_merge confirm rc=$rc out=$out"; return 1; fi
  if ! assert_contains "合并碑双父" "$out"; then fail "wt_merge 未验证合并碑: $out"; return 1; fi
  local cnt; cnt="$("$REAL_GIT" -C "$TRIPLE_LOCAL" rev-list --count main 2>/dev/null)"
  if [ "${cnt:-0}" -lt 2 ]; then fail "wt_merge 合并后 main 提交数异常: $cnt"; return 1; fi
  pass "worktree_merge: --confirm 生成双父合并碑并入 main"
}

test_wt_merge_no_branch() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_merge.sh "$TRIPLE_LOCAL" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "wt_merge 缺--branch 应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "worktree_merge: 未指定 --branch → rc=2"
}

test_wt_merge_not_main() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "M"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/M )
  local out rc
  out="$(run_script sop_worktree_merge.sh "$TRIPLE_LOCAL" --branch feat/M --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "wt_merge 非main 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "worktree_merge: 非 main → rc=1"
}

test_wt_merge_conflict() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  ( cd "$TRIPLE_LOCAL" \
    && "$REAL_GIT" checkout -q -b feat/A \
    && printf 'A line\n' > conflict.txt && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "A" \
    && "$REAL_GIT" checkout -q main \
    && "$REAL_GIT" checkout -q -b feat/B \
    && printf 'B line\n' > conflict.txt && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "B" \
    && "$REAL_GIT" checkout -q main )
  run_script sop_worktree_merge.sh "$TRIPLE_LOCAL" --branch feat/A --confirm >/dev/null 2>&1
  local out rc
  out="$(run_script sop_worktree_merge.sh "$TRIPLE_LOCAL" --branch feat/B 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_merge 冲突应 exit 0(暂停), 实际 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "冲突" "$out"; then fail "wt_merge 未预测冲突: $out"; return 1; fi
  pass "worktree_merge: 冲突预测 → 列冲突并 exit 0（不自动解）"
}

test_wt_merge_unknown_opt() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_merge.sh "$TRIPLE_LOCAL" --branch feat/M --bogus 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "wt_merge 未知选项应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "worktree_merge: 未知选项 → rc=2"
}

# ---------------- sop_worktree_cleanup.sh ----------------
test_wt_cleanup_dryrun() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  if ! _worktree_flow "$TRIPLE_LOCAL" "feat/wt"; then fail "wt_cleanup 前置链路失败"; return 1; fi
  local out rc
  out="$(run_script sop_worktree_cleanup.sh "$TRIPLE_LOCAL" --branch feat/wt 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_cleanup dry-run rc=$rc out=$out"; return 1; fi
  if ! assert_contains "清理工作树" "$out"; then fail "wt_cleanup 未打印清理预览: $out"; return 1; fi
  pass "worktree_cleanup: dry-run 打印回收预览（已合并分支）"
}

test_wt_cleanup_confirm() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  if ! _worktree_flow "$TRIPLE_LOCAL" "feat/wt"; then fail "wt_cleanup 前置链路失败"; return 1; fi
  local out rc
  out="$(run_script sop_worktree_cleanup.sh "$TRIPLE_LOCAL" --branch feat/wt --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_cleanup confirm rc=$rc out=$out"; return 1; fi
  local wt="$TRIPLE_LOCAL/.worktrees/wt"
  if [ -e "$wt" ]; then fail "wt_cleanup 工作树未删除: $wt"; return 1; fi
  if "$REAL_GIT" -C "$TRIPLE_LOCAL" show-ref --verify --quiet "refs/heads/feat/wt" 2>/dev/null; then
    fail "wt_cleanup 本地分支未删除"; return 1
  fi
  pass "worktree_cleanup: --confirm 真正删除工作树与本地分支"
}

test_wt_cleanup_unmerged() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/unmerged --confirm >/dev/null 2>&1
  # 在 worktree 内实际开发提交，使 feat/unmerged 真正领先 main（未合并）
  local wt="$TRIPLE_LOCAL/.worktrees/unmerged"
  local cu
  if ! cu="$(cd "$wt" && echo "dev" > dev.txt && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "dev on unmerged" 2>&1)"; then
    echo "  [UNMERGED] commit fail: $cu"; return 1
  fi
  local out rc
  out="$(run_script sop_worktree_cleanup.sh "$TRIPLE_LOCAL" --branch feat/unmerged 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "wt_cleanup 未合并应 rc=1, 实际 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "合并校验失败" "$out"; then fail "wt_cleanup 未报合并校验失败: $out"; return 1; fi
  pass "worktree_cleanup: 未合并分支 → 合并校验失败 rc=1（防丢提交）"
}

test_wt_cleanup_no_branch() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_cleanup.sh "$TRIPLE_LOCAL" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "wt_cleanup 缺--branch 应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "worktree_cleanup: 未指定 --branch → rc=2"
}

test_wt_cleanup_unknown_opt() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_cleanup.sh "$TRIPLE_LOCAL" --branch feat/wt --bogus 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "wt_cleanup 未知选项应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "worktree_cleanup: 未知选项 → rc=2"
}

register_test "worktree_add: dry-run" test_wt_add_dryrun
register_test "worktree_add: --confirm" test_wt_add_confirm
register_test "worktree_add: 缺--branch→rc2" test_wt_add_no_branch
register_test "worktree_add: 分支已存在→rc1" test_wt_add_branch_exists
register_test "worktree_add: 非main→rc1" test_wt_add_not_main
register_test "worktree_add: 脏→rc1" test_wt_add_dirty
register_test "worktree_add: 未知选项→rc2" test_wt_add_unknown_opt
register_test "worktree_merge: dry-run" test_wt_merge_dryrun
register_test "worktree_merge: --confirm" test_wt_merge_confirm
register_test "worktree_merge: 缺--branch→rc2" test_wt_merge_no_branch
register_test "worktree_merge: 非main→rc1" test_wt_merge_not_main
register_test "worktree_merge: 冲突预测" test_wt_merge_conflict
register_test "worktree_merge: 未知选项→rc2" test_wt_merge_unknown_opt
register_test "worktree_cleanup: dry-run" test_wt_cleanup_dryrun
register_test "worktree_cleanup: --confirm" test_wt_cleanup_confirm
register_test "worktree_cleanup: 未合并→rc1" test_wt_cleanup_unmerged
register_test "worktree_cleanup: 缺--branch→rc2" test_wt_cleanup_no_branch
register_test "worktree_cleanup: 未知选项→rc2" test_wt_cleanup_unknown_opt
