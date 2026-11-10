#!/usr/bin/env node
/**
 * wechat-article-to-ima · 抓取失败诊断 + 微信直连头（离线单测）
 *
 * 缘起（2026-11-10 卡片A 实跑）：31 篇原生抓取失败，但四栏清单与 report 全显
 * 「原生抓取失败：<原生根因>｜Agent 编排兜底失败：<2/3 级兜底根因>」——原生真实根因（HTTP 4xx /
 * js_content 为空 / 超时）被组合错误信息吞没，既无法诊断，
 * 也使 test_fetch_failure_taxonomy.js 的分类器在真实态下失去意义。
 *
 * 本测试锁定两条修复契约：
 *   ① buildFetchFailureReason：原生与 Agent 编排兜底（2/3 级）失败原因必须分别保留、用分隔符区分；
 *   ② buildFetchHeaders：微信文章直连必须带 Referer（否则反爬/防盗链易拦截）。
 *
 * 纪律：零第三方依赖；复用 pipeline.js 纯函数导出；无网络/凭据；临时文件自清理。
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
// 安全调用：导出缺失/抛错时返回占位串，使单测"干净失败"而非进程崩溃
function call(fn) { try { return fn(); } catch (e) { return '__THREW__:' + e.message; } }

console.log('=== ① buildFetchFailureReason：原生与 Agent 编排兜底（2/3 级）失败原因必须分别保留 ===');
check('已导出且为函数', typeof P.buildFetchFailureReason === 'function');
check('原生失败+Agent 编排兜底失败 → 两者原因均可见且用「｜」区分', (() => {
  const r = call(() => P.buildFetchFailureReason(new Error('HTTP 403'), 'web-search→firecrawl 不可用（CLI 缺失）'));
  return typeof r === 'string' && /原生抓取失败：HTTP 403/.test(r) && /Agent 编排兜底失败：web-search→firecrawl 不可用/.test(r) && r.includes('｜');
})());
check('仅原生失败（Agent 编排未触发） → 只含原生原因', (() => {
  const r = call(() => P.buildFetchFailureReason(new Error('js_content 为空或过短'), ''));
  return typeof r === 'string' && /原生抓取失败：js_content 为空/.test(r) && !/Agent 编排/.test(r);
})());
check('仅 Agent 编排兜底失败（原生未知） → 只含兜底原因', (() => {
  const r = call(() => P.buildFetchFailureReason(null, 'web-search→firecrawl 对所有候选均失败'));
  return typeof r === 'string' && /Agent 编排兜底失败：web-search→firecrawl 对所有候选均失败/.test(r) && !/原生/.test(r);
})());
check('两者皆无 → 兜底占位文案（不抛错）', (() => {
  const r = call(() => P.buildFetchFailureReason(null, ''));
  return typeof r === 'string' && r.length > 0 && !r.startsWith('__THREW__');
})());
check('★ 回归护栏：旧实现会把「HTTP 403」吞掉；本函数须让其可见', (() => {
  const r = call(() => P.buildFetchFailureReason(new Error('HTTP 403'), 'web-search→firecrawl 不可用（CLI 缺失）'));
  return typeof r === 'string' && r.includes('HTTP 403');
})());

console.log('\n=== ② buildFetchHeaders：微信直连必须带 Referer ===');
check('已导出且为函数', typeof P.buildFetchHeaders === 'function');
check('返回对象含 Referer 且指向 mp.weixin.qq.com', (() => {
  const h = call(() => P.buildFetchHeaders());
  return h && typeof h === 'object' && h.Referer === P.WECHAT_REFERER && /mp\.weixin\.qq\.com/.test(h.Referer);
})());
check('保留 UA 与 Accept-Language', (() => {
  const h = call(() => P.buildFetchHeaders());
  return h && /Mozilla/.test(h['User-Agent']) && /zh-CN/.test(h['Accept-Language']);
})());

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('未通过明细：'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
