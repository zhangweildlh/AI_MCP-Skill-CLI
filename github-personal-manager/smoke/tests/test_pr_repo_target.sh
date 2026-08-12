#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/tests/test_pr_repo_target.sh
# 中文名: PR 目标仓库(--repo)取值语义对抗式测试
#
# 【背景】
#   sop_pr_create.sh 工作流语义为「向上游仓库贡献代码」——有 upstream 时 PR 必须开向
#   upstream；无 upstream（自有仓库）时回退 fork(origin) 自身，属合法场景。
#   此前一次修复仅改了打印行(echo)，漏改真实执行行（gh pr create --repo ...），
#   导致 fork 工作流下实际仍向 fork 自身开 PR。该缺陷因缺少 --repo 取值断言而漏网
#   （冒烟全绿但行为错误）。本测试显式捕获 fake gh 收到的 --repo 实参，断言其取值正确，
#   闭合「假设每一步无效/有 BUG，用测试证伪」的对抗式验证。
#
# 【注入方式】
#   复用 test_failure_injection.sh 已验证的环境变量注入范式：GIT_BIN=/GH_BIN= 指向
#   fake 工具，兼容脚本绝对路径调用架构。
#   - fake git：仅拦截 push（短路返回 0，避免真实联网），其余透传真实 git。
#   - fake gh：拦截 `pr create`，把 --repo 之后的实参写入 marker 文件后返回 0；其余
#     gh 命令一律返回 0（no-op），避免无关调用中断流程。
# =============================================================================

# 用例1: 存在 upstream 远端 → PR 必须开向 upstream（fork 贡献工作流的正确语义）
test_pr_targets_upstream_when_upstream_exists() {
  local d; d="$(make_fixture)"
  init_fixture_repo "$d"
  ( cd "$d" \
    && "$GIT_BIN" remote add origin "https://github.com/zhangweildlh/forkrepo.git" \
    && "$GIT_BIN" remote add upstream "https://github.com/upstreamorg/upstreamrepo.git" \
    && "$GIT_BIN" checkout -q -b feat/demo \
    && echo "x" > file.txt && "$GIT_BIN" add -A && "$GIT_BIN" commit -qm "demo" ) \
    || { fail "夹具初始化失败"; return 1; }

  local rg="$GIT_BIN"; [ -z "$rg" ] && rg="$(command -v git || where.exe git 2>/dev/null | head -1)"
  local fb; fb="$(make_fixture)"
  cat > "$fb/git" <<EOF
#!/usr/bin/env bash
[ "\$1" = "push" ] && exit 0
exec "$rg" "\$@"
EOF
  chmod +x "$fb/git"

  local marker="$fb/repo_marker.txt"
  cat > "$fb/gh" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "pr" ] && [ "\$2" = "create" ]; then
  args=( "\$@" )
  for ((i=0; i<\${#args[@]}; i++)); do
    if [ "\${args[i]}" = "--repo" ]; then echo "\${args[i+1]}" > "$marker"; break; fi
  done
  exit 0
fi
exit 0
EOF
  chmod +x "$fb/gh"

  local out rc
  out="$(GIT_BIN="$fb/git" GH_BIN="$fb/gh" bash "$ROOT_DIR/scripts/sop_pr_create.sh" "$d" --confirm 2>&1)"; rc=$?
  if assert_true "$rc"; then :; else fail "PR 流程应成功(rc=0), rc=$rc | out=$out"; return 1; fi
  if [ ! -f "$marker" ]; then fail "fake gh 未捕获 --repo 实参: $out"; return 1; fi
  local got; got="$(cat "$marker")"
  if [ "$got" != "upstreamorg/upstreamrepo" ]; then
    fail "PR 应开向上游(upstreamorg/upstreamrepo), 实际=[$got] | out=$out"
    return 1
  fi
  pass "有 upstream 时 PR 开向上游(真实执行行 --repo 语义正确)"
}

# 用例2: 无 upstream 远端、无 UPSTREAM_REPO 环境变量 → 回退 fork(origin) 自身（自有仓库合法场景）
test_pr_falls_back_to_fork_when_no_upstream() {
  local d; d="$(make_fixture)"
  init_fixture_repo "$d"
  ( cd "$d" \
    && "$GIT_BIN" remote add origin "https://github.com/zhangweildlh/ownrepo.git" \
    && "$GIT_BIN" checkout -q -b feat/demo \
    && echo "x" > file.txt && "$GIT_BIN" add -A && "$GIT_BIN" commit -qm "demo" ) \
    || { fail "夹具初始化失败"; return 1; }

  local rg="$GIT_BIN"; [ -z "$rg" ] && rg="$(command -v git || where.exe git 2>/dev/null | head -1)"
  local fb; fb="$(make_fixture)"
  cat > "$fb/git" <<EOF
#!/usr/bin/env bash
[ "\$1" = "push" ] && exit 0
exec "$rg" "\$@"
EOF
  chmod +x "$fb/git"

  local marker="$fb/repo_marker.txt"
  cat > "$fb/gh" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "pr" ] && [ "\$2" = "create" ]; then
  args=( "\$@" )
  for ((i=0; i<\${#args[@]}; i++)); do
    if [ "\${args[i]}" = "--repo" ]; then echo "\${args[i+1]}" > "$marker"; break; fi
  done
  exit 0
fi
exit 0
EOF
  chmod +x "$fb/gh"

  local out rc
  # 显式清除 UPSTREAM_REPO，确保走「无 upstream → 回退 fork」分支
  out="$(env -u UPSTREAM_REPO GIT_BIN="$fb/git" GH_BIN="$fb/gh" bash "$ROOT_DIR/scripts/sop_pr_create.sh" "$d" --confirm 2>&1)"; rc=$?
  if assert_true "$rc"; then :; else fail "PR 流程应成功(rc=0), rc=$rc | out=$out"; return 1; fi
  if [ ! -f "$marker" ]; then fail "fake gh 未捕获 --repo 实参: $out"; return 1; fi
  local got; got="$(cat "$marker")"
  if [ "$got" != "zhangweildlh/ownrepo" ]; then
    fail "无 upstream 时应回退 fork(zhangweildlh/ownrepo), 实际=[$got] | out=$out"
    return 1
  fi
  pass "无 upstream 时 PR 回退 fork(自有仓库语义正确)"
}

register_test "PR 目标: 有 upstream 开向上游" test_pr_targets_upstream_when_upstream_exists
register_test "PR 目标: 无 upstream 回退 fork" test_pr_falls_back_to_fork_when_no_upstream
