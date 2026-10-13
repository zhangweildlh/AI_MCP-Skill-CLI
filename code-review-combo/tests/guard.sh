#!/usr/bin/env bash
#
# guard.sh — code-review-combo 仓库一致性守卫（离线，无需 ocr / LLM Key）
# ==========================================================================
# 融合自上游 zhu1090093659/spec_driven_develop/scripts/validate.sh
#   （MIT License，Copyright (c) 2026 spec-driven-develop contributors，
#    blob ca48847ebcbceac3ddf9826572d7288000f817b3）
# 适配 code-review-combo 扁平布局，实现 4 项检查：
#   (a) 引用存在性  — .md 中 `./...` / 已知根相对路径须可解析（多基准：仓库根 + 引用文件目录向上级 + 各子技能根）
#   (c) 版本一致性  — SKILL.md frontmatter version 须与 README 引用版本一致
#   (d) JSON 合法性 — 仓库内全部 .json（排除 gitignored providers.json）须可解析
#   (e) Schema 一致性 — merge_reports 真实输出字段 须与 SKILL.md Schema 双向一致（2026-10-13 新增）
#   (f) py_compile  — 仓库内 .py（review-spd/scripts/review-context.py）语法编译（可选：无 python 则跳过）
# 退出码：0 = 全部检查通过；非 0 = 任一检查失败。
# 依赖：bash + node（(a)(c)(d)(e)）；python/uv（(f)，缺失则跳过而非失败）。
# ==========================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOTW="$(cd "$ROOT" && pwd -W 2>/dev/null || echo "$ROOT")"   # Windows 原生路径（供 python 使用）
cd "$ROOT"

FAILURES=0

run_check() {
  local id="$1"; shift
  local desc="$1"; shift
  if "$@"; then
    echo "[PASS] ($id) $desc"
  else
    echo "[FAIL] ($id) $desc"
    FAILURES=$((FAILURES + 1))
  fi
}

# ---------------------------------------------------------------------------
# (a) + (c) + (d) 统一由 node 完成（引用存在性 / 版本一致性 / JSON 合法性）
# ---------------------------------------------------------------------------
run_check a_c_d "reference-existence + version-parity + json-validity" node -e '
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
let fails = 0;

// ---- 收集仓库内文件（排除 .git / node_modules） ----
function walk(dir, pred, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, pred, out); }
    else if (pred(e.name)) { out.push(p); }
  }
}
const mdFiles = [], jsonFiles = [];
walk(ROOT, (n) => n.endsWith(".md"), mdFiles);
walk(ROOT, (n) => n.endsWith(".json"), jsonFiles);
const jsonChecked = jsonFiles.filter((f) => !f.endsWith(path.sep + "providers.json"));

// ---- (a) 引用存在性（多基准解析，对齐上游 validate.sh 的 rel_bases） ----
const SKIP = new Set(["<", ">", "{", "}", "*"]);
const KNOWN = ["local/", "scripts/", "review-spd/", "open-code-review-delegate/", "config/", "tests/"];
const SKILL_ROOTS = ["review-spd", "open-code-review-delegate"].map((s) => path.join(ROOT, s));
const bt = /`([^`\n]+)`/g;
const missing = [];
for (const f of mdFiles) {
  let text;
  try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
  const refDir = path.dirname(f);
  let m;
  while ((m = bt.exec(text))) {
    const c = m[1].trim();
    if (!c) continue;
    if ([...c].some((ch) => SKIP.has(ch))) continue;
    if (/\s/.test(c)) continue;
    if (c.startsWith("http")) continue;
    if (c.startsWith("../")) continue;            // 运行时相对路径，跳过
    if (c.startsWith("plugins/")) continue;       // 上游仓库路径（非 combo 内部），跳过
    if (c.startsWith("zhu1090093659/")) continue; // 上游仓库全路径（非 combo 内部），跳过
    let rel = null;
    if (c.startsWith("./")) rel = c.slice(2);
    else if (KNOWN.some((r) => c.startsWith(r))) rel = c;
    if (rel === null) continue;
    if (rel.includes("providers.json")) continue; // gitignored 真实配置，跳过
    // 多基准：仓库根 -> 引用文件目录向上级 -> 各子技能根
    const bases = [ROOT];
    let d = refDir;
    while (true) { bases.push(d); if (d === ROOT) break; d = path.dirname(d); }
    for (const sr of SKILL_ROOTS) bases.push(sr);
    const ok = bases.some((b) => fs.existsSync(path.join(b, rel)));
    if (!ok) missing.push(rel + "  (in " + path.relative(ROOT, f) + ")");
  }
}
if (missing.length) {
  for (const x of missing) console.log("  (a) broken reference: " + x);
  fails++;
} else {
  console.log("  (a) reference-existence: OK (" + mdFiles.length + " .md scanned)");
}

// ---- (c) 版本一致性：SKILL.md frontmatter version 须被 README 引用 ----
const skill = fs.readFileSync(path.join(ROOT, "SKILL.md"), "utf8");
const fm = skill.match(/^---\s*\n(.*?)\n---/s);
const block = fm ? fm[1] : "";
const vm = block.match(/^\s*version:\s*"?([^"\n]+)"?\s*$/m);
if (!vm) { console.log("  (c) SKILL.md frontmatter 缺少 version"); fails++; }
else {
  const ver = vm[1].trim();
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  if (readme.includes(ver) || readme.includes("v" + ver)) {
    console.log("  (c) version-parity: SKILL.md version=" + ver + " 被 README 引用 OK");
  } else {
    console.log("  (c) version-parity: README 未引用版本 " + ver);
    fails++;
  }
}

// ---- (d) JSON 合法性 ----
let bad = 0;
for (const f of jsonChecked) {
  try { JSON.parse(fs.readFileSync(f, "utf8")); }
  catch (e) { console.log("  (d) invalid JSON: " + path.relative(ROOT, f) + " -> " + e.message); bad++; }
}
if (bad === 0) console.log("  (d) json-validity: OK (" + jsonChecked.length + " .json)");
else fails += bad;

process.exit(fails === 0 ? 0 : 1);
'

# ---------------------------------------------------------------------------
# (e) Schema 一致性：merge_reports 真实输出 须与 SKILL.md Schema 双向一致（2026-10-13 新增）
# 背景（自审 finding #1）：SKILL.md 曾声明summary 顶层存在扁平 critical/high/medium/low 别名，
#     但实现从未回填、Schema 代码块也未列——三项证据全依赖人工实跑才暴露，(a)(c)(d) 均不覆盖
#     「字段级不一致」。本项据此补齐该盲区。
# 判据：实跑 merge_reports 读真实产出的键（实现产出集）↔ SKILL.md Schema 块声明的键（文档声明集），
#     要求**双向相等**——实现有而文档无 = 文档漏写；文档有而实现无 = 文档声称存在但实际不存在。
#     另校验 verified_by/cross_check/category/severity 的枚举取值一致。
# 依赖：node + bash；缺 node / merge_reports / fixtures 时判 SKIP（不因环境缺失而失败）。
# 比对逻辑独立成 tests/schema_parity.js：内联会让 JS 反引号与 bash -c '...' 嵌套冲突。
# ---------------------------------------------------------------------------
SCHEMA_JS="$SCRIPT_DIR/schema_parity.js"
run_check e "schema-parity (merge_reports 输出 ⊆ SKILL.md Schema 声明，双向)" bash -c '
set -uo pipefail
G_ROOT="'"$ROOT"'"
MERGE="$G_ROOT/scripts/merge_reports"
SCHEMA_JS="'"$SCHEMA_JS"'"
FIXTURE="$G_ROOT/tests/fixtures"

command -v node >/dev/null 2>&1 || { echo "  (e) SKIP - 未找到 node"; exit 0; }
[ -f "$MERGE" ] || { echo "  (e) SKIP - 未找到 scripts/merge_reports"; exit 0; }
[ -f "$SCHEMA_JS" ] || { echo "  (e) SKIP - 未找到 tests/schema_parity.js"; exit 0; }

IN=""
for f in ocr_report.json delegate_report.json reviewspd_report.md; do
  [ -f "$FIXTURE/$f" ] && IN="$IN $FIXTURE/$f"
done
[ -n "$IN" ] || { echo "  (e) SKIP - tests/fixtures 无可用输入样本"; exit 0; }

OUT_DIR="$(mktemp -d 2>/dev/null)" || { echo "  (e) SKIP - mktemp 失败"; exit 0; }
trap '"'"'rm -rf "$OUT_DIR"'"'"' EXIT

# 用 Windows 原生路径（merge_reports 内部以 pwd -W 取路径，POSIX 路径会落错位置）
OUT_DIR_W="$(cd "$OUT_DIR" && pwd -W 2>/dev/null || echo "$OUT_DIR")"
if ! ( cd "$G_ROOT" && bash "$MERGE" $IN "$OUT_DIR/probe.json" ) >/dev/null 2>&1; then
  echo "  (e) merge_reports 实跑失败，无法校验 Schema 一致性"; exit 1
fi
[ -s "$OUT_DIR/probe.json" ] || { echo "  (e) merge_reports 未产出 JSON"; exit 1; }

SKILL_W="$(cd "$G_ROOT" && pwd -W)/SKILL.md"
node "$SCHEMA_JS" "$SKILL_W" "$OUT_DIR_W/probe.json"
'

# ---------------------------------------------------------------------------
# (f) py_compile（可选；用 Windows 原生路径避免 python 不识 POSIX 路径）
# ---------------------------------------------------------------------------
PYBIN=""
if command -v uv >/dev/null 2>&1; then PYBIN="uv run python";
elif command -v python3 >/dev/null 2>&1; then PYBIN="python3";
elif command -v python >/dev/null 2>&1; then PYBIN="python"; fi

if [ -z "$PYBIN" ]; then
  echo "[SKIP] (f) py_compile — 未找到 python/uv，跳过（非失败）"
else
  py_files=$(find "$ROOTW" -name "*.py" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null)
  if [ -z "$py_files" ]; then
    echo "[PASS] (f) py_compile — 无可编译 .py"
  else
    if $PYBIN -m py_compile $py_files 2>/tmp/guard_py.err; then
      # py_compile 会在各 .py 同级写入 __pycache__/*.pyc。这是校验的临时副产物，须即时清理：
      # 不清理会随技能副本一起进入交付目录（实测部署态残留 2 个 .pyc），污染部署产物。
      find "$ROOTW" -type d -name "__pycache__" -not -path "*/.git/*" -exec rm -rf {} + 2>/dev/null || true
      echo "[PASS] (f) py_compile — $(echo "$py_files" | wc -l | tr -d ' ') .py OK"
    else
      echo "[FAIL] (f) py_compile — 见 /tmp/guard_py.err"
      cat /tmp/guard_py.err >&2
      FAILURES=$((FAILURES + 1))
    fi
  fi
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "guard.sh: $FAILURES check(s) FAILED" >&2
  exit 1
fi
echo "guard.sh: all checks passed"
exit 0
