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
 *   ⑦ CLI 契约（缺参即报错退出、--dry-run 不写盘、--ingest-pending 合法模式）
 *   ⑪ 引导词.md 契约覆盖（4 套章节级自含 / 共享区下沉 / 零跨段引用 / 命令参数白名单 / E-23·E-24 端到端实跑）
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
function pipe(args, extraEnv) {
  const r = spawnSync('node', [PIPE_JS, ...args], Object.assign({ encoding: 'utf-8' }, extraEnv ? { env: Object.assign({}, process.env, extraEnv) } : {}));
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
let r = pipe([]);
check('缺参数 → 退出码非 0 且打印用法', r.code !== 0 && /用法：node pipeline\.js/.test(r.err), r.err);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-pipe-test-'));
try {
  const searchFile = path.join(TMP, 's.json');
  fs.writeFileSync(searchFile, JSON.stringify({ query: 'q', total: 1, articles: [{ title: '某标题', url: 'https://mp.weixin.qq.com/s?x=1', source: 's', datetime: 'd' }] }), 'utf8');
  const progFile = path.join(TMP, '_progress_A.json');
  fs.writeFileSync(progFile, JSON.stringify({ schema: '1.1', updatedAt: '', cards: { A: { name: 'A', folder_id: 'f', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0 } }, articles: [] }), 'utf8');
  r = pipe(['--workspace', TMP, '--card', 'A', '--search', searchFile, '--dry-run']);
  check('--dry-run 正常退出', r.code === 0, r.err);
  check('★ --dry-run 不写进度文件（预演不得污染状态）', (() => {
    const p = JSON.parse(fs.readFileSync(progFile, 'utf8'));
    return Array.isArray(p.articles) && p.articles.length === 0 && p.updatedAt === '';
  })(), fs.readFileSync(progFile, 'utf8').slice(0, 200));
  check('★ --dry-run 不落盘 .md', fs.readdirSync(TMP).filter((f) => f.endsWith('.md')).length === 0, fs.readdirSync(TMP).join(','));

  // 审计 E-23：--ingest-pending 曾被参数守卫误拦（守卫只认 --search / --ingest-quarantine），
  // 使引导词中的 handback 回收命令 exit=1 只打印用法。双层判据：源码级确定性 + CLI 行为级。
  const guardSrc = fs.readFileSync(PIPE_JS, 'utf8');
  check('★ E-23：参数守卫纳入 opt.ingestPending（源码级确定性判据）',
    /if \(!opt\.search && !opt\.ingestPending && !opt\.ingestQuarantine\)/.test(guardSrc));
  const stubApiE23 = path.join(TMP, 'ima_api_stub.cjs');
  fs.writeFileSync(stubApiE23, 'module.exports = { imaApi: function () { return "{}"; } };\n', 'utf8');
  r = pipe(['--workspace', TMP, '--card', 'A', '--ingest-pending', '--kb-id', 'K', '--folder-id', 'F'],
    { IMA_API_CJS: stubApiE23 });
  check('★ E-23：--ingest-pending 不再被参数守卫拒绝（进入 handback 消费分支）',
    r.code === 0 && !/用法：node pipeline\.js/.test(r.err) && /=== 消费 Agent 编排 handback/.test(r.out),
    'code=' + r.code + ' err=' + r.err.slice(0, 160) + ' out=' + r.out.slice(0, 160));
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log('\n=== ⑧ 隔离区补入判定 shouldReingest ===');
check('无进度记录 → 尝试重入（交入库流程判定）', P.shouldReingest('t', undefined) === true);
check('闸门未过（gateResult=fail:*）→ 跳过不重入（质量失败重入必再失败）', P.shouldReingest('t', { gateResult: 'fail:chars<800', ingestStatus: 'failed' }) === false);
check('闸门通过但入库失败 → 尝试重入（多为瞬态）', P.shouldReingest('t', { gateResult: 'pass', ingestStatus: 'failed' }) === true);
check('已入库 → 尝试重入（由 KB 去重兜底，不重复创建）', P.shouldReingest('t', { gateResult: 'pass', ingestStatus: 'ingested' }) === true);

console.log('\n=== ⑧b 错误页 / handback 验收（审计 E-17、E-22 回归）===');
const ANTI = 'IP：195.64.119.200\n\n访问时间：2026.11.11 13:11:26\n\nVerifyCode：aefc5810eff3\n\nFrom：weixin.sogou.com\n\n此验证码用于确认这些请求是您的正常行为而不是自动程序发出的，需要您协助验证。\n\n验证码：\n\n![](https://weixin.sogou.com/antispider/?from=x)\n\n提交提交后没解决问题？欢迎反馈。\n\n搜狗搜索';
check('反爬验证码页 → looksLikeErrorPage=true', P.looksLikeErrorPage(ANTI) === true);
check('正常长正文 → looksLikeErrorPage=false', P.looksLikeErrorPage('# 标题\n\n' + '正文内容。'.repeat(300)) === false);
check('★ evaluateGate 对反爬页 pass=false（原闸门会因段落数放行）', (() => {
  const g = P.evaluateGate(ANTI, '');
  return g.pass === false && /error_page/.test(g.reason);
})());
check('★ validateHandback 拒收反爬验证码页', P.validateHandback(ANTI).ok === false);
check('★ validateHandback 拒收仅含搜狗中转链接的回交',
  P.validateHandback('# 标题\n\n原文直链：https://weixin.sogou.com/link?url=x\n\n正文').ok === false);
check('★ validateHandback 拒收缺 # 标题的回交',
  P.validateHandback('正文第一段。\n\n正文第二段。').ok === false);
check('★ validateHandback 接纳合规 handback',
  P.validateHandback('# 文章标题\n\n来源：某公众号\n发布时间：2026-11-11\n作者：某\n原文直链：https://mp.weixin.qq.com/s?x=1\n采集日期：2026-11-11\n\n' + '正文。'.repeat(300)).ok === true);
// E-22 源码级确定性门禁：入库成功分支不得再引用未定义的 chars/periods
const PIPE_SRC = fs.readFileSync(PIPE_JS, 'utf8');
// 判据须精确命中「入库成功日志」这一处，不能用全文裸字符串判据：
// evaluateGate 内部的 `chars=${chars}` 是合法引用（chars 定义在该函数作用域内），全文匹配会误伤。
check('★ E-22：入库成功日志改用 gate.chars / gate.periods（正向判据）',
  /chars=\$\{gate\.chars\}/.test(PIPE_SRC) && /periods=\$\{gate\.periods\}/.test(PIPE_SRC));
check('★ E-22：入库成功日志不得残留裸 chars 引用',
  !/\| chars=\$\{chars\}/.test(PIPE_SRC));

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

  // 文件名隔离：每卡独立进度文件（_progress_<card>.json）。卡 A 含待补入记录，卡 B 为空（无任何条目）。
  const progA = path.join(WS2, '_progress_A.json');
  fs.writeFileSync(progA, JSON.stringify({
    schema: '1.1', updatedAt: '',
    cards: { A: { name: 'A', folder_id: 'fa', status: 'pending', attempts: 0, searchedKeywords: [], failureClass: '' } },
    articles: [
      // 卡 A 有该标题记录（failed）→ 卡 A 跑时应成功补入
      { card: 'A', title: '跨卡文章', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'failed', note: '' }
    ]
  }), 'utf8');
  const progB = path.join(WS2, '_progress_B.json');
  fs.writeFileSync(progB, JSON.stringify({
    schema: '1.1', updatedAt: '',
    cards: { B: { name: 'B', folder_id: 'fb', status: 'pending', attempts: 0, searchedKeywords: [], failureClass: '' } },
    articles: []  // 卡 B 无任何条目 → 卡 B 跑时应全部跳过（跨卡残留 + 孤立文件）
  }), 'utf8');

  // 卡 B 跑隔离补入：本应跳过全部（跨卡残留带前缀 + 旧式无前缀无记录）
  const rB = spawnSync('node', [PIPE_JS, '--workspace', WS2, '--card', 'B', '--ingest-quarantine', '--kb-id', 'kb1', '--folder-id', 'f1'],
    { encoding: 'utf-8', env: Object.assign({}, process.env, { IMA_API_CJS: stubApi }) });
  check('★ 卡 B 跑隔离补入：退出码 0 且未误入', rB.status === 0, (rB.stderr || '').slice(0, 200));
  check('★ 跨卡残留文件 A__跨卡文章.md 未被删除（闸1 跨卡前缀防护生效）', fs.existsSync(path.join(qDir, 'A__跨卡文章.md')), '');
  check('★ 旧式无前缀残留 旧文.md 未被删除（闸2 无记录防护生效）', fs.existsSync(path.join(qDir, '旧文.md')), '');
  const pB = JSON.parse(fs.readFileSync(progB, 'utf8'));
  check('★ 卡 B 进度未被污染（_progress_B.json 无任何 articles）',
    pB.articles.length === 0, JSON.stringify(pB.articles));
  const pApre = JSON.parse(fs.readFileSync(progA, 'utf8'));
  check('★ 卡 A 进度文件未被卡 B 跑污染（仍仅含卡 A 记录）',
    pApre.articles.length === 1 && pApre.articles[0].card === 'A', JSON.stringify(pApre.articles));
  check('★ 卡 B 跑隔离补入日志含跳过提示', /\[跳过\]/.test(rB.stdout || ''), (rB.stdout || '').slice(-300));

  // 卡 A 跑隔离补入：本应成功补入并移除本卡文件（证明同卡正向路径不被误伤）
  const rA = spawnSync('node', [PIPE_JS, '--workspace', WS2, '--card', 'A', '--ingest-quarantine', '--kb-id', 'kb1', '--folder-id', 'f1'],
    { encoding: 'utf-8', env: Object.assign({}, process.env, { IMA_API_CJS: stubApi }) });
  check('★ 卡 A 跑隔离补入：退出码 0', rA.status === 0, (rA.stderr || '').slice(0, 200));
  check('★ 卡 A 的隔离文件已补入并移除', !fs.existsSync(path.join(qDir, 'A__跨卡文章.md')), '');
  const pA = JSON.parse(fs.readFileSync(progA, 'utf8'));
  const aArticle = pA.articles.find((a) => a.card === 'A' && a.title === '跨卡文章');
  check('★ 卡 A 进度已标 ingested', !!aArticle && aArticle.ingestStatus === 'ingested', JSON.stringify(aArticle));
  check('★ 旧式无前缀孤立文件 旧文.md 仍不被误食（两卡跑完仍残留）', fs.existsSync(path.join(qDir, '旧文.md')), '');
} finally {
  try { fs.rmSync(WS2, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  try { fs.rmSync(stubDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log('\n=== ⑩ 隔离区残差消费不依赖 status（G4 回归：搜索完成但入库失败残留）===');
// 桩 ima_api.cjs（同 ⑨ 双模）：get_knowledge_list 返回与残留标题不同的条目，迫使走 import→add→verify→mark-ingested 正向路径。
const stubDirG4 = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-ima-stub-g4-'));
const stubApiG4 = path.join(stubDirG4, 'ima_api.cjs');
fs.writeFileSync(stubApiG4, [
  'function imaApi(apiPath, body) {',
  "  if (String(apiPath).indexOf('get_knowledge_list') >= 0) {",
  "    return JSON.stringify({ code: 0, msg: 'ok', data: { knowledge_list: [{ media_id: 'm1', media_type: 11, title: '其他文章.md' }] } });",
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

const WS3 = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-quar-g4-'));
try {
  const qDir3 = path.join(WS3, 'failed_quarantine');
  fs.mkdirSync(qDir3, { recursive: true });
  // 卡 X 的历史入库失败残留（带卡前缀），标题与进度条目一致
  fs.writeFileSync(path.join(qDir3, 'X__我的文章.md'), '# 我的文章\n\n来源：Z\n\n正文...', 'utf8');

  const progX = path.join(WS3, '_progress_X.json');
  // status=completed 模拟「搜索已完成」但入库失败残留仍待补入；证明残差检测不依赖 status（守护须结合隔离区残差判定）
  fs.writeFileSync(progX, JSON.stringify({
    schema: '1.1', updatedAt: '',
    cards: { X: { name: 'X', folder_id: 'fx', status: 'completed', attempts: 0, searchedKeywords: [], failureClass: '' } },
    articles: [
      { card: 'X', title: '我的文章', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'failed', note: '' }
    ]
  }), 'utf8');

  const rX = spawnSync('node', [PIPE_JS, '--workspace', WS3, '--card', 'X', '--ingest-quarantine', '--kb-id', 'kb1', '--folder-id', 'f1'],
    { encoding: 'utf-8', env: Object.assign({}, process.env, { IMA_API_CJS: stubApiG4 }) });
  check('★ ⑩ 卡 X 隔离区残差：退出码 0', rX.status === 0, (rX.stderr || '').slice(0, 200));
  check('★ ⑩ 卡 X 的 X__我的文章.md 被消费并移除（残差不依赖 status）', !fs.existsSync(path.join(qDir3, 'X__我的文章.md')), '');
  const pX = JSON.parse(fs.readFileSync(progX, 'utf8'));
  const xArt = pX.articles.find((a) => a.card === 'X' && a.title === '我的文章');
  check('★ ⑩ 卡 X 进度条目已翻正为 ingested', !!xArt && xArt.ingestStatus === 'ingested', JSON.stringify(xArt));
  check('★ ⑩ 日志含补入成功提示', /\[补入\]|✅/.test(rX.stdout || ''), (rX.stdout || '').slice(-200));
} finally {
  try { fs.rmSync(WS3, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  try { fs.rmSync(stubDirG4, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log('\n=== ⑪ 引导词.md 契约覆盖（E-23/E-24 防漂移；此前两层测试零读取此文件）===');
// 背景：四套引导词是「调度方直接复制执行的命令清单」，但仓库级 scripts/smoke/ 与本技能 tests/
// 此前都未读过 引导词.md，导致「文档写着能跑、实跑 exit=1」的 E-23（--ingest-pending 被守卫拒绝）
// 与 E-24（classify-failure 被 --progress 必填拦住）长期无人察觉。本章节把引导词当契约来测。
const GUIDE_MD = path.join(SKILL_DIR, '引导词.md');
const GUIDE = fs.readFileSync(GUIDE_MD, 'utf8');
check('★ 引导词.md 存在且非空（此前零测试读取）', GUIDE.length > 1000, String(GUIDE.length));
check('★ 引导词.md 纯 LF', !GUIDE.includes('\r'));

const parts = GUIDE.split(/^## 引导词 /m).slice(1);
check('★ 恰含 4 套引导词（A / B / C / 续跑守护）', parts.length === 4, String(parts.length));
if (parts.length === 4) {
  check('★ 4 套标题顺序正确',
    /^A /.test(parts[0]) && /^B /.test(parts[1]) && /^C /.test(parts[2]) && /^续跑守护/.test(parts[3]),
    parts.map((p) => p.split('\n')[0]).join(' | '));
}
['A', 'B', 'C'].forEach((card, i) => {
  const seg = parts[i] || '';
  check(`★ 引导词 ${card} 自含 --card ${card} 与 _progress_${card}.json`,
    seg.includes(`--card ${card}`) && seg.includes(`_progress_${card}.json`));
  check(`★ 引导词 ${card} 用 folder_name 且无硬编码 folder_id`,
    /folder_name=/.test(seg) && !/folder_[0-9]{6,}/.test(seg));
  check(`★ 引导词 ${card} 含 --ingest-pending / --ingest-quarantine 两条回收命令`,
    seg.includes('--ingest-pending') && seg.includes('--ingest-quarantine'));
  check(`★ 引导词 ${card} 收尾 completed / partial 二选一`,
    seg.includes('--status completed') && seg.includes('--status partial'));
  check(`★ 引导词 ${card} 闭环判据含第五栏 + 两类残留 + 两词簇`,
    seg.includes('移交Agent编排') && seg.includes('闭环判定') &&
    seg.includes('pending_fetch/') && seg.includes('failed_quarantine/') && seg.includes('两词簇'));
});
const GUARD = parts[3] || '';
check('★ 续跑守护禁用 reset-card 且用 diff-keywords 取差集',
  GUARD.includes('不调用 `reset-card`') && !GUARD.includes('reset-card --card') && GUARD.includes('diff-keywords'));

// —— 章节级自含判据 ——
// 原实现用 GUIDE.includes() 全文全局断言：只要任意一套或共享区出现某符号即判通过，
// 结构上检不出「某一套缺失符号定义」。共享前置区清零后必须改成逐套断言。
const SELF_CONTAINED = [
  '唯一权威', '单段自含', '可独立复制粘贴',
  '已加载本技能', 'knowledge_base_id=ima_kb_QFSIbCma',
  '唯一事实源分工', '以 `SKILL.md` 为唯一事实源', '不复述',
  '`[WS]` =', '`[SKILL]` =', '`[FID]` =',
  '不依赖当前工作目录', '禁止硬编码 `folder_id`',
  '禁止伪造 completed', '四栏齐全 ≠ 闭环', '须另核',
];
parts.forEach((seg, i) => {
  const miss = SELF_CONTAINED.filter((x) => !seg.includes(x));
  check(`★ 第 ${i + 1} 套自含共享区 ${SELF_CONTAINED.length} 项必要内容（零跨段取值）`,
    miss.length === 0, miss.slice(0, 3).join(' ; '));
});
check('★ 顶部共享区已清零：无「路径约定（四套通用）」/「四套同构」',
  !GUIDE.includes('路径约定（四套通用）') && !GUIDE.includes('四套通用') && !GUIDE.includes('四套同构'));
const PREAMBLE = GUIDE.split(/^## 引导词 /m)[0];
check('★ 顶部不再承载任何符号定义 / 调用契约',
  !['`[WS]` =', '`[SKILL]` =', '`[FID]` =', 'resolve-folder', 'reset-card'].some((x) => PREAMBLE.includes(x)));
const CROSS_REF = ['见上方', '见共享区', '按「路径约定', '路径约定（四套通用）', '四套通用',
  '四套同构', '顶部', '上节', '如前所述', '参见本文件', '见第 3 行', '共享区'];
parts.forEach((seg, i) => {
  const hit = CROSS_REF.filter((x) => seg.includes(x));
  check(`★ 第 ${i + 1} 套零跨段引用（复制单段后无外部指向）`, hit.length === 0, hit.join(' ; '));
});
const IMPL_DETAIL = ['cool_down_seconds', 'min_chars', 'min_periods', 'import_doc', 'add_knowledge',
  'NEEDS_FETCH', 'listAllKb', 'get_knowledge_list', 'matchFilter', 'dedupKey', 'js_content', 'media_type'];
parts.forEach((seg, i) => {
  const hit = IMPL_DETAIL.filter((x) => seg.includes(x));
  check(`★ 第 ${i + 1} 套不复述 SKILL.md 实现细节`, hit.length === 0, hit.join(' ; '));
});
parts.forEach((seg, i) => {
  check(`★ 第 ${i + 1} 套无硬编码 folder_id`, !/folder_[0-9]{6,}/.test(seg));
});
const FOLDER_NAME = ['工程总承包EPC', '城市更新', '全域土地和生态修复'];
['A', 'B', 'C'].forEach((card, i) => {
  const seg = parts[i] || '';
  check(`★ 引导词 ${card} 的 resolve-folder --name 与 folder_name 一致`,
    seg.includes(`resolve-folder --name "${FOLDER_NAME[i]}"`) && seg.includes(`folder_name=${FOLDER_NAME[i]}`));
});

// 命令参数契约：从脚本 parseArgs 源码抽白名单，逐条比对引导词里的命令行（确定性静态判据）
const CMD_RE = /`(node "\[SKILL\]\/scripts\/[^`]+)`/g;
const CMDS = [...GUIDE.matchAll(CMD_RE)].map((m) => m[1]);
check('★ 判据自身有效：抽取到 >= 30 条可执行 node 命令（防 CMD_RE 失效）', CMDS.length >= 30, String(CMDS.length));
parts.forEach((seg, i) => {
  const n = [...seg.matchAll(CMD_RE)].length;
  check(`★ 第 ${i + 1} 套单段命令数 >= 8（切断全文后仍可独立执行）`, n >= 8, String(n));
});
function allowedFlags(rel) {
  const src = fs.readFileSync(path.join(SKILL_DIR, 'scripts', rel), 'utf8');
  const set = new Set(); const re = /a\s*===\s*'--([a-z-]+)'/g; let m;
  while ((m = re.exec(src))) set.add('--' + m[1]);
  return set;
}
const FLAGS = { pipeline: allowedFlags('pipeline.js'), state: allowedFlags('state.js'), deps: allowedFlags('check-deps.js') };
check('★ 白名单判据自身有效（三脚本参数均已解析）',
  FLAGS.pipeline.size >= 8 && FLAGS.state.size >= 15 && FLAGS.deps.size >= 3,
  `pipeline=${FLAGS.pipeline.size} state=${FLAGS.state.size} deps=${FLAGS.deps.size}`);
function tokenize(cmd) {
  const out = []; let cur = '', q = null;
  for (const ch of cmd) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const BAD_FLAGS = [];
for (const cmd of CMDS) {
  const t = tokenize(cmd); const s = t[1] || '';
  const f = s.includes('pipeline.js') ? FLAGS.pipeline : s.includes('state.js') ? FLAGS.state : s.includes('check-deps.js') ? FLAGS.deps : null;
  if (!f) { BAD_FLAGS.push('未知脚本 ' + s); continue; }
  for (let i = 2; i < t.length; i++) if (t[i].startsWith('--') && !f.has(t[i])) BAD_FLAGS.push(t[i] + ' @ ' + cmd.slice(0, 50));
}
check('★ 引导词全部命令参数均在脚本 parseArgs 白名单内（零错误参数）',
  BAD_FLAGS.length === 0, BAD_FLAGS.slice(0, 3).join(' ; '));
const PIPE_CMDS = CMDS.filter((c) => c.includes('pipeline.js'));
check('★ 每条 pipeline.js 命令都带 --workspace/--card/--kb-id/--folder-id',
  PIPE_CMDS.length >= 8 && PIPE_CMDS.every((c) => ['--workspace', '--card', '--kb-id', '--folder-id'].every((x) => c.includes(x))),
  String(PIPE_CMDS.length));
const RECYCLE = CMDS.filter((c) => c.includes('--ingest-pending') || c.includes('--ingest-quarantine'));
check('★ handback / 隔离区回收命令全部带 --card',
  RECYCLE.length >= 8 && RECYCLE.every((c) => c.includes('--card')), String(RECYCLE.length));
const CF = CMDS.filter((c) => c.includes('classify-failure'));
check('★ classify-failure 纯离线：不带 --progress / --card（E-24 静态判据）',
  CF.length === 1 && !CF[0].includes('--progress') && !CF[0].includes('--card'));
const RESET = CMDS.filter((c) => c.includes('reset-card'));
check('★ reset-card 仅 3 套全量采集使用（续跑守护零调用）', RESET.length === 3, String(RESET.length));

// 端到端行为判据：把引导词里的命令实例化后真跑，锁死「文档写着能跑」这件事
function instantiate(cmd, ws) {
  return cmd.replace(/\[SKILL\]/g, SKILL_DIR).replace(/\[WS\]/g, ws)
    .replace(/\[FID\]/g, 'folder_test').replace(/"<失败原因>"/g, '"平台限流，请稍后再试"');
}
const TMPG = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-guide-'));
const STUBG = path.join(TMPG, 'ima_api_stub.cjs');
fs.writeFileSync(STUBG, 'module.exports = { imaApi: function () { return "{}"; } };\n', 'utf8');
try {
  const pend = CMDS.find((c) => c.includes('--ingest-pending') && c.includes('--card A'));
  const rp = pend ? spawnSync('node', tokenize(instantiate(pend, TMPG)).slice(1),
    { encoding: 'utf-8', env: Object.assign({}, process.env, { IMA_API_CJS: STUBG }) }) : { status: -1, stdout: '', stderr: '未找到命令' };
  check('★ E-23 端到端：引导词里的 --ingest-pending 命令实跑不再被守卫拒绝',
    rp.status === 0 && !/用法：node pipeline\.js/.test(rp.stderr || '') && /=== 消费 Agent 编排 handback/.test(rp.stdout || ''),
    'code=' + rp.status + ' err=' + String(rp.stderr || '').slice(0, 160));
  const cfCmd = CF[0];
  const rc = cfCmd ? spawnSync('node', tokenize(instantiate(cfCmd, TMPG)).slice(1), { encoding: 'utf-8' })
    : { status: -1, stdout: '', stderr: '未找到命令' };
  check('★ E-24 端到端：引导词里的 classify-failure 免 --progress 实跑输出 transient',
    rc.status === 0 && String(rc.stdout || '').trim() === 'transient',
    'code=' + rc.status + ' out=' + String(rc.stdout || '').trim() + ' err=' + String(rc.stderr || '').slice(0, 160));
} finally {
  try { fs.rmSync(TMPG, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) {
  console.log('未通过明细：');
  failures.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
