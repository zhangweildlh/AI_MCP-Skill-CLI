#!/usr/bin/env node
/**
 * wechat-article-to-ima · pipeline.js 契约测试（离线，零网络、零凭据）
 *
 * 覆盖：
 *   ① 响应解析层 parseImaResponse（曾因未解析原始文本导致去重失效 → 重复入库，不可逆）
 *   ② 过滤分层语义 matchFilter（强/弱特征、正文层 ≥2 强特征、词边界）
 *   ③ 完整性闸门辅助判据 auxCriteria
 *   ④ 正文提取与 HTML→文本 htmlToText / extractContent / extractAuthor
 *   ⑤ 元数据头 buildMd（内联形态、禁 YAML front-matter、原文直链取解析后直链）
 *   ⑥ 文件名安全化 safeFile
 *   ⑦ CLI 契约（缺参即报错退出、--dry-run 不写盘）
 *
 * 纪律：零第三方依赖；不反向依赖仓库级入口；临时文件自清理（§9.5）；无绝对路径/网络/随机。
 * 运行：node tests/test_pipeline_contract.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const PIPE_JS = path.join(SKILL_DIR, 'scripts', 'pipeline.js');
const P = require(PIPE_JS);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

console.log('=== ① 响应解析层 parseImaResponse ===');
check('正常业务响应解析为对象', (() => {
  const j = P.parseImaResponse('openapi/x', JSON.stringify({ code: 0, data: { knowledge_list: [1, 2] } }));
  return j.data.knowledge_list.length === 2;
})());
check('★ 原始文本必须被解析（否则 data 恒 undefined → 去重失效）', (() => {
  const j = P.parseImaResponse('openapi/x', '{"code":0,"data":{"knowledge_list":[{"title":"t"}]}}');
  return Array.isArray(j.data.knowledge_list) && j.data.knowledge_list[0].title === 't';
})());
check('非 JSON 响应 → 抛错（不得静默当成功）', (() => {
  try { P.parseImaResponse('openapi/x', '<html>error</html>'); return false; } catch (e) { return /响应非 JSON/.test(e.message); }
})());
check('业务码非 0 → 抛错并带 imaCode', (() => {
  try { P.parseImaResponse('openapi/x', '{"code":310001,"msg":"文件夹不存在"}'); return false; }
  catch (e) { return e.imaCode === 310001 && /310001/.test(e.message) && /文件夹不存在/.test(e.message); }
})());
check('空响应 → 空对象（不抛错，由调用方按缺字段处理）', (() => {
  const j = P.parseImaResponse('openapi/x', ''); return j && typeof j === 'object';
})());

console.log('\n=== ② 过滤分层语义 matchFilter ===');
check('标题层：强特征「招标公告」命中', P.matchFilter('某项目招标公告', 'title') === '中标类');
check('正文层：单个强特征「中标公示」不拦截（避免顺带提及被误杀）', P.matchFilter('正文提到中标公示这件事', 'body') === null);
check('正文层：同族 ≥2 个强特征才拦截', P.matchFilter('中标公示 与 中标候选人 同时出现', 'body') === '中标类');
check('正文层：弱特征「评标办法和标准」不拦截（法规原文）', P.matchFilter('（二）评标办法和标准', 'body') === null);
check('标题层：弱特征须命中上下文模式（大力推广 不命中）', P.matchFilter('大力推广工程总承包', 'title') === null);
check('标题层：弱特征命中上下文模式则拦截', P.matchFilter('某广告推广合作', 'title') === '广告类');
check('子串边界：「推动」不触发「动工」', P.matchFilter('要推动工程总承包模式快速发展', 'title') === null);
check('子串边界：「召开」不触发「开工」', P.matchFilter('中建五局召开工程总承包管理推进会', 'title') === null);
check('子串边界：「新开工项目」不触发「开工」', P.matchFilter('新开工项目审批放缓', 'title') === null);
check('标题层：「项目开工」真命中被拦截', P.matchFilter('天辰总承包EPC项目开工', 'title') === '开工类');

console.log('\n=== ③ 完整性闸门辅助判据 auxCriteria ===');
check('段落数 ≥3 → 辅助判据满足', P.auxCriteria('<p>a</p><p>b</p><p>c</p>', 'a\n\nb\n\nc').met === true);
check('结构化列表 ≥2 → 辅助判据满足', P.auxCriteria('<ul><li>a</li><li>b</li></ul>', 'a\nb').met === true);
check('标题层级 ≥2 → 辅助判据满足', P.auxCriteria('<h2>一</h2><h3>二</h3>', '一\n二').met === true);
check('三者皆不满足 → 辅助判据不满足', P.auxCriteria('<p>短</p>', '短').met === false);

console.log('\n=== ④ 正文提取与 HTML→文本 ===');
check('extractContent 取 js_content', P.extractContent('<div id="js_content"><p>正文内容</p></div>').includes('正文内容'));
check('extractContent 无 js_content 时返回空串', P.extractContent('<div>无</div>') === '');
check('extractAuthor 取 js_author_name', P.extractAuthor('<span id="js_author_name">宋健</span>') === '宋健');
check('extractAuthor 缺失时返回「未知」', P.extractAuthor('<div></div>') === '未知');
check('htmlToText 保留段落分隔', P.htmlToText('<p>第一段</p><p>第二段</p>').includes('\n\n'));
check('htmlToText 还原常见实体', P.htmlToText('A&amp;B&nbsp;C') === 'A&B C');
check('htmlToText 丢弃 script 内容', !P.htmlToText('<script>var x=1;</script><p>正文</p>').includes('var x'));

console.log('\n=== ⑤ 元数据头 buildMd（内联形态，禁 YAML front-matter）===');
const md = P.buildMd(
  { title: '某标题', source: '某公众号', datetime: '2026-11-05 10:00:00', url: 'https://mp.weixin.qq.com/s?x=1' },
  { author: '某作者', html: '<p>正文第一行</p><p>正文第二行</p>' },
  '某标题');
check('首行为 H1 标题', md.split('\n')[0] === '# 某标题', md.split('\n')[0]);
check('含「来源：」', /\n来源：某公众号\n/.test(md));
check('含「发布时间：」', /\n发布时间：2026-11-05 10:00:00\n/.test(md));
check('含「作者：」', /\n作者：某作者\n/.test(md));
check('含「原文直链：」', /\n原文直链：https:\/\/mp\.weixin\.qq\.com\/s\?x=1\n/.test(md));
check('含「采集日期：」', /\n采集日期：\d{4}-\d{2}-\d{2}\n/.test(md));
check('★ 不含 YAML front-matter 标记（否则标题被 front-matter 污染）', !md.includes('---') && !/^title:/m.test(md));
check('★ 原文直链优先用解析后的真实直链', (() => {
  const m2 = P.buildMd({ title: 't', source: 's', datetime: 'd', url: 'https://weixin.sogou.com/link?url=x' },
    { author: 'a', html: '<p>b</p>' }, 't');
  return m2.includes('原文直链：https://weixin.sogou.com/link?url=x');
})(), '');

console.log('\n=== ⑥ 文件名安全化 safeFile ===');
check('替换非法字符', !/[\\/:*?"<>|]/.test(P.safeFile('a/b:c*d?e"f<g>h|i')), P.safeFile('a/b:c*d?e"f<g>h|i'));
check('压缩空白并截断长度', P.safeFile('a   b').includes('a b') && P.safeFile('x'.repeat(300)).length <= 120, String(P.safeFile('x'.repeat(300)).length));

console.log('\n=== ⑦ CLI 契约 ===');
function pipe(args) {
  const r = spawnSync('node', [PIPE_JS, ...args], { encoding: 'utf-8' });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
let r = pipe([]);
check('缺参数 → 退出码非 0 且打印用法', r.code !== 0 && /用法：node pipeline\.js/.test(r.err), r.err);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-pipe-test-'));
try {
  const searchFile = path.join(TMP, 's.json');
  fs.writeFileSync(searchFile, JSON.stringify({ query: 'q', total: 1, articles: [{ title: '某标题', url: 'https://mp.weixin.qq.com/s?x=1', source: 's', datetime: 'd' }] }), 'utf8');
  const progFile = path.join(TMP, '_progress.json');
  fs.writeFileSync(progFile, JSON.stringify({ schema: '1.1', updatedAt: '', cards: { A: { name: 'A', folder_id: 'f', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0 } }, articles: [] }), 'utf8');
  r = pipe(['--workspace', TMP, '--card', 'A', '--search', searchFile, '--dry-run']);
  check('--dry-run 正常退出', r.code === 0, r.err);
  check('★ --dry-run 不写进度文件（预演不得污染状态）', (() => {
    const p = JSON.parse(fs.readFileSync(progFile, 'utf8'));
    return Array.isArray(p.articles) && p.articles.length === 0 && p.updatedAt === '';
  })(), fs.readFileSync(progFile, 'utf8').slice(0, 200));
  check('★ --dry-run 不落盘 .md', fs.readdirSync(TMP).filter((f) => f.endsWith('.md')).length === 0, fs.readdirSync(TMP).join(','));
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log('\n=== ⑧ 隔离区补入判定 shouldReingest ===');
check('无进度记录 → 尝试重入（交入库流程判定）', P.shouldReingest('t', undefined) === true);
check('闸门未过（gateResult=fail:*）→ 跳过不重入（质量失败重入必再失败）', P.shouldReingest('t', { gateResult: 'fail:chars<800', ingestStatus: 'failed' }) === false);
check('闸门通过但入库失败 → 尝试重入（多为瞬态）', P.shouldReingest('t', { gateResult: 'pass', ingestStatus: 'failed' }) === true);
check('已入库 → 尝试重入（由 KB 去重兜底，不重复创建）', P.shouldReingest('t', { gateResult: 'pass', ingestStatus: 'ingested' }) === true);

console.log('\n=== ⑨ 隔离区跨卡污染防护（缺陷 C 回归）===');
// 桩 ima_api.cjs：get_knowledge_list 返回已入库条目（让 mark-ingested 联机复核通过），import/add 返回成功。
// 双模：既支持被 require 调用（pipeline 自身 imaCall），也支持被 spawn 调用（verifyMediaType11 / report 以 `node <stub> <apiPath> <body>` 方式调用，须向 stdout 输出 JSON）。
const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-ima-stub-'));
const stubApi = path.join(stubDir, 'ima_api.cjs');
fs.writeFileSync(stubApi, [
  'function imaApi(apiPath, body) {',
  "  if (String(apiPath).indexOf('get_knowledge_list') >= 0) {",
  "    return JSON.stringify({ code: 0, msg: 'ok', data: { knowledge_list: [{ media_id: 'm1', media_type: 11, title: '跨卡文章.md' }] } });",
  "  }",
  "  if (String(apiPath).indexOf('import_doc') >= 0) {",
  "    return JSON.stringify({ code: 0, msg: 'ok', data: { note_id: 'n1' } });",
  "  }",
  "  if (String(apiPath).indexOf('add_knowledge') >= 0) {",
  "    return JSON.stringify({ code: 0, msg: 'ok', data: { media_id: 'm1', knowledge_id: 'm1', id: 'm1' } });",
  "  }",
  "  return JSON.stringify({ code: 0, msg: 'ok', data: {} });",
  '}',
  'module.exports = { imaApi };',
  "if (require.main === module) { process.stdout.write(imaApi(process.argv[2] || '', process.argv[3] || '{}')); }",
  ''
].join('\n'), 'utf8');

const WS2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-quar-test-'));
try {
  const qDir = path.join(WS2, 'failed_quarantine');
  fs.mkdirSync(qDir, { recursive: true });
  // 卡 A 残留隔离文件（带卡前缀，模拟修复后写入形态）
  fs.writeFileSync(path.join(qDir, 'A__跨卡文章.md'), '# 跨卡文章\n\n来源：X\n\n正文...', 'utf8');
  // 旧式无前缀残留（模拟修复前遗留文件）
  fs.writeFileSync(path.join(qDir, '旧文.md'), '# 旧文\n\n来源：Y\n\n正文...', 'utf8');

  const progB = path.join(WS2, '_progress.json');
  fs.writeFileSync(progB, JSON.stringify({
    schema: '1.1', updatedAt: '',
    cards: {
      A: { name: 'A', folder_id: 'fa', status: 'pending', attempts: 0, searchedKeywords: [], failureClass: '' },
      B: { name: 'B', folder_id: 'fb', status: 'pending', attempts: 0, searchedKeywords: [], failureClass: '' }
    },
    articles: [
      // 卡 A 有该标题记录（failed），卡 B 无 → 卡 B 跑时应全部跳过
      { card: 'A', title: '跨卡文章', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'failed', note: '' }
    ]
  }), 'utf8');

  // 卡 B 跑隔离补入：本应跳过全部（跨卡残留带前缀 + 旧式无前缀无记录）
  const rB = spawnSync('node', [PIPE_JS, '--workspace', WS2, '--card', 'B', '--ingest-quarantine', '--kb-id', 'kb1', '--folder-id', 'f1'],
    { encoding: 'utf-8', env: Object.assign({}, process.env, { IMA_API_CJS: stubApi }) });
  check('★ 卡 B 跑隔离补入：退出码 0 且未误入', rB.status === 0, (rB.stderr || '').slice(0, 200));
  check('★ 跨卡残留文件 A__跨卡文章.md 未被删除（闸1 跨卡前缀防护生效）', fs.existsSync(path.join(qDir, 'A__跨卡文章.md')), '');
  check('★ 旧式无前缀残留 旧文.md 未被删除（闸2 无记录防护生效）', fs.existsSync(path.join(qDir, '旧文.md')), '');
  const pB = JSON.parse(fs.readFileSync(progB, 'utf8'));
  check('★ 卡 B 进度未被污染（articles 仍仅卡 A 1 条，卡 B 无新增 ingested）',
    pB.articles.length === 1 && pB.articles[0].card === 'A', JSON.stringify(pB.articles));
  check('★ 卡 B 跑隔离补入日志含跳过提示', /\[跳过\]/.test(rB.stdout || ''), (rB.stdout || '').slice(-300));

  // 卡 A 跑隔离补入：本应成功补入并移除本卡文件（证明同卡正向路径不被误伤）
  const rA = spawnSync('node', [PIPE_JS, '--workspace', WS2, '--card', 'A', '--ingest-quarantine', '--kb-id', 'kb1', '--folder-id', 'f1'],
    { encoding: 'utf-8', env: Object.assign({}, process.env, { IMA_API_CJS: stubApi }) });
  check('★ 卡 A 跑隔离补入：退出码 0', rA.status === 0, (rA.stderr || '').slice(0, 200));
  check('★ 卡 A 的隔离文件已补入并移除', !fs.existsSync(path.join(qDir, 'A__跨卡文章.md')), '');
  const pA = JSON.parse(fs.readFileSync(progB, 'utf8'));
  const aArticle = pA.articles.find((a) => a.card === 'A' && a.title === '跨卡文章');
  check('★ 卡 A 进度已标 ingested', !!aArticle && aArticle.ingestStatus === 'ingested', JSON.stringify(aArticle));
  check('★ 旧式无前缀孤立文件 旧文.md 仍不被误食（两卡跑完仍残留）', fs.existsSync(path.join(qDir, '旧文.md')), '');
} finally {
  try { fs.rmSync(WS2, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  try { fs.rmSync(stubDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) {
  console.log('未通过明细：');
  failures.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
