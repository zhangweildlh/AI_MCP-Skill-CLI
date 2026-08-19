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
#
# 【新命名约定（方案 Y，对齐 AGENTS.md §4.1 与 sop_worktree_add.sh）】
#   sop_worktree_add.sh 现按「时间戳一致性」命名：
#     - 传 --scope <name> 时：目录名 = <scope>-<topic>-<TS>，分支名 = feat/<目录名>（对齐 AGENTS.md <name>-<topic>-<TS>）；
#     - 未传 --scope 时（兼容无 scope 概念的通用仓库）：目录名 = <topic>-<TS>，分支名 = feat/<目录名>；
#     - 两种模式均共享同一无分隔符秒级 TS，且保证「目录名 + feat/ 前缀 = 分支名」；
#     - 默认工作树根由仓库内 .worktrees 改为 worktrees/。
#   因此凡需引用实际分支名/工作树路径的用例，一律从脚本输出「工作树路径: / 功能分支: 」
#   两行解析（脚本打印实际值），确保断言与实现一致。
# =============================================================================

# 全链路：add --confirm → 在 worktree 内提交 → merge --confirm
# 入参: <主仓库目录> <分支主题(feat/x)>
# 输出: 实际分支名（如 feat/wt-<TS>）；失败信息输出到 stderr 并返回非 0
_worktree_flow() {
  local repo="$1"; local branch="$2"
  local o rc commit_out wt branch_actual
  o="$(run_script sop_worktree_add.sh "$repo" --branch "$branch" --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then echo "  [FLOW] ADD FAIL rc=$rc: $o" >&2; return 1; fi
  wt="$(printf '%s\n' "$o" | sed -n 's/^工作树路径: //p' | head -n1)"
  branch_actual="$(printf '%s\n' "$o" | sed -n 's/^功能分支: //p' | sed 's/ （基于.*$//' | head -n1)"
  if [ -z "$wt" ] || [ -z "$branch_actual" ]; then
    echo "  [FLOW] 无法解析 add 输出: $o" >&2; return 1
  fi
  if ! commit_out="$(cd "$wt" && echo "wt work" > "wt_${branch_actual##*/}.txt" \
    && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "work on $branch_actual" 2>&1)"; then
    echo "  [FLOW] WT COMMIT FAIL: $commit_out" >&2; return 1
  fi
  o="$(run_script sop_worktree_merge.sh "$repo" --branch "$branch_actual" --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then echo "  [FLOW] MERGE FAIL rc=$rc: $o" >&2; return 1; fi
  echo "$branch_actual"
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
  local out rc branch_actual
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/wt --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_add confirm rc=$rc out=$out"; return 1; fi
  # 新命名断言：分支 = feat/wt-<14位无分隔符TS>
  branch_actual="$(printf '%s\n' "$out" | sed -n 's/^功能分支: //p' | sed 's/ （基于.*$//' | head -n1)"
  if [[ "$branch_actual" != feat/wt-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9] ]]; then
    fail "wt_add 分支名不符合 <topic>-<TS> 新命名: $branch_actual"; return 1
  fi
  local wl; wl="$("$REAL_GIT" -C "$TRIPLE_LOCAL" worktree list 2>/dev/null)"
  if ! assert_contains "$branch_actual" "$wl"; then fail "wt_add 工作树未建立: $wl"; return 1; fi
  pass "worktree_add: --confirm 真正创建工作树与分支($branch_actual)"
}

test_wt_add_no_branch() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "wt_add 缺--branch 应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "worktree_add: 未指定 --branch → rc=2"
}

# 分支已存在守卫（新命名含秒级 TS：用 update-ref 快速预建 base-1..base+10 秒窗口的
# feat/wt-<TS> 分支 ref，覆盖 add 内部生成 TS 与测试之间的启动延迟，秒级确定性；
# 极端慢速时重试一次刷新窗口）
test_wt_add_branch_exists() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc ts t i
  rc=0
  for attempt in 1 2; do
    ts="$(date +%Y%m%d%H%M%S)"
    for i in -1 0 1 2 3 4 5 6 7 8 9 10; do
      if [ "$i" -eq 0 ]; then t="$ts"; else t="$(date -d "$i seconds" +%Y%m%d%H%M%S)"; fi
      "$REAL_GIT" -C "$TRIPLE_LOCAL" update-ref "refs/heads/feat/wt-$t" HEAD 2>/dev/null
    done
    out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/wt --confirm 2>&1)"; rc=$?
    [ "$rc" -eq 1 ] && break
    # 未命中（add 意外成功）：回收本次产物后重试（重试以新当前秒重建窗口）
    local b2; b2="$(printf '%s\n' "$out" | sed -n 's/^功能分支: //p' | sed 's/ （基于.*$//' | head -n1)"
    [ -n "$b2" ] && { "$REAL_GIT" -C "$TRIPLE_LOCAL" worktree remove --force "$TRIPLE_LOCAL/worktrees/${b2#feat/}" >/dev/null 2>&1; "$REAL_GIT" -C "$TRIPLE_LOCAL" branch -D "$b2" >/dev/null 2>&1; }
  done
  if ! assert_rc "$rc" 1; then fail "wt_add 分支已存在应 rc=1, 实际 rc=$rc out=$out"; return 1; fi
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

# --scope 路径（对齐 AGENTS.md §4.1 <name>-<topic>-<TS>）：分支 = feat/<scope>-<topic>-<TS>
test_wt_add_scope_confirm() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc branch_actual
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --scope web-search --branch feat/wt --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_add scope confirm rc=$rc out=$out"; return 1; fi
  # 分支 = feat/web-search-wt-<14位无分隔符TS>
  branch_actual="$(printf '%s\n' "$out" | sed -n 's/^功能分支: //p' | sed 's/ （基于.*$//' | head -n1)"
  if [[ "$branch_actual" != feat/web-search-wt-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9] ]]; then
    fail "wt_add scope 分支名不符合 <scope>-<topic>-<TS>: $branch_actual"; return 1
  fi
  local wl; wl="$("$REAL_GIT" -C "$TRIPLE_LOCAL" worktree list 2>/dev/null)"
  if ! assert_contains "$branch_actual" "$wl"; then fail "wt_add scope 工作树未建立: $wl"; return 1; fi
  pass "worktree_add: --scope 命名 feat/web-search-wt-<TS>"
}

test_wt_add_scope_invalid() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --scope Bad_Name --branch feat/wt --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "wt_add scope 非法应 rc=2, 实际 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "仅允许小写字母" "$out"; then fail "wt_add scope 非法未提示: $out"; return 1; fi
  pass "worktree_add: --scope 非法值 → rc=2"
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
  local branch; branch="$(_worktree_flow "$TRIPLE_LOCAL" "feat/wt")" || { fail "wt_cleanup 前置链路失败"; return 1; }
  local out rc
  out="$(run_script sop_worktree_cleanup.sh "$TRIPLE_LOCAL" --branch "$branch" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_cleanup dry-run rc=$rc out=$out"; return 1; fi
  if ! assert_contains "清理工作树" "$out"; then fail "wt_cleanup 未打印清理预览: $out"; return 1; fi
  pass "worktree_cleanup: dry-run 打印回收预览（已合并分支 $branch）"
}

test_wt_cleanup_confirm() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local branch; branch="$(_worktree_flow "$TRIPLE_LOCAL" "feat/wt")" || { fail "wt_cleanup 前置链路失败"; return 1; }
  local out rc
  out="$(run_script sop_worktree_cleanup.sh "$TRIPLE_LOCAL" --branch "$branch" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "wt_cleanup confirm rc=$rc out=$out"; return 1; fi
  # 新工作树根：仓库内 worktrees/，目录名 = 分支名去 feat/ 前缀（同一 TS）
  local wt="$TRIPLE_LOCAL/worktrees/${branch#feat/}"
  if [ -e "$wt" ]; then fail "wt_cleanup 工作树未删除: $wt"; return 1; fi
  if "$REAL_GIT" -C "$TRIPLE_LOCAL" show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
    fail "wt_cleanup 本地分支未删除"; return 1
  fi
  pass "worktree_cleanup: --confirm 真正删除工作树与本地分支($branch)"
}

test_wt_cleanup_unmerged() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local o wt branch_actual
  o="$(run_script sop_worktree_add.sh "$TRIPLE_LOCAL" --branch feat/unmerged --confirm 2>&1)"
  wt="$(printf '%s\n' "$o" | sed -n 's/^工作树路径: //p' | head -n1)"
  branch_actual="$(printf '%s\n' "$o" | sed -n 's/^功能分支: //p' | sed 's/ （基于.*$//' | head -n1)"
  # 在 worktree 内实际开发提交，使 feat/unmerged 真正领先 main（未合并）
  local cu
  if ! cu="$(cd "$wt" && echo "dev" > dev.txt && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "dev on unmerged" 2>&1)"; then
    echo "  [UNMERGED] commit fail: $cu"; return 1
  fi
  local out rc
  out="$(run_script sop_worktree_cleanup.sh "$TRIPLE_LOCAL" --branch "$branch_actual" 2>&1)"; rc=$?
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
register_test "worktree_add: --scope 命名对齐" test_wt_add_scope_confirm
register_test "worktree_add: --scope 非法→rc2" test_wt_add_scope_invalid
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
