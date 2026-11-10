#!/usr/bin/env node
/**
 * wechat-article-to-ima · 并发锁 / 文件名隔离 回归测试（离线，零网络、零凭据）
 *
 * 验证 R7/R8 落地后的两类关键不变量：
 *   ① 文件锁 + 原子写：即使多个 state.js 进程并发写同一卡进度文件（_progress_<card>.json），
 *      最终文件始终为合法 JSON、无半截写损坏，且每个成功写入恰好落盘一次（无 lost update）。
 *   ② 文件名隔离：并发写 A 卡与 B 卡进度文件互不干扰、互不跨卡污染。
 *
 * 机制说明：state.js 以 _progress_<card>.json.lock（wx 互斥）串行化同卡写；
 *   并发争用者因拿不到锁而退出非 0（快速失败，而非覆盖）。本测试据此断言最终一致性。
 *
 * 纪律：零第三方依赖；临时文件建于系统临时目录并自清理（§9.5）；无绝对业务路径。
 * 运行：node tests/test_concurrent_lock.js
 */

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const STATE_JS = path.join(SKILL_DIR, 'scripts', 'state.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-lock-test-'));
const PA = path.join(TMP, '_progress_A.json');
const PB = path.join(TMP, '_process_B.json');

function seed(P, card, titles) {
  const articles = titles.map((t) => ({ card, title: t, fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'pending', note: '' }));
  const cards = {};
  cards[card] = { name: card, folder_id: 'f', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0, searchedKeywords: [], failureClass: '' };
  fs.writeFileSync(P, JSON.stringify({ schema: '1.1', updatedAt: '', cards, articles }, null, 2) + '\n', 'utf8');
}

// 真正并发（非阻塞 spawn）执行 state.js，返回 Promise 收集退出码
function runAsync(P, args) {
  return new Promise((resolve) => {
    const cp = spawn('node', [STATE_JS, '--progress', P, ...args], { stdio: 'ignore' });
    cp.on('close', (code) => resolve(code === 0));
    cp.on('error', () => resolve(false));
  });
}

console.log('=== ① 并发写同卡 A + 并发写 B：文件始终合法 + 无跨卡污染 ===');
seed(PA, 'A', ['A初始1', 'A初始2']);
seed(PB, 'B', ['B初始1']);

const N = 12;
const procs = [];
const aSuccessCodes = [];
for (let i = 0; i < N; i++) procs.push(runAsync(PA, ['mark-filtered', '--card', 'A', '--title', 'A并发' + i, '--reason', 'x']));
const bSuccessCodes = [];
for (let i = 0; i < N; i++) procs.push(runAsync(PB, ['mark-filtered', '--card', 'B', '--title', 'B并发' + i, '--reason', 'x']));

Promise.all(procs).then((codes) => {
  const aCodes = codes.slice(0, N);
  const bCodes = codes.slice(N);
  const aOk = aCodes.filter(Boolean).length;
  const bOk = bCodes.filter(Boolean).length;

  let pA = null, pB = null;
  try { pA = JSON.parse(fs.readFileSync(PA, 'utf8')); } catch (e) { /* 解析失败 */ }
  try { pB = JSON.parse(fs.readFileSync(PB, 'utf8')); } catch (e) { /* 解析失败 */ }

  check('①-A 并发写后 A 文件仍为合法 JSON（无半截写/损坏）', pA !== null, pA === null ? '解析失败' : '');
  check('①-B 并发写后 B 文件仍为合法 JSON', pB !== null, pB === null ? '解析失败' : '');
  check('② A 卡全部条目 card=A（无 B 污染）', pA && pA.articles.every((a) => a.card === 'A'), JSON.stringify(pA && pA.articles.map((a) => a.card)));
  check('③ B 卡全部条目 card=B（无 A 污染）', pB && pB.articles.every((a) => a.card === 'B'), JSON.stringify(pB && pB.articles.map((a) => a.card)));
  // 关键不变量：每个成功写入恰好落盘一次，无 lost update / 无重复写入
  check('④ A 文件条数 == 初始2 + 成功写入数（无丢失/无重复）',
    pA && pA.articles.length === 2 + aOk,
    '实际=' + (pA && pA.articles.length) + ' 期望=' + (2 + aOk) + ' (aOk=' + aOk + ')');
  check('⑤ B 文件条数 == 初始1 + 成功写入数（无丢失/无重复）',
    pB && pB.articles.length === 1 + bOk,
    '实际=' + (pB && pB.articles.length) + ' 期望=' + (1 + bOk) + ' (bOk=' + bOk + ')');
  // 锁生效：并发争用应至少淘汰部分进程（否则说明无锁裸奔）
  check('⑥ 同卡并发触发锁争用（至少 1 个 A 进程因锁退出非 0）', aOk < N, 'aOk=' + aOk + '/' + N);

  console.log('\n=== ⑦ reset-card 并发：只清目标卡、不损坏、他卡不受影响 ===');
  seed(PA, 'A', ['A种子1', 'A种子2']);
  seed(PB, 'B', ['B保留']);
  const rprocs = [];
  for (let i = 0; i < 8; i++) rprocs.push(runAsync(PA, ['reset-card', '--card', 'A']));
  Promise.all(rprocs).then(() => {
    let pAr = null, pBr = null;
    try { pAr = JSON.parse(fs.readFileSync(PA, 'utf8')); } catch (e) {}
    try { pBr = JSON.parse(fs.readFileSync(PB, 'utf8')); } catch (e) {}
    check('⑦-A reset 并发后 A 文件合法', pAr !== null, '');
    check('⑦-B reset 并发后 A 卡文章清零（仅清目标卡，无残留）', pAr && pAr.articles.length === 0, 'len=' + (pAr && pAr.articles.length));
    check('⑦-C reset 并发后 B 卡不受影响（仍含 B保留）', pBr && pBr.articles.length === 1 && pBr.articles[0].title === 'B保留', JSON.stringify(pBr && pBr.articles.map((a) => a.title)));

    console.log('\n=== 汇总 ===');
    console.log(`通过 ${pass} / 失败 ${fail}`);
    if (fail) failures.forEach((f) => console.log('  - ' + f));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
    process.exit(fail ? 1 : 0);
  });
});
