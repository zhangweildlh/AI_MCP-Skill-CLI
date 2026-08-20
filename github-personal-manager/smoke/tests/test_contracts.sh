#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/tests/test_contracts.sh
# 中文名: L2 契约规格测试（主集）
#
# 【功能】
#   冒烟测试的核心层（L2），把每个 SOP 脚本对外承诺的「契约」逐条转成可执行断言。
#   覆盖两大组共 19 条用例：
#     第一组·核心行为契约（11 条）:
#       巡检前置预检只读、清理引用不动远端、只读合并状态、快进拉取遇双向分叉不自动改、
#       快进拉取遇脏工作区硬停、合并上游决策树、主线分支守卫、开 PR 守卫、
#       重跑 CI 需确认、重跑 CI 的真实调用路径、CI 只读查询。
#     第二组·缺陷回归契约（8 条）:
#       仓库解析传入根目录正常 / 传入子目录报错（BUG-GPM-1）、
#       文档同步传入子目录报错（BUG-GPM-2）/ 传入根目录正常、
#       仓库标识解析容忍尾部斜杠（P-GPM-2）、
#       文档同步帮助文本走标记块提取（P-GPM-1）、
#       仓库解析对相对路径的子目录报错与根目录正常（BUG-GPM-4）。
#   其中「主线分支守卫」用例采用全文扫描方式，检查四个写操作脚本的源码中
#   不得出现对主线的强制推送、删除远端分支、强制删除主线本地分支这三类禁用写法。
#   已实现脚本走真实断言；尚未实现的脚本对应用例返回跳过，契约文本仍保留以备后续补齐。
#
# 【用途 / 使用场景】
#   1. 修改任意 SOP 脚本后的主回归入口：确认既有契约没有被破坏。
#   2. 修复缺陷后固化回归：新缺陷修复完成即在此追加一条对应用例，防止问题复发。
#   3. 代码评审佐证：用例名即契约描述，可直接作为「脚本承诺了什么」的清单。
#
# 【详细用法】
#   本文件不单独执行，由 smoke/run-smoke.sh 自动 source 并注册用例。
#   运行冒烟测试后，查看输出中前缀为「L2-契约」的记录即可。
#
#   依赖的外部函数与变量:
#     setup_origin_and_local   来自 test_fixtures.sh，提供标准夹具
#     assert_contains 等断言   来自 lib/harness.sh
#     ROOT_DIR / GIT_BIN / MAIN_BRANCH / ORIGIN_REMOTE   由 run-smoke.sh 准备
#
# 【注意事项】
#   - 全部用例在临时夹具仓库上运行，不触碰任何真实仓库，也不产生远端副作用。
#   - 涉及 GitHub 交互的用例采用桩方式模拟，不依赖真实网络与鉴权。
#   - 新增用例后务必在文件末尾调用 register_test 注册，否则不会被执行。
# =============================================================================

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
  # 默认 dry-run：打印 git fetch --prune 计划但不实际执行、不报错（符合写操作默认干跑契约）
  if assert_contains "[dry-run]" "$out" && assert_contains "fetch --prune" "$out"; then
    pass "fetch_prune 默认 dry-run（打印 git fetch --prune 计划，不实际执行，不报错）"; return 0
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

# 重跑 CI 真实调用路径：拦截 gh，验证「显式携带 --repo owner/repo」（审计契约）
# （历史 BUG1：gh run list --repo <完整URL> 可能查不到 run；已改为 owner/repo 形态。
#   历史 BUG2：依赖 gh 当前仓库自动探测（不传 --repo）在多远端/非仓库目录下误探测；
#   已改为显式 --repo（P-GPM-5 / --repo 审计）。）
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
  if ! grep -q -- "--repo" "$log"; then fail "gh 调用未显式携带 --repo（审计契约，防多远端/非仓库目录误探测）: $(cat "$log")"; return 1; fi
  if grep -Eq -- "--repo https?://" "$log"; then fail "gh 调用把完整 remote URL 当作 --repo 传入: $(cat "$log")"; return 1; fi
  pass "重跑 CI 真实调用路径：触发 gh run list 且显式 --repo（owner/repo 形态，非完整 URL）"
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

# ---- 新增：sop_resolve_repo / sop_docs_sync_check 契约（含 BUG-GPM-1/2 子目录守卫回归） ----

# 传入真实 git 根 → 正常解析三元组（rc=0），不误判父仓库
test_contract_resolve_repo_valid_root() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_resolve_repo.sh" "$local" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "传入 git 根应成功 rc=$rc: $out"; return 1; fi
  if assert_contains "REPO_NAME=" "$out"; then
    pass "resolve_repo 传入 git 根: 正常解析三元组(rc=0)"; return 0
  fi
  fail "resolve_repo 输出异常: $out"; return 1
}

# 传入子目录（非 git 根）→ 必须报错，不得静默误解析为父仓库（BUG-GPM-1 回归）
test_contract_resolve_repo_subdir_rejected() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  mkdir -p "$local/sub"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_resolve_repo.sh" "$local/sub" 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then fail "传入子目录不应成功(应为非0): $out"; return 1; fi
  if assert_contains "git 仓库根" "$out"; then
    pass "resolve_repo 传入子目录: 显式报错『非 git 仓库根』，不再静默误解析父仓库(BUG-GPM-1 回归)"; return 0
  fi
  fail "传入子目录未报『git 仓库根』错误: $out"; return 1
}

# 传入子目录（非 git 根）→ 必须报错，不得静默扫描整个父仓库（BUG-GPM-2 回归）
test_contract_docs_sync_subdir_rejected() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  mkdir -p "$local/sub"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_docs_sync_check.sh" "$local/sub" 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then fail "传入子目录不应成功(应为非0): $out"; return 1; fi
  if assert_contains "git 仓库根" "$out"; then
    pass "docs_sync_check 传入子目录: 显式报错『非 git 仓库根』，不再静默扫描父仓库(BUG-GPM-2 回归)"; return 0
  fi
  fail "传入子目录未报『git 仓库根』错误: $out"; return 1
}

# 传入真实 git 根 → 正常执行文档同步检查，不得报非仓库错误
test_contract_docs_sync_valid_root() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_docs_sync_check.sh" "$local" 2>&1)"; rc=$?
  if printf '%s' "$out" | grep -qF "git 仓库根"; then
    fail "传入 git 根不该报非仓库错误: $out"; return 1
  fi
  pass "docs_sync_check 传入 git 根: 正常执行未报非仓库错误(rc=$rc)"; return 0
}

# _sop_parse_owner_repo 对尾部斜杠/无尾斜杠/ssh 形式均给出干净 owner/repo（P-GPM-2 回归）
test_contract_parse_owner_repo_trailing_slash() {
  ( # shellcheck disable=SC1091
    source "$ROOT_DIR/scripts/lib/sop-common.sh"
    local r1; r1="$(_sop_parse_owner_repo "https://github.com/owner/repo/")"
    local r2; r2="$(_sop_parse_owner_repo "https://github.com/owner/repo")"
    local r3; r3="$(_sop_parse_owner_repo "git@github.com:owner/repo.git")"
    if [ "$r1" = "owner/repo" ] && [ "$r2" = "owner/repo" ] && [ "$r3" = "owner/repo" ]; then
      pass "parse_owner_repo: 尾斜杠/无尾斜杠/ssh 均解析为 owner/repo(P-GPM-2 回归)"; return 0
    fi
    fail "解析异常 r1=[$r1] r2=[$r2] r3=[$r3]"; return 1
  )
}

# help 文本从标记块提取，运行 -h 应能正常打印用法（P-GPM-1 回归：不再依赖硬编码行号 2-9）
test_contract_docs_sync_help() {
  local out rc
  out="$("$ROOT_DIR/scripts/sop_docs_sync_check.sh" -h 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "运行 -h 应成功 rc=$rc: $out"; return 1; fi
  if assert_contains "用法" "$out" && assert_contains "sop_docs_sync_check.sh" "$out"; then
    pass "docs_sync_check -h: 从标记块提取 help 并正常打印用法(P-GPM-1 回归)"; return 0
  fi
  fail "help 输出异常: $out"; return 1
}

# 相对路径传入子目录（非 git 根）→ 仍正确报错，路径归一化不得误判（BUG-GPM-4 回归）
test_contract_resolve_repo_relative_subdir() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  mkdir -p "$local/sub"
  local parent; parent="$(cd "$local/.." && pwd)"
  local out rc
  # 在 parent 目录下以相对路径 "local/sub" 指向子目录调用（cwd 基准场景）
  out="$(cd "$parent" && "$ROOT_DIR/scripts/sop_resolve_repo.sh" "local/sub" 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then fail "相对路径传入子目录不应成功(应为非0): $out"; return 1; fi
  if assert_contains "git 仓库根" "$out"; then
    pass "resolve_repo 相对路径子目录: 稳定报错(路径归一化正确, BUG-GPM-4 回归)"; return 0
  fi
  fail "相对路径子目录未报『git 仓库根』错误: $out"; return 1
}

# 相对路径传入真正 git 根 → 不得误判为「非 git 仓库根」（BUG-GPM-4 false positive 回归）
test_contract_resolve_repo_relative_root() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local parent; parent="$(cd "$local/.." && pwd)"
  local out rc
  # 在 parent 目录下以相对路径 "local" 指向真正的 git 仓库根调用
  out="$(cd "$parent" && "$ROOT_DIR/scripts/sop_resolve_repo.sh" "local" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "相对路径传入真正 git 根应成功 rc=$rc: $out"; return 1; fi
  if assert_contains "REPO_NAME=" "$out"; then
    pass "resolve_repo 相对路径指向 git 根: 正常解析(未被误判为非根, BUG-GPM-4 回归)"; return 0
  fi
  fail "相对路径 git 根输出异常: $out"; return 1
}

register_test "L2-契约: 仓库解析-传入git根正常" test_contract_resolve_repo_valid_root
register_test "L2-契约: 仓库解析-传入子目录报错(BUG-GPM-1回归)" test_contract_resolve_repo_subdir_rejected
register_test "L2-契约: 文档同步-传入子目录报错(BUG-GPM-2回归)" test_contract_docs_sync_subdir_rejected
register_test "L2-契约: 文档同步-传入git根正常" test_contract_docs_sync_valid_root
register_test "L2-契约: owner/repo解析-尾斜杠(P-GPM-2回归)" test_contract_parse_owner_repo_trailing_slash
register_test "L2-契约: 文档同步help标记块(P-GPM-1回归)" test_contract_docs_sync_help
register_test "L2-契约: 仓库解析-相对路径子目录报错(BUG-GPM-4回归)" test_contract_resolve_repo_relative_subdir
register_test "L2-契约: 仓库解析-相对路径git根正常(BUG-GPM-4回归)" test_contract_resolve_repo_relative_root
