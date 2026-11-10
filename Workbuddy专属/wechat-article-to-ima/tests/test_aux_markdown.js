#!/usr/bin/env node
/**
 * wechat-article-to-ima · 完整性闸门辅助判据（markdown 源）离线单测
 *
 * 缘起（2026-11-10 代码审查）：pipeline.js 的 auxCriteria 仅识别 HTML 标签
 * （<li>/<tr>/<table>/<h2-6>）来算 structured/headings。当 3 级 firecrawl 兜底生效时，
 * 文章源是 markdown（无 HTML 标签）→ structured/headings 恒为 0 → 含 2 列表 + 1 标题的
 * 优质 markdown 也会被判 met=false 被闸门误杀（而 1 级原生 HTML 源不受影响，故本轮未爆发）。
 *
 * 本测试锁定修复契约：auxCriteria 在 html 为空时，改用 markdown 语法近似（列表项 / 表格行 / # 标题）。
 *
 * 纪律：零第三方依赖；复用 pipeline.js 纯函数导出；无网络/凭据。
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

console.log('=== ③ auxCriteria：markdown 源（firecrawl）须按 markdown 语法判辅助判据 ===');
// 修复前：html 为空时 structured/headings 恒 0 → 以下优质 markdown 被误判 met=false
check('markdown 含 ≥2 列表项 → structured≥2 满足', (() => {
  const a = P.auxCriteria('', '# 标题\n\n- 项目一\n- 项目二\n\n正文段落一\n\n正文段落二');
  return a.structured >= 2;
})());
check('markdown 含 # 标题 → headings≥1 满足', (() => {
  const a = P.auxCriteria('', '# 标题\n\n正文');
  return a.headings >= 1;
})());
check('markdown 列表+标题 → met 整体为真', (() => {
  const a = P.auxCriteria('', '# 标题\n\n- 项目一\n- 项目二\n\n正文');
  return a.met === true;
})());
check('markdown 含表格行 → structured 计入', (() => {
  const md = '| 列1 | 列2 |\n| --- | --- |\n| a | b |\n| c | d |';
  const a = P.auxCriteria('', md);
  return a.structured >= 2;
})());
check('HTML 源行为保持不退化', (() => {
  const a = P.auxCriteria('<ul><li>a</li><li>b</li></ul>', 'a\nb');
  return a.structured >= 2 && a.met === true;
})());
check('三者皆不满足（短 markdown）→ met=false', (() => {
  const a = P.auxCriteria('', '只有一句话。');
  return a.met === false;
})());

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('未通过明细：'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
