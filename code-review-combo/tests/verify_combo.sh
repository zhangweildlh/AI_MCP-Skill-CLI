#!/usr/bin/env bash
#
# verify_combo.sh — code-review-combo Phase5 验收辅助脚本
# ==========================================================================
# 用途：
#   准备两类靶子并实跑 ocr，校验输出 JSON 是否与实测 Schema 一致：
#     1) git 靶子  -> ocr review  (顶层 comments[] + manifest)
#     2) 非git靶子 -> ocr scan    (顶层 comments[] 且 无 manifest)
#   校验点：顶层含 comments[]；单条字段完整(path/content/existing_code/
#           start_line/end_line/category/severity)；severity/category 枚举
#           合法；review 含 manifest、scan 不含。
#   本脚本仅准备靶子 + 实跑 + 校验打印，不修改任何技能核心文件。
#
# 用法：
#   bash tests/verify_combo.sh <provider>
#   <provider> = 已在 ocr config 中命名配置的 provider（如 nvidia / sensenova）
#
# 红线：本文件绝不写入任何 Key 值；provider 仅以名称引用。
# 退出码：0 = review 与 scan 均通过校验；非 0 = 任一校验失败。
# ==========================================================================

set -uo pipefail

PROVIDER="${1:-}"
if [ -z "$PROVIDER" ]; then
  echo "用法: bash tests/verify_combo.sh <provider>" >&2
  echo "  <provider> = 已配置的 provider 名 (例如 nvidia / sensenova)" >&2
  exit 2
fi

# ---- 路径解析 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# code-review-combo 的上两级 = AI_MCP-Skill-CLI（git 靶子仓库）
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_TMP="D:/Documents/AI_Work_Temp/2026-08-17-14-54-31"
SCAN_TARGET="$WORK_TMP/scan-nongit-target"
# 含代码的小目录（非 git 副本）：github-personal-manager 的脚本目录
SCAN_SRC="$REPO_DIR/github-personal-manager/scripts"

REVIEW_OUT="$WORK_TMP/verify_review_${PROVIDER}.json"
SCAN_OUT="$WORK_TMP/verify_scan_${PROVIDER}.json"
REVIEW_ERR="$WORK_TMP/verify_review_${PROVIDER}.err"
SCAN_ERR="$WORK_TMP/verify_scan_${PROVIDER}.err"

OCR_BIN="$(command -v ocr || true)"
NODE_BIN="$(command -v node || true)"

overall=0

echo "=============================================="
echo " code-review-combo 验收验证 (provider=$PROVIDER)"
echo "=============================================="
echo "[env] ocr  = ${OCR_BIN:-MISSING}"
echo "[env] node = ${NODE_BIN:-MISSING}"
echo "[env] repo = $REPO_DIR"

if [ -z "$OCR_BIN" ]; then echo "ERROR: ocr 未安装，无法实跑" >&2; exit 3; fi
if [ -z "$NODE_BIN" ]; then echo "ERROR: node 未安装，无法解析 JSON" >&2; exit 3; fi

# ---- 复用校验器：读取 JSON 文件，按 kind(review|scan) 校验 ----
validate_json() {
  local file="$1"; local kind="$2"
  "$NODE_BIN" -e '
    const fs = require("fs");
    const file = process.argv[1];
    const kind = process.argv[2];
    let raw;
    try { raw = fs.readFileSync(file, "utf8"); }
    catch (e) { console.log("  FAIL: 无法读取输出文件 " + file); process.exit(1); }
    let d;
    try { d = JSON.parse(raw); }
    catch (e) { console.log("  FAIL: 输出不是合法 JSON: " + e.message); process.exit(1); }

    let ok = true;
    const topNeed = ["status","llm","summary","comments","session_id"];
    for (const k of topNeed) {
      if (!(k in d)) { console.log("  FAIL: 顶层缺少键 " + k); ok = false; }
    }
    if (!Array.isArray(d.comments)) { console.log("  FAIL: comments 不是数组"); ok = false; }

    const SEV = ["critical","high","medium","low"];
    const CAT = ["bug","security","performance","maintainability","test","style","documentation","other"];
    // 必填字段（合并去重与 Schema 合规的硬依赖）；existing_code / suggestion_code 为可选(omitempty)，缺失仅告警不致命
    const REQ_FIELDS = ["path","content","start_line","end_line","category","severity"];
    const OPT_FIELDS = ["existing_code","suggestion_code"];
    let missingReq = 0, missingOpt = 0, badSev = 0, badCat = 0;
    const sevCount = {}, catCount = {};
    if (Array.isArray(d.comments)) {
      d.comments.forEach((c) => {
        for (const f of REQ_FIELDS) {
          if (!(f in c) || c[f] === null || c[f] === undefined) missingReq++;
        }
        for (const f of OPT_FIELDS) {
          if (!(f in c) || c[f] === null || c[f] === undefined) missingOpt++;
        }
        if (c.severity && !SEV.includes(c.severity)) badSev++;
        if (c.category && !CAT.includes(c.category)) badCat++;
        if (c.severity) sevCount[c.severity] = (sevCount[c.severity] || 0) + 1;
        if (c.category) catCount[c.category] = (catCount[c.category] || 0) + 1;
      });
    }

    const hasManifest = ("manifest" in d);
    if (kind === "review" && !hasManifest) { console.log("  FAIL: review 输出缺少 manifest"); ok = false; }
    if (kind === "scan" && hasManifest)    { console.log("  FAIL: scan 输出不应含 manifest，但实际存在"); ok = false; }

    const n = Array.isArray(d.comments) ? d.comments.length : 0;
    console.log("  comments=" + n + " 缺必填字段=" + missingReq +
                " 缺可选字段(告警)=" + missingOpt +
                " 非法severity=" + badSev + " 非法category=" + badCat);
    console.log("  severity分布=" + JSON.stringify(sevCount));
    console.log("  category分布=" + JSON.stringify(catCount));
    console.log("  manifest=" + (hasManifest ? "存在" : "无") +
                " (期望:" + (kind === "review" ? "存在" : "无") + ")");
    if (missingOpt > 0) console.log("  WARN: 有 " + missingOpt + " 处可选字段(existing_code/suggestion_code)缺失（不致命）");

    if (missingReq > 0) { console.log("  FAIL: 有 " + missingReq + " 处必填字段缺失"); ok = false; }
    if (badSev > 0)       { console.log("  FAIL: 有 " + badSev + " 条 severity 非法"); ok = false; }
    if (badCat > 0)       { console.log("  FAIL: 有 " + badCat + " 条 category 非法"); ok = false; }

    process.exit(ok ? 0 : 1);
  ' "$file" "$kind"
}

# ---- 1. git 靶子：ocr review ----
HEAD="$(cd "$REPO_DIR" 2>/dev/null && git rev-parse HEAD 2>/dev/null || true)"
if [ -z "$HEAD" ]; then echo "ERROR: 无法解析仓库 HEAD" >&2; exit 3; fi
BASE="${HEAD}~1"

echo ""
echo "----------------------------------------------"
echo " [1/2] git 靶子: ocr review"
echo "       from=$BASE  to=$HEAD"
echo "----------------------------------------------"
if ! ( cd "$REPO_DIR" && ocr review --provider "$PROVIDER" --format json --audience agent \
     --from "$BASE" --to "$HEAD" >"$REVIEW_OUT" 2>"$REVIEW_ERR" ); then
  echo "  WARN: ocr review 退出码非 0（可能 provider 不可用），以下按输出文件判定。详见 $(basename "$REVIEW_ERR")"
fi
echo " [review 校验]"
if validate_json "$REVIEW_OUT" "review"; then
  echo "  RESULT review: PASS"
else
  echo "  RESULT review: FAIL"
  overall=1
fi

# ---- 2. 非 git 靶子：ocr scan ----
echo ""
echo "----------------------------------------------"
echo " [2/2] 非 git 靶子: ocr scan"
echo "----------------------------------------------"
echo "  准备临时非 git 目录: $SCAN_TARGET"
rm -rf "$SCAN_TARGET"
mkdir -p "$SCAN_TARGET"
if [ -d "$SCAN_SRC" ]; then
  cp -r "$SCAN_SRC" "$SCAN_TARGET/scripts"
else
  echo "  WARN: SCAN_SRC 不存在: $SCAN_SRC，退回占位文件"
  printf 'def foo():\n    return 1\n' > "$SCAN_TARGET/sample.py"
fi
if [ -d "$SCAN_TARGET/.git" ]; then echo "  WARN: 目标目录意外含 .git" >&2; fi

echo "  运行 ocr scan (cwd=$SCAN_TARGET, 默认 whole, 不传 --path)"
( cd "$SCAN_TARGET" && ocr scan --provider "$PROVIDER" --format json --audience agent >"$SCAN_OUT" 2>"$SCAN_ERR" )
if [ $? -ne 0 ]; then
  echo "  WARN: ocr scan 退出码非 0，以下按输出文件判定。详见 $(basename "$SCAN_ERR")"
fi
echo " [scan 校验]"
if validate_json "$SCAN_OUT" "scan"; then
  echo "  RESULT scan: PASS"
else
  echo "  RESULT scan: FAIL"
  overall=1
fi

echo ""
echo "=============================================="
if [ "$overall" -eq 0 ]; then
  echo " OVERALL: PASS (review + scan 输出均与实测 Schema 一致)"
else
  echo " OVERALL: FAIL"
fi
echo " 产物: $REVIEW_OUT"
echo "       $SCAN_OUT"
echo "=============================================="
exit $overall
