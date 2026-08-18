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
#   (f) py_compile  — 仓库内 .py（review-spd/scripts/review-context.py）语法编译（可选：无 python 则跳过）
# 退出码：0 = 全部检查通过；非 0 = 任一检查失败。
# 依赖：bash + node（(a)(c)(d)）；python/uv（(f)，缺失则跳过而非失败）。
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
