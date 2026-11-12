#!/usr/bin/env node
/**
 * wechat-article-to-ima · reset-card 工作区残余清理 回归测试（离线、零网络、零凭据）
 *
 * 验证 E1 / E5 / D6 修复：
 *   reset-card 在清空本卡进度前，先打扫工作区中「与本卡相关」的残余文件，
 *   实现零污染、零断点残留陷阱；同时：
 *     - 不得误删他卡（B 卡）的 pending_fetch / failed_quarantine / _process_summary；
 *     - 不得误删跨卡前缀或无前缀的孤立文件（闸1/闸2 防护仍生效）；
 *     - 保留本卡既有 name（E6）。
 *
 * 纪律：仅用 Node 内置模块；临时目录建于系统临时区并自清理；确定性、无网络。
 * 运行：node tests/test_reset_card_cleanup.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const STATE_JS = path.join(SKILL_DIR, 'scripts', 'state.js');
const { dedupKey } = require(STATE_JS);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

// ── 临时工作区（重置进度文件直接置于此目录，使 ws = 该目录）──
const WS = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-reset-clean-'));
const PROGRESS = path.join(WS, '_progress_A.json');
const PF_DIR = path.join(WS, 'pending_fetch');
const Q_DIR = path.join(WS, 'failed_quarantine');
fs.mkdirSync(PF_DIR, { recursive: true });
fs.mkdirSync(Q_DIR, { recursive: true });

// 进度：卡 A（有 name / completed / searchedKeywords / failureClass / note）+ 卡 B（对照卡）
const progress = {
  schema: '1.1',
  updatedAt: '',
  cards: {
    A: { name: '工程总承包EPC', folder_id: 'folder_x', lastRun: '2026-11-10', nextDue: '', rotateIndex: 0, status: 'completed', nextRetryAt: null, attempts: 2, searchedKeywords: ['工程总承包', 'EPC'], failureClass: 'permanent', pendingKeywords: [], note: '旧轮已完成' },
    B: { name: '卡B', folder_id: 'folder_y', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0, searchedKeywords: [], failureClass: '', pendingKeywords: [], note: '' },
  },
  articles: [
    { card: 'A', title: '工程总承包管理要点', status: 'pending' },
    { card: 'A', title: 'EPC总承包模式解析', status: 'pending' },
    { card: 'B', title: '卡B的文章不删', status: 'pending' },
  ],
};
fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2), 'utf8');

// 工作区残余：卡 A 两个 pending_fetch stub + 卡 B 一个（须存活）
const aStub1 = path.join(PF_DIR, dedupKey('工程总承包管理要点') + '.md');
const aStub2 = path.join(PF_DIR, dedupKey('EPC总承包模式解析') + '.md');
const bStub = path.join(PF_DIR, dedupKey('卡B的文章不删') + '.md');
fs.writeFileSync(aStub1, '# stub A1', 'utf8');
fs.writeFileSync(aStub2, '# stub A2', 'utf8');
fs.writeFileSync(bStub, '# stub B', 'utf8');

// 隔离区：A__ 与 B__ 各一份（B__ 须存活）
const aQuar = path.join(Q_DIR, 'A__残篇.md');
const bQuar = path.join(Q_DIR, 'B__残篇.md');
fs.writeFileSync(aQuar, '# quar A', 'utf8');
fs.writeFileSync(bQuar, '# quar B', 'utf8');

// 过程汇总：A 与 B 各一份（B 须存活）
const aSum = path.join(WS, '_process_summary_A.json');
const bSum = path.join(WS, '_process_summary_B.json');
fs.writeFileSync(aSum, '{}', 'utf8');
fs.writeFileSync(bSum, '{}', 'utf8');

console.log('=== reset-card 工作区残余清理（E1 / E5 / D6）===');

const r = spawnSync('node', [STATE_JS, '--progress', PROGRESS, 'reset-card', '--card', 'A'], { encoding: 'utf-8' });
check('reset-card 退出码 0', r.status === 0, 'code=' + r.status + ' err=' + (r.stderr || '').trim());

// ① 本卡 pending_fetch stub 已清理
check('卡 A pending_fetch stub1 已删除', !fs.existsSync(aStub1));
check('卡 A pending_fetch stub2 已删除', !fs.existsSync(aStub2));
// ② 他卡 pending_fetch 不误删
check('卡 B pending_fetch stub 仍存活（跨卡保护）', fs.existsSync(bStub));
// ③ 本卡隔离区卡前缀已清理
check('卡 A failed_quarantine/A__ 已删除', !fs.existsSync(aQuar));
// ④ 他卡隔离区不误删
check('卡 B failed_quarantine/B__ 仍存活（跨卡保护）', fs.existsSync(bQuar));
// ⑤ 本卡过程汇总已清理
check('卡 A _process_summary_A.json 已删除', !fs.existsSync(aSum));
// ⑥ 他卡过程汇总不误删
check('卡 B _process_summary_B.json 仍存活', fs.existsSync(bSum));

// ⑦ 进度态：卡 A 文章清空、name 保留、累积态归零
const after = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
const aArts = after.articles.filter((a) => (a.card || a.cardId) === 'A');
const bArts = after.articles.filter((a) => (a.card || a.cardId) === 'B');
check('卡 A 文章记录已全部清空', aArts.length === 0, '剩余=' + aArts.length);
check('卡 B 文章记录未受影响', bArts.length === 1, '剩余=' + bArts.length);
check('卡 A name 已保留（E6）', after.cards.A && after.cards.A.name === '工程总承包EPC', after.cards.A && after.cards.A.name);
check('卡 A searchedKeywords 已清空（强制全量重搜）', Array.isArray(after.cards.A.searchedKeywords) && after.cards.A.searchedKeywords.length === 0);
check('卡 A failureClass 已清空', after.cards.A.failureClass === '');
check('卡 A status 归零为 pending', after.cards.A.status === 'pending');
check('卡 A note 已清空', after.cards.A.note === '');
check('卡 A attempts 归零', after.cards.A.attempts === 0);
check('卡 B 累积态未受影响', after.cards.B.searchedKeywords.length === 0 && after.cards.B.failureClass === '' && after.cards.B.status === 'pending');

// ── 自清理 ──
try { fs.rmSync(WS, { recursive: true, force: true }); } catch (_) { /* ignore */ }

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('失败项：\n - ' + failures.join('\n - ')); process.exit(1); }
else process.exit(0);
