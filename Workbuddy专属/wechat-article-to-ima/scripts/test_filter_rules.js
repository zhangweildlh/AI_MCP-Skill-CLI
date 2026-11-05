/**
 * S3 过滤规则回归验证：用 2026-11-05 实测的 29 条「被过滤」样本，
 * 断言修复后的规则不再误杀（27 条应为「不拦截」），且 2 条真命中仍被拦截。
 * 同时覆盖子串边界用例（推动/召开 不得触发 动工/开工）。
 */
const fs = require('fs');
const path = require('path');
const WT = 'D:/Documents/AI_MCP-Skill-CLI/worktrees/Workbuddy专属-sink-defect-fixes-20261105151349/Workbuddy专属/wechat-article-to-ima/scripts';
const { matchFilter } = require(path.join(WT, 'pipeline.js'));

const EV = 'D:/Documents/AI_Work_Temp/ima+WorkBuddy/.workbuddy/evidence/_filter_analysis.json';
const samples = JSON.parse(fs.readFileSync(EV, 'utf8'));

// 真命中（应为 true）：标题含「项目开工」/「顺利开工」的开工类标题
const TRUE_POSITIVE = [
  '天辰总承包EPC项目开工',
  '工程纵览|中国化学工程东华公司总承包的碳鑫科技醇基高端化学品项目一期工程项目现场顺利开工',
];
// 真命中（应为 true）：确为招标公告
const TRUE_POSITIVE_2 = [
  '之寓·保税区人才公寓项目二标段工程总承包(EPC)专电工程专业分包招标公告',
];

let pass = 0, fail = 0;
const bad = [];

console.log('=== ① 29 条历史被过滤样本：断言「不再误杀」===');
for (const s of samples) {
  const isTP = TRUE_POSITIVE.includes(s.title) || TRUE_POSITIVE_2.includes(s.title);
  // 标题层判定（历史样本的 layer 字段指命中层；正文层命中一律不拦截）
  const hitTitle = matchFilter(s.title, 'title');
  // 正文层：样本只保留了命中上下文片段，用片段模拟正文（片段必然含命中词）
  const hitBody = matchFilter(s.ctx || '', 'body');
  const nowFiltered = !!(hitTitle || hitBody);
  const expectFiltered = isTP;
  if (nowFiltered === expectFiltered) { pass++; }
  else { fail++; bad.push({ title: s.title, expect: expectFiltered ? '拦截' : '不拦截', got: nowFiltered ? '拦截' : '不拦截', hitTitle, hitBody, ctx: (s.ctx || '').slice(0, 50) }); }
}
console.log(`  通过 ${pass} / 失败 ${fail}`);

console.log('\n=== ② 真命中样例：断言「仍被拦截」===');
let tp = 0, tpf = 0;
for (const t of [...TRUE_POSITIVE, ...TRUE_POSITIVE_2]) {
  const hit = matchFilter(t, 'title');
  if (hit) tp++; else { tpf++; bad.push({ title: t, expect: '拦截', got: '不拦截', hitTitle: null }); }
}
console.log(`  真命中被拦截 ${tp} / 漏网 ${tpf}`);

console.log('\n=== ③ 子串边界用例（核心 bug：动工⊂推动、开工⊂召开）===');
const boundary = [
  ['要推动工程总承包模式快速发展', null, '「推动」含「动工」子串 → 不得命中'],
  ['中建五局召开工程总承包管理推进会', null, '「召开」含「开工」子串 → 不得命中'],
  ['近两年来新开工项目审批放缓、资金紧缺', null, '「新开工项目」→ 不得命中'],
  ['大力推广工程总承包，使企业得到锻炼', null, '政策套话「大力推广」→ 不得命中'],
  ['形成在全国可复制、可推广的经验和改革创新成果', null, '「可复制、可推广的经验」→ 不得命中'],
  ['（一）投标人须知；（二）评标办法和标准', null, '法规原文「评标办法和标准」→ 不得命中'],
  ['招标人与中标人的责任和权利', null, '法规原文「招标人与中标人的责任」→ 不得命中'],
  ['建设单位评标话语权增强', null, '「评标话语权」→ 不得命中'],
  ['天辰总承包EPC项目开工', '开工类', '标题真命中 → 应拦截'],
  ['某项目顺利开工仪式隆重举行', '开工类', '标题真命中 → 应拦截'],
  ['关于房屋建筑工程总承包发包人要求编制指南的招标公告', '中标类', '强特征「招标公告」→ 应拦截'],
];
let bp = 0, bf = 0;
for (const [text, expect, desc] of boundary) {
  const hit = matchFilter(text, 'title');
  const ok = (expect === null) ? (hit === null) : (hit === expect);
  if (ok) { bp++; console.log(`  ✅ ${desc} → ${hit || '不拦截'}`); }
  else { bf++; console.log(`  ❌ ${desc} → 实得 ${hit || '不拦截'}（期望 ${expect || '不拦截'}）`); bad.push({ text, expect, got: hit }); }
}
console.log(`  边界用例通过 ${bp} / 失败 ${bf}`);

console.log('\n=== 汇总 ===');
console.log(`总通过 ${pass + tp + bp} / 总失败 ${fail + tpf + bf}`);
if (bad.length) {
  console.log('\n未通过明细：');
  bad.forEach((b) => console.log('  -', JSON.stringify(b)));
  process.exit(1);
}
console.log('✅ 全部断言通过');
