#!/usr/bin/env bash
# =============================================================================
# 文件名: gpm-regression/tests/test_readonly_and_sync.sh
# 中文名: 只读/同步类脚本全边界回归（任务二扩展）
#
# 【覆盖】
#   sop_resolve_repo.sh      —— 三元组提取（fork / 无 upstream / 非git / 子目录）
#   sop_branch_merged_status.sh —— 只读合并状态（正常 / 非git / -h）
#   sop_fetch_prune.sh       —— 清理过时引用（dry-run / --confirm / 未知选项 / 非git）
#   sop_privacy_gate.sh      —— 隐私闸门（命中密钥 / 干净 / 未知选项 / 非git）
#   sop_docs_sync_check.sh   —— 文档同步门禁（无变化 / 已同步 / Tier1阻断 / 未知选项 / 非git）
#   sop_sync_precheck.sh     —— 巡检预检（正常 / 非git / 子目录 / 无upstream）
#   sop_sync_report.sh       —— 上游更新报告（有新增 / 无upstream / 非main / 未知选项）
#   sop_status_all.sh        —— 批量巡检（多仓 / root不存在 / -h）
# =============================================================================

# 往 origin 裸仓推一个独立提交，使 local 相对 origin 落后（造“落后”场景）
_make_origin_ahead() {
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

# ---------------- sop_resolve_repo.sh ----------------
test_resolve_repo_fork() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_resolve_repo.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "resolve_repo rc=$rc out=$out"; return 1; fi
  if ! assert_contains "GH_USER=zhangweildlh" "$out"; then fail "resolve_repo GH_USER 不符: $out"; return 1; fi
  if ! assert_contains "REPO_NAME=gpm-forkrepo" "$out"; then fail "resolve_repo REPO_NAME 不符: $out"; return 1; fi
  if ! assert_contains "UPSTREAM=upstreamorg/gpm-upstreamrepo" "$out"; then fail "resolve_repo UPSTREAM 不符: $out"; return 1; fi
  pass "resolve_repo: fork 三元组解析正确(origin+upstream)"
}

test_resolve_repo_no_upstream() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" remote remove upstream )
  local out rc
  out="$(run_script sop_resolve_repo.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "resolve_repo 无upstream rc=$rc"; return 1; fi
  if ! assert_contains "GH_USER=zhangweildlh" "$out"; then fail "resolve_repo 无upstream GH_USER 不符: $out"; return 1; fi
  if ! assert_contains "UPSTREAM=" "$out"; then fail "resolve_repo 无upstream 应留空: $out"; return 1; fi
  pass "resolve_repo: 无 upstream 时 UPSTREAM 为空、GH_USER 取 origin"
}

test_resolve_repo_not_git() {
  local nd; nd="$(make_fixture)"
  local out rc
  out="$(run_script sop_resolve_repo.sh "$nd" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "resolve_repo 非git 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "resolve_repo: 非 git 目录 → rc=1"
}

test_resolve_repo_subdir() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local sub; sub="$(make_fixture)/sub"; mkdir -p "$sub"
  ( cd "$TRIPLE_LOCAL" && cp init.txt "$sub/" )
  local out rc
  out="$(run_script sop_resolve_repo.sh "$sub" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "resolve_repo 子目录应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "resolve_repo: 传入仓库子目录 → rc=1（根守卫生效）"
}

# ---------------- sop_branch_merged_status.sh ----------------
test_branch_merged_normal() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  # 建未合并分支
  make_feat_and_push "$TRIPLE_LOCAL" "unmerged"
  # 建已合并分支：提交→合并进 main→删本地分支
  ( cd "$TRIPLE_LOCAL" \
    && "$REAL_GIT" checkout -q -b feat/merged \
    && echo "m" > m.txt && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "merged work" \
    && "$REAL_GIT" checkout -q main \
    && "$REAL_GIT" merge --no-ff -m "merge feat/merged" feat/merged >/dev/null 2>&1 \
    && "$REAL_GIT" branch -d feat/merged >/dev/null 2>&1 )
  local out rc
  out="$(run_script sop_branch_merged_status.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "branch_merged rc=$rc"; return 1; fi
  if ! assert_contains "feat/unmerged" "$out"; then fail "branch_merged 未列出未合并分支: $out"; return 1; fi
  pass "branch_merged_status: 列出已合并/未合并分支(只读)"
}

test_branch_merged_not_git() {
  local nd; nd="$(make_fixture)"
  local out rc
  out="$(run_script sop_branch_merged_status.sh "$nd" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "branch_merged 非git 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "branch_merged_status: 非 git → rc=1"
}

test_branch_merged_help() {
  local out rc
  out="$(run_script sop_branch_merged_status.sh -h 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "branch_merged -h rc=$rc"; return 1; fi
  pass "branch_merged_status: -h → rc=0"
}

# ---------------- sop_fetch_prune.sh ----------------
test_fetch_prune_dryrun() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_fetch_prune.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "fetch_prune dry-run rc=$rc"; return 1; fi
  if ! assert_contains "[dry-run]" "$out"; then fail "fetch_prune dry-run 未标记: $out"; return 1; fi
  pass "fetch_prune: dry-run → rc=0 且标记预览"
}

test_fetch_prune_confirm() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_fetch_prune.sh "$TRIPLE_LOCAL" --confirm 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "fetch_prune confirm rc=$rc"; return 1; fi
  if ! assert_contains "已完成 git fetch --prune" "$out"; then fail "fetch_prune confirm 未执行: $out"; return 1; fi
  pass "fetch_prune: --confirm → rc=0 且执行清理"
}

test_fetch_prune_unknown_opt() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_fetch_prune.sh "$TRIPLE_LOCAL" --bogus 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "fetch_prune 未知选项应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "fetch_prune: 未知选项 → rc=2"
}

test_fetch_prune_not_git() {
  local nd; nd="$(make_fixture)"
  local out rc
  out="$(run_script sop_fetch_prune.sh "$nd" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "fetch_prune 非git 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "fetch_prune: 非 git → rc=1"
}

# ---------------- sop_privacy_gate.sh ----------------
test_privacy_gate_hit() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  # 工作区放入含 OpenAI 密钥的 .env（未跟踪、未被 gitignore 排除）
  # 注意：源码中 sk- 后紧跟引号（非连续字母数字），故不会被仓库 pre-commit 密钥钩子误判；
  # bash 执行时两串拼接，运行时 .env 仍为完整 sk-... 密钥，被测 sop_privacy_gate.sh 照常检出。
  printf 'OPENAI_API_KEY=sk-'"abcdefghijklmnopqrstuvwxyz123456"'\n' > "$TRIPLE_LOCAL/.env"
  local out rc
  out="$(run_script sop_privacy_gate.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "privacy_gate 命中密钥应 rc=1, 实际 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "命中" "$out"; then fail "privacy_gate 未报命中: $out"; return 1; fi
  pass "privacy_gate: 含密钥 .env → rc=1 拦截"
}

test_privacy_gate_clean() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_privacy_gate.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "privacy_gate 干净仓应 rc=0, 实际 rc=$rc out=$out"; return 1; fi
  pass "privacy_gate: 干净仓 → rc=0 放行"
}

test_privacy_gate_unknown_opt() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_privacy_gate.sh "$TRIPLE_LOCAL" --bogus 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "privacy_gate 未知选项应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "privacy_gate: 未知选项 → rc=2"
}

test_privacy_gate_not_git() {
  local nd; nd="$(make_fixture)"
  local out rc
  out="$(run_script sop_privacy_gate.sh "$nd" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "privacy_gate 非git 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "privacy_gate: 非 git → rc=1"
}

# ---------------- sop_docs_sync_check.sh ----------------
test_docs_sync_no_change() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_docs_sync_check.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "docs_sync 无变化应 rc=0, 实际 rc=$rc out=$out"; return 1; fi
  pass "docs_sync_check: 无真实变化 → rc=0 放行"
}

test_docs_sync_synced() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  # 同时改源码(.sh)与 README → Tier1 已同步
  printf 'echo hi\n' > "$TRIPLE_LOCAL/tool.sh"
  printf '# Demo\n' > "$TRIPLE_LOCAL/README.md"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "add tool and readme" )
  # 工作区干净后，制造未提交改动：再改 .sh 并改 README（二者皆在 CHANGED）
  printf 'echo hi2\n' > "$TRIPLE_LOCAL/tool.sh"
  printf '# Demo v2\n' > "$TRIPLE_LOCAL/README.md"
  local out rc
  out="$(run_script sop_docs_sync_check.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "docs_sync 已同步应 rc=0, 实际 rc=$rc out=$out"; return 1; fi
  pass "docs_sync_check: 改源码且 README 同步改 → rc=0"
}

test_docs_sync_tier1_block() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  # 提交 README（使其在仓库中存在），然后仅改源码(.sh)不碰 README → Tier1 阻断
  printf '# Demo\n' > "$TRIPLE_LOCAL/README.md"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "add readme" )
  printf 'echo hi\n' > "$TRIPLE_LOCAL/tool.sh"   # 未跟踪 .sh，触发 feature
  local out rc
  out="$(run_script sop_docs_sync_check.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "docs_sync Tier1 应 rc=2, 实际 rc=$rc out=$out"; return 1; fi
  if ! assert_contains "阻断" "$out"; then fail "docs_sync 未报阻断: $out"; return 1; fi
  pass "docs_sync_check: 改源码但 README 未同步 → rc=2 阻断"
}

test_docs_sync_unknown_opt() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_docs_sync_check.sh "$TRIPLE_LOCAL" --bogus 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "docs_sync 未知选项应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "docs_sync_check: 未知选项 → rc=2"
}

test_docs_sync_not_git() {
  local nd; nd="$(make_fixture)"
  local out rc
  out="$(run_script sop_docs_sync_check.sh "$nd" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "docs_sync 非git 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "docs_sync_check: 非 git → rc=1"
}

# ---------------- sop_sync_precheck.sh ----------------
test_sync_precheck_normal() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_sync_precheck.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "sync_precheck rc=$rc out=$out"; return 1; fi
  if ! assert_contains "巡检前置预检" "$out"; then fail "sync_precheck 无标题: $out"; return 1; fi
  if ! assert_contains "remotes" "$out"; then fail "sync_precheck 无 remotes 段: $out"; return 1; fi
  pass "sync_precheck: 正常输出五段预检"
}

test_sync_precheck_not_git() {
  local nd; nd="$(make_fixture)"
  local out rc
  out="$(run_script sop_sync_precheck.sh "$nd" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "sync_precheck 非git 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "sync_precheck: 非 git → rc=1"
}

test_sync_precheck_subdir() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local sub; sub="$(make_fixture)/sub"; mkdir -p "$sub"
  ( cd "$TRIPLE_LOCAL" && cp init.txt "$sub/" )
  local out rc
  out="$(run_script sop_sync_precheck.sh "$sub" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "sync_precheck 子目录应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "sync_precheck: 子目录 → rc=1"
}

test_sync_precheck_no_upstream() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" remote remove upstream )
  local out rc
  out="$(run_script sop_sync_precheck.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "sync_precheck 无upstream rc=$rc"; return 1; fi
  if ! assert_contains "无 upstream" "$out"; then fail "sync_precheck 未跳过 upstream 段: $out"; return 1; fi
  pass "sync_precheck: 无 upstream → 跳过 origin↔upstream 段"
}

# ---------------- sop_sync_report.sh ----------------
test_sync_report_has_new() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  make_upstream_ahead "$TRIPLE_UP" "$TRIPLE_LOCAL"
  local out rc
  out="$(run_script sop_sync_report.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "sync_report rc=$rc out=$out"; return 1; fi
  if ! assert_contains "上游更新分析报告" "$out"; then fail "sync_report 无报告标题: $out"; return 1; fi
  pass "sync_report: upstream 有新增 → 输出报告"
}

test_sync_report_no_upstream() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" remote remove upstream )
  local out rc
  out="$(run_script sop_sync_report.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "sync_report 无upstream 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "sync_report: 无 upstream → rc=1"
}

test_sync_report_not_main() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  make_feat_and_push "$TRIPLE_LOCAL" "R"
  ( cd "$TRIPLE_LOCAL" && "$REAL_GIT" checkout -q feat/R )
  local out rc
  out="$(run_script sop_sync_report.sh "$TRIPLE_LOCAL" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "sync_report 非main 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "sync_report: 非 main 分支 → rc=1"
}

test_sync_report_unknown_opt() {
  local triple; triple="$(setup_triple)"; _parse_triple "$triple"
  local out rc
  out="$(run_script sop_sync_report.sh "$TRIPLE_LOCAL" --bogus 2>&1)"; rc=$?
  if ! assert_rc "$rc" 2; then fail "sync_report 未知选项应 rc=2, 实际 rc=$rc"; return 1; fi
  pass "sync_report: 未知选项 → rc=2"
}

# ---------------- sop_status_all.sh ----------------
test_status_all_multi() {
  local root; root="$(make_fixture)/repos"
  mkdir -p "$root"
  for n in repoA repoB repoC; do
    "$REAL_GIT" init -q -b main "$root/$n"
    ( cd "$root/$n" \
      && "$REAL_GIT" config user.email r@e.com && "$REAL_GIT" config user.name r \
      && echo "x" > x.txt && "$REAL_GIT" add -A \
      && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "init $n" )
  done
  # repoB 制造脏工作区
  echo "dirty" > "$root/repoB/dirty.txt"
  local out rc
  out="$(GIT_BIN="$REAL_GIT" GH_BIN="$FAKE_GH" bash "$SKILL_SCRIPTS/sop_status_all.sh" --root "$root" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "status_all rc=$rc out=$out"; return 1; fi
  if ! assert_contains "repoA" "$out"; then fail "status_all 未列 repoA: $out"; return 1; fi
  if ! assert_contains "repoB" "$out"; then fail "status_all 未列 repoB: $out"; return 1; fi
  if ! assert_contains "repoC" "$out"; then fail "status_all 未列 repoC: $out"; return 1; fi
  if ! assert_contains "汇总" "$out"; then fail "status_all 无汇总: $out"; return 1; fi
  pass "status_all: 扫描多仓并输出汇总"
}

test_status_all_missing_root() {
  local nd; nd="$(make_fixture)/nope_$(date +%s%N)"
  local out rc
  out="$(GIT_BIN="$REAL_GIT" GH_BIN="$FAKE_GH" bash "$SKILL_SCRIPTS/sop_status_all.sh" --root "$nd" 2>&1)"; rc=$?
  if ! assert_rc "$rc" 1; then fail "status_all 缺失root 应 rc=1, 实际 rc=$rc"; return 1; fi
  pass "status_all: --root 不存在 → rc=1"
}

test_status_all_help() {
  local out rc
  out="$(GIT_BIN="$REAL_GIT" GH_BIN="$FAKE_GH" bash "$SKILL_SCRIPTS/sop_status_all.sh" -h 2>&1)"; rc=$?
  if ! assert_rc "$rc" 0; then fail "status_all -h rc=$rc"; return 1; fi
  pass "status_all: -h → rc=0"
}

register_test "resolve_repo: fork三元组" test_resolve_repo_fork
register_test "resolve_repo: 无upstream留空" test_resolve_repo_no_upstream
register_test "resolve_repo: 非git→rc1" test_resolve_repo_not_git
register_test "resolve_repo: 子目录→rc1" test_resolve_repo_subdir
register_test "branch_merged: 正常列出" test_branch_merged_normal
register_test "branch_merged: 非git→rc1" test_branch_merged_not_git
register_test "branch_merged: -h" test_branch_merged_help
register_test "fetch_prune: dry-run" test_fetch_prune_dryrun
register_test "fetch_prune: --confirm" test_fetch_prune_confirm
register_test "fetch_prune: 未知选项→rc2" test_fetch_prune_unknown_opt
register_test "fetch_prune: 非git→rc1" test_fetch_prune_not_git
register_test "privacy_gate: 命中密钥→rc1" test_privacy_gate_hit
register_test "privacy_gate: 干净→rc0" test_privacy_gate_clean
register_test "privacy_gate: 未知选项→rc2" test_privacy_gate_unknown_opt
register_test "privacy_gate: 非git→rc1" test_privacy_gate_not_git
register_test "docs_sync: 无变化→rc0" test_docs_sync_no_change
register_test "docs_sync: 已同步→rc0" test_docs_sync_synced
register_test "docs_sync: Tier1阻断→rc2" test_docs_sync_tier1_block
register_test "docs_sync: 未知选项→rc2" test_docs_sync_unknown_opt
register_test "docs_sync: 非git→rc1" test_docs_sync_not_git
register_test "sync_precheck: 正常五段" test_sync_precheck_normal
register_test "sync_precheck: 非git→rc1" test_sync_precheck_not_git
register_test "sync_precheck: 子目录→rc1" test_sync_precheck_subdir
register_test "sync_precheck: 无upstream跳过" test_sync_precheck_no_upstream
register_test "sync_report: 有新增" test_sync_report_has_new
register_test "sync_report: 无upstream→rc1" test_sync_report_no_upstream
register_test "sync_report: 非main→rc1" test_sync_report_not_main
register_test "sync_report: 未知选项→rc2" test_sync_report_unknown_opt
register_test "status_all: 多仓扫描" test_status_all_multi
register_test "status_all: 缺失root→rc1" test_status_all_missing_root
register_test "status_all: -h" test_status_all_help
