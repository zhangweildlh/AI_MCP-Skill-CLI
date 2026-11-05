#!/usr/bin/env node
/**
 * wechat-article-to-ima · state.js 回归测试（离线，零网络、零凭据）
 *
 * 覆盖 state.js 的全部子命令与强约束：
 *   validate / migrate / mark-ingested / mark-failed / mark-filtered
 *   set-attempts / reset-attempts / reset-card / update-card / report
 *   以及导出的 dedupKey() 去重键语义。
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
check('filtered 条目严禁标 ingested（强约束）', r.code !== 0 && /严禁标记为 ingested/.test(r.err), r.err);
r = state('mark-ingested', ['--card', 'A', '--title', '失败篇', '--media-id', '123', '--no-verify']);
check('failed 条目严禁标 ingested（强约束）', r.code !== 0 && /严禁标记为 ingested/.test(r.err), r.err);
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
  cards: { A: { name: 'A', folder_id: 'fa', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0 },
    B: { name: 'B', folder_id: 'fb', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0 } },
  articles: [{ card: 'A', title: 'a1', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'ingested', note: '' },
    { card: 'B', title: 'b1', fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'ingested', note: '' }],
});
r = state('reset-card', ['--card', 'A']);
p = readProgress();
check('reset-card 仅移除目标卡条目', r.code === 0 && p.articles.length === 1 && p.articles[0].card === 'B',
  r.err + ' | ' + JSON.stringify(p.articles.map((a) => a.card)));

console.log('\n=== ⑦ dedupKey 去重键语义（服务端截断 30 字符）===');
const { dedupKey, TITLE_CAP } = require(STATE_JS);
check('TITLE_CAP = 30', TITLE_CAP === 30, String(TITLE_CAP));
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

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) {
  console.log('未通过明细：');
  failures.forEach((f) => console.log('  - ' + f));
}
// 自清理（§9.5）
try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch (_) { /* ignore */ }
process.exit(fail ? 1 : 0);
