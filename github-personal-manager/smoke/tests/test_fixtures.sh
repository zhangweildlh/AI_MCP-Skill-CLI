#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/tests/test_fixtures.sh
# 中文名: L1 夹具行为测试（状态探测原语的语义基线）
#
# 【功能】
#   验证「仓库状态探测」这组底层原语在临时夹具仓库上的行为是否符合预期，共五条用例：
#     1. 空仓库初始同步：落后与领先均为 0；
#     2. 落后状态：本地少于远端 1 个提交；
#     3. 领先状态：本地多于远端 1 个提交；
#     4. 双向分叉：落后与领先同时为 1；
#     5. 脏工作区：存在未提交改动时能被正确识别。
#   这些原语会被各个 SOP 脚本复用，因此必须先在此确立一条可信的「绿色基线」，
#   后续契约层用例失败时才能确定不是探测语义本身出了问题。
#   同时本文件提供夹具构造函数 setup_origin_and_local，被其他测试文件复用。
#
# 【用途 / 使用场景】
#   1. 修改公共库中状态探测相关函数后的回归验证。
#   2. 排查「同步脚本判断方向反了」这类问题时，先跑本层确认底层语义是否正确。
#   3. 为其他测试文件提供标准夹具：一个裸远端仓库 + 一份本地克隆。
#
# 【详细用法】
#   本文件不单独执行，由 smoke/run-smoke.sh 自动 source 并注册用例。
#   运行冒烟测试后，查看输出中前缀为「L1-夹具」的五条记录即可。
#
#   对外提供的夹具函数:
#     setup_origin_and_local   创建带初始提交的裸远端仓库并克隆为本地仓库，
#                              返回格式为 "远端目录|本地目录" 的字符串。
#
#   依赖的外部变量（由 run-smoke.sh 与 harness.sh 预先准备）:
#     TEST_TMP / GIT_BIN / MAIN_BRANCH / ORIGIN_REMOTE
#
# 【注意事项】
#   - 全部操作发生在临时夹具目录内，远端是本地裸仓库而非真实 GitHub，无网络依赖。
#   - 下方的 git 计数换算约定务必保持不变，它是所有同步类脚本方向判断的共同前提。
#
# 【git 计数换算约定】
#
# git 约定： `git rev-list --left-right --count A...B` 输出 (left, right)
#   left  = A 独有提交数（本场景 A=本地 main → 即「本地领先」）
#   right = B 独有提交数（本场景 B=origin/main → 即「本地落后」）
# 故脚本统一换算： ahead=$left, behind=$right，再套用记忆策略：
#   仅 behind>0 → pull --ff-only；仅 ahead>0 → push origin main；both → 双向分叉暂停。

# 创建带初始提交的 origin（裸仓库，允许接收推送）+ 克隆为 local，返回 "origindir|localdir"
setup_origin_and_local() {
  local base; base="$(make_fixture)"
  local origin="$base/origin.git"
  local local="$base/local"
  "$GIT_BIN" init -q --bare -b "$MAIN_BRANCH" "$origin"
  local seed; seed="$(make_fixture)/seed"
  mkdir -p "$seed"
  ( cd "$seed" && "$GIT_BIN" init -q -b "$MAIN_BRANCH" \
    && "$GIT_BIN" config user.email s@s.s && "$GIT_BIN" config user.name s \
    && echo "init" > init.txt && "$GIT_BIN" add -A && "$GIT_BIN" commit -qm "init" )
  "$GIT_BIN" -C "$seed" push -q "$origin" "$MAIN_BRANCH"
  "$GIT_BIN" clone -q "$origin" "$local" >/dev/null 2>&1
  init_fixture_repo "$local" >/dev/null 2>&1
  echo "$origin|$local"
}

# 用一个第三方克隆向 origin(裸)推一笔提交，并让 local fetch 以更新 origin/main
push_to_origin_from_third() {
  local origin="$1"
  local tmp; tmp="$(make_fixture)/third"
  "$GIT_BIN" clone -q "$origin" "$tmp" >/dev/null 2>&1
  init_fixture_repo "$tmp" >/dev/null 2>&1
  echo "up" > "$tmp/up.txt"
  "$GIT_BIN" -C "$tmp" add -A
  "$GIT_BIN" -C "$tmp" commit -qm "upstream commit"
  "$GIT_BIN" -C "$tmp" push -q "$ORIGIN_REMOTE" "$MAIN_BRANCH"
}

# 读取语义化的 (behind, ahead)
detect_state() {
  local dir="$1"
  local left right
  read left right < <("$GIT_BIN" -C "$dir" rev-list --left-right --count "$MAIN_BRANCH...$ORIGIN_REMOTE/$MAIN_BRANCH" 2>/dev/null)
  echo "$right $left"   # 输出 "behind ahead"
}

test_fixture_clean_state() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local st; st="$(detect_state "$local")"
  if assert_eq "$st" "0 0"; then pass "空仓库初始同步: behind=0 ahead=0"; return 0; else fail "初始状态=$st"; return 1; fi
}

test_fixture_behind() {
  local pair; pair="$(setup_origin_and_local)"
  local origin="${pair%|*}"; local local="${pair#*|}"
  push_to_origin_from_third "$origin"
  "$GIT_BIN" -C "$local" fetch -q "$ORIGIN_REMOTE"
  local st; st="$(detect_state "$local")"
  if assert_eq "$st" "1 0"; then pass "落后状态: behind=1 ahead=0 → 应 pull --ff-only"; return 0; else fail "落后状态=$st"; return 1; fi
}

test_fixture_ahead() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  echo "local" > "$local/local.txt"
  "$GIT_BIN" -C "$local" add -A
  "$GIT_BIN" -C "$local" commit -qm "local commit"
  local st; st="$(detect_state "$local")"
  if assert_eq "$st" "0 1"; then pass "领先状态: behind=0 ahead=1 → 应 push origin main"; return 0; else fail "领先状态=$st"; return 1; fi
}

test_fixture_diverge() {
  local pair; pair="$(setup_origin_and_local)"
  local origin="${pair%|*}"; local local="${pair#*|}"
  echo "l" > "$local/l.txt"
  "$GIT_BIN" -C "$local" add -A
  "$GIT_BIN" -C "$local" commit -qm "local"
  push_to_origin_from_third "$origin"
  "$GIT_BIN" -C "$local" fetch -q "$ORIGIN_REMOTE"
  local st; st="$(detect_state "$local")"
  if assert_eq "$st" "1 1"; then pass "双向分叉: behind=1 ahead=1 → 应暂停列 A-E"; return 0; else fail "分叉状态=$st"; return 1; fi
}

test_fixture_dirty() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  echo "dirty" > "$local/dirty.txt"
  local st; st="$("$GIT_BIN" -C "$local" status --porcelain)"
  if [ -n "$st" ]; then pass "脏工作区被检出: $(printf '%s' "$st" | head -1)"; return 0; else fail "脏工作区未被检出"; return 1; fi
}

# 创建 upstream(裸) + origin(裸 fork，初态同 upstream) + local 克隆；返回 "upstreamdir|origindir|localdir"
setup_fork_with_upstream() {
  local base; base="$(make_fixture)"
  local upstream="$base/upstream.git"
  local origin="$base/origin.git"
  local local="$base/local"
  "$GIT_BIN" init -q --bare -b "$MAIN_BRANCH" "$upstream"
  "$GIT_BIN" init -q --bare -b "$MAIN_BRANCH" "$origin"
  local seed; seed="$(make_fixture)/seed"
  mkdir -p "$seed"
  ( cd "$seed" && "$GIT_BIN" init -q -b "$MAIN_BRANCH" \
    && "$GIT_BIN" config user.email s@s.s && "$GIT_BIN" config user.name s \
    && echo "init" > init.txt && "$GIT_BIN" add -A && "$GIT_BIN" commit -qm "init" )
  "$GIT_BIN" -C "$seed" push -q "$upstream" "$MAIN_BRANCH"
  "$GIT_BIN" -C "$seed" push -q "$origin" "$MAIN_BRANCH"
  "$GIT_BIN" clone -q "$origin" "$local" >/dev/null 2>&1
  init_fixture_repo "$local" >/dev/null 2>&1
  "$GIT_BIN" -C "$local" remote add "$UPSTREAM_REMOTE" "$upstream"
  echo "$upstream|$origin|$local"
}

# 让 upstream 比 origin/local 多一笔提交（K>0）；origin 与 local 保持一致（M=0）
push_to_upstream_from_third() {
  local upstream="$1"
  local tmp; tmp="$(make_fixture)/uthird"
  "$GIT_BIN" clone -q "$upstream" "$tmp" >/dev/null 2>&1
  init_fixture_repo "$tmp" >/dev/null 2>&1
  echo "up" > "$tmp/up.txt"
  "$GIT_BIN" -C "$tmp" add -A
  "$GIT_BIN" -C "$tmp" commit -qm "upstream commit"
  "$GIT_BIN" -C "$tmp" push -q origin "$MAIN_BRANCH"
}

register_test "L1-夹具: 空仓库初始同步" test_fixture_clean_state
register_test "L1-夹具: 落后状态探测(behind=1)" test_fixture_behind
register_test "L1-夹具: 领先状态探测(ahead=1)" test_fixture_ahead
register_test "L1-夹具: 双向分叉探测(behind=1,ahead=1)" test_fixture_diverge
register_test "L1-夹具: 脏工作区探测" test_fixture_dirty
