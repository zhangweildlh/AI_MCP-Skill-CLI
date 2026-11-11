#!/usr/bin/env node
/**
 * wechat-article-to-ima · state.js 回归测试（离线，零网络、零凭据）
 *
 * 覆盖 state.js 的全部子命令与强约束：
 *   validate / migrate / mark-ingested / mark-failed / mark-filtered
 *   set-attempts / reset-attempts / reset-card / update-card / report
 *   以及导出的 dedupKey() 去重键语义、classify-failure 裸 CLI 免 --progress（E-24）。
 *
 * 纪律：
 *   - 零第三方依赖，仅用 Node 内置模块；
 *   - 全程以子进程方式调用 state.js CLI（黑盒验证真实契约与退出码），不反向依赖仓库级入口；
 *   - 临时进度文件建于系统临时目录并在结束时自清理（§9.5）；
 *   - 无绝对路径、无网络、无随机、无时间依赖（确定性）。
 *
 * 运行：node tests/test_state.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const STATE_JS = path.join(SKILL_DIR, 'scripts', 'state.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

// ── 临时进度文件（自清理）──
const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-state-test-'));
const P = path.join(TMPDIR, '_progress.json');
function writeProgress(obj) { fs.writeFileSync(P, JSON.stringify(obj, null, 2), 'utf8'); }
function readProgress() { return JSON.parse(fs.readFileSync(P, 'utf8')); }
function state(cmd, args) {
  const r = spawnSync('node', [STATE_JS, '--progress', P, cmd, ...args], { encoding: 'utf-8' });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
function legacyProgress() {
  return {
    schema: '1.1',
    updatedAt: '2026-11-04T09:15:00.000Z',
    cards: {
      C: { name: '全域土地', folder_id: 'folder_7512041610809167', lastRun: '2026-11-04', nextDue: '2026-11-14', rotateIndex: 0, status: 'limited', nextRetryAt: '2026-11-05T01:00:00.000Z', attempts: 4, pendingKeywords: ['拆旧复垦'], note: '旧轮限流' },
    },
    articles: [
      { cardId: 'C', title: '旧条目已入库', status: 'ingested', ingested: true, filtered: false, gatePassed: true },
      { cardId: 'C', title: '旧条目闸门失败', status: 'gate_failed', ingested: false, filtered: false, gatePassed: false, reason: 'chars=287 <800' },
      { cardId: 'C', title: '旧条目被过滤', status: 'filtered', ingested: false, filtered: true, gatePassed: true, reason: '中标类（正文命中）' },
    ],
  };
}

console.log('=== ① migrate：旧 schema → 新 schema（幂等、卡级字段零改动）===');
writeProgress(legacyProgress());
let r = state('migrate', []);
check('migrate 退出码 0', r.code === 0, r.err);
check('migrate 输出声明新写入 3 条', /新写入 3 条/.test(r.err), r.err);
let p = readProgress();
check('卡级字段 lastRun/nextDue/attempts/status 保持不变',
  p.cards.C.lastRun === '2026-11-04' && p.cards.C.nextDue === '2026-11-14' && p.cards.C.attempts === 4 && p.cards.C.status === 'limited',
  JSON.stringify(p.cards.C));
check('卡级 pendingKeywords 与 note 保持不变',
  Array.isArray(p.cards.C.pendingKeywords) && p.cards.C.pendingKeywords[0] === '拆旧复垦' && p.cards.C.note === '旧轮限流',
  JSON.stringify(p.cards.C.pendingKeywords) + ' / ' + p.cards.C.note);
check('条目字段名已归一为 card（cardId 消失）',
  p.articles.every((a) => a.card === 'C' && a.cardId === undefined),
  JSON.stringify(p.articles.map((a) => a.card)));
const migrated = Object.fromEntries(p.articles.map((a) => [a.title, a]));
check('旧 ingested 条目 → ingestStatus=ingested/gateResult=pass',
  migrated['旧条目已入库'].ingestStatus === 'ingested' && migrated['旧条目已入库'].gateResult === 'pass',
  JSON.stringify(migrated['旧条目已入库']));
check('旧 gate_failed 条目 → gateResult=fail:* 且 ingestStatus=failed',
  /^fail:/.test(migrated['旧条目闸门失败'].gateResult) && migrated['旧条目闸门失败'].ingestStatus === 'failed',
  JSON.stringify(migrated['旧条目闸门失败']));
check('旧 filtered 条目 → filterResult=filtered:*',
  /^filtered:/.test(migrated['旧条目被过滤'].filterResult),
  JSON.stringify(migrated['旧条目被过滤']));
r = state('migrate', []);
check('migrate 幂等（二次执行新写入 0 条）', /新写入 0 条/.test(r.err), r.err);

console.log('\n=== ② validate：结构与一致性 ===');
r = state('validate', []);
check('迁移后 validate 通过', r.code === 0, r.err);
writeProgress({ schema: '1.1', updatedAt: '', cards: {}, articles: [{ card: 'A', title: 'x', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'fail:chars<800', ingestStatus: 'ingested' }] });
r = state('validate', []);
check('gate_failed 伪装 ingested → validate 拒绝', r.code !== 0 && /一致性违例/.test(r.err), r.err);
writeProgress({ schema: '1.1', updatedAt: '', cards: {}, articles: [{ card: 'A', title: 'x', fetchStatus: 'ok', filterResult: 'filtered:中标类', gateResult: 'pass', ingestStatus: 'ingested' }] });
r = state('validate', []);
check('filtered 与 ingested 并存 → validate 拒绝', r.code !== 0 && /一致性违例/.test(r.err), r.err);
writeProgress({ schema: '1.1', updatedAt: '', cards: {}, articles: [{ card: 'A', title: 'x', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'weird' }] });
r = state('validate', []);
check('非法 ingestStatus → validate 拒绝', r.code !== 0 && /ingestStatus 非法/.test(r.err), r.err);

console.log('\n=== ③ mark-filtered / mark-failed：写入与 report 口径 ===');
writeProgress({ schema: '1.1', updatedAt: '', cards: { A: { name: '总包', folder_id: 'f1', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0 } }, articles: [] });
r = state('mark-filtered', ['--card', 'A', '--title', '被过滤篇', '--reason', '中标类（正文命中）']);
check('mark-filtered 退出码 0', r.code === 0, r.err);
r = state('mark-failed', ['--card', 'A', '--title', '失败篇', '--reason', '抓取失败:timeout']);
check('mark-failed 退出码 0', r.code === 0, r.err);
r = state('report', []);
check('report 被过滤列 = 1（此前因无写入入口恒为 0）', /被过滤 : 1/.test(r.out), r.out);
check('report 失败列 = 1', /失败   : 1/.test(r.out), r.out);
p = readProgress();
check('被过滤条目 ingestStatus 保持 pending（不计入失败）',
  p.articles.find((a) => a.title === '被过滤篇').ingestStatus === 'pending',
  JSON.stringify(p.articles.find((a) => a.title === '被过滤篇')));

console.log('\n=== ④ mark-ingested：默认联机复核 + 强约束 ===');
r = state('mark-ingested', ['--card', 'A', '--title', '新篇', '--media-id', '123']);
check('缺 --ima-api/--kb-id → 默认复核拦截（退出码非 0）', r.code !== 0 && /默认要求联机复核/.test(r.err), r.err);
r = state('mark-ingested', ['--card', 'A', '--title', '新篇', '--media-id', '123', '--no-verify']);
check('--no-verify 可写入 ingested', r.code === 0 && /未联机复核/.test(r.err), r.err);
r = state('mark-ingested', ['--card', 'A', '--title', '被过滤篇', '--media-id', '123', '--no-verify']);
check('filtered 条目严禁标 ingested（强约束）', r.code !== 0 && /严禁.*标记为 ingested/.test(r.err), r.err);
r = state('mark-ingested', ['--card', 'A', '--title', '失败篇', '--media-id', '123', '--no-verify']);
check('failed 条目严禁标 ingested（强约束）', r.code !== 0 && /严禁.*标记为 ingested/.test(r.err), r.err);
r = state('mark-ingested', ['--card', 'A', '--title', '被过滤篇', '--media-id', '123', '--no-verify']);
check('重复尝试仍被拒（幂等拒绝而非静默放行）', r.code !== 0, r.err);

console.log('\n=== ⑤ update-card / set-attempts / reset-attempts ===');
r = state('update-card', ['--card', 'A', '--last-run', '2026-11-05', '--next-due', '2026-11-15', '--rotate-index', '1',
  '--status', 'antispider_partial', '--next-retry-at', '2026-11-06T02:00:00.000Z', '--note', '要点', '--pending-keywords', 'EPC,总包; 总承包EPC']);
check('update-card 退出码 0', r.code === 0, r.err);
p = readProgress();
const ca = p.cards.A;
check('update-card 写入全部卡级字段',
  ca.lastRun === '2026-11-05' && ca.nextDue === '2026-11-15' && ca.rotateIndex === 1
  && ca.status === 'antispider_partial' && ca.nextRetryAt === '2026-11-06T02:00:00.000Z' && ca.note === '要点',
  JSON.stringify(ca));
check('pendingKeywords 逗号/分号均可分隔且已去空白',
  JSON.stringify(ca.pendingKeywords) === JSON.stringify(['EPC', '总包', '总承包EPC']),
  JSON.stringify(ca.pendingKeywords));
r = state('set-attempts', ['--card', 'A', '--n', '3']);
check('set-attempts 写入', r.code === 0 && readProgress().cards.A.attempts === 3, r.err);
r = state('reset-attempts', ['--card', 'A']);
check('reset-attempts 归零', r.code === 0 && readProgress().cards.A.attempts === 0, r.err);

console.log('\n=== ⑥ reset-card：只清目标卡 ===');
writeProgress({
  schema: '1.1', updatedAt: '',
  cards: { A: { name: 'A', folder_id: 'fa', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0, searchedKeywords: ['k1', 'k2'], failureClass: 'permanent' },
    B: { name: 'B', folder_id: 'fb', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0, searchedKeywords: ['bk'], failureClass: 'transient' } },
  articles: [{ card: 'A', title: 'a1', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'ingested', note: '' },
    { card: 'B', title: 'b1', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'ingested', note: '' }],
});
r = state('reset-card', ['--card', 'A']);
p = readProgress();
check('reset-card 仅移除目标卡条目', r.code === 0 && p.articles.length === 1 && p.articles[0].card === 'B',
  r.err + ' | ' + JSON.stringify(p.articles.map((a) => a.card)));
// ★ 缺陷 B 回归：reset-card 须清空本卡 searchedKeywords / failureClass（否则强制全量重搜失效、旧失败类沿用）
check('★ reset-card 清空目标卡 searchedKeywords=[]（强制全量重搜）', Array.isArray(p.cards.A.searchedKeywords) && p.cards.A.searchedKeywords.length === 0,
  JSON.stringify(p.cards.A && p.cards.A.searchedKeywords));
check('★ reset-card 清空目标卡 failureClass=\'\'（解除旧失败类锁定）', p.cards.A.failureClass === '',
  JSON.stringify(p.cards.A && p.cards.A.failureClass));
check('reset-card 不影响他卡累积态（searchedKeywords/failureClass 不变）',
  JSON.stringify(p.cards.B.searchedKeywords) === JSON.stringify(['bk']) && p.cards.B.failureClass === 'transient',
  JSON.stringify(p.cards.B));
// ★ 审计 E-07 回归：reset-card 须把状态机归零，否则续跑守护误判「已完成」而跳过续跑
check('★ reset-card 把 status 归零为 pending（防旧 completed 误判）', p.cards.A.status === 'pending',
  String(p.cards.A.status));
check('★ reset-card 清旧 note/attempts/nextRetryAt/pendingKeywords',
  p.cards.A.note === '' && p.cards.A.attempts === 0 && !p.cards.A.nextRetryAt
  && Array.isArray(p.cards.A.pendingKeywords) && p.cards.A.pendingKeywords.length === 0,
  JSON.stringify(p.cards.A));

console.log('\n=== ⑦ dedupKey 去重键语义（服务端截断 30 字符）===');
const { dedupKey, TITLE_CAP, classifyReport, classifyFailure } = require(STATE_JS);
check('TITLE_CAP = 30', TITLE_CAP === 30, String(TITLE_CAP));
// ★ 审计 E-12 回归：classifyReport 须给出闭环标志，四栏齐全不再等于闭环
check('★ classifyReport 输出 closed 字段（无待办 → true）',
  classifyReport({ articles: [] }, null, {}).closed === true);
check('★ classifyReport 有 needs-fetch 待办 → closed=false',
  classifyReport({ articles: [{ card: 'A', title: 't', fetchStatus: 'needs-fetch', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'pending' }] }, null, {}).closed === false);
check('长标题取前 30 字符', dedupKey('A'.repeat(50)).length === 30, String(dedupKey('A'.repeat(50)).length));
check('库内截断形态（…）与原始标题同键',
  dedupKey('标题内容'.repeat(10)) === dedupKey('标题内容'.repeat(10) + '...'),
  dedupKey('标题内容'.repeat(10)) + ' vs ' + dedupKey('标题内容'.repeat(10) + '...'));
check('★ 恰 30 字标题：先剥截断标记再切片（否则键内含尾点而失配）',
  dedupKey('中'.repeat(30)) === dedupKey('中'.repeat(30) + '...'),
  dedupKey('中'.repeat(30)) + ' vs ' + dedupKey('中'.repeat(30) + '...'));
check('剥除 front-matter 污染前缀后与干净标题同键',
  dedupKey('title: "干净标题"') === dedupKey('干净标题'),
  dedupKey('title: "干净标题"') + ' vs ' + dedupKey('干净标题'));
check('忽略 .md 扩展名', dedupKey('某标题.md') === dedupKey('某标题'), dedupKey('某标题.md'));
check('忽略全半角与空格差异', dedupKey('某 标题！') === dedupKey('某标题'), dedupKey('某 标题！'));
check('不同标题不撞键', dedupKey('甲篇文章标题') !== dedupKey('乙篇文章标题'), '');

console.log('\n=== ⑧ report 增强四栏：逐条原因 + KB 复核 + 幽灵记录 ===');
writeProgress({
  schema: '1.1', updatedAt: '',
  cards: { A: { name: '总包', folder_id: 'fA', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0 } },
  articles: [
    { card: 'A', title: '真入库篇', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'ingested', note: 'media_id=M1' },
    { card: 'A', title: '幽灵篇', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'ingested', note: 'media_id=MG_host' },
    { card: 'A', title: '过滤篇', fetchStatus: 'ok', filterResult: 'filtered:中标类（正文命中）', gateResult: 'pass', ingestStatus: 'pending' },
    { card: 'A', title: '失败篇', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'fail:chars<800', ingestStatus: 'failed', note: '闸门未过' },
    { card: 'A', title: '待入篇', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'pending' },
  ],
});
const KB = [{ media_id: 'M1', title: '真入库篇.md' }, { media_id: 'M2', title: '别的篇' }];
const rep = classifyReport(readProgress(), KB, {});
check('KB 复核：应入库=3', rep.shouldIngest === 3, JSON.stringify(rep));
check('KB 复核：实入库(确认)=1', rep.confirmed === 1, JSON.stringify(rep));
check('KB 复核：被过滤=1', rep.filtered === 1, JSON.stringify(rep));
check('KB 复核：失败=1', rep.failed === 1, JSON.stringify(rep));
check('KB 复核：幽灵记录=1', rep.ghost === 1, JSON.stringify(rep));
check('KB 复核：待入库/卡死=1', rep.pending === 1, JSON.stringify(rep));
check('KB 复核：应入未入=2（幽灵1+待入1）', rep.shouldButNotIngested === 2, JSON.stringify(rep));
check('幽灵明细含「幽灵篇」', rep.ghostItems.some((g) => g.title === '幽灵篇'), JSON.stringify(rep.ghostItems));
check('被过滤明细原因非空', rep.filteredItems[0].reason.length > 0, JSON.stringify(rep.filteredItems));
check('失败明细原因非空（取自 note）', /闸门未过/.test(rep.failedItems[0].reason), JSON.stringify(rep.failedItems));

// 离线模式（无 KB）：幽灵检测不可用，实入库为声称值
const repOff = classifyReport(readProgress(), null, {});
check('离线：实入库=声称2（无幽灵检测）', repOff.confirmed === 2, JSON.stringify(repOff));
check('离线：kbVerified=false', repOff.kbVerified === false, JSON.stringify(repOff));

// CLI 路径：--kb-snapshot 离线/审计复核（无需真实 API）
const SNAP = path.join(TMPDIR, 'kb_snapshot.json');
fs.writeFileSync(SNAP, JSON.stringify(KB), 'utf8');
r = state('report', ['--kb-snapshot', SNAP]);
check('CLI --kb-snapshot 退出码 0', r.code === 0, r.err);
check('CLI 输出含 幽灵记录明细', /幽灵记录明细/.test(r.out), r.out);
check('CLI 输出含 应入库但未入库 : 2', /应入库但未入库】 : 2 篇/.test(r.out), r.out);
check('CLI 输出含 被过滤明细(1 篇)', /被过滤明细】\(1 篇\)/.test(r.out), r.out);
check('CLI 输出含 失败明细(1 篇)', /失败明细】\(1 篇\)/.test(r.out), r.out);

// CLI 离线模式（无 KB 参数）：告警提示
r = state('report', []);
check('CLI 离线 report 退出码 0', r.code === 0, r.err);
check('CLI 离线 report 提示未 KB 复核', /离线模式/.test(r.out), r.out);
check('CLI 离线 report 被过滤计数正确', /被过滤 : 1/.test(r.out), r.out);
check('★ E-12：report 输出显式闭环判定行（四栏齐全≠闭环）', /闭环判定/.test(r.out), r.out);

// CLI --card 过滤
r = state('report', ['--kb-snapshot', SNAP, '--card', 'B']);
check('CLI --card 过滤（无 B 卡条目）应入库=0', /应入库 : 0/.test(r.out), r.out);

console.log('\n=== ⑨ 续跑状态机：searchedKeywords 累积 / failureClass / diff-keywords / classify-failure ===');
writeProgress({ schema: '1.1', updatedAt: '', cards: { A: { name: '总包', folder_id: 'f1', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0, searchedKeywords: [], failureClass: '' } }, articles: [] });
r = state('update-card', ['--card', 'A', '--searched-keywords', 'EPC,总包; 总承包EPC']);
check('searchedKeywords 首次写入（逗号/分号分隔）', r.code === 0, r.err);
r = state('update-card', ['--card', 'A', '--searched-keywords', 'EPC, 城市更新']);
p = readProgress();
check('searchedKeywords 累积并集（EPC 重复被去重）', JSON.stringify(p.cards.A.searchedKeywords) === JSON.stringify(['EPC', '总包', '总承包EPC', '城市更新']), JSON.stringify(p.cards.A.searchedKeywords));
r = state('update-card', ['--card', 'A', '--clear-searched']);
p = readProgress();
check('clear-searched 清空已搜词集合', Array.isArray(p.cards.A.searchedKeywords) && p.cards.A.searchedKeywords.length === 0, JSON.stringify(p.cards.A.searchedKeywords));
r = state('update-card', ['--card', 'A', '--failure-class', 'permanent']);
p = readProgress();
check('failureClass=permanent 写入', p.cards.A.failureClass === 'permanent', JSON.stringify(p.cards.A.failureClass));
r = state('update-card', ['--card', 'A', '--failure-class', 'bogus']);
check('failureClass 非法值被拒', r.code !== 0, r.err);
r = state('update-card', ['--card', 'A', '--failure-class', '']);
p = readProgress();
check('failureClass 清空（空串）', p.cards.A.failureClass === '', JSON.stringify(p.cards.A.failureClass));
r = state('update-card', ['--card', 'A', '--searched-keywords', 'EPC;总包']);
r = state('diff-keywords', ['--card', 'A', '--keywords', 'EPC;总包;城市更新;海绵城市']);
check('diff-keywords 输出未搜词差集', r.out.trim().split('\n').filter(Boolean).join(',') === '城市更新,海绵城市', r.out);
r = state('diff-keywords', ['--card', 'A', '--keywords', 'EPC;总包;城市更新', '--json']);
let dj;
try { dj = JSON.parse(r.out); } catch (e) { dj = null; }
check('diff-keywords --json remaining/searched 正确', dj && dj.total === 3 && dj.searched === 2 && dj.remaining.length === 1 && dj.remaining[0] === '城市更新', r.out);
r = state('classify-failure', ['--reason', 'HTTP 401 未授权 api_key 无效']);
check('classify-failure 凭据失效 → permanent', r.out.trim() === 'permanent', r.out);
r = state('classify-failure', ['--reason', '平台限流，请稍后再试']);
check('classify-failure 限流 → transient', r.out.trim() === 'transient', r.out);
r = state('classify-failure', ['--reason', '某未知错误']);
check('classify-failure 未知 → unknown', r.out.trim() === 'unknown', r.out);
// 审计 E-24：classify-failure 是纯离线命令，SKILL.md 与引导词均声明「无需 --progress / --card」；
// 原实现因 main() 的 --progress 必填守卫而 exit=1。以下用裸 CLI（不带 --progress）锁定该契约。
const rawClassify = spawnSync('node', [STATE_JS, 'classify-failure', '--reason', '平台限流，请稍后再试'], { encoding: 'utf-8' });
check('★ E-24：classify-failure 不带 --progress 仍可执行（纯离线提前分流）',
  rawClassify.status === 0 && (rawClassify.stdout || '').trim() === 'transient',
  'code=' + rawClassify.status + ' out=' + (rawClassify.stdout || '').trim() + ' err=' + (rawClassify.stderr || '').trim().slice(0, 160));
check('classifyFailure(凭据) = permanent', classifyFailure('鉴权失败 client_id 无效') === 'permanent');
check('classifyFailure(网络) = transient', classifyFailure('econnreset 网络连接超时') === 'transient');
check('classifyFailure(未知) = unknown', classifyFailure('锅里的错误') === 'unknown');
writeProgress({ schema: '1.1', updatedAt: '', cards: { A: { name: 'A', folder_id: 'f', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0 } }, articles: [] });
r = state('validate', []);
check('validate 对缺 searchedKeywords/failureClass 的旧卡向后兼容（loadProgress 补齐）', r.code === 0, r.err);

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) {
  console.log('未通过明细：');
  failures.forEach((f) => console.log('  - ' + f));
}
// 自清理（§9.5）
try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch (_) { /* ignore */ }
process.exit(fail ? 1 : 0);
