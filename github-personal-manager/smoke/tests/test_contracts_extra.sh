#!/usr/bin/env bash
# L2 契约补充测试：覆盖全脚本横切边界（-h / 未知选项 / 非 git 目录）与各脚本核心守卫、
# 双模式 --confirm 真实执行路径、docs_sync 的 --strict 与 Tier 1 阻断、需 gh 的只读脚本桩契约。
# 与 test_contracts.sh 配合，达成「使用场景 + 边际条件」全覆盖。
# 所有写操作类契约（分叉不自动改、脏区硬停、main 守卫、confirm 才真执行）在此真实断言。

# ---- 辅助 ----
assert_rc_eq() {
  if [ "$1" = "$2" ]; then return 0; fi
  echo "    assert_rc_eq 失败: 实际[$1] 期望[$2]"; return 1
}

# 全部 sop_*.sh 脚本
_all_scripts() { ls "$ROOT_DIR"/scripts/sop_*.sh 2>/dev/null; }

# 含 `-*) exit 2` 严格选项解析的脚本（其余只读脚本把未知参数当仓库路径处理，不在此列）
_STRICT_OPT_SCRIPTS="sop_sync_pull_ff sop_sync_upstream sop_pr_create sop_ci_rerun sop_fetch_prune sop_sync_report sop_docs_sync_check"

# ===== 横切边界 =====

test_contract_all_help() {
  local fail=0 s out rc
  for s in $(_all_scripts); do
    out="$("$s" -h 2>&1)"; rc=$?
    if [ "$rc" -ne 0 ]; then echo "    $(basename "$s") -h rc=$rc"; fail=1; fi
    if ! printf '%s' "$out" | grep -q "用法"; then echo "    $(basename "$s") -h 无'用法'"; fail=1; fi
  done
  if [ "$fail" -eq 0 ]; then pass "全部 $(ls "$ROOT_DIR"/scripts/sop_*.sh 2>/dev/null | wc -l | tr -d ' ') 个脚本 -h 均正常打印用法(exit 0)"; return 0; fi
  fail "部分脚本 -h 异常"; return 1
}

test_contract_unknown_opt_exit2() {
  local fail=0 s out rc
  for s in $_STRICT_OPT_SCRIPTS; do
    out="$("$ROOT_DIR/scripts/$s.sh" --bogus-opt-xyz 2>&1)"; rc=$?
    if [ "$rc" -ne 2 ]; then echo "    $s 未知选项 rc=$rc(期望2)"; fail=1; fi
  done
  if [ "$fail" -eq 0 ]; then pass "$(echo $_STRICT_OPT_SCRIPTS | wc -w | tr -d ' ') 个带选项脚本对未知选项均 rc=2 退出"; return 0; fi
  fail "未知选项处理异常"; return 1
}

test_contract_nongit_dir_exit1() {
  local d; d="$(make_fixture)"
  local fail=0 s out rc
  for s in $(_all_scripts); do
    out="$("$s" "$d" 2>&1)"; rc=$?
    if [ "$rc" -ne 1 ]; then echo "    $(basename "$s") 非git目录 rc=$rc(期望1)"; fail=1; fi
    if ! printf '%s' "$out" | grep -q "不是 git 仓库"; then echo "    $(basename "$s") 非git目录无提示"; fail=1; fi
  done
  if [ "$fail" -eq 0 ]; then pass "全部脚本传入非 git 目录均 rc=1 并提示『不是 git 仓库』"; return 0; fi
  fail "非git目录处理异常"; return 1
}

# ===== sop_sync_precheck（只读） =====

test_contract_precheck_no_upstream() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out; out="$("$ROOT_DIR/scripts/sop_sync_precheck.sh" "$local" 2>&1)"
  if assert_contains "无 upstream 远程" "$out"; then
    pass "precheck: 无 upstream 远程时跳过 origin↔upstream 探测"; return 0
  fi
  fail "precheck 无upstream 分支异常: $out"; return 1
}

test_contract_precheck_cwd() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc; out="$(cd "$local" && "$ROOT_DIR/scripts/sop_sync_precheck.sh" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 0 && assert_contains "remotes" "$out" && assert_contains "落后=" "$out"; then
    pass "precheck 空参数(当前目录为 git 仓库): 正常输出 remotes 与计数 exit 0"; return 0
  fi
  fail "precheck cwd 场景异常 rc=$rc: $out"; return 1
}

# ===== sop_sync_pull_ff（写操作，双模式） =====

test_contract_pull_ff_notmain() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  "$GIT_BIN" -C "$local" switch -q -c feat/x
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_pull_ff.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 1 && assert_contains "非 [main]" "$out"; then
    pass "pull_ff 当前非 main 分支: 硬停止(rc=1) 提示非 main"; return 0
  fi
  fail "非main守卫异常 rc=$rc: $out"; return 1
}

test_contract_pull_ff_behind_confirm() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  push_to_origin_from_third "${pair%|*}"
  "$GIT_BIN" -C "$local" fetch -q "$ORIGIN_REMOTE"
  local before; before="$("$GIT_BIN" -C "$local" rev-parse HEAD)"
  local out_dry; out_dry="$("$ROOT_DIR/scripts/sop_sync_pull_ff.sh" "$local" 2>&1)"
  local after_dry; after_dry="$("$GIT_BIN" -C "$local" rev-parse HEAD)"
  if [ "$before" != "$after_dry" ]; then fail "dry-run 不应改 HEAD"; return 1; fi
  if ! assert_contains "[dry-run]" "$out_dry"; then fail "dry-run 无标记"; return 1; fi
  local out_run; out_run="$("$ROOT_DIR/scripts/sop_sync_pull_ff.sh" "$local" --confirm 2>&1)"
  local after_run; after_run="$("$GIT_BIN" -C "$local" rev-parse HEAD)"
  if [ "$after_run" = "$before" ]; then fail "confirm 未快进 HEAD: $out_run"; return 1; fi
  pass "pull_ff 仅落后: dry-run 不改、--confirm 快进拉取 origin/main"; return 0
}

test_contract_pull_ff_ahead_confirm() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  echo "local" > "$local/local.txt"
  "$GIT_BIN" -C "$local" add -A
  "$GIT_BIN" -C "$local" commit -qm "local"
  local before; before="$("$GIT_BIN" -C "$local" rev-parse "$ORIGIN_REMOTE/$MAIN_BRANCH")"
  local out_dry; out_dry="$("$ROOT_DIR/scripts/sop_sync_pull_ff.sh" "$local" 2>&1)"
  local after_dry; after_dry="$("$GIT_BIN" -C "$local" rev-parse "$ORIGIN_REMOTE/$MAIN_BRANCH")"
  if [ "$before" != "$after_dry" ]; then fail "dry-run 不应改 origin/main"; return 1; fi
  if ! assert_contains "[dry-run]" "$out_dry"; then fail "dry-run 无标记"; return 1; fi
  local out_run; out_run="$("$ROOT_DIR/scripts/sop_sync_pull_ff.sh" "$local" --confirm 2>&1)"
  local after_run; after_run="$("$GIT_BIN" -C "$local" rev-parse "$ORIGIN_REMOTE/$MAIN_BRANCH")"
  if [ "$after_run" = "$before" ]; then fail "confirm 未推送 origin/main: $out_run"; return 1; fi
  pass "pull_ff 仅领先: dry-run 不改、--confirm 推送 origin/main(快进)"; return 0
}

test_contract_pull_ff_clean() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_pull_ff.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 0 && assert_contains "无需操作" "$out"; then
    pass "pull_ff 已同步(落后=0领先=0): 打印『无需操作』exit 0"; return 0
  fi
  fail "已同步场景异常 rc=$rc: $out"; return 1
}

# ===== sop_sync_report（只读，需 upstream） =====

test_contract_report_basic() {
  local trio; IFS='|' read -r up or local <<< "$(setup_fork_with_upstream)"
  push_to_upstream_from_third "$up"
  "$GIT_BIN" -C "$local" fetch -q "$UPSTREAM_REMOTE"
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_report.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 0 && assert_contains "上游更新分析报告" "$out" && assert_contains "详细提交记录" "$out"; then
    pass "report: 有 upstream 新增提交→输出分类报告与提交表"; return 0
  fi
  fail "report 基本场景异常 rc=$rc: $out"; return 1
}

test_contract_report_no_new() {
  local trio; IFS='|' read -r up or local <<< "$(setup_fork_with_upstream)"
  "$GIT_BIN" -C "$local" fetch -q "$UPSTREAM_REMOTE"
  # 提供 BASE=upstream/main → 相对范围为空 → 已是最新
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_report.sh" "$local" "$UPSTREAM_REMOTE/$MAIN_BRANCH" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 0 && assert_contains "已是最新" "$out"; then
    pass "report: 提供 BASE=upstream/main→相对范围为空『已是最新』exit 0"; return 0
  fi
  fail "report 无新增场景异常 rc=$rc: $out"; return 1
}

test_contract_report_notmain() {
  local trio; IFS='|' read -r up or local <<< "$(setup_fork_with_upstream)"
  "$GIT_BIN" -C "$local" switch -q -c feat/x
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_report.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 1 && assert_contains "请先切回 main" "$out"; then
    pass "report 非 main 分支: 守卫退出(rc=1)"; return 0
  fi
  fail "report 非main守卫异常 rc=$rc: $out"; return 1
}

test_contract_report_no_upstream() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_report.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 1 && assert_contains "upstream" "$out"; then
    pass "report 无 upstream 远程: 守卫退出(rc=1)"; return 0
  fi
  fail "report 无upstream守卫异常 rc=$rc: $out"; return 1
}

# ===== sop_docs_sync_check（只读，--strict） =====

test_contract_docs_tier1_block() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf '# R\n' > "$local/README.md"
  printf '# C\n' > "$local/CHANGELOG.md"
  "$GIT_BIN" -C "$local" add -A && "$GIT_BIN" -C "$local" commit -qm "docs init"
  echo "change" > "$local/src.txt"   # 非文档→UNKNOWN→触发全部 Tier1
  local out rc; out="$("$ROOT_DIR/scripts/sop_docs_sync_check.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 2 && assert_contains "阻断" "$out"; then
    pass "docs_sync: 改动代码但 Tier1(README/CHANGELOG)未同步→exit 2 阻断"; return 0
  fi
  fail "docs_sync Tier1 阻断异常 rc=$rc: $out"; return 1
}

test_contract_docs_strict() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  mkdir -p "$local/docs"; printf '# x\n' > "$local/docs/x.md"
  "$GIT_BIN" -C "$local" add -A && "$GIT_BIN" -C "$local" commit -qm "docs init"
  echo "change" > "$local/src.txt"   # UNKNOWN→触发全部 Tier2（docs/x.md 存在未改）
  local out_def rc_def; out_def="$("$ROOT_DIR/scripts/sop_docs_sync_check.sh" "$local" 2>&1)"; rc_def=$?
  if ! assert_rc_eq "$rc_def" 0; then fail "docs_sync 默认应 exit0: rc=$rc_def $out_def"; return 1; fi
  local out_strict rc_strict; out_strict="$("$ROOT_DIR/scripts/sop_docs_sync_check.sh" "$local" --strict 2>&1)"; rc_strict=$?
  if assert_rc_eq "$rc_strict" 2 && assert_contains "Tier 2 阻断" "$out_strict"; then
    pass "docs_sync: 默认 Tier2 仅提示(exit0)；--strict 同样阻断(exit2)"; return 0
  fi
  fail "docs_sync --strict 异常 rc=$rc_strict: $out_strict"; return 1
}

test_contract_docs_no_change() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc; out="$("$ROOT_DIR/scripts/sop_docs_sync_check.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 0 && assert_contains "已同步" "$out"; then
    pass "docs_sync: 无真实变化→『已同步』exit 0"; return 0
  fi
  fail "docs_sync 无变化场景异常 rc=$rc: $out"; return 1
}

# ===== sop_pr_create（写操作，双模式） =====

test_contract_pr_create_detached() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  "$GIT_BIN" -C "$local" checkout -q "$("$GIT_BIN" -C "$local" rev-parse HEAD)"   # detached HEAD
  local out rc; out="$("$ROOT_DIR/scripts/sop_pr_create.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 1 && assert_contains "分离 HEAD" "$out"; then
    pass "pr_create 分离 HEAD: 守卫退出(rc=1)"; return 0
  fi
  fail "pr_create 分离HEAD守卫异常 rc=$rc: $out"; return 1
}

test_contract_pr_create_confirm() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  "$GIT_BIN" -C "$local" switch -q -c feat/x
  # gh 桩：记录 gh 调用并模拟 pr create 输出
  local gh_stub; gh_stub="$(make_fixture)/gh_stub.sh"
  cat > "$gh_stub" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$SMOKE_GH_LOG"
case "$1 $2" in
  "pr create") echo "https://github.com/owner/repo/pull/1" ;;
  *) : ;;
esac
STUB
  chmod +x "$gh_stub"
  # git 桩：记录 git 调用并转发真实 git（公共库依赖 $GIT_BIN 的真实输出，必须转发）
  local git_stub; git_stub="$(make_fixture)/git_stub.sh"
  cat > "$git_stub" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$SMOKE_GH_LOG"
exec "$REAL_GIT_BIN" "$@"
STUB
  chmod +x "$git_stub"
  local log; log="$(make_fixture)/gh_calls.log"; : > "$log"
  # 中性化本机 config（与已验证的 test_contract_ci_rerun_realpath 同写法），使 GH_BIN/GIT_BIN 注入生效
  local cfg="$ROOT_DIR/config/github-sop.config.sh"
  local cfg_bak=""
  if [ -f "$cfg" ]; then cfg_bak="$(make_fixture)/cfg.bak"; mv "$cfg" "$cfg_bak"; fi
  trap 'if [ -n "$cfg_bak" ] && [ -f "$cfg_bak" ]; then mv -f "$cfg_bak" "$cfg"; fi' RETURN
  local REAL_GIT_BIN="$GIT_BIN"; export REAL_GIT_BIN
  export SMOKE_GH_LOG="$log"
  export GH_BIN="$gh_stub"
  export GIT_BIN="$git_stub"
  local rc=0
  "$ROOT_DIR/scripts/sop_pr_create.sh" "$local" --confirm >/dev/null 2>&1; rc=$?
  if [ "$rc" -ne 0 ]; then fail "脚本异常退出 rc=$rc"; return 1; fi
  if ! grep -q "push -u" "$log"; then fail "confirm 未触发 git push -u: $(cat "$log")"; return 1; fi
  if ! grep -q "pr create --fill" "$log"; then fail "confirm 未触发 gh pr create --fill: $(cat "$log")"; return 1; fi
  pass "pr_create --confirm: 真实触发 git push -u + gh pr create --fill --base main"
}

# ===== 需 gh 的只读脚本（gh 桩契约） =====

test_contract_pr_checks_stub() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local gh_stub; gh_stub="$(make_fixture)/gh_stub.sh"
  cat > "$gh_stub" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$SMOKE_GH_LOG"
case "$1 $2" in
  "pr checks") echo "all checks pass" ;;
  "run list") echo "run1" ;;
  *) : ;;
esac
STUB
  chmod +x "$gh_stub"
  local log; log="$(make_fixture)/gh_calls.log"; : > "$log"
  local cfg="$ROOT_DIR/config/github-sop.config.sh"
  local cfg_bak=""
  if [ -f "$cfg" ]; then cfg_bak="$(make_fixture)/cfg.bak"; mv "$cfg" "$cfg_bak"; fi
  trap 'if [ -n "$cfg_bak" ] && [ -f "$cfg_bak" ]; then mv -f "$cfg_bak" "$cfg"; fi' RETURN
  export SMOKE_GH_LOG="$log"
  export GH_BIN="$gh_stub"
  local rc=0
  "$ROOT_DIR/scripts/sop_pr_checks.sh" "$local" >/dev/null 2>&1; rc=$?
  if [ "$rc" -ne 0 ]; then fail "脚本异常退出 rc=$rc"; return 1; fi
  if ! grep -q "pr checks" "$log"; then fail "未触发 gh pr checks: $(cat "$log")"; return 1; fi
  if ! grep -q "run list" "$log"; then fail "未触发 gh run list: $(cat "$log")"; return 1; fi
  pass "pr_checks: 触发 gh pr checks 与 gh run list(不崩溃, exit0)"
}

test_contract_ci_failed_log_stub() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local gh_stub; gh_stub="$(make_fixture)/gh_stub.sh"
  cat > "$gh_stub" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$SMOKE_GH_LOG"
case "$1 $2" in
  "run list") echo "123" ;;
  "run view") echo "failed step log" ;;
  *) : ;;
esac
STUB
  chmod +x "$gh_stub"
  local log; log="$(make_fixture)/gh_calls.log"; : > "$log"
  local cfg="$ROOT_DIR/config/github-sop.config.sh"
  local cfg_bak=""
  if [ -f "$cfg" ]; then cfg_bak="$(make_fixture)/cfg.bak"; mv "$cfg" "$cfg_bak"; fi
  trap 'if [ -n "$cfg_bak" ] && [ -f "$cfg_bak" ]; then mv -f "$cfg_bak" "$cfg"; fi' RETURN
  export SMOKE_GH_LOG="$log"
  export GH_BIN="$gh_stub"
  local rc=0
  "$ROOT_DIR/scripts/sop_ci_failed_log.sh" "$local" >/dev/null 2>&1; rc=$?
  if [ "$rc" -ne 0 ]; then fail "脚本异常退出 rc=$rc"; return 1; fi
  if ! grep -q "run view" "$log"; then fail "未触发 gh run view: $(cat "$log")"; return 1; fi
  if ! grep -q -- "--log-failed" "$log"; then fail "未触发 --log-failed: $(cat "$log")"; return 1; fi
  pass "ci_failed_log: 有 run→触发 gh run view --log-failed(不崩溃, exit0)"
}

test_contract_ci_rerun_confirm() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local gh_stub; gh_stub="$(make_fixture)/gh_stub.sh"
  cat > "$gh_stub" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$SMOKE_GH_LOG"
case "$1 $2" in
  "run list") echo '[{"databaseId":555,"status":"completed","conclusion":"failure"}]' ;;
  "run rerun") echo "rerun ok" ;;
  *) : ;;
esac
STUB
  chmod +x "$gh_stub"
  local log; log="$(make_fixture)/gh_calls.log"; : > "$log"
  local cfg="$ROOT_DIR/config/github-sop.config.sh"
  local cfg_bak=""
  if [ -f "$cfg" ]; then cfg_bak="$(make_fixture)/cfg.bak"; mv "$cfg" "$cfg_bak"; fi
  trap 'if [ -n "$cfg_bak" ] && [ -f "$cfg_bak" ]; then mv -f "$cfg_bak" "$cfg"; fi' RETURN
  export SMOKE_GH_LOG="$log"
  export GH_BIN="$gh_stub"
  local rc=0
  "$ROOT_DIR/scripts/sop_ci_rerun.sh" "$local" --confirm >/dev/null 2>&1; rc=$?
  if [ "$rc" -ne 0 ]; then fail "脚本异常退出 rc=$rc"; return 1; fi
  if ! grep -q "run rerun 555 --failed" "$log"; then fail "confirm 未触发 gh run rerun --failed: $(cat "$log")"; return 1; fi
  pass "ci_rerun --confirm: 真实触发 gh run rerun <id> --failed"
}

# ===== sop_resolve_repo（只读） =====

test_contract_resolve_repo_quiet() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out; out="$("$ROOT_DIR/scripts/sop_resolve_repo.sh" "$local" --quiet 2>&1)"
  if assert_contains "REPO_NAME=" "$out" && ! printf '%s' "$out" | grep -q "解析结果"; then
    pass "resolve_repo --quiet: 仅输出 key=value，不含说明文字"; return 0
  fi
  fail "resolve_repo --quiet 异常: $out"; return 1
}

test_contract_resolve_repo_cwd() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc; out="$(cd "$local" && "$ROOT_DIR/scripts/sop_resolve_repo.sh" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 0 && assert_contains "REPO_NAME=" "$out"; then
    pass "resolve_repo 空参数(当前目录为 git 根): 正常解析 exit 0"; return 0
  fi
  fail "resolve_repo cwd 场景异常 rc=$rc: $out"; return 1
}

# ===== sop_sync_upstream（写操作，双模式） =====

test_contract_upstream_no_upstream() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_upstream.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 1 && assert_contains "upstream" "$out"; then
    pass "upstream 同步: 无 upstream 远程→守卫退出(rc=1)"; return 0
  fi
  fail "upstream 无upstream守卫异常 rc=$rc: $out"; return 1
}

test_contract_upstream_ahead_only() {
  local trio; IFS='|' read -r up or local <<< "$(setup_fork_with_upstream)"
  echo "mine" > "$local/mine.txt"
  "$GIT_BIN" -C "$local" add -A
  "$GIT_BIN" -C "$local" commit -qm "mine"
  "$GIT_BIN" -C "$local" push -q "$ORIGIN_REMOTE" "$MAIN_BRANCH"
  "$GIT_BIN" -C "$local" fetch -q "$UPSTREAM_REMOTE"
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_upstream.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 0 && assert_contains "fork领先=M=1" "$out"; then
    pass "upstream 同步: M>0 K=0(fork领先, upstream无新)→查PR路径, exit0 不崩溃"; return 0
  fi
  fail "upstream M>0 场景异常 rc=$rc: $out"; return 1
}

test_contract_upstream_notmain() {
  local trio; IFS='|' read -r up or local <<< "$(setup_fork_with_upstream)"
  "$GIT_BIN" -C "$local" switch -q -c feat/x
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_upstream.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 1 && assert_contains "非 [main]" "$out"; then
    pass "upstream 同步: 非 main 分支→守卫退出(rc=1)"; return 0
  fi
  fail "upstream 非main守卫异常 rc=$rc: $out"; return 1
}

test_contract_upstream_dirty() {
  local trio; IFS='|' read -r up or local <<< "$(setup_fork_with_upstream)"
  echo "dirty" > "$local/dirty.txt"
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_upstream.sh" "$local" 2>&1)"; rc=$?
  if assert_rc_eq "$rc" 1 && assert_contains "工作区不干净" "$out"; then
    pass "upstream 同步: 脏工作区→硬停止(rc=1)"; return 0
  fi
  fail "upstream 脏区守卫异常 rc=$rc: $out"; return 1
}

# ===== 注册（在 run_all 调用前全部注册） =====
register_test "L2-补充: 全脚本 -h 正常" test_contract_all_help
register_test "L2-补充: 未知选项均 rc=2" test_contract_unknown_opt_exit2
register_test "L2-补充: 非 git 目录均 rc=1" test_contract_nongit_dir_exit1
register_test "L2-补充: precheck 无 upstream 跳过" test_contract_precheck_no_upstream
register_test "L2-补充: precheck 当前目录模式" test_contract_precheck_cwd
register_test "L2-补充: pull_ff 非 main 守卫" test_contract_pull_ff_notmain
register_test "L2-补充: pull_ff 仅落后 confirm 真拉取" test_contract_pull_ff_behind_confirm
register_test "L2-补充: pull_ff 仅领先 confirm 真推送" test_contract_pull_ff_ahead_confirm
register_test "L2-补充: pull_ff 已同步无需操作" test_contract_pull_ff_clean
register_test "L2-补充: report 基本分类报告" test_contract_report_basic
register_test "L2-补充: report 无新增已是最新" test_contract_report_no_new
register_test "L2-补充: report 非 main 守卫" test_contract_report_notmain
register_test "L2-补充: report 无 upstream 守卫" test_contract_report_no_upstream
register_test "L2-补充: docs_sync Tier1 阻断 exit2" test_contract_docs_tier1_block
register_test "L2-补充: docs_sync --strict 阻断" test_contract_docs_strict
register_test "L2-补充: docs_sync 无变化 exit0" test_contract_docs_no_change
register_test "L2-补充: pr_create 分离 HEAD 守卫" test_contract_pr_create_detached
register_test "L2-补充: pr_create --confirm 真执行(桩)" test_contract_pr_create_confirm
register_test "L2-补充: pr_checks gh 桩契约" test_contract_pr_checks_stub
register_test "L2-补充: ci_failed_log gh 桩契约" test_contract_ci_failed_log_stub
register_test "L2-补充: ci_rerun --confirm 真执行(桩)" test_contract_ci_rerun_confirm
register_test "L2-补充: resolve_repo --quiet" test_contract_resolve_repo_quiet
register_test "L2-补充: resolve_repo 当前目录" test_contract_resolve_repo_cwd
register_test "L2-补充: upstream 无 upstream 守卫" test_contract_upstream_no_upstream
register_test "L2-补充: upstream M>0 查PR路径" test_contract_upstream_ahead_only
register_test "L2-补充: upstream 非 main 守卫" test_contract_upstream_notmain
register_test "L2-补充: upstream 脏区硬停" test_contract_upstream_dirty

# ===== M4 补齐：upstream PR 核查路径（gh 桩） =====
# 注：branch_merged_status 的 open PR 反向识别段已在生产代码与 SKILL.md 中同步移除，对应回归测试一并删除（见审计报告 H1）。

# upstream 同步 M>0 路径：中性化 config 后由环境变量注入 GH_USER/UPSTREAM_REPO（保留本地裸仓库路径做离线 fetch/push），
# PR 核查应真实调用 gh pr list（桩返回空→输出『无 open PR』），证明 M>0 PR 核查路径被有效覆盖。
test_contract_sync_upstream_pr_stub() {
  local trio; IFS='|' read -r up or local <<< "$(setup_fork_with_upstream)"
  local cfg="$ROOT_DIR/config/github-sop.config.sh"
  local cfg_bak=""
  if [ -f "$cfg" ]; then cfg_bak="$(make_fixture)/cfg.bak"; mv "$cfg" "$cfg_bak"; fi
  trap 'if [ -n "$cfg_bak" ] && [ -f "$cfg_bak" ]; then mv -f "$cfg_bak" "$cfg"; fi' RETURN
  export GH_USER="zhangweildlh"
  export UPSTREAM_REPO="upstream-owner/test-repo"
  # M>0：本地新增提交并推 origin（本地裸仓库，离线可行），再 fetch upstream 以建立 upstream/main 引用
  echo "mine" > "$local/mine.txt"
  "$GIT_BIN" -C "$local" add -A
  "$GIT_BIN" -C "$local" commit -qm "mine"
  "$GIT_BIN" -C "$local" push -q "$ORIGIN_REMOTE" "$MAIN_BRANCH"
  "$GIT_BIN" -C "$local" fetch -q "$UPSTREAM_REMOTE"
  local gh_stub; gh_stub="$(make_fixture)/gh_stub.sh"
  cat > "$gh_stub" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$SMOKE_GH_LOG"
case "$1 $2" in
  "pr list") echo '[]' ;;
  *) : ;;
esac
STUB
  chmod +x "$gh_stub"
  local log; log="$(make_fixture)/gh_calls.log"; : > "$log"
  export SMOKE_GH_LOG="$log"
  export GH_BIN="$gh_stub"
  local out rc; out="$("$ROOT_DIR/scripts/sop_sync_upstream.sh" "$local" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "脚本异常退出 rc=$rc: $out"; return 1; fi
  if ! grep -q "pr list" "$log"; then fail "M>0 未触发 gh pr list 核查: $(cat "$log")"; return 1; fi
  if ! assert_contains "无 open PR" "$out"; then fail "M>0 无 open PR 路径异常: $out"; return 1; fi
  pass "sync_upstream: M>0 路径触发 gh pr list 核查（桩返回空→输出『无 open PR』）"
}

register_test "M4-补齐: sync_upstream M>0 PR核查触发(gh桩)" test_contract_sync_upstream_pr_stub
