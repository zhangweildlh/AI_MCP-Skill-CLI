#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/tests/test_status_all.sh
# 中文名: sop_status_all.sh 批量巡检脚本冒烟测试
#
# 【功能】
#   针对 scripts/sop_status_all.sh 的行为契约，用临时 git 仓库模拟多 fork 场景，
#   共六条用例：
#     1. 总览正确性：落后/领先/脏/未推送 四类状态被正确汇总，非仓库目录被跳过，
#        .mimocode/.workbuddy 被排除；
#     2. --help：打印 HELP 标记块并以 0 退出；
#     3. REPO_ROOT 不存在：中文报错且退出码非 0；
#     4. --fetch（无 --confirm）：dry-run，仅打印将对各仓库执行的 git fetch，不真正抓取
#        （落后数保持陈旧值）；
#     5. --fetch --confirm：真正执行 git fetch，刷新后落后数被正确揭示；
#     6. 排除目录：.mimocode 与 .workbuddy 不被当作仓库扫描。
#
# 【用途 / 使用场景】
#   1. 修改 sop_status_all.sh 后的回归验证；
#   2. 验证 dry-run 优先纪律（默认不联网、--fetch 仅打印、--confirm 才执行）是否被遵守；
#   3. 对应需求：复用 sop-common.sh、中文输出、路径核验与目录排除。
#
# 【实现要点】
#   用例内的夹具构建复用 harness 的 make_fixture / init_fixture_repo；
#   bare 远端用本地裸仓库模拟（无真实网络依赖）。
#   被测脚本以子进程方式调用：bash "$ROOT_DIR/scripts/sop_status_all.sh" ...
#
#   依赖的外部变量（由 run-smoke.sh 与 harness.sh 预先准备）:
#     ROOT_DIR / GIT_BIN / MAIN_BRANCH / ORIGIN_REMOTE / UPSTREAM_REMOTE
#
# 【注意事项】
#   - 全部发生在临时夹具目录内，不改动任何真实仓库，无远端副作用。
#   - 每条用例在子 shell 中执行，夹具与 cwd 不污染其他用例。
# =============================================================================

SCRIPT="$ROOT_DIR/scripts/sop_status_all.sh"

# 创建「bare 远端 + 本地克隆」，返回 "origindir|localdir"
status_all_make_origin_clone() {
  local base="$1" name="$2"
  local origin="$base/${name}_origin.git"
  local local="$base/$name"
  "$GIT_BIN" init -q --bare -b "$MAIN_BRANCH" "$origin"
  local seed; seed="$(make_fixture)/seed"
  mkdir -p "$seed"
  ( cd "$seed" && "$GIT_BIN" init -q -b "$MAIN_BRANCH" \
    && "$GIT_BIN" config user.email s@s.s && "$GIT_BIN" config user.name s \
    && echo init > init.txt && "$GIT_BIN" add -A && "$GIT_BIN" commit -qm init )
  "$GIT_BIN" -C "$seed" push -q "$origin" "$MAIN_BRANCH"
  "$GIT_BIN" clone -q "$origin" "$local" >/dev/null 2>&1
  init_fixture_repo "$local" >/dev/null 2>&1
  echo "$origin|$local"
}

# 让 origin 比本地多一笔提交（用于制造「落后」态势）
status_all_push_to_origin() {
  local origin="$1"
  local tmp; tmp="$(make_fixture)/third"
  "$GIT_BIN" clone -q "$origin" "$tmp" >/dev/null 2>&1
  init_fixture_repo "$tmp" >/dev/null 2>&1
  echo "up" > "$tmp/up.txt"
  "$GIT_BIN" -C "$tmp" add -A
  "$GIT_BIN" -C "$tmp" commit -qm "upstream commit"
  "$GIT_BIN" -C "$tmp" push -q "$ORIGIN_REMOTE" "$MAIN_BRANCH"
}

# 构建「总览」场景夹具：repoA(落后1,已fetch可知) / repoB(领先1,未推送) / repoC(脏) / notarepo / .mimocode
status_all_build_summary_fixture() {
  local fx; fx="$(make_fixture)"
  # repoA: 落后 1（fetch 过，状态可知）
  local pair; pair="$(status_all_make_origin_clone "$fx" repoA)"
  local originA="${pair%|*}"; local repoA="${pair#*|}"
  status_all_push_to_origin "$originA"
  "$GIT_BIN" -C "$repoA" fetch -q "$ORIGIN_REMOTE"
  # repoB: 领先 1（本地有一笔未推送），工作区干净
  pair="$(status_all_make_origin_clone "$fx" repoB)"
  local repoB="${pair#*|}"
  echo "mine" > "$repoB/mine.txt"
  "$GIT_BIN" -C "$repoB" add -A
  "$GIT_BIN" -C "$repoB" commit -qm "local commit"
  # repoC: 脏工作区，同步态干净
  pair="$(status_all_make_origin_clone "$fx" repoC)"
  local repoC="${pair#*|}"
  echo "dirty" > "$repoC/dirty.txt"
  # 非仓库目录（应被跳过）
  mkdir -p "$fx/notarepo"
  # 排除目录（不应被扫描）
  mkdir -p "$fx/.mimocode" "$fx/.workbuddy"
  echo "$fx"
}

# 构建「抓取」场景夹具：repoD(origin 多一笔，但本地未 fetch → 默认态落后=0 陈旧)
status_all_build_fetch_fixture() {
  local fx; fx="$(make_fixture)"
  local pair; pair="$(status_all_make_origin_clone "$fx" repoD)"
  local originD="${pair%|*}"
  status_all_push_to_origin "$originD"
  # 刻意不 fetch repoD，使其 origin/main 引用陈旧（默认态落后=0）
  mkdir -p "$fx/notarepo"
  mkdir -p "$fx/.mimocode"
  echo "$fx"
}

test_status_all_summary() {
  local fx; fx="$(status_all_build_summary_fixture)"
  local out rc
  out="$(bash "$SCRIPT" --root "$fx" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "总览用例非零退出 rc=$rc out=$out"; return 1; fi
  local ok=1
  printf '%s' "$out" | grep -q "repoA  落后=1" || { echo "    缺少 repoA 落后=1"; ok=0; }
  printf '%s' "$out" | grep -q "repoB.*领先=1" || { echo "    缺少 repoB 领先=1"; ok=0; }
  printf '%s' "$out" | grep -q "repoB.*未推送=1笔" || { echo "    缺少 repoB 未推送=1笔"; ok=0; }
  printf '%s' "$out" | grep -q "repoC.*工作区=脏" || { echo "    缺少 repoC 工作区=脏"; ok=0; }
  printf '%s' "$out" | grep -q "跳过（非 git 仓库目录）：notarepo" || { echo "    未跳过 notarepo"; ok=0; }
  printf '%s' "$out" | grep -q "扫描仓库数=3" || { echo "    扫描仓库数不为3"; ok=0; }
  printf '%s' "$out" | grep -q "脏工作区=1" || { echo "    脏工作区计数错误"; ok=0; }
  printf '%s' "$out" | grep -q "有未推送=1" || { echo "    未推送计数错误"; ok=0; }
  printf '%s' "$out" | grep -q "落后>0=1" || { echo "    落后计数错误"; ok=0; }
  printf '%s' "$out" | grep -q "领先>0=1" || { echo "    领先计数错误"; ok=0; }
  # 排除目录不应以仓库形式出现
  if printf '%s' "$out" | grep -q "mimocode" || printf '%s' "$out" | grep -q "workbuddy"; then
    echo "    .mimocode/.workbuddy 不应被扫描"; ok=0
  fi
  if [ "$ok" -eq 1 ]; then pass "总览：落后/领先/脏/未推送汇总正确，跳过非仓库，排除 .mimocode/.workbuddy"; return 0; fi
  fail "总览输出: $out"; return 1
}

test_status_all_help() {
  local out rc
  out="$(bash "$SCRIPT" --help 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "脚本名: sop_status_all.sh"; then
    pass "--help 打印 HELP 标记块并以 0 退出"
    return 0
  fi
  fail "--help 行为异常 rc=$rc out=$out"; return 1
}

test_status_all_missing_root() {
  local fx; fx="$(make_fixture)"
  local missing="$fx/nope_dir_$$"
  local out rc
  out="$(bash "$SCRIPT" --root "$missing" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q "不存在"; then
    pass "REPO_ROOT 不存在时中文报错且退出码非0"
    return 0
  fi
  fail "缺失根目录未正确报错 rc=$rc out=$out"; return 1
}

test_status_all_fetch_dryrun() {
  local fx; fx="$(status_all_build_fetch_fixture)"
  local out rc
  out="$(bash "$SCRIPT" --root "$fx" --fetch 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "fetch dry-run 非零退出 rc=$rc out=$out"; return 1; fi
  local ok=1
  printf '%s' "$out" | grep -q "dry-run" || { echo "    缺少 dry-run 标记"; ok=0; }
  printf '%s' "$out" | grep -q "git fetch" || { echo "    缺少 git fetch 提示"; ok=0; }
  # 关键：dry-run 不应真正抓取，repoD 仍显示陈旧的 落后=0
  printf '%s' "$out" | grep -q "repoD  落后=0" || { echo "    dry-run 不应改变落后数(应仍 落后=0)"; ok=0; }
  if [ "$ok" -eq 1 ]; then pass "--fetch 默认 dry-run：仅打印将对各仓库执行的 git fetch，未真正抓取"; return 0; fi
  fail "fetch dry-run 输出: $out"; return 1
}

test_status_all_fetch_confirm() {
  local fx; fx="$(status_all_build_fetch_fixture)"
  local out rc
  out="$(bash "$SCRIPT" --root "$fx" --fetch --confirm 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "fetch confirm 非零退出 rc=$rc out=$out"; return 1; fi
  local ok=1
  printf '%s' "$out" | grep -q "正在对 repoD 执行 git fetch" || { echo "    缺少真正抓取的执行提示"; ok=0; }
  # 关键：--confirm 真正抓取后，repoD 的落后数被刷新为 1（origin 多一笔）
  printf '%s' "$out" | grep -q "repoD  落后=1" || { echo "    --confirm 抓取后未刷新落后数(应 落后=1)"; ok=0; }
  if [ "$ok" -eq 1 ]; then pass "--fetch --confirm 真正执行 git fetch，刷新后揭示 落后=1"; return 0; fi
  fail "fetch confirm 输出: $out"; return 1
}

test_status_all_exclude_dirs() {
  local fx; fx="$(status_all_build_summary_fixture)"
  local out rc
  out="$(bash "$SCRIPT" --root "$fx" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then fail "排除用例非零退出 rc=$rc out=$out"; return 1; fi
  if printf '%s' "$out" | grep -qE "\[[0-9]+\] \.mimocode" || printf '%s' "$out" | grep -qE "\[[0-9]+\] \.workbuddy"; then
    fail "排除目录被当作仓库扫描: $out"; return 1
  fi
  pass "排除目录 .mimocode/.workbuddy 未被当作仓库扫描"
  return 0
}

register_test "L2-status_all: 总览汇总正确(落后/领先/脏/未推送/跳过/排除)" test_status_all_summary
register_test "L2-status_all: --help 打印 HELP 块并以0退出" test_status_all_help
register_test "L2-status_all: REPO_ROOT 不存在中文报错且非0退出" test_status_all_missing_root
register_test "L2-status_all: --fetch 默认 dry-run 不真正抓取" test_status_all_fetch_dryrun
register_test "L2-status_all: --fetch --confirm 真正抓取并刷新" test_status_all_fetch_confirm
register_test "L2-status_all: 排除 .mimocode/.workbuddy 目录" test_status_all_exclude_dirs
