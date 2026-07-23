#!/usr/bin/env bash
# L2 契约规格测试
# 已编写脚本的契约 → 真实断言（由 SKIP 转 PASS）；未编写/B 档脚本 → SKIP（契约文本保留）。

# ---- A 档：已实现，真实断言 ----

test_contract_precheck() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out; out="$("$ROOT_DIR/scripts/sop_sync_precheck.sh" "$local" 2>&1)"
  if assert_contains "落后=" "$out" && assert_contains "remotes" "$out"; then
    pass "precheck 输出含 remotes 与落后/领先计数（只读无副作用）"; return 0
  fi
  fail "precheck 输出异常: $out"; return 1
}

test_contract_fetch_prune() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out; out="$("$ROOT_DIR/scripts/sop_fetch_prune.sh" "$local" 2>&1)"
  if assert_contains "fetch --prune" "$out"; then
    pass "fetch_prune 执行 git fetch --prune 且不报错（只清本地过时引用）"; return 0
  fi
  fail "fetch_prune 异常: $out"; return 1
}

test_contract_branch_merged_status() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out; out="$("$ROOT_DIR/scripts/sop_branch_merged_status.sh" "$local" 2>&1)"
  if assert_contains "已合并" "$out" && assert_contains "未合并" "$out"; then
    pass "branch_merged_status 输出合并状态（只读）"; return 0
  fi
  fail "branch_merged_status 异常: $out"; return 1
}

# ---- B 档：已实现，真实断言 ----

# 双向分叉：必须打印 A–E 且不得修改任何引用
test_contract_pull_ff_diverge() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  echo "l" > "$local/l.txt"
  "$GIT_BIN" -C "$local" add -A
  "$GIT_BIN" -C "$local" commit -qm "local"
  push_to_origin_from_third "${pair%|*}"
  "$GIT_BIN" -C "$local" fetch -q "$ORIGIN_REMOTE"
  local h_before; h_before="$("$GIT_BIN" -C "$local" rev-parse HEAD)"
  local o_before; o_before="$("$GIT_BIN" -C "$local" rev-parse "$ORIGIN_REMOTE/$MAIN_BRANCH")"
  local out; out="$("$ROOT_DIR/scripts/sop_sync_pull_ff.sh" "$local" 2>&1)"
  local h_after; h_after="$("$GIT_BIN" -C "$local" rev-parse HEAD)"
  local o_after; o_after="$("$GIT_BIN" -C "$local" rev-parse "$ORIGIN_REMOTE/$MAIN_BRANCH")"
  if assert_contains "双向分叉" "$out" && assert_contains "A:" "$out" && assert_contains "E:" "$out" \
     && [ "$h_before" = "$h_after" ] && [ "$o_before" = "$o_after" ]; then
    pass "双向分叉: 打印 A–E 且未修改任何引用（绝不自动 reset/merge/rebase）"; return 0
  fi
  fail "双向分叉契约异常: $out (h:$h_before->$h_after o:$o_before->$o_after)"; return 1
}

# 工作区脏：硬停止，等指令
test_contract_pull_ff_dirty() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  echo "dirty" > "$local/dirty.txt"
  local out; out="$("$ROOT_DIR/scripts/sop_sync_pull_ff.sh" "$local" 2>&1)"; local rc=$?
  if [ "$rc" -ne 0 ] && assert_contains "工作区不干净" "$out"; then
    pass "脏工作区: 硬停止(rc=$rc) 并打印「工作区不干净」"; return 0
  fi
  fail "脏工作区契约异常 rc=$rc: $out"; return 1
}

# origin↔upstream：M=0,K>0 自动 merge+push（dry-run 不改、confirm 推进 origin/main）
test_contract_upstream_sync() {
  local trio; trio="$(setup_fork_with_upstream)"
  local local="${trio##*|}"
  local upstream="${trio%%|*}"
  push_to_upstream_from_third "$upstream"
  "$GIT_BIN" -C "$local" fetch -q "$UPSTREAM_REMOTE"
  local before; before="$("$GIT_BIN" -C "$local" rev-parse "$ORIGIN_REMOTE/$MAIN_BRANCH")"
  local out_dry; out_dry="$("$ROOT_DIR/scripts/sop_sync_upstream.sh" "$local" 2>&1)"
  local after_dry; after_dry="$("$GIT_BIN" -C "$local" rev-parse "$ORIGIN_REMOTE/$MAIN_BRANCH")"
  if [ "$before" != "$after_dry" ]; then fail "dry-run 不应修改 origin/main"; return 1; fi
  if ! assert_contains "[dry-run]" "$out_dry"; then fail "dry-run 未打印计划"; return 1; fi
  local out_run; out_run="$("$ROOT_DIR/scripts/sop_sync_upstream.sh" "$local" --confirm 2>&1)"
  local after_run; after_run="$("$GIT_BIN" -C "$local" rev-parse "$ORIGIN_REMOTE/$MAIN_BRANCH")"
  if [ "$after_run" = "$before" ]; then fail "confirm 未推进 origin/main: $out_run"; return 1; fi
  if assert_contains "已合并" "$out_run"; then
    pass "upstream 同步(M=0,K>0): dry-run 不改、confirm 合并并推送 origin/main"; return 0
  fi
  fail "upstream 同步输出异常: $out_run"; return 1
}

# 顶级禁令：4 个 B 档脚本均不得含强推/删除 main 的禁用模式
test_contract_branch_guard_main() {
  local bad=0
  for f in sop_sync_pull_ff.sh sop_sync_upstream.sh sop_pr_create.sh sop_ci_rerun.sh; do
    if grep -Eq -e 'push[[:space:]].*--force' -e 'push[[:space:]].*--delete' -e 'branch[[:space:]]+-D[[:space:]]+main' "$ROOT_DIR/scripts/$f"; then
      echo "    命中禁用模式: $f"; bad=1
    fi
  done
  if [ "$bad" -eq 0 ]; then pass "4 个 B 档脚本均未包含强推/删除 main 的禁用模式"; return 0; fi
  fail "发现对 main 的强推/删除模式"; return 1
}

# 开 PR 守卫：main 上拒绝；feat 上 dry-run 列出 gh pr create 计划
test_contract_pr_create() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out_main; out_main="$("$ROOT_DIR/scripts/sop_pr_create.sh" "$local" 2>&1)"; local rc_main=$?
  if [ "$rc_main" -eq 0 ] || ! assert_contains "main" "$out_main"; then
    fail "在 main 上开 PR 应被拒绝，实际 rc=$rc_main out=$out_main"; return 1
  fi
  "$GIT_BIN" -C "$local" switch -q -c feat/test
  local out_feat; out_feat="$("$ROOT_DIR/scripts/sop_pr_create.sh" "$local" 2>&1)"
  if assert_contains "[dry-run]" "$out_feat" && assert_contains "gh pr create" "$out_feat"; then
    pass "开 PR 守卫: main 上拒绝；feat 上 dry-run 列出 gh pr create 计划（需 --confirm）"; return 0
  fi
  fail "feat 上开 PR 守卫异常: $out_feat"; return 1
}

# 重跑 CI 门禁：默认 dry-run，不加 --confirm 不真正调用 gh run rerun
test_contract_ci_rerun() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out; out="$("$ROOT_DIR/scripts/sop_ci_rerun.sh" "$local" 2>&1)"
  if assert_contains "[dry-run]" "$out" && assert_contains "gh run rerun" "$out"; then
    pass "重跑 CI: 默认 dry-run 打印 gh run rerun 计划（不加 --confirm 不真正执行）"; return 0
  fi
  fail "重跑 CI gate 异常: $out"; return 1
}

# 重跑 CI 真实调用路径：拦截 gh，验证「不再把完整 remote URL 当作 --repo 传入」
# （此前 BUG：gh run list --repo <完整URL> 可能查不到 run；修复后依赖 gh 当前仓库自动探测）
test_contract_ci_rerun_realpath() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  # 构造记录 gh 调用的桩
  local gh_stub; gh_stub="$(make_fixture)/gh_stub.sh"
  cat > "$gh_stub" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$SMOKE_GH_LOG"
case "$1 $2" in
  "run list") echo '[{"databaseId":999,"status":"completed","conclusion":"success"}]' ;;
  *) : ;;
esac
STUB
  chmod +x "$gh_stub"
  local log; log="$(make_fixture)/gh_calls.log"; : > "$log"
  # 中性化个人配置对 GH_BIN 的显式覆盖（若存在 config/github-sop.config.sh 会赋值 GH_BIN）
  local cfg="$ROOT_DIR/config/github-sop.config.sh"
  local cfg_bak=""
  if [ -f "$cfg" ]; then cfg_bak="$(make_fixture)/cfg.bak"; mv "$cfg" "$cfg_bak"; fi
  trap 'if [ -n "$cfg_bak" ] && [ -f "$cfg_bak" ]; then mv -f "$cfg_bak" "$cfg"; fi' RETURN
  local rc=0
  SMOKE_GH_LOG="$log" GH_BIN="$gh_stub" "$ROOT_DIR/scripts/sop_ci_rerun.sh" "$local" >/dev/null 2>&1
  rc=$?
  if [ "$rc" -ne 0 ]; then fail "脚本异常退出 rc=$rc"; return 1; fi
  if ! grep -q "run list" "$log"; then fail "未触发真实 gh run list 调用: $(cat "$log")"; return 1; fi
  if grep -Eq -- "--repo" "$log"; then fail "gh 调用仍携带 --repo（修复 regression）: $(cat "$log")"; return 1; fi
  pass "重跑 CI 真实调用路径：触发 gh run list 且未误传 --repo（依赖当前仓库自动探测）"
}

# A 档只读 CI 查询：需真实仓库+gh 登录，手工验收（此处不自动断言）
test_contract_pr_checks_ci() {
  skip "契约(sop-plan.md 第3节): sop_pr_checks / sop_ci_failed_log 为只读 CI 查询，需真实仓库+gh 登录，手工验收（A 档已实现，此处不自动断言）"
  return 2
}

register_test "L2-契约: 巡检前置预检(只读)" test_contract_precheck
register_test "L2-契约: fetch prune 不动远程" test_contract_fetch_prune
register_test "L2-契约: 只读合并状态" test_contract_branch_merged_status
register_test "L2-契约: 快进拉取-双向分叉不自动改" test_contract_pull_ff_diverge
register_test "L2-契约: 快进拉取-脏区硬停" test_contract_pull_ff_dirty
register_test "L2-契约: 合并上游决策树" test_contract_upstream_sync
register_test "L2-契约: main 分支守卫" test_contract_branch_guard_main
register_test "L2-契约: 开 PR 守卫" test_contract_pr_create
register_test "L2-契约: 重跑 CI 需确认" test_contract_ci_rerun
register_test "L2-契约: 重跑 CI 真实调用路径" test_contract_ci_rerun_realpath
register_test "L2-契约: CI 只读查询(需真实仓库)" test_contract_pr_checks_ci
