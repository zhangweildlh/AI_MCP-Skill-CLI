#!/usr/bin/env node
/**
 * wechat-article-to-ima · 缺陷 C / D 下沉修复 回归测试（离线单测，零网络、零凭据）
 *
 * 缘起（2026-11-13 sink-defects-abe 任务）：将本轮发现的 5 项缺陷（A-E）中
 * 可代码级消除的项下沉到技能开发态副本。本脚本锁定其中两项纯函数契约：
 *
 *   缺陷 D：classifyFetchResult —— 反爬/验证码页语义否决必须优先于「正文为空」判定。
 *           顺序即契约：先 looksLikeErrorPage，再判 js_content 长度。
 *           回归重点：一个「同时含反爬标记且 js_content 极短」的页面，必须判为
 *           error-page（而非 empty），否则「无浏览器→中转链接未解析→取回反爬页」
 *           会被误报为「js_content 为空（内容已删除）」，掩盖真实根因。
 *
 *   缺陷 C：computeIngestSummary —— 内联摘要「实入库」口径与 state.js report 四栏对齐
 *           （KB 已存在跳过不计入新入）。实入库 = ingested - dupSkipped（Math.max 兜底非负）。
 *
 * 纪律：零第三方依赖；复用 pipeline.js 纯函数导出；无网络/凭据；无临时文件。
 */
'use strict';
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const P = require(path.join(SKILL_DIR, 'scripts', 'pipeline.js'));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}
function call(fn) { try { return fn(); } catch (e) { return '__THREW__:' + e.message; } }

// 样本构造辅助
function antiSpiderPage() {
  // 命中 2 个 ERROR_PAGE_MARKERS（搜狗搜索 + antispider）→ looksLikeErrorPage=true
  return '<html><head><title>搜狗搜索</title></head><body><div class="antispider">请验证</div>' +
    '<div id="js_content"></div></body></html>';
}
function normalPage(text) {
  const body = (text || '正文段落一。'.repeat(20)); // 远超 50 字
  return '<html><head><title>正常文章</title></head><body><div id="js_content">' + body + '</div></body></html>';
}
function emptyContentPage() {
  // 无反爬标记，且 js_content 内正文 <50 字
  return '<html><head><title>空文</title></head><body><div id="js_content">短</div></body></html>';
}
function verifyCodePage() {
  // 单标记 VerifyCode 即触发（ERROR_PAGE_MARKERS 内显式 OR 项）
  return '<html><head><title>验证</title></head><body><div>VerifyCode：abc</div></body></html>';
}

console.log('=== ① 缺陷 D：classifyFetchResult 已导出且顺序契约正确 ===');
check('classifyFetchResult 已导出且为函数', typeof P.classifyFetchResult === 'function');
check('computeIngestSummary 已导出且为函数', typeof P.computeIngestSummary === 'function');

console.log('\n=== ② 缺陷 D：正常页面 → ok（含 inner/author）===');
{
  const r = call(() => P.classifyFetchResult(normalPage()));
  check('正常页 → kind=ok', r && r.kind === 'ok', JSON.stringify(r));
  check('正常页 inner 非空（已抽取 js_content）', r && typeof r.inner === 'string' && r.inner.length > 0, JSON.stringify(r));
  check('正常页 author 字段存在', r && 'author' in r, JSON.stringify(r));
}

console.log('\n=== ③ 缺陷 D：纯空正文（无反爬标记）→ empty（口径 js_content<50字）===');
{
  const r = call(() => P.classifyFetchResult(emptyContentPage()));
  check('空正文页 → kind=empty', r && r.kind === 'empty', JSON.stringify(r));
  check('empty 错误文案指向「js_content 为空或过短」', r && /js_content 为空或过短/.test(r.err || ''), JSON.stringify(r));
}

console.log('\n=== ④ 缺陷 D：反爬页（2 标记）→ error-page ===');
{
  const r = call(() => P.classifyFetchResult(antiSpiderPage()));
  check('反爬页 → kind=error-page', r && r.kind === 'error-page', JSON.stringify(r));
  check('error-page 错误文案指向「反爬/验证码页」', r && /反爬\/验证码页/.test(r.err || ''), JSON.stringify(r));
}

console.log('\n=== ⑤ 缺陷 D：VerifyCode 单标记即触发 → error-page ===');
{
  const r = call(() => P.classifyFetchResult(verifyCodePage()));
  check('VerifyCode 页 → kind=error-page', r && r.kind === 'error-page', JSON.stringify(r));
}

console.log('\n=== ⑥ ★ 缺陷 D 核心回归：反爬页 + js_content 极短 → 必须判 error-page（顺序契约，非 empty）===');
{
  // 旧实现只判「正文<50字」会统一误报 empty；此页同时含反爬标记（搜狗搜索+antispider）且 js_content 空。
  const r = call(() => P.classifyFetchResult(antiSpiderPage()));
  check('★ 反爬+空正文 → kind=error-page（优先于 empty）', r && r.kind === 'error-page', '实得 ' + JSON.stringify(r));
  check('★ 绝不误报为 empty（掩盖真实根因）', r && r.kind !== 'empty', '实得 ' + JSON.stringify(r));
}

console.log('\n=== ⑦ 缺陷 C：computeIngestSummary 口径对齐 report 四栏 ===');
{
  const s = call(() => P.computeIngestSummary({ shouldIngest: 5, ingested: 3, filtered: 1, failed: 1, dupSkipped: 2 }));
  check('应入库 = shouldIngest', s && s.shouldIngest === 5, JSON.stringify(s));
  check('★ 实入库 = ingested - dupSkipped = 1（KB 已存在跳过不计入新入）', s && s.newlyIngested === 1, JSON.stringify(s));
  check('KB 已存在跳过披露 = 2', s && s.dupSkipped === 2, JSON.stringify(s));
  check('被过滤 = filtered', s && s.filtered === 1, JSON.stringify(s));
  check('失败 = failed', s && s.failed === 1, JSON.stringify(s));
}
console.log('\n=== ⑧ 缺陷 C：实入库 不为负（dupSkipped>ingested 时 Math.max 兜底）===');
{
  const s = call(() => P.computeIngestSummary({ shouldIngest: 2, ingested: 1, filtered: 0, failed: 1, dupSkipped: 3 }));
  check('★ 实入库 兜底为 0（不出现负数）', s && s.newlyIngested === 0, JSON.stringify(s));
  check('应入库 仍含 dupSkipped 披露', s && s.shouldIngest === 2 && s.dupSkipped === 3, JSON.stringify(s));
}
console.log('\n=== ⑨ 缺陷 C：全量新入（无重复跳过）===');
{
  const s = call(() => P.computeIngestSummary({ shouldIngest: 10, ingested: 10, filtered: 0, failed: 0, dupSkipped: 0 }));
  check('无跳过时 实入库 = ingested = 10', s && s.newlyIngested === 10, JSON.stringify(s));
}
console.log('\n=== ⑩ 缺陷 C：缺字段不崩（向后兼容默认 0）===');
{
  const s = call(() => P.computeIngestSummary({}));
  check('空 stat 返回全 0（不抛错）', s && s.shouldIngest === 0 && s.newlyIngested === 0 && s.filtered === 0 && s.failed === 0 && s.dupSkipped === 0, JSON.stringify(s));
  check('空 stat 不抛异常', typeof s === 'object', String(s));
}

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('未通过明细：'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
