// schema_parity.js — code-review-combo 守卫 (e) 的比对逻辑
// 职责：校验 merge_reports 的真实输出字段 与 SKILL.md Schema 声明**双向一致**。
// 由 tests/guard.sh 以 `node schema_parity.js <SKILL.md> <实跑产出.json>` 调用。
// 独立成文件而非内联进 guard.sh：内联会让 JS 里的反引号/引号与 bash -c '...' 嵌套冲突。
//
// 背景（2026-10-13 自审 finding #1）：SKILL.md 曾声明 summary 顶层存在扁平
// critical/high/medium/low 别名，但实现从未回填、Schema 代码块也未列——三项证据
// 全依赖人工实跑才暴露，既有守卫 (a)(c)(d) 均不覆盖「字段级不一致」。
//
// 判据（双向）：
//   实现有而文档无 → 文档漏写，下游按文档取不到该字段
//   文档有而实现无 → 文档声称存在但实际不存在，下游取到 undefined
// 另校验 verified_by / cross_check / category / severity 的枚举取值一致。
//
// 退出码：0 = 一致；1 = 不一致（逐条打印差异）；2 = 输入不可解析（非一致性失败）。

"use strict";
const fs = require("fs");

const SKILL = process.argv[2];
const OUT = process.argv[3];
if (!SKILL || !OUT) {
  console.log("  (e) schema-parity: 用法 node schema_parity.js <SKILL.md> <out.json>");
  process.exit(2);
}

// ---- 1) 定位 SKILL.md 的「输出：唯一审计报告格式」小节与其 ```json 块 ----
const skill = fs.readFileSync(SKILL, "utf8");
const secRe = /## 输出：唯一审计报告格式[^\n]*\n([\s\S]*?)\n## /;
const sec = skill.match(secRe);
if (!sec) {
  console.log("  (e) 未找到「输出：唯一审计报告格式」小节");
  process.exit(1);
}
// 围栏正则须容忍 CRLF 行尾（仓库文件为 CRLF），故用 \r?\n 而非 \n；
// 反引号在 regex 字面量中直接书写，无需转义（此前用 new RegExp + "\\n" 会被
// 解析成字面反斜杠+n，导致永远匹配不到围栏）。
const fenceRe = /```json\r?\n([\s\S]*?)```/;
const block = sec[1].match(fenceRe);
if (!block) {
  console.log("  (e) 该小节内无 json 代码块");
  process.exit(1);
}
const schemaText = block[1];

// ---- 2) 读实跑产出 ----
let real;
try {
  real = JSON.parse(fs.readFileSync(OUT, "utf8"));
} catch (e) {
  console.log("  (e) 产出 JSON 不可解析: " + e.message);
  process.exit(1);
}

// ---- 3) 收集实现产出的字段名（只收「字段名」，不收枚举字典的键）----
// 关键设计：summary 下by_source / severity_dist / verified_by / category_dist 是
// **枚举字典**，其键（ocr / critical / both / bug …）是「取值」而非「字段名」，
// Schema 用 inline 形式（"by_source": { "ocr": 0, ... }）声明。若递归收全部键，
// 这些取值名会被误当成字段名 → 假阳性。故按「已知枚举字典字段」白名单跳过。
const ENUM_DICT_KEYS = new Set([
  "by_source", // -> ocr / delegate / review-spd
  "severity_dist", // -> critical / high / medium / low
  "verified_by", // -> both / ocr-only / delegate-only / review-spd-only
  "category_dist", // -> bug / security / performance / test / other
]);
function collectKeys(o, out) {
  if (Array.isArray(o)) {
    if (o.length) collectKeys(o[0], out);
    return out;
  }
  if (o && typeof o === "object") {
    for (const k of Object.keys(o)) {
      if (ENUM_DICT_KEYS.has(k)) continue; // 枚举字典：只收字段名本身，不收其下的取值名
      out.add(k);
      collectKeys(o[k], out);
    }
  }
  return out;
}
const realKeys = collectKeys(real, new Set());

// ---- 4) 收集 Schema 声明的键 ----
// Schema 块含行注释（# ...）与枚举竖线（a | b | c），无法严格 JSON.parse。
// 策略：**按行提取「缩进 + "key" + :」形态**——只收真正的字段声明行，
// 排除行内枚举里出现的 "key"（枚举形如 "category": "bug | security | ..."，
// 其引号内容不带「行首缩进 + "x": 」结构，据此可区分）。
// 早期实现曾用「JSON.parse 失败后全文正则 /"(\w+)":/ 兜底」，会把枚举值
// （bug / security / ocr-only / review-spd 等）误收为键，产生大量假阳性。
const docKeys = new Set();
{
  const re = /^\s{2,}"([A-Za-z_][A-Za-z0-9_]*)"\s*:/gm;
  let m;
  while ((m = re.exec(schemaText))) {
    const k = m[1];
    // 跳过枚举字典 inline 块内部的取值名（"ocr": 0 / "critical": 0 …）：
    // Schema 里这些与by_source 等字段名同缩进，仅靠缩进无法区分，
    // 故按「已知枚举字典字段名」反向排除。
    if (ENUM_DICT_KEYS.has(k)) continue;
    docKeys.add(k);
  }
}

// ---- 5) 枚举取值一致性 ----
function collectVals(o, keyName, out) {
  if (Array.isArray(o)) {
    o.forEach((v) => collectVals(v, keyName, out));
    return out;
  }
  if (o && typeof o === "object") {
    const v = o[keyName];
    if (Array.isArray(v) && typeof v[0] === "string") {
      v.forEach((s) => out.add(String(s).trim()));
    }
    for (const k of Object.keys(o)) collectVals(o[k], keyName, out);
  }
  return out;
}

const enumMismatches = [];
for (const f of ["verified_by", "cross_check", "category", "severity"]) {
  const em = schemaText.match(new RegExp('"' + f + '"\\s*:\\s*([^\\n]+)'));
  if (!em) continue;
  const declared = em[1]
    .split("|")
    .map((s) => s.trim().replace(/[",`].*$/, ""))
    .filter((s) => /^[a-z_][a-z_-]*$/.test(s));
  if (!declared.length) continue;
  const actual = collectVals(real, f, new Set());
  if (!actual.size) continue; // 该字段本次产出未用到（如无 findings），跳过
  for (const d of declared) {
    if (!actual.has(d)) enumMismatches.push(f + "." + d);
  }
}

// ---- 6) 双向比对并报告 ----
const missingInDoc = [...realKeys].filter((k) => !docKeys.has(k)).sort();
const phantomInDoc = [...docKeys].filter((k) => !realKeys.has(k)).sort();

let bad = 0;
if (missingInDoc.length) {
  console.log("  (e) 实现有而 Schema 未声明: " + missingInDoc.join(", "));
  bad++;
} else {
  console.log("  (e) 输出键 ⊆ Schema 声明 OK (" + realKeys.size + " 键)");
}
if (phantomInDoc.length) {
  console.log("  (e) Schema 声明但实现不存在: " + phantomInDoc.join(", "));
  bad++;
} else {
  console.log("  (e) Schema 声明键 ⊆ 实现产出 OK (" + docKeys.size + " 键)");
}
if (enumMismatches.length) {
  console.log("  (e) Schema 枚举值实现未产出: " + enumMismatches.join(", "));
  bad++;
} else {
  console.log("  (e) verified_by/cross_check/category/severity 枚举一致 OK");
}

process.exit(bad === 0 ? 0 : 1);