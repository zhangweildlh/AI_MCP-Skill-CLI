#!/usr/bin/env bash
# L1 夹具行为测试：验证「状态探测」原语在临时仓库上的行为（绿色基线）
# 这些原语将被实际脚本复用；先在此确认 git 在 behind/ahead/diverge/dirty 下的语义映射正确。
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
