/**
 * S3 过滤规则回归验证：用 2026-11-05 实测的 29 条「被过滤」样本，
 * 断言修复后的规则不再误杀（27 条应为「不拦截」），且真命中仍被拦截。
 * 同时覆盖子串边界用例（推动/召开 不得触发 动工/开工）。
 *
 * 运行：node scripts/test_filter_rules.js（零依赖，仅用 Node 内置模块）
 * 样本来源：tests/fixtures/filter_false_positives.json（技能自包含，不依赖任何本机绝对路径）
 */
const fs = require('fs');
const path = require('path');
const SKILL_DIR = path.resolve(__dirname, '..');
const { matchFilter } = require(path.join(SKILL_DIR, 'scripts', 'pipeline.js'));

const FIXTURE = path.join(SKILL_DIR, 'tests', 'fixtures', 'filter_false_positives.json');
if (!fs.existsSync(FIXTURE)) {
  console.error('[错误] 缺少测试样本文件：' + FIXTURE);
  process.exit(2);
}
const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const samples = fixture.samples || [];

// 真命中（应为 true）：标题含「项目开工」/「顺利开工」的开工类标题，以及确为招标公告者
const TRUE_POSITIVE = fixture.truePositive || [];

let pass = 0, fail = 0;
const bad = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

console.log('=== ① 29 条历史被过滤样本：断言「不再误杀」===');
const FP = [];   // 误杀：期望不拦截却拦截
const FN = [];   // 漏杀：期望拦截却未拦截
for (const s of samples) {
  const isTP = TRUE_POSITIVE.includes(s.title);
  // 标题层判定（历史样本的 layer 字段指命中层；正文层命中一律不拦截）
  const hitTitle = matchFilter(s.title, 'title');
  // 正文层：样本只保留了命中上下文片段，用片段模拟正文（片段必然含命中词）
  const hitBody = matchFilter(s.ctx || '', 'body');
  const nowFiltered = !!(hitTitle || hitBody);
  const expectFiltered = isTP;
  if (nowFiltered === expectFiltered) { pass++; }
  else {
    fail++;
    (expectFiltered ? FN : FP).push({ title: s.title, hitTitle, hitBody, ctx: (s.ctx || '').slice(0, 50) });
    bad.push({ title: s.title, expect: expectFiltered ? '拦截' : '不拦截', got: nowFiltered ? '拦截' : '不拦截', hitTitle, hitBody, ctx: (s.ctx || '').slice(0, 50) });
  }
}
console.log(`  通过 ${pass} / 失败 ${fail}`);

console.log('\n=== ② 真命中样例：断言「仍被拦截」===');
let tp = 0, tpf = 0;
for (const t of TRUE_POSITIVE) {
  const hit = matchFilter(t, 'title');
  if (hit) tp++; else { tpf++; bad.push({ title: t, expect: '拦截', got: '不拦截', hitTitle: null }); }
}
console.log(`  真命中被拦截 ${tp} / 漏网 ${tpf}`);

console.log('\n=== ③ 过滤精确率 / 召回率指标（复用同一 fixture，量化而非仅逐条断言）===');
// 以「标注样本集」为基准：正类 = 应被拦截的公告类，负类 = 不应被拦截的行业/政策类文章
const TP = tp + (TRUE_POSITIVE.length - tpf);          // 真阳：期望拦截且确实拦截
const FPc = FP.length;                                 // 误杀：不该拦却拦了
const FNc = FN.length;                                 // 漏杀：该拦却没拦
const precision = (TP + FPc) ? TP / (TP + FPc) : 1;
const recall = (TP + FNc) ? TP / (TP + FNc) : 1;
console.log(`  真阳 TP=${TP}  误杀 FP=${FPc}  漏杀 FN=${FNc}`);
console.log(`  精确率 precision = ${(precision * 100).toFixed(1)}%   召回率 recall = ${(recall * 100).toFixed(1)}%`);
console.log('  （对照：旧版「整标题/整正文命中即丢弃」规则在此样本集上误杀率 93.1%，精确率 6.9%）');
check('误杀数 = 0（旧规则为 27/29 = 93.1%）', FPc === 0, '误杀 ' + FPc + ' 条：' + FP.map((x) => x.title).join(' | '));
check('漏杀数 = 0', FNc === 0, '漏杀 ' + FNc + ' 条：' + FN.map((x) => x.title).join(' | '));
check('精确率 = 100%', precision === 1, (precision * 100).toFixed(1) + '%');
check('召回率 = 100%', recall === 1, (recall * 100).toFixed(1) + '%');

console.log('\n=== ④ 子串边界用例（核心 bug：动工⊂推动、开工⊂召开）===');
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
