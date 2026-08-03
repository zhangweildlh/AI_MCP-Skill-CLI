#!/usr/bin/env bash
# 工作流七（多工作树并行合并）专属冒烟测试：覆盖 sop_worktree_add / sop_worktree_merge / sop_worktree_cleanup
# 三个脚本的契约。
#
# 设计要点：
# - 自带稳健夹具 wt_make_repo（裸 origin 先接收 seed 初始提交再克隆，避免 Windows 下 clone 空仓库
#   报 "failed to iterate over objects" 的已知坑），不依赖 test_fixtures.sh 的 setup_origin_and_local。
# - 所有写操作脚本默认 dry-run（预览不落地），加 --confirm 才真正执行 → 测试分别断言两种模式。
# - 合并/清理均在主仓库目录执行（绝不在 worktree 内），符合 SKILL.md 阶段三/七硬约束。
# - 本地夹具的 origin 是本地路径（非 github.com），merge 脚本据此跳过分支保护核验、走直推路径，
#   正好覆盖「无保护直推」契约，无需真实 GitHub 鉴权与网络。
# - 工作树根一律放在主仓库之外的兄弟临时目录（wt_root），确保主仓库 git status 保持干净，
#   不会误触发 merge/cleanup 的「主仓库须干净」守卫（worktree 建在仓库内会被视为未跟踪目录）。

# ---------- 内部辅助 ----------

# 工作树根：返回主仓库之外的一个全新临时目录（make_fixture 本身就在 TEST_TMP 下独立随机目录），
# 保证其不在 $ldir 内部，主仓库 git status 不会因 worktree 父目录而变脏。
wt_root() { make_fixture; }

# 自建稳健夹具：裸 origin（含初始提交）+ 克隆 local，返回 "origindir|localdir"
wt_make_repo() {
  local base; base="$(make_fixture)"
  local origin="$base/origin.git"
  local ldir="$base/local"
  local seed; seed="$(make_fixture)"
  mkdir -p "$seed"
  ( cd "$seed" && "$GIT_BIN" init -q -b "$MAIN_BRANCH" \
    && "$GIT_BIN" config user.email s@s.s && "$GIT_BIN" config user.name s \
    && echo "init" > init.txt && "$GIT_BIN" add -A && "$GIT_BIN" commit -qm "init" ) || { echo "seed 失败" >&2; return 1; }
  "$GIT_BIN" init -q --bare -b "$MAIN_BRANCH" "$origin"
  "$GIT_BIN" -C "$seed" push -q "$origin" "$MAIN_BRANCH" || { echo "push origin 失败" >&2; return 1; }
  "$GIT_BIN" clone -q "$origin" "$ldir" >/dev/null 2>&1 || { echo "clone 失败" >&2; return 1; }
  init_fixture_repo "$ldir" >/dev/null 2>&1
  echo "$origin|$ldir"
}

# 开独立工作树并做一次功能提交（模拟阶段一 + 阶段二）。
# 入参: <主仓库目录> <分支名> <topic> <worktree-root>
# 输出: worktree 绝对路径
wt_prepare() {
  local ldir="$1" branch="$2" topic="$3" wtroot="$4"
  "$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic "$topic" --branch "$branch" --worktree-root "$wtroot" --confirm >/dev/null 2>&1
  local wt="$wtroot/$topic"
  echo "work" > "$wt/wt_file.txt"
  "$GIT_BIN" -C "$wt" add -A
  "$GIT_BIN" -C "$wt" commit -qm "work on $branch"
  echo "$wt"
}

# ---------- 阶段一：sop_worktree_add 契约 ----------

# 1) 默认 dry-run 不创建工作树
test_wt_add_dryrun_noop() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wtroot="$(wt_root)"
  local wt="$wtroot/topicA"
  local out; out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic topicA --branch feat/A --worktree-root "$wtroot" 2>&1)"
  if [ -e "$wt" ]; then fail "dry-run 不应创建工作树: $wt"; return 1; fi
  if assert_contains "[dry-run]" "$out"; then pass "add dry-run: 预览不落地、输出含 [dry-run]"; return 0; fi
  fail "add dry-run 输出异常: $out"; return 1
}

# 2) --confirm 真正创建工作树 + 分支
test_wt_add_success() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wtroot="$(wt_root)"
  local wt="$wtroot/topicB"
  local out; out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic topicB --branch feat/B --worktree-root "$wtroot" --confirm 2>&1)"
  if [ ! -e "$wt" ]; then fail "add --confirm 未创建工作树: $wt"; return 1; fi
  if ! "$GIT_BIN" -C "$ldir" show-ref --verify --quiet "refs/heads/feat/B" 2>/dev/null; then
    fail "add --confirm 未创建分支 feat/B"; return 1
  fi
  if assert_contains "已创建工作树" "$out"; then pass "add --confirm: 创建工作树 + 分支 feat/B"; return 0; fi
  fail "add --confirm 输出异常: $out"; return 1
}

# 3) 非 main 守卫：当前不在 main 应被拒绝
test_wt_add_non_main_guard() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  "$GIT_BIN" -C "$ldir" switch -q -c tmp_other
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --branch feat/X --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ] && assert_contains "非 [$MAIN_BRANCH]" "$out"; then
    pass "add 非 main 守卫: rc=$rc 拒绝并在 main 之外开工作树"; return 0
  fi
  fail "add 非 main 守卫异常 rc=$rc: $out"; return 1
}

# 4) 脏工作区硬停止
test_wt_add_dirty_stop() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  echo "dirty" > "$ldir/dirty.txt"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --branch feat/Y --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ] && assert_contains "不干净" "$out"; then
    pass "add 脏工作区硬停止: rc=$rc 拒绝"; return 0
  fi
  fail "add 脏工作区应被硬停止却未拦截 rc=$rc: $out"; return 1
}

# 5) 分支已存在错误
test_wt_add_branch_exists() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  "$GIT_BIN" -C "$ldir" branch feat/Z
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --branch feat/Z --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ] && assert_contains "已存在" "$out"; then
    pass "add 分支已存在守卫: rc=$rc 拒绝重复分支"; return 0
  fi
  fail "add 分支已存在应被拒绝 rc=$rc: $out"; return 1
}

# ---------- 阶段三：sop_worktree_merge 契约 ----------

# 6) dry-run 不改动主线（合并前/后 main HEAD 不变）
test_wt_merge_dryrun_noop() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  wt_prepare "$ldir" "feat/M" "topicM" "$(wt_root)" >/dev/null
  local before; before="$("$GIT_BIN" -C "$ldir" rev-parse HEAD)"
  local out; out="$("$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch feat/M 2>&1)"
  local after; after="$("$GIT_BIN" -C "$ldir" rev-parse HEAD)"
  if [ "$before" != "$after" ]; then fail "merge dry-run 不应改动 main HEAD"; return 1; fi
  if assert_contains "[dry-run]" "$out"; then pass "merge dry-run: 不改动 main、输出含 [dry-run]"; return 0; fi
  fail "merge dry-run 输出异常: $out"; return 1
}

# 7) --no-ff 合并生成双父合并碑（核心四约束之一）
test_wt_merge_no_ff_double_parent() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  wt_prepare "$ldir" "feat/M2" "topicM2" "$(wt_root)" >/dev/null
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch feat/M2 --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "merge --confirm 异常退出 rc=$rc: $out"; return 1; fi
  # 验证合并碑双父
  local parents; parents="$("$GIT_BIN" -C "$ldir" cat-file -p HEAD | grep -c '^parent')"
  if [ "$parents" != "2" ]; then fail "合并碑父节点数=$parents（期望 2）: $out"; return 1; fi
  # 验证分支保护门禁未阻断本地夹具（无保护直推路径）：输出不应提示改走 PR
  if assert_contains "双父" "$out" && ! printf '%s' "$out" | grep -q "须走 PR"; then
    pass "merge --no-ff: 双父(parents=2)、本地夹具走直推路径（未被分支保护门禁阻断）"; return 0
  fi
  fail "merge --no-ff 输出异常: $out"; return 1
}

# 8) 冲突预测暂停：merge-tree 预测冲突则列文件并 exit 0（绝不自动解）
test_wt_merge_conflict_pause() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  # 构造冲突：main 与 feat 都改同一文件同一行（相对共同祖先）
  echo "base" > "$ldir/conflict.txt"
  "$GIT_BIN" -C "$ldir" add -A
  "$GIT_BIN" -C "$ldir" commit -qm "base conflict.txt"
  local wt; wt="$(wt_prepare "$ldir" "feat/C" "topicC" "$(wt_root)")"
  echo "feat" > "$wt/conflict.txt"
  "$GIT_BIN" -C "$wt" add -A
  "$GIT_BIN" -C "$wt" commit -qm "feat change"
  echo "main" > "$ldir/conflict.txt"
  "$GIT_BIN" -C "$ldir" add -A
  "$GIT_BIN" -C "$ldir" commit -qm "main change"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch feat/C 2>&1)"; rc=$?
  # 冲突时脚本 exit 0（暂停而非失败），且打印冲突提示
  if [ "$rc" -eq 0 ] && assert_contains "冲突" "$out"; then
    pass "merge 冲突预测: exit 0 暂停、列出冲突(s)并打印「冲突」提示（不自动解）"; return 0
  fi
  fail "merge 冲突预测异常 rc=$rc: $out"; return 1
}

# 9) 无保护直推：本地夹具（origin 为本地路径，无法解析 GitHub 标识）→ 跳过保护核验、不阻断
test_wt_merge_no_protection_direct() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  wt_prepare "$ldir" "feat/P" "topicP" "$(wt_root)" >/dev/null
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch feat/P --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "无保护直推被异常阻断 rc=$rc: $out"; return 1; fi
  if ! printf '%s' "$out" | grep -q "须走 PR"; then
    pass "无保护直推: 本地夹具跳过分支保护核验，未触发 PR 流程门禁"; return 0
  fi
  fail "无保护夹具不应提示走 PR: $out"; return 1
}

# ---------- 阶段七：sop_worktree_cleanup 契约 ----------

# 10) 已合并清理：--confirm 移除工作树 + 删本地/远端分支，提交不丢
test_wt_cleanup_merged() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wt; wt="$(wt_prepare "$ldir" "feat/CL" "topicCL" "$(wt_root)")"
  "$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch feat/CL --confirm >/dev/null 2>&1
  local tip; tip="$("$GIT_BIN" -C "$ldir" rev-parse feat/CL)"
  # 不传 --worktree-path，验证自动探测 worktree
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch feat/CL --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "cleanup --confirm 异常 rc=$rc: $out"; return 1; fi
  if [ -e "$wt" ]; then fail "cleanup 未移除工作树: $wt"; return 1; fi
  if "$GIT_BIN" -C "$ldir" show-ref --verify --quiet "refs/heads/feat/CL" 2>/dev/null; then
    fail "cleanup 未删除本地分支 feat/CL"; return 1
  fi
  if ! "$GIT_BIN" -C "$ldir" merge-base --is-ancestor "$tip" HEAD 2>/dev/null; then
    fail "cleanup 后提交丢失：Tip 不再可达 main"; return 1
  fi
  if assert_contains "清理完成" "$out"; then pass "cleanup 已合并: 移除工作树+本地分支、提交保留、自动探测生效"; return 0; fi
  fail "cleanup 输出异常: $out"; return 1
}

# 11) 未合并拒绝：合并校验失败 → 硬停止，绝不清理未合并工作
test_wt_cleanup_unmerged_reject() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wt; wt="$(wt_prepare "$ldir" "feat/UN" "topicUN" "$(wt_root)")"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch feat/UN --confirm 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then fail "未合并分支不应被清理（应硬停止）"; return 1; fi
  if [ ! -e "$wt" ]; then fail "未合并应拒绝清理，但工作树已被删: $wt"; return 1; fi
  if assert_contains "合并校验失败" "$out"; then pass "cleanup 未合并拒绝: rc=$rc 硬停止、工作树保留"; return 0; fi
  fail "cleanup 未合并拒绝输出异常 rc=$rc: $out"; return 1
}

# 12) 远端删除 dry-run 不真删：列出 git push --delete 计划，但远端分支仍存在
test_wt_cleanup_remote_dryrun_noop() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wt; wt="$(wt_prepare "$ldir" "feat/RM" "topicRM" "$(wt_root)")"
  "$GIT_BIN" -C "$ldir" push -u "$ORIGIN_REMOTE" "feat/RM" >/dev/null 2>&1
  "$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch feat/RM --confirm >/dev/null 2>&1
  local out
  out="$("$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch feat/RM --worktree-path "$wt" 2>&1)"
  # dry-run 应列出远端删除计划
  if ! assert_contains "git push --delete" "$out"; then fail "dry-run 未列出远端删除计划: $out"; return 1; fi
  # 远端分支不应被真删
  if "$GIT_BIN" -C "$ldir" show-ref --verify --quiet "refs/remotes/$ORIGIN_REMOTE/feat/RM" 2>/dev/null; then
    pass "cleanup 远端 dry-run: 列出删除计划但未真删（远端分支仍在）"; return 0
  fi
  fail "cleanup 远端 dry-run 误删了远端分支"; return 1
}

# 13) 核心修复覆盖（L2）：worktree 根置于主仓库内部时，自动写入 .git/info/exclude，
#     使主仓库 git status 不把工作树父目录视为未跟踪（避免后续 merge/cleanup 的「干净守卫」误触发）。
#     同时验证 dry-run 不写 exclude（L1 修复）、主仓库保持干净、exclude 写入幂等。
test_wt_add_inner_exclude() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wtroot="$ldir/.worktrees"
  local topic="innerX"
  # dry-run 不应写 exclude
  "$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic "$topic" --branch feat/INNER --worktree-root "$wtroot" 2>&1
  if grep -qxF "/.worktrees/" "$ldir/.git/info/exclude" 2>/dev/null; then
    fail "dry-run 不应写入 exclude"; return 1
  fi
  # --confirm 写入并创建
  "$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic "$topic" --branch feat/INNER --worktree-root "$wtroot" --confirm 2>&1
  if ! grep -qxF "/.worktrees/" "$ldir/.git/info/exclude" 2>/dev/null; then
    fail "add --confirm 未写入 exclude"; return 1
  fi
  # 主仓库 git status 保持干净（exclude 生效）
  if [ -n "$("$GIT_BIN" -C "$ldir" status --porcelain)" ]; then
    fail "add 后主仓库未保持干净（exclude 未生效）"; return 1
  fi
  # 幂等：移除 worktree + 分支后再次 confirm，exclude 仍只有 1 行
  "$GIT_BIN" -C "$ldir" worktree remove --force "$wtroot/$topic" >/dev/null 2>&1 || true
  "$GIT_BIN" -C "$ldir" branch -D feat/INNER >/dev/null 2>&1 || true
  "$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic "$topic" --branch feat/INNER --worktree-root "$wtroot" --confirm >/dev/null 2>&1 || true
  local cnt; cnt="$(grep -cxF "/.worktrees/" "$ldir/.git/info/exclude" 2>/dev/null)"
  if [ "$cnt" -ne 1 ]; then fail "exclude 写入非幂等（出现 $cnt 行）"; return 1; fi
  # 清理残留（夹具将被统一回收，此处仅确保本用例不污染）
  "$GIT_BIN" -C "$ldir" worktree remove --force "$wtroot/$topic" >/dev/null 2>&1 || true
  "$GIT_BIN" -C "$ldir" branch -D feat/INNER >/dev/null 2>&1 || true
  sed -i '/^\/\.worktrees\/$/d' "$ldir/.git/info/exclude" 2>/dev/null || true
  pass "add 核心修复: 仓库内 worktree 根自动写 exclude、dry-run 不写、主仓库保持干净、写入幂等"
}

# 14) 远端删除 --confirm 真删（L2 延伸）：断言远端分支被真实删除（本地裸 origin，安全）
test_wt_cleanup_remote_confirm_delete() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wt; wt="$(wt_prepare "$ldir" "feat/RMC" "topicRMC" "$(wt_root)")"
  "$GIT_BIN" -C "$ldir" push -u "$ORIGIN_REMOTE" "feat/RMC" >/dev/null 2>&1
  "$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch feat/RMC --confirm >/dev/null 2>&1
  "$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch feat/RMC --worktree-path "$wt" --confirm >/dev/null 2>&1
  if "$GIT_BIN" -C "$ldir" show-ref --verify --quiet "refs/remotes/$ORIGIN_REMOTE/feat/RMC" 2>/dev/null; then
    fail "cleanup --confirm 未真删远端分支"; return 1
  fi
  pass "cleanup 远端 --confirm: 真实删除远端分支（本地裸 origin）"
}

# 15) 脏工作树默认拒绝移除（N1 修复）：无 --discard-uncommitted 时 --confirm 硬停止，不丢未提交改动
test_wt_cleanup_dirty_reject() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wt; wt="$(wt_prepare "$ldir" "feat/DIR" "topicDIR" "$(wt_root)")"
  echo "uncommitted" > "$wt/dirty_extra.txt"
  "$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch feat/DIR --confirm >/dev/null 2>&1
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch feat/DIR --worktree-path "$wt" --confirm 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then fail "脏工作树无 --discard-uncommitted 不应被清理"; return 1; fi
  if [ ! -e "$wt" ]; then fail "脏工作树应保留未移除（未提交改动未丢）"; return 1; fi
  if assert_contains "未提交改动" "$out"; then pass "cleanup 脏工作树默认拒绝移除(无 --discard-uncommitted)"; return 0; fi
  fail "脏工作树拒止输出异常 rc=$rc: $out"; return 1
}

# ---------- 注册 ----------
register_test "W7-add: 仓库内 worktree 根写 exclude(L2核心修复)" test_wt_add_inner_exclude
register_test "W7-cleanup: 远端 --confirm 真删" test_wt_cleanup_remote_confirm_delete
register_test "W7-cleanup: 脏工作树默认拒绝(N1)" test_wt_cleanup_dirty_reject
register_test "W7-add: dry-run 不创建工作树"   test_wt_add_dryrun_noop
register_test "W7-add: --confirm 创建工作树+分支" test_wt_add_success
register_test "W7-add: 非 main 守卫拒绝"       test_wt_add_non_main_guard
register_test "W7-add: 脏工作区硬停止"         test_wt_add_dirty_stop
register_test "W7-add: 分支已存在守卫"         test_wt_add_branch_exists
register_test "W7-merge: dry-run 不改主线"     test_wt_merge_dryrun_noop
register_test "W7-merge: --no-ff 双父合并碑"   test_wt_merge_no_ff_double_parent
register_test "W7-merge: 冲突预测暂停"         test_wt_merge_conflict_pause
register_test "W7-merge: 无保护直推路径"       test_wt_merge_no_protection_direct
register_test "W7-cleanup: 已合并清理+提交保留" test_wt_cleanup_merged
register_test "W7-cleanup: 未合并拒绝"         test_wt_cleanup_unmerged_reject
register_test "W7-cleanup: 远端 dry-run 不真删" test_wt_cleanup_remote_dryrun_noop
