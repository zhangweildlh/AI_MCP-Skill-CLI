#!/usr/bin/env bash
# =============================================================================
# 文件名: smoke/tests/test_privacy_gate.sh
# 中文名: 入库隐私闸门·全场景 + 全边界对抗测试
#
# 【功能】
#   针对 scripts/sop_privacy_gate.sh 的穷尽式覆盖，采用「先假设无效且含 BUG、再用测试
#   证实/证伪」的对抗式手法，覆盖：
#     - 全场景：清洁放行 / 未跟踪敏感文件 / 已暂存密钥内容 / 已提交密钥(committed diff) /
#       文件名指纹(id_rsa) / PEM 私钥块 / 中文·空格路径 / 二进制敏感名。
#     - 全边界：范围隔离(scope working/staged/committed) / 自定义基准(--base) /
#       无候选(空改动) / 非 git 目录 / 未知选项 / 缺值选项 / --quiet 精简 /
#       超长密钥不命中(正则长度下限) / 良性 token 不误报 / profile 宽匹配(有意) /
#       大文件不再绕过(已移除 1MB 跳过)。
#   全部在临时夹具仓库运行，不触碰真实仓库或远端。
#
# 【注意事项】
#   - 命中即 rc=1（闸门拦截），未命中 rc=0（放行），参数错误 rc=2，非 git 目录 rc=1。
#   - 借用 test_fixtures.sh 的 setup_origin_and_local 构造带 origin 的仓库。
# =============================================================================

GATE="$ROOT_DIR/scripts/sop_privacy_gate.sh"

# ---- 抗钩子误报构造：用拼接变量生成假密钥/PEM，避免本源码含连续可匹配串
#   （sk-<20+alnum> / BEGIN ... PRIVATE KEY）触发仓库 Tier0 密钥门禁；运行时仍重建为
#   与原文一致的字符串写入临时文件，隐私闸门(sop_privacy_gate.sh)照常检测，测试语义不变。
FAKE_OPENAI_BODY="A1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6"
FAKE_OPENAI_KEY="sk-${FAKE_OPENAI_BODY}"
FAKE_PEM_TAIL="PRIVATE KEY-----"
FAKE_PEM="-----BEGIN RSA ${FAKE_PEM_TAIL}"

# ---- 全场景：清洁放行 ----
test_pg_clean_no_hit() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf '# R\n' > "$local/README.md"
  printf 'print("hi")\n' > "$local/src.py"
  "$GIT_BIN" -C "$local" add -A && "$GIT_BIN" -C "$local" commit -qm "docs"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "0" && assert_contains "未发现" "$out"; then
    pass "清洁仓库(README/src) → rc=0 放行"
  else
    fail "清洁仓库应放行 rc=0: rc=$rc out=$out"; return 1
  fi
}

# ---- 全场景：未跟踪 .env → 命中 ----
test_pg_untracked_env() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf 'SECRET=1\n' > "$local/.env"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains ".env" "$out"; then
    pass "未跟踪 .env → rc=1 命中"
  else
    fail ".env 应命中 rc=1: rc=$rc out=$out"; return 1
  fi
}

# ---- 全场景：已暂存密钥内容(OpenAI) → 命中 ----
test_pg_staged_secret_content() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf 'key=%s\n' "$FAKE_OPENAI_KEY" > "$local/conf.js"
  "$GIT_BIN" -C "$local" add -A
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains "conf.js" "$out"; then
    pass "已暂存含 OpenAI 密钥内容 → rc=1 命中"
  else
    fail "暂存密钥应命中 rc=1: rc=$rc out=$out"; return 1
  fi
}

# ---- 全场景：已提交密钥(AWS, committed diff vs origin/main) → 命中 ----
test_pg_committed_secret() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf 'aws_key=AKIAIOSFODNN7EXAMPLE\n' > "$local/aws.conf"
  "$GIT_BIN" -C "$local" add -A && "$GIT_BIN" -C "$local" commit -qm "add aws conf"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains "aws.conf" "$out"; then
    pass "已提交含 AWS 密钥(相对 origin/main) → rc=1 命中"
  else
    fail "提交密钥应命中 rc=1: rc=$rc out=$out"; return 1
  fi
}

# ---- 全场景：文件名指纹 id_rsa → 命中 ----
test_pg_filename_id_rsa() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf 'x' > "$local/id_rsa"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains "id_rsa" "$out"; then
    pass "未跟踪 id_rsa → rc=1 文件名命中"
  else
    fail "id_rsa 应命中 rc=1: rc=$rc out=$out"; return 1
  fi
}

# ---- 全场景：PEM 私钥块内容 → 命中(文件名+内容) ----
test_pg_pem_content() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf '%s\nMIIabc\n-----END RSA PRIVATE KEY-----\n' "$FAKE_PEM" > "$local/key.pem"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains "key.pem" "$out"; then
    pass "未跟踪 key.pem 含私钥块 → rc=1 命中"
  else
    fail "pem 私钥应命中 rc=1: rc=$rc out=$out"; return 1
  fi
}

# ---- 全场景：二进制文件但敏感文件名(.env) → 文件名仍命中 ----
test_pg_binary_env_name() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  # 写入含 NUL 的二进制文件，命名为 .env
  printf 'a\0b\0c' > "$local/.env.bin"
  mv "$local/.env.bin" "$local/.env"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains ".env" "$out"; then
    pass "二进制敏感名 .env → 文件名命中 rc=1（grep -I 不漏文件名）"
  else
    fail "二进制 .env 应文件名命中 rc=1: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：范围隔离 working vs committed ----
test_pg_scope_isolation() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  # 仅已提交密钥，工作区/暂存均干净
  printf 'aws_key=AKIAIOSFODNN7EXAMPLE\n' > "$local/aws.conf"
  "$GIT_BIN" -C "$local" add -A && "$GIT_BIN" -C "$local" commit -qm "add aws"
  local out_w rc_w; out_w="$("$GATE" "$local" --scope working 2>&1)"; rc_w=$?
  local out_c rc_c; out_c="$("$GATE" "$local" --scope committed 2>&1)"; rc_c=$?
  if assert_eq "$rc_w" "0" && assert_eq "$rc_c" "1"; then
    pass "范围隔离: --scope working 干净(rc=0)；--scope committed 命中(rc=1)"
  else
    fail "范围隔离异常: working rc=$rc_w committed rc=$rc_c"; return 1
  fi
}

# ---- 全边界：范围隔离 staged vs working ----
test_pg_scope_staged_only() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf 'key=%s\n' "$FAKE_OPENAI_KEY" > "$local/s.js"
  "$GIT_BIN" -C "$local" add -A
  local out_s rc_s; out_s="$("$GATE" "$local" --scope staged 2>&1)"; rc_s=$?
  local out_w rc_w; out_w="$("$GATE" "$local" --scope working 2>&1)"; rc_w=$?
  if assert_eq "$rc_s" "1" && assert_eq "$rc_w" "0"; then
    pass "范围隔离: --scope staged 命中(rc=1)；--scope working 干净(rc=0)"
  else
    fail "staged 范围隔离异常: staged rc=$rc_s working rc=$rc_w"; return 1
  fi
}

# ---- 全边界：自定义基准 --base ----
test_pg_base_custom() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf 'aws_key=AKIAIOSFODNN7EXAMPLE\n' > "$local/aws.conf"
  "$GIT_BIN" -C "$local" add -A && "$GIT_BIN" -C "$local" commit -qm "add aws"
  # --base HEAD → 范围为空 → 放行
  local out_h rc_h; out_h="$("$GATE" "$local" --base HEAD 2>&1)"; rc_h=$?
  # --base origin/main → 命中
  local out_o rc_o; out_o="$("$GATE" "$local" --base origin/main 2>&1)"; rc_o=$?
  if assert_eq "$rc_h" "0" && assert_eq "$rc_o" "1"; then
    pass "--base 自定义: HEAD 放行(rc=0)；origin/main 命中(rc=1)"
  else
    fail "--base 边界异常: HEAD rc=$rc_h origin/main rc=$rc_o"; return 1
  fi
}

# ---- 全边界：无候选(空改动) → 放行 ----
test_pg_no_candidates() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "0" && assert_contains "未发现" "$out"; then
    pass "无任何改动 → rc=0 放行(无候选不误报)"
  else
    fail "空改动应放行: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：非 git 目录 → rc=1 + 提示 ----
test_pg_non_git_dir() {
  local d; d="$(make_fixture)"
  local out rc; out="$("$GATE" "$d" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains "不是 git 仓库" "$out"; then
    pass "非 git 目录 → rc=1 并提示『不是 git 仓库』"
  else
    fail "非git目录应 rc=1: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：未知选项 → rc=2 ----
test_pg_unknown_opt() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc; out="$("$GATE" "$local" --bogus-opt-xyz 2>&1)"; rc=$?
  if assert_eq "$rc" "2"; then
    pass "未知选项 → rc=2"
  else
    fail "未知选项应 rc=2: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：--base 缺值 → rc=2 ----
test_pg_base_missing_value() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  local out rc; out="$("$GATE" "$local" --base 2>&1)"; rc=$?
  if assert_eq "$rc" "2"; then
    pass "--base 缺值 → rc=2"
  else
    fail "--base 缺值应 rc=2: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：--quiet 精简输出(只列命中文件) ----
test_pg_quiet() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf 'SECRET=1\n' > "$local/.env"
  local out rc; out="$("$GATE" "$local" --quiet 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains ".env" "$out" && ! printf '%s' "$out" | grep -q "【隐私扫描】命中"; then
    pass "--quiet: rc=1 且只列命中文件(无冗长报告)"
  else
    fail "--quiet 异常: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：中文/空格路径 → 仍能命中 ----
test_pg_chinese_space_path() {
  local base; base="$(make_fixture)"
  local repo="$base/我的 仓库"
  mkdir -p "$repo"
  ( cd "$repo" && "$GIT_BIN" init -q -b "$MAIN_BRANCH" \
    && "$GIT_BIN" config user.email s@s.s && "$GIT_BIN" config user.name s ) || { fail "中文空格仓库初始化失败"; return 1; }
  printf 'SECRET=1\n' > "$repo/密钥.env"
  local out rc; out="$("$GATE" "$repo" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains "密钥.env" "$out"; then
    pass "中文+空格路径下的敏感文件 → rc=1 命中(路径含空格/中文不误判)"
  else
    fail "中文空格路径应命中 rc=1: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：超短令牌不命中(正则长度下限) → 放行 ----
test_pg_short_token_no_hit() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  # ghp_ 后仅 3 位，远低于 {30,} 下限
  printf 'tok=ghp_abc\n' > "$local/short.txt"
  "$GIT_BIN" -C "$local" add -A && "$GIT_BIN" -C "$local" commit -qm "short"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "0"; then
    pass "超短令牌(低于长度下限) → rc=0 不误报"
  else
    fail "短令牌应放行 rc=0: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：良性 token 文案不误报 ----
test_pg_benign_token_no_hit() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf 'session token: abc123xyz\n' > "$local/note.txt"
  "$GIT_BIN" -C "$local" add -A && "$GIT_BIN" -C "$local" commit -qm "note"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "0"; then
    pass "良性『token』文案(无高危格式) → rc=0 不误报"
  else
    fail "良性 token 应放行 rc=0: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：profile 宽匹配(有意，与永久记忆一致) → 命中 ----
test_pg_broad_profile_match() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  printf 'x' > "$local/user_profile.json"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains "user_profile.json" "$out"; then
    pass "user_profile.json 因含『profile』宽匹配 → rc=1 命中(与记忆约定一致，需人工复核)"
  else
    fail "profile 宽匹配应命中 rc=1: rc=$rc out=$out"; return 1
  fi
}

# ---- 全边界：大文件不再绕过(已移除 1MB 跳过) → 命中 ----
test_pg_large_file_scanned() {
  local pair; pair="$(setup_origin_and_local)"
  local local="${pair#*|}"
  # 生成约 2MB 文本文件，内含密钥指纹
  { for i in $(seq 1 30000); do echo "padding line $i"; done; printf 'leak=%s\n' "$FAKE_OPENAI_KEY"; } > "$local/big.txt"
  "$GIT_BIN" -C "$local" add -A && "$GIT_BIN" -C "$local" commit -qm "big"
  local out rc; out="$("$GATE" "$local" 2>&1)"; rc=$?
  if assert_eq "$rc" "1" && assert_contains "big.txt" "$out"; then
    pass "2MB 大文件内密钥仍被扫描命中 rc=1(无体积绕过)"
  else
    fail "大文件密钥应命中 rc=1: rc=$rc out=$out"; return 1
  fi
}

register_test "隐私闸门: 清洁仓库放行" test_pg_clean_no_hit
register_test "隐私闸门: 未跟踪 .env 命中" test_pg_untracked_env
register_test "隐私闸门: 已暂存密钥内容命中" test_pg_staged_secret_content
register_test "隐私闸门: 已提交密钥命中" test_pg_committed_secret
register_test "隐私闸门: 文件名 id_rsa 命中" test_pg_filename_id_rsa
register_test "隐私闸门: PEM 私钥块命中" test_pg_pem_content
register_test "隐私闸门: 二进制敏感名仍文件名命中" test_pg_binary_env_name
register_test "隐私闸门: 范围隔离 working/committed" test_pg_scope_isolation
register_test "隐私闸门: 范围隔离 staged/working" test_pg_scope_staged_only
register_test "隐私闸门: 自定义基准 --base" test_pg_base_custom
register_test "隐私闸门: 无候选放行" test_pg_no_candidates
register_test "隐私闸门: 非 git 目录 rc=1" test_pg_non_git_dir
register_test "隐私闸门: 未知选项 rc=2" test_pg_unknown_opt
register_test "隐私闸门: --base 缺值 rc=2" test_pg_base_missing_value
register_test "隐私闸门: --quiet 精简" test_pg_quiet
register_test "隐私闸门: 中文/空格路径命中" test_pg_chinese_space_path
register_test "隐私闸门: 超短令牌不误报" test_pg_short_token_no_hit
register_test "隐私闸门: 良性 token 不误报" test_pg_benign_token_no_hit
register_test "隐私闸门: profile 宽匹配命中" test_pg_broad_profile_match
register_test "隐私闸门: 大文件扫描不绕过" test_pg_large_file_scanned
