#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/tests/test_worktree.sh
# 中文名: 工作流五专属测试（多工作树并行·开树/合并/回收）
#
# 【功能】
#   工作流五「多工作树并行开发 + 普通合并 + 清理」的专属用例集，覆盖三个脚本共 15 条用例：
#     sop_worktree_add（开工作树，6 条）:
#       预览模式不创建、确认后成功创建工作树与分支、非主线守卫拒绝、
#       主仓库脏工作区硬停、分支已存在守卫、工作树根位于仓库内时写入本地忽略清单。
#     sop_worktree_merge（普通合并，4 条）:
#       预览模式不改主线、确认后生成双父合并碑、冲突预测命中即暂停、无分支保护时走直推路径。
#     sop_worktree_cleanup（回收，5 条）:
#       已合并分支正常回收且提交完整保留、未合并一律拒绝、
#       远端分支预览模式不真删、确认后真删、工作树含未提交改动时默认拒绝。
#
# 【新命名约定（方案 Y，对齐 AGENTS.md §4.1 与 sop_worktree_add.sh）】
#   sop_worktree_add.sh 现按「时间戳一致性」命名：
#     - 传 --scope <name> 时：目录名 = <scope>-<topic>-<TS>，分支名 = feat/<目录名>（对齐 AGENTS.md <name>-<topic>-<TS>）；
#     - 未传 --scope 时（兼容无 scope 概念的通用仓库）：目录名 = <topic>-<TS>，分支名 = feat/<目录名>；
#     - 两种模式均共享同一无分隔符秒级 TS，且保证「目录名 + feat/ 前缀 = 分支名」；
#     - 默认工作树根由仓库内 .worktrees 改为 worktrees/（与仓库级 .gitignore 一致）；
#     - 仓库内工作树根自动写入 .git/info/exclude 的条目为 /worktrees/。
#   因此本文件所有「分支名 / 工作树路径 / exclude 条目」断言均基于上述实现：
#   实际分支名与目录名由脚本输出解析（脚本打印「工作树路径: …」「功能分支: …」），
#   绝不按旧命名（feat/A、$wtroot/topicA、/.worktrees/）硬编码。
#
# 【用途 / 使用场景】
#   1. 改动三个工作树脚本中任意一个后的定向回归。
#   2. 验证并行开发工作流的端到端链路：开树 → 开发 → 合并 → 回收。
#   3. 确认安全门禁：预览与确认双模式、未合并不清理、脏工作树不强删。
#
# 【详细用法】
#   本文件不单独执行，由 smoke/run-smoke.sh 自动 source 并注册用例。
#   运行冒烟测试后，查看输出中前缀为「W5-」的记录即可。
#
#   本文件自带夹具函数:
#     wt_make_repo   创建稳健的测试仓库（裸远端先接收初始提交再克隆）
#     wt_prepare     开工作树+提交一次功能提交，回显 "工作树路径 实际分支名"
#
#   依赖的外部变量:
#     TEST_TMP / ROOT_DIR / GIT_BIN / MAIN_BRANCH / ORIGIN_REMOTE
#
# 【注意事项】
#   - 全部用例在临时夹具仓库上运行，远端为本地裸仓库，无网络与鉴权依赖。
#   - 本文件刻意不复用 test_fixtures.sh 的夹具，原因见下方设计要点第一条。
#
# 【设计要点】
# - 自带稳健夹具 wt_make_repo（裸 origin 先接收 seed 初始提交再克隆，避免 Windows 下 clone 空仓库
#   报 "failed to iterate over objects" 的已知坑），不依赖 test_fixtures.sh 的 setup_origin_and_local。
# - 所有写操作脚本默认 dry-run（预览不落地），加 --confirm 才真正执行 → 测试分别断言两种模式。
# - 合并/清理均在主仓库目录执行（绝不在 worktree 内），符合 SKILL.md 阶段三/五/六硬约束。
# - 本地夹具的 origin 是本地路径（非 github.com），merge 脚本据此跳过分支保护核验、走直推路径，
#   正好覆盖「无保护直推」契约，无需真实 GitHub 鉴权与网络。
# - 工作树根一律放在主仓库之外的兄弟临时目录（wt_root），确保主仓库 git status 保持干净，
#   不会误触发 merge/cleanup 的「主仓库须干净」守卫（worktree 建在仓库内会被视为未跟踪目录）。
# - 由于脚本按秒级 TS 命名且 TS 由脚本内部生成，凡需引用实际分支名/目录名的用例，
#   一律从脚本输出「工作树路径: / 功能分支: 」两行解析，保证断言与实现一致。

# ---------- 内部辅助 ----------

# 工作树根：返回主仓库之外的一个全新临时目录（make_fixture 本身就在 TEST_TMP 下独立随机目录），
# 保证其不在 $ldir 内部，主仓库 git status 不会因 worktree 父目录而变脏。
wt_root() { make_fixture; }

# 从 sop_worktree_add.sh 输出中解析实际生成的工作树路径（脚本打印「工作树路径: <path>」）
_wt_parse_path() {
  printf '%s\n' "$1" | sed -n 's/^工作树路径: //p' | head -n1
}

# 从 sop_worktree_add.sh 输出中解析实际生成的分支名（脚本打印「功能分支: <branch> （基于 …）」）
_wt_parse_branch() {
  printf '%s\n' "$1" | sed -n 's/^功能分支: //p' | sed 's/ （基于.*$//' | head -n1
}

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
# 入参: <主仓库目录> <topic> <worktree-root>
# 输出: "worktree绝对路径 实际分支名"（空格分隔；实际命名由脚本按 <topic>-<TS> 生成，解析自输出）
wt_prepare() {
  local ldir="$1" topic="$2" wtroot="$3"
  local out wt branch_actual
  out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic "$topic" --branch "feat/$topic" --worktree-root "$wtroot" --confirm 2>&1)"
  wt="$(_wt_parse_path "$out")"
  branch_actual="$(_wt_parse_branch "$out")"
  if [ -z "$wt" ] || [ -z "$branch_actual" ]; then
    echo "wt_prepare 无法解析脚本输出: $out" >&2
    return 1
  fi
  echo "work" > "$wt/wt_file.txt"
  "$GIT_BIN" -C "$wt" add -A
  "$GIT_BIN" -C "$wt" commit -qm "work on $branch_actual"
  echo "$wt $branch_actual"
}

# ---------- 阶段一：sop_worktree_add 契约 ----------

# 1) 默认 dry-run 不创建工作树
test_wt_add_dryrun_noop() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wtroot="$(wt_root)"
  local out; out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic topicA --branch feat/A --worktree-root "$wtroot" 2>&1)"
  # 新命名：目录名 = topicA-<TS>；dry-run 不应创建任何 topicA-* 目录
  if [ -n "$(find "$wtroot" -maxdepth 1 -name 'topicA-*' 2>/dev/null)" ]; then
    fail "dry-run 不应创建工作树（$wtroot 下出现 topicA-*）"; return 1
  fi
  if assert_contains "[dry-run]" "$out"; then pass "add dry-run: 预览不落地、输出含 [dry-run]"; return 0; fi
  fail "add dry-run 输出异常: $out"; return 1
}

# 2) --confirm 真正创建工作树 + 分支（并校验时间戳一致性命名：分支 = feat/<topic>-<14位TS>）
test_wt_add_success() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wtroot="$(wt_root)"
  local out; out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic topicB --branch feat/B --worktree-root "$wtroot" --confirm 2>&1)"
  local wt; wt="$(_wt_parse_path "$out")"
  local branch; branch="$(_wt_parse_branch "$out")"
  if [ -z "$wt" ] || [ ! -e "$wt" ]; then fail "add --confirm 未创建工作树: $wt"; return 1; fi
  if ! "$GIT_BIN" -C "$ldir" show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
    fail "add --confirm 未创建分支 $branch"; return 1
  fi
  # 新命名断言：分支 = feat/topicB-<14位无分隔符TS>，目录名 = 分支名去 feat/ 前缀（同一 TS）
  if [[ "$branch" != feat/topicB-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9] ]]; then
    fail "add 分支名不符合 <topic>-<TS> 新命名: $branch"; return 1
  fi
  if [ "$wt" != "$wtroot/${branch#feat/}" ]; then
    fail "工作树路径与分支名不一致（目录名应等于分支名去 feat/ 前缀）: wt=$wt branch=$branch"; return 1
  fi
  if assert_contains "已创建工作树" "$out"; then pass "add --confirm: 创建工作树 + 分支 $branch（时间戳一致）"; return 0; fi
  fail "add --confirm 输出异常: $out"; return 1
}

# 2.5) --scope 路径（对齐 AGENTS.md §4.1 <name>-<topic>-<TS>）：分支 = feat/<scope>-<topic>-<TS>，
#      目录 = $wtroot/<scope>-<topic>-<TS>，且「目录名 + feat/ 前缀 = 分支名」
test_wt_add_scope_naming() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wtroot="$(wt_root)"
  local out; out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --scope web-search --topic sync-work --branch feat/sync-work --worktree-root "$wtroot" --confirm 2>&1)"
  local wt; wt="$(_wt_parse_path "$out")"
  local branch; branch="$(_wt_parse_branch "$out")"
  if [ -z "$wt" ] || [ ! -e "$wt" ]; then fail "add --scope 未创建工作树: $wt"; return 1; fi
  # 分支 = feat/web-search-sync-work-<14位无分隔符TS>
  if [[ "$branch" != feat/web-search-sync-work-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9] ]]; then
    fail "add --scope 分支名不符合 <scope>-<topic>-<TS> 命名: $branch"; return 1
  fi
  # 目录 = $wtroot/<scope>-<topic>-<同一TS>，且 目录名 + feat/ 前缀 = 分支名
  if [ "$wt" != "$wtroot/${branch#feat/}" ]; then
    fail "add --scope 工作树路径与分支名不一致: wt=$wt branch=$branch"; return 1
  fi
  if ! "$GIT_BIN" -C "$ldir" show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
    fail "add --scope 未创建分支 $branch"; return 1
  fi
  pass "add --scope: 分支 $branch（目录名 + feat/ 前缀 = 分支名）"; return 0
}

# 2.6) --scope 非法值 → rc=2
test_wt_add_scope_invalid() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --scope Bad_Name --branch feat/X --confirm 2>&1)"; rc=$?
  if [ "$rc" -eq 2 ] && assert_contains "仅允许小写字母" "$out"; then
    pass "add --scope 非法值: rc=2 拒绝"; return 0
  fi
  fail "add --scope 非法值应 rc=2: rc=$rc out=$out"; return 1
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

# 5) 分支已存在错误（新命名含秒级 TS：用 update-ref 快速预建 base-1..base+10 秒窗口的
#    feat/Z-<TS> 分支 ref，覆盖 add 内部生成 TS 与测试之间的启动延迟，秒级确定性；
#    极端慢速时重试一次刷新窗口）
test_wt_add_branch_exists() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local out rc ts t i b2
  rc=0
  for attempt in 1 2; do
    ts="$(date +%Y%m%d%H%M%S)"
    for i in -1 0 1 2 3 4 5 6 7 8 9 10; do
      if [ "$i" -eq 0 ]; then t="$ts"; else t="$(date -d "$i seconds" +%Y%m%d%H%M%S)"; fi
      "$GIT_BIN" -C "$ldir" update-ref "refs/heads/feat/Z-$t" HEAD 2>/dev/null
    done
    out="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --branch feat/Z --confirm 2>&1)"; rc=$?
    [ "$rc" -eq 1 ] && break
    # 未命中（add 意外成功）：回收本次产物后重试（重试以新当前秒重建窗口）
    b2="$(_wt_parse_branch "$out")"
    [ -n "$b2" ] && { "$GIT_BIN" -C "$ldir" worktree remove --force "$ldir/worktrees/${b2#feat/}" >/dev/null 2>&1; "$GIT_BIN" -C "$ldir" branch -D "$b2" >/dev/null 2>&1; }
  done
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
  local pair_data; pair_data="$(wt_prepare "$ldir" "topicM" "$(wt_root)")"
  local branch; branch="${pair_data#* }"
  local before; before="$("$GIT_BIN" -C "$ldir" rev-parse HEAD)"
  local out; out="$("$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch "$branch" 2>&1)"
  local after; after="$("$GIT_BIN" -C "$ldir" rev-parse HEAD)"
  if [ "$before" != "$after" ]; then fail "merge dry-run 不应改动 main HEAD"; return 1; fi
  if assert_contains "[dry-run]" "$out"; then pass "merge dry-run: 不改动 main、输出含 [dry-run]"; return 0; fi
  fail "merge dry-run 输出异常: $out"; return 1
}

# 7) --no-ff 合并生成双父合并碑（核心四约束之一）
test_wt_merge_no_ff_double_parent() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local pair_data; pair_data="$(wt_prepare "$ldir" "topicM2" "$(wt_root)")"
  local branch; branch="${pair_data#* }"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch "$branch" --confirm 2>&1)"; rc=$?
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
  local pair_data; pair_data="$(wt_prepare "$ldir" "topicC" "$(wt_root)")"
  local wt="${pair_data%% *}" branch="${pair_data#* }"
  echo "feat" > "$wt/conflict.txt"
  "$GIT_BIN" -C "$wt" add -A
  "$GIT_BIN" -C "$wt" commit -qm "feat change"
  echo "main" > "$ldir/conflict.txt"
  "$GIT_BIN" -C "$ldir" add -A
  "$GIT_BIN" -C "$ldir" commit -qm "main change"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch "$branch" 2>&1)"; rc=$?
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
  local pair_data; pair_data="$(wt_prepare "$ldir" "topicP" "$(wt_root)")"
  local branch; branch="${pair_data#* }"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch "$branch" --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "无保护直推被异常阻断 rc=$rc: $out"; return 1; fi
  if ! printf '%s' "$out" | grep -q "须走 PR"; then
    pass "无保护直推: 本地夹具跳过分支保护核验，未触发 PR 流程门禁"; return 0
  fi
  fail "无保护夹具不应提示走 PR: $out"; return 1
}

# ---------- 阶段五/六：sop_worktree_cleanup 契约 ----------

# 10) 已合并清理：--confirm 移除工作树 + 删本地/远端分支，提交不丢
test_wt_cleanup_merged() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local pair_data; pair_data="$(wt_prepare "$ldir" "topicCL" "$(wt_root)")"
  local wt="${pair_data%% *}" branch="${pair_data#* }"
  "$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch "$branch" --confirm >/dev/null 2>&1
  local tip; tip="$("$GIT_BIN" -C "$ldir" rev-parse "$branch")"
  # 不传 --worktree-path，验证自动探测 worktree
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch "$branch" --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "cleanup --confirm 异常 rc=$rc: $out"; return 1; fi
  if [ -e "$wt" ]; then fail "cleanup 未移除工作树: $wt"; return 1; fi
  if "$GIT_BIN" -C "$ldir" show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
    fail "cleanup 未删除本地分支 $branch"; return 1
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
  local pair_data; pair_data="$(wt_prepare "$ldir" "topicUN" "$(wt_root)")"
  local wt="${pair_data%% *}" branch="${pair_data#* }"
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch "$branch" --confirm 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then fail "未合并分支不应被清理（应硬停止）"; return 1; fi
  if [ ! -e "$wt" ]; then fail "未合并应拒绝清理，但工作树已被删: $wt"; return 1; fi
  if assert_contains "合并校验失败" "$out"; then pass "cleanup 未合并拒绝: rc=$rc 硬停止、工作树保留"; return 0; fi
  fail "cleanup 未合并拒绝输出异常 rc=$rc: $out"; return 1
}

# 12) 远端删除 dry-run 不真删：列出 git push --delete 计划，但远端分支仍存在
test_wt_cleanup_remote_dryrun_noop() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local pair_data; pair_data="$(wt_prepare "$ldir" "topicRM" "$(wt_root)")"
  local wt="${pair_data%% *}" branch="${pair_data#* }"
  "$GIT_BIN" -C "$ldir" push -u "$ORIGIN_REMOTE" "$branch" >/dev/null 2>&1
  "$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch "$branch" --confirm >/dev/null 2>&1
  local out
  out="$("$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch "$branch" --worktree-path "$wt" 2>&1)"
  # dry-run 应列出远端删除计划
  if ! assert_contains "git push --delete" "$out"; then fail "dry-run 未列出远端删除计划: $out"; return 1; fi
  # 远端分支不应被真删
  if "$GIT_BIN" -C "$ldir" show-ref --verify --quiet "refs/remotes/$ORIGIN_REMOTE/$branch" 2>/dev/null; then
    pass "cleanup 远端 dry-run: 列出删除计划但未真删（远端分支仍在）"; return 0
  fi
  fail "cleanup 远端 dry-run 误删了远端分支"; return 1
}

# 13) 核心修复覆盖（L2）：worktree 根置于主仓库内部时，自动写入 .git/info/exclude，
#     使主仓库 git status 不把工作树父目录视为未跟踪（避免后续 merge/cleanup 的「干净守卫」误触发）。
#     同时验证 dry-run 不写 exclude（L1 修复）、主仓库保持干净、exclude 写入幂等。
#     注意：仓库内工作树根现为 worktrees/（方案 Y 新默认），exclude 条目为 /worktrees/。
test_wt_add_inner_exclude() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local wtroot="$ldir/worktrees"
  local topic="innerX"
  # dry-run 不应写 exclude
  "$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic "$topic" --branch feat/INNER --worktree-root "$wtroot" 2>&1
  if grep -qxF "/worktrees/" "$ldir/.git/info/exclude" 2>/dev/null; then
    fail "dry-run 不应写入 exclude"; return 1
  fi
  # --confirm 写入并创建（解析实际生成的工作树路径与分支名）
  local out2 wt branch_actual
  out2="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic "$topic" --branch feat/INNER --worktree-root "$wtroot" --confirm 2>&1)"
  wt="$(_wt_parse_path "$out2")"
  branch_actual="$(_wt_parse_branch "$out2")"
  if ! grep -qxF "/worktrees/" "$ldir/.git/info/exclude" 2>/dev/null; then
    fail "add --confirm 未写入 exclude"; return 1
  fi
  # 主仓库 git status 保持干净（exclude 生效）
  if [ -n "$("$GIT_BIN" -C "$ldir" status --porcelain)" ]; then
    fail "add 后主仓库未保持干净（exclude 未生效）"; return 1
  fi
  # 幂等：移除 worktree + 分支后再次 confirm，exclude 仍只有 1 行
  "$GIT_BIN" -C "$ldir" worktree remove --force "$wt" >/dev/null 2>&1 || true
  "$GIT_BIN" -C "$ldir" branch -D "$branch_actual" >/dev/null 2>&1 || true
  local out3 wt2 branch2 cnt
  out3="$("$ROOT_DIR/scripts/sop_worktree_add.sh" "$ldir" --topic "$topic" --branch feat/INNER --worktree-root "$wtroot" --confirm 2>&1)"
  cnt="$(grep -cxF "/worktrees/" "$ldir/.git/info/exclude" 2>/dev/null)"
  if [ "$cnt" -ne 1 ]; then fail "exclude 写入非幂等（出现 $cnt 行）"; return 1; fi
  # 清理残留（夹具将被统一回收，此处仅确保本用例不污染）
  wt2="$(_wt_parse_path "$out3")"
  branch2="$(_wt_parse_branch "$out3")"
  "$GIT_BIN" -C "$ldir" worktree remove --force "$wt2" >/dev/null 2>&1 || true
  "$GIT_BIN" -C "$ldir" branch -D "$branch2" >/dev/null 2>&1 || true
  sed -i '/^\/worktrees\/$/d' "$ldir/.git/info/exclude" 2>/dev/null || true
  pass "add 核心修复: 仓库内 worktree 根自动写 exclude、dry-run 不写、主仓库保持干净、写入幂等"
}

# 14) 远端删除 --confirm 真删（L2 延伸）：断言远端分支被真实删除（本地裸 origin，安全）
test_wt_cleanup_remote_confirm_delete() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local pair_data; pair_data="$(wt_prepare "$ldir" "topicRMC" "$(wt_root)")"
  local wt="${pair_data%% *}" branch="${pair_data#* }"
  "$GIT_BIN" -C "$ldir" push -u "$ORIGIN_REMOTE" "$branch" >/dev/null 2>&1
  "$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch "$branch" --confirm >/dev/null 2>&1
  "$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch "$branch" --worktree-path "$wt" --confirm >/dev/null 2>&1
  if "$GIT_BIN" -C "$ldir" show-ref --verify --quiet "refs/remotes/$ORIGIN_REMOTE/$branch" 2>/dev/null; then
    fail "cleanup --confirm 未真删远端分支"; return 1
  fi
  pass "cleanup 远端 --confirm: 真实删除远端分支（本地裸 origin）"
}

# 15) 脏工作树默认拒绝移除（N1 修复）：无 --discard-uncommitted 时 --confirm 硬停止，不丢未提交改动
test_wt_cleanup_dirty_reject() {
  local pair; pair="$(wt_make_repo)"
  local ldir="${pair#*|}"
  local pair_data; pair_data="$(wt_prepare "$ldir" "topicDIR" "$(wt_root)")"
  local wt="${pair_data%% *}" branch="${pair_data#* }"
  echo "uncommitted" > "$wt/dirty_extra.txt"
  "$ROOT_DIR/scripts/sop_worktree_merge.sh" "$ldir" --branch "$branch" --confirm >/dev/null 2>&1
  local out rc
  out="$("$ROOT_DIR/scripts/sop_worktree_cleanup.sh" "$ldir" --branch "$branch" --worktree-path "$wt" --confirm 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then fail "脏工作树无 --discard-uncommitted 不应被清理"; return 1; fi
  if [ ! -e "$wt" ]; then fail "脏工作树应保留未移除（未提交改动未丢）"; return 1; fi
  if assert_contains "未提交改动" "$out"; then pass "cleanup 脏工作树默认拒绝移除(无 --discard-uncommitted)"; return 0; fi
  fail "脏工作树拒止输出异常 rc=$rc: $out"; return 1
}

# ---------- 注册 ----------
register_test "W5-add: 仓库内 worktree 根写 exclude(L2核心修复)" test_wt_add_inner_exclude
register_test "W5-cleanup: 远端 --confirm 真删" test_wt_cleanup_remote_confirm_delete
register_test "W5-cleanup: 脏工作树默认拒绝(N1)" test_wt_cleanup_dirty_reject
register_test "W5-add: dry-run 不创建工作树"   test_wt_add_dryrun_noop
register_test "W5-add: --confirm 创建工作树+分支" test_wt_add_success
register_test "W5-add: --scope 命名对齐(name-topic-TS)" test_wt_add_scope_naming
register_test "W5-add: --scope 非法值 rc=2"     test_wt_add_scope_invalid
register_test "W5-add: 非 main 守卫拒绝"       test_wt_add_non_main_guard
register_test "W5-add: 脏工作区硬停止"         test_wt_add_dirty_stop
register_test "W5-add: 分支已存在守卫"         test_wt_add_branch_exists
register_test "W5-merge: dry-run 不改主线"     test_wt_merge_dryrun_noop
register_test "W5-merge: --no-ff 双父合并碑"   test_wt_merge_no_ff_double_parent
register_test "W5-merge: 冲突预测暂停"         test_wt_merge_conflict_pause
register_test "W5-merge: 无保护直推路径"       test_wt_merge_no_protection_direct
register_test "W5-cleanup: 已合并清理+提交保留" test_wt_cleanup_merged
register_test "W5-cleanup: 未合并拒绝"         test_wt_cleanup_unmerged_reject
register_test "W5-cleanup: 远端 dry-run 不真删" test_wt_cleanup_remote_dryrun_noop
