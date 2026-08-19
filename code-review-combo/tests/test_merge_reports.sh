#!/usr/bin/env bash
#
# test_merge_reports.sh — code-review-combo 回归测试（merge_reports 归一化/去重逻辑）
# ==========================================================================
# 自包含、确定性、零外部依赖（不调用 ocr / LLM）：
#   * 用 tests/fixtures/ 下的小型固定夹具跑 scripts/merge_reports；
#   * 断言跨源 confirmed/disputed、同源键碰撞保留、文件级 finding、new 发现
#     等关键不变量，防止 Stage3 合并逻辑回归。
# 退出码：0 = 全部断言通过；非 0 = 任一断言失败。
# ==========================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && (pwd -W 2>/dev/null || pwd))"
COMBO_DIR="$(cd "$SCRIPT_DIR/.." && (pwd -W 2>/dev/null || pwd))"
MERGE="$COMBO_DIR/scripts/merge_reports"
FIX="$SCRIPT_DIR/fixtures"
OUT="$FIX/_out.merged.json"

if [ ! -x "$MERGE" ] && [ ! -f "$MERGE" ]; then echo "ERROR: 找不到 merge_reports: $MERGE" >&2; exit 2; fi

echo "=============================================="
echo " code-review-combo 回归测试: merge_reports"
echo "=============================================="

# 运行合并
if ! bash "$MERGE" "$FIX/ocr_report.json" "$FIX/reviewspd_report.md" "$OUT"; then
  echo "RESULT: FAIL (merge_reports 执行异常)" >&2
  exit 1
fi

# 用 node 做断言（环境已有 node）
"$COMBO_DIR/scripts/select-provider" >/dev/null 2>&1 || true   # 仅确认 node 可用（select-provider 内即 node）
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then echo "ERROR: 无 node，无法断言" >&2; exit 2; fi

"$NODE_BIN" -e '
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const f = r.findings;
let fails = 0;
function check(name, cond) {
  if (cond) { console.log("  PASS: " + name); }
  else { console.log("  FAIL: " + name); fails++; }
}
const by = f.reduce((a,x)=>{a[x.verified_by]=(a[x.verified_by]||0)+1;return a;},{});
const cc = f.reduce((a,x)=>{a[x.cross_check]=(a[x.cross_check]||0)+1;return a;},{});

check("总 findings = 8 (实际 " + f.length + ")", f.length === 8);
check("verified_by.both = 2 (实际 " + (by.both||0) + ")", (by.both||0) === 2);
check("verified_by.ocr-only = 4 (实际 " + (by["ocr-only"]||0) + ")", (by["ocr-only"]||0) === 4);
check("verified_by.review-spd-only = 2 (实际 " + (by["review-spd-only"]||0) + ")", (by["review-spd-only"]||0) === 2);
check("cross_check.confirmed = 1 (实际 " + (cc.confirmed||0) + ")", (cc.confirmed||0) === 1);
check("cross_check.disputed = 1 (实际 " + (cc.disputed||0) + ")", (cc.disputed||0) === 1);
check("cross_check.new = 6 (实际 " + (cc.new||0) + ")", (cc.new||0) === 6);

// 同源键碰撞：d.sh:40:40:bug 应保留 2 条独立 ocr-only
const d = f.filter(x => x.path === "d.sh" && x.start_line === 40 && x.category === "bug");
check("同源碰撞 d.sh:40 保留 2 条 (实际 " + d.length + ")", d.length === 2 && d.every(x => x.verified_by === "ocr-only"));

// disputed 取较高 severity：c.sh:30 应为 critical
const c = f.find(x => x.path === "c.sh" && x.start_line === 30);
check("disputed c.sh:30 severity=critical (实际 " + (c && c.severity) + ")", c && c.severity === "critical");

// 文件级 finding（start_line=0）应双方各保留 1 条
const fl = f.filter(x => x.start_line === 0 && x.end_line === 0);
check("文件级 finding 共 2 条 (实际 " + fl.length + ")", fl.length === 2);

// 新增 review-spd-only：f.sh security + g.sh other
const nf = f.filter(x => x.verified_by === "review-spd-only");
check("review-spd-only 含 f.sh(security) 与 g.sh(other)",
  nf.some(x=>x.path==="f.sh"&&x.category==="security") && nf.some(x=>x.path==="g.sh"&&x.category==="other"));

console.log("");
if (fails === 0) { console.log("OVERALL: PASS"); process.exit(0); }
else { console.log("OVERALL: FAIL (" + fails + " 项断言失败)"); process.exit(1); }
' "$OUT"

rc=$?
# 清理合并产物（.json + 新增 .md）；不再生成 .txt
rm -f "$OUT" "${OUT%.json}.md"
exit $rc
