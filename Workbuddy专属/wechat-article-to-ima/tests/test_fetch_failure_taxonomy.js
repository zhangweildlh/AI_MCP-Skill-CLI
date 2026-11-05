#!/usr/bin/env node
/**
 * wechat-article-to-ima · 抓取失败归因分类（真实态 + 离线分类器单测）
 *
 * 缘起：批量抓取出现大面积失败时，若只以「抓取失败」笼统结案，会把真实根因
 * （搜狗反爬重定向 / 原文已删除 / 嵌套标签截断）掩盖掉，进而误判修复方向。
 * 本脚本把归因做成**确定性分类器**（离线可回归），并在真实态下对实际响应
 * 做分类统计与阈值断言。
 *
 * 用法：
 *   node tests/test_fetch_failure_taxonomy.js              # 离线：分类器单测（默认，零网络）
 *   node tests/test_fetch_failure_taxonomy.js --allow-real # 真实态：附带真实 URL 抽样归因
 *   node tests/test_fetch_failure_taxonomy.js --search <检索结果.json> --limit N
 *
 * 纪律：零第三方依赖；不反向依赖仓库级入口；无绝对路径；临时文件自清理（§9.5）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const FIXTURE = path.join(SKILL_DIR, 'tests', 'fixtures', 'fetch_response_samples.json');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

/**
 * 对抓取响应体分类（纯函数，离线可回归）。
 * 判定顺序刻意如此：先认「反爬标记」（短响应里最常见的真实形态），
 * 再认「有无可入库正文容器」，最后才以长度作辅助判据——
 * 否则「原文已删除」的大响应会被短响应判据误吞。
 *
 * @param {string} text 响应体
 * @returns {{cls:string, len:number, title:string, detail:string}}
 */
function classifyResponse(text) {
  const t = String(text || '');
  const len = t.length;
  const titleM = t.match(/<title[^>]*>([^<]{0,60})<\/title>/);
  const title = titleM ? titleM[1].trim() : '';
  const hasJsContent = /id="js_content"/.test(t);
  const bodyLen = hasJsContent ? (t.match(/id="js_content"[^>]*>([\s\S]*?)<\/div>/) || ['', ''])[1].replace(/<[^>]+>/g, '').trim().length : 0;
  if (/antispider/i.test(t) || /搜狗|sogou/i.test(title)) {
    return { cls: 'sogouAntispider', len, title, detail: '搜狗反爬页：会话/IP 被风控，或中转链接未解析' };
  }
  if (hasJsContent) {
    return bodyLen < 200
      ? { cls: 'jsContentShort', len, title, detail: 'js_content 过短（' + bodyLen + ' 字符）：嵌套标签截断或空正文' }
      : { cls: 'ok', len, title, detail: '正文容器正常（' + bodyLen + ' 字符）' };
  }
  return len < 20000
    ? { cls: 'sogouRedirect', len, title, detail: '无正文容器且响应过短：跳转页或风控占位' }
    : { cls: 'noJsContent', len, title, detail: '无正文容器且响应体不小：原文已删除 / 违规 / 非文章页' };
}

/** 按 fixture 的确定性补白指令组合样本（避免仓库内留存大体积 fixture） */
function composeSample(s) {
  if (!s.padTimes) return s.html;
  const pad = s.padText.repeat(s.padTimes);
  return s.padAt === 'end' ? s.html + pad : pad + s.html;
}

console.log('=== ① 分类器离线单测（fixture 驱动，零网络）===');
const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
for (const s of fx.samples) {
  const r = classifyResponse(composeSample(s));
  check(`「${s.name}」→ ${s.expect}`, r.cls === s.expect, `实得 ${r.cls}（${r.detail}）`);
}
check('分类器对空响应不抛错', classifyResponse('').cls === 'sogouRedirect', JSON.stringify(classifyResponse('')));
check('分类器对 undefined 不抛错', classifyResponse(undefined).cls === 'sogouRedirect', '');

console.log('\n=== ② url_resolved 与处置结果交叉表（离线，结构自检）===');
// 该交叉表是 2026-11-05 定位「中转链接未解析致 91% 抓取失败」的核心证据形态，
// 断言其结构恒等式：未解析条目数 + 已解析条目数 === 检索结果总数
function crossTab(articles) {
  const cross = { resolved: { ingested: 0, filtered: 0, failed: 0 }, unresolved: { ingested: 0, filtered: 0, failed: 0 } };
  let resolved = 0, unresolved = 0, ampEntity = 0;
  for (const a of articles) {
    const url = String(a.url || '');
    const isResolved = a.url_resolved === true && /mp\.weixin\.qq\.com/.test(url);
    if (/&amp;/.test(url)) ampEntity++;
    if (isResolved) resolved++; else unresolved++;
    const o = a.__outcome;
    if (!o) continue;
    const kind = o === 'ingested' ? 'ingested' : o === 'filtered' ? 'filtered' : 'failed';
    cross[isResolved ? 'resolved' : 'unresolved'][kind]++;
  }
  return { cross, resolved, unresolved, ampEntity, total: articles.length };
}
const sampleArts = [
  { url: 'https://mp.weixin.qq.com/s?a=1', url_resolved: true, __outcome: 'ingested' },
  { url: 'https://mp.weixin.qq.com/s?a=2', url_resolved: true, __outcome: 'filtered' },
  { url: 'https://weixin.sogou.com/link?url=x&amp;type=2', url_resolved: false, __outcome: 'failed' },
];
const ct = crossTab(sampleArts);
check('已解析 + 未解析 === 总数', ct.resolved + ct.unresolved === ct.total, JSON.stringify(ct));
check('交叉表按 resolved/unresolved 分桶正确', ct.cross.resolved.ingested === 1 && ct.cross.resolved.filtered === 1 && ct.cross.unresolved.failed === 1, JSON.stringify(ct.cross));
check('★ 统计出 URL 中含未解码 &amp; 实体的条数（修复前的主要成因）', ct.ampEntity === 1, String(ct.ampEntity));
check('未解析条目恒不计入 resolved 桶', ct.cross.resolved.failed === 0, JSON.stringify(ct.cross.resolved));

console.log('\n=== ③ 真实态抽样归因（需 --allow-real；默认跳过）===');
const allowReal = process.argv.includes('--allow-real');
async function realStateSection() {
  if (!allowReal) {
    console.log('  ○ 已跳过（真实态测试默认不运行，须 --allow-real 显式门控，见 §9.3）');
    return;
  }
  const searchIdx = process.argv.indexOf('--search');
  const limitIdx = process.argv.indexOf('--limit');
  const searchFile = searchIdx >= 0 ? process.argv[searchIdx + 1] : '';
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) || 10 : 10;
  if (!searchFile || !fs.existsSync(searchFile)) {
    console.log('  ⚠ 未提供 --search <检索结果.json>，跳过真实态抽样');
    return;
  }
  const arts = JSON.parse(fs.readFileSync(searchFile, 'utf8')).articles || [];
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
  const tally = {};
  const picks = arts.slice(0, limit);
  for (const a of picks) {
    let cls = 'networkError';
    try {
      const r = await fetch(a.url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' } });
      const t = await r.text();
      cls = classifyResponse(t).cls;
    } catch (e) { cls = 'networkError'; }
    tally[cls] = (tally[cls] || 0) + 1;
  }
  console.log('  抽样 ' + picks.length + ' 条，归因分布：' + JSON.stringify(tally));
  const bad = (tally.sogouAntispider || 0) + (tally.sogouRedirect || 0);
  check('反爬类占比 < 50%（超阈值说明会话被风控，应冷却后换出口 IP 重试）',
    picks.length === 0 || bad / picks.length < 0.5, `反爬类 ${bad}/${picks.length}`);
}

(async () => {
  await realStateSection();
  console.log('\n=== 汇总 ===');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if (fail) {
    console.log('未通过明细：');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(fail ? 1 : 0);
})();
