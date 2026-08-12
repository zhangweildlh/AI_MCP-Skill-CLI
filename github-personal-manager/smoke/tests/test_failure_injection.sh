#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/tests/test_failure_injection.sh
# 中文名: 失败注入负向用例（堵住 S1/S2/S3「假成功」回归）
#
# 【功能】
#   用 PATH 前置的 fake git/gh 注入写命令失败，验证被测脚本在失败时必须非零退出、
#   且不得打印「✅ 已…」成功提示；同时验证 worktree_merge 的分支保护 fail-safe
#   （非 404 核验失败 → rc=1 暂停）。这些路径正是此前「假成功」缺陷的盲区。
#
# 【注入方式（重要）】
#   全部 sop_*.sh 业务脚本按 SKILL.md「工具路径不硬编码」契约，内部一律用绝对路径
#   $GIT_BIN / $GH_BIN 调用工具（优先 config、其次 where.exe、最后 PATH）。因此「PATH 前置
#   fake 工具」对这套架构无效——绝对路径调用会绕过 PATH 注入，fake 工具形同虚设。
#   本测试改为用「GIT_BIN=.../git GH_BIN=.../gh 环境变量注入」fake 工具：脚本读取环境
#   中的绝对路径，真正调用到 fake 工具，从而实现可靠失败注入。
#   fake 工具仅拦截特定命令（push / fetch / api），其余命令透传真实工具，保证夹具构造
#   与本地 git 操作（rev-parse / merge-tree / merge 等）正常进行。
#
# 【注意事项】
#   - 全部在临时夹具仓库运行，不触碰任何真实仓库或远端。
#   - 夹具 origin 使用 github 形式 url，确保 _sop_resolve_remotes 能解析出 owner/repo
#     （本地路径 url 非 github.com 域，解析为空会导致分支保护核验被跳过，无法验证意图）。
#   - fake git 对 fetch/push 短路（不真正联网），其余命令透传真实 git。
# =============================================================================

# 失败注入: push 失败不得假成功（覆盖 S1 pull_ff / S3 pr_create）
test_push_failure_no_fake_success() {
  local d; d="$(make_fixture)"
  init_fixture_repo "$d"
  ( cd "$d" \
    && "$GIT_BIN" remote add origin "https://github.com/zhangweildlh/demo.git" \
    && "$GIT_BIN" checkout -q -b feat/demo \
    && echo "x" > file.txt \
    && "$GIT_BIN" add -A \
    && "$GIT_BIN" commit -qm "demo" ) || { fail "夹具初始化失败"; return 1; }

  # 捕获真实 git 路径（供 fake git 透传非拦截命令）
  local rg="$GIT_BIN"; [ -z "$rg" ] && rg="$(command -v git || where.exe git 2>/dev/null | head -1)"
  # 构造 fake git：仅拦截 push（返回 1），其余命令透传真实 git
  local fb; fb="$(make_fixture)"
  cat > "$fb/git" <<EOF
#!/usr/bin/env bash
[ "\$1" = "push" ] && exit 1
exec "$rg" "\$@"
EOF
  chmod +x "$fb/git"

  # 用环境变量注入 fake git（兼容脚本绝对路径调用架构），GH_BIN 保持真实值即可
  local out rc
  out="$(GIT_BIN="$fb/git" GH_BIN="$GH_BIN" bash "$ROOT_DIR/scripts/sop_pr_create.sh" "$d" --confirm 2>&1)"; rc=$?
  if assert_false "$rc"; then :; else fail "push 失败时脚本应非零退出, rc=$rc | out=$out"; return 1; fi
  if printf '%s' "$out" | grep -qF "✅ 已创建 PR"; then fail "push 失败却打印『已创建 PR』: $out"; return 1; fi
  assert_contains "⛔" "$out"
  pass "push 失败不再假成功(S3 已修复)"
}

# 失败注入: 分支保护核验失败（非 404）→ rc=1 暂停（worktree_merge fail-safe）
test_branch_protection_failsafe() {
  local d; d="$(make_fixture)"
  init_fixture_repo "$d"
  ( cd "$d" \
    && "$GIT_BIN" remote add origin "https://github.com/zhangweildlh/demo.git" \
    && echo "a" > a.txt && "$GIT_BIN" add -A && "$GIT_BIN" commit -qm init \
    && "$GIT_BIN" checkout -q -b feat/x \
    && echo "b" > b.txt && "$GIT_BIN" add -A && "$GIT_BIN" commit -qm feat \
    && "$GIT_BIN" checkout -q "$MAIN_BRANCH" ) || { fail "夹具初始化失败"; return 1; }

  # 捕获真实 git 路径（供 fake git 透传非拦截命令）
  local rg="$GIT_BIN"; [ -z "$rg" ] && rg="$(command -v git || where.exe git 2>/dev/null | head -1)"
  # 构造 fake git：fetch 短路返回 0（不联网，避免超时），其余透传真实 git
  local fb; fb="$(make_fixture)"
  cat > "$fb/git" <<EOF
#!/usr/bin/env bash
[ "\$1" = "fetch" ] && exit 0
exec "$rg" "\$@"
EOF
  chmod +x "$fb/git"
  # 构造 fake gh：仅 api 返回非 404 错误（模拟网络不通/未认证/403），触发 fail-safe 暂停
  cat > "$fb/gh" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = "api" ]; then echo "fake gh api error: network unreachable" >&2; exit 1; fi
exit 1
EOF
  chmod +x "$fb/gh"

  # 用环境变量注入 fake git/fake gh（兼容脚本绝对路径调用架构）
  local out rc
  out="$(GIT_BIN="$fb/git" GH_BIN="$fb/gh" bash "$ROOT_DIR/scripts/sop_worktree_merge.sh" "$d" --branch feat/x --confirm 2>&1)"; rc=$?
  if assert_false "$rc"; then :; else fail "分支保护核验失败应非零退出, rc=$rc | out=$out"; return 1; fi
  if ! assert_contains "无法确认主线是否受保护" "$out"; then return 1; fi
  pass "分支保护 fail-safe 非404→rc=1"
}

register_test "失败注入: push 失败不假成功" test_push_failure_no_fake_success
register_test "失败注入: 分支保护 fail-safe" test_branch_protection_failsafe
