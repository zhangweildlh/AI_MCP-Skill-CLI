#!/usr/bin/env node
/**
 * wechat-article-to-ima 确定性状态脚本（F9）。
 *
 * 职责：`_progress.json` 的唯一读写入口 + 校验，消灭 LLM 手工维护产生的错误状态
 * （门失败文章误标 ingested、漏记、ANTI_SPIDER 关键词谎称完成等）。
 *
 * 零依赖：仅用 Node 内置模块（fs / path / child_process）。
 *
 * 用法：
 *   node state.js --progress <路径> <子命令> [选项]
 *
 * 子命令：
 *   validate                                  结构与一致性校验
 *   mark-ingested --card C --title T --media-id M [--verify] [--ima-api P] [--kb-id K] [--folder-id F]
 *                                             标记入库（默认不联机复核；--verify 时调 ima_api.cjs 复核 media_type===11 真实存在）
 *   mark-failed   --card C --title T --reason R
 *                                             标记失败
 *   set-attempts  --card C --n N              设置某卡已尝试次数
 *   reset-attempts --card C                   重置某卡已尝试次数为 0
 *   report                                      输出应入库 / 实入库 / 被过滤 / 失败 四栏清单
 *
 * 强约束（违反即拒绝写入并报错）：
 *   - mark-ingested 须先复核目标条目 media_type===11 真实存在（--verify 时硬性联机复核；无 --verify 时仅做本地一致性校验）。
 *   - gate_failed（gateResult 以 "fail" 开头）或被标记 failed 的条目严禁标记为 ingested。
 *   - 每轮结算四栏清单由 report 产出，禁止手工拼凑。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCHEMA = '1.1';
const INGEST_STATES = ['pending', 'ingested', 'failed'];

function usage() {
  console.error(`用法：node state.js --progress <路径> <子命令> [选项]

子命令：
  validate
  mark-ingested --card C --title T --media-id M [--verify] [--ima-api P] [--kb-id K] [--folder-id F]
  mark-failed   --card C --title T --reason R
  set-attempts  --card C --n N
  reset-attempts --card C
  report

通用选项：
  --progress <路径>   必填。_progress.json 路径。
  -h, --help          打印本帮助。`);
}

function fail(msg) {
  console.error(`[state.js 错误] ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opt = { progress: '', command: '', card: '', title: '', mediaId: '', reason: '', n: null, verify: false, imaApi: '', kbId: '', folderId: '' };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { usage(); process.exit(0); }
    else if (a === '--progress') opt.progress = argv[++i] || fail('缺少 --progress 值');
    else if (a === '--card') opt.card = argv[++i] || fail('缺少 --card 值');
    else if (a === '--title') opt.title = argv[++i] || fail('缺少 --title 值');
    else if (a === '--media-id') opt.mediaId = argv[++i] || fail('缺少 --media-id 值');
    else if (a === '--reason') opt.reason = argv[++i] || fail('缺少 --reason 值');
    else if (a === '--n') { opt.n = parseInt(argv[++i], 10); if (Number.isNaN(opt.n)) fail('--n 必须为整数'); }
    else if (a === '--verify') opt.verify = true;
    else if (a === '--ima-api') opt.imaApi = argv[++i] || fail('缺少 --ima-api 值');
    else if (a === '--kb-id') opt.kbId = argv[++i] || fail('缺少 --kb-id 值');
    else if (a === '--folder-id') opt.folderId = argv[++i] || fail('缺少 --folder-id 值');
    else if (!opt.command) opt.command = a;
    else fail(`未知参数：${a}`);
    i++;
  }
  return opt;
}

function loadProgress(progressPath) {
  let data;
  if (!fs.existsSync(progressPath)) {
    return { schema: SCHEMA, updatedAt: '', cards: {}, articles: [] };
  }
  try {
    data = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  } catch (e) {
    fail(`_progress.json 解析失败（${e.message}），请先按模板重建。`);
  }
  if (!data || typeof data !== 'object') fail('_progress.json 结构非法（非对象）。');
  if (!data.cards || typeof data.cards !== 'object') data.cards = {};
  if (!Array.isArray(data.articles)) data.articles = [];
  return data;
}

function saveProgress(progressPath, data) {
  data.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(path.resolve(progressPath)), { recursive: true });
  fs.writeFileSync(progressPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function ensureCard(data, card) {
  if (!data.cards[card]) {
    data.cards[card] = { name: '', folder_id: '', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0 };
  }
  return data.cards[card];
}

function findArticle(data, card, title) {
  return data.articles.find((a) => a.card === card && a.title === title);
}

function upsertArticle(data, card, title) {
  let art = findArticle(data, card, title);
  if (!art) {
    art = { card, title, fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'pending', note: '' };
    data.articles.push(art);
  }
  return art;
}

// 联机复核：调 ima_api.cjs 取目标子目录全量，确认 media_id 对应条目 media_type===11 真实存在。
function verifyMediaType11(opt, folderId) {
  if (!opt.imaApi) fail('--verify 需要提供 --ima-api <ima_api.cjs 路径>。');
  if (!opt.kbId) fail('--verify 需要提供 --kb-id <knowledge_base_id>。');
  const fid = folderId || opt.folderId;
  if (!fid) fail('--verify 需要提供 --folder-id 或从进度卡推导 folder_id。');
  const body = JSON.stringify({ knowledge_base_id: opt.kbId, folder_id: fid, cursor: '', limit: 50 });
  const res = spawnSync('node', [opt.imaApi, 'openapi/wiki/v1/get_knowledge_list', body], { encoding: 'utf-8' });
  if (res.error) fail(`调用 ima_api.cjs 失败：${res.error.message}`);
  if (res.status !== 0) fail(`ima_api.cjs 退出码 ${res.status}：${(res.stderr || '').trim() || (res.stdout || '').trim()}`);
  let json;
  try { json = JSON.parse(res.stdout); } catch (e) { fail(`ima_api.cjs 输出非 JSON：${res.stdout.slice(0, 200)}`); }
  const list = (json && json.data && (json.data.knowledge_list || json.data.list)) || [];
  const hit = list.find((it) => String(it.media_id) === String(opt.mediaId));
  if (!hit) fail(`media_id=${opt.mediaId} 在目标子目录未找到（可能未真正入库）。`);
  if (Number(hit.media_type) !== 11) fail(`media_id=${opt.mediaId} 的 media_type=${hit.media_type}，非笔记(11)，禁止标记为 ingested。`);
  return true;
}

function cmdValidate(opt, data) {
  const errs = [];
  if (data.schema !== SCHEMA) errs.push(`schema 期望 ${SCHEMA}，实际 ${data.schema}`);
  if (typeof data.cards !== 'object') errs.push('cards 非对象');
  if (!Array.isArray(data.articles)) errs.push('articles 非数组');
  const cardKeys = ['name', 'folder_id', 'lastRun', 'nextDue', 'rotateIndex', 'status', 'nextRetryAt', 'attempts'];
  for (const [c, v] of Object.entries(data.cards)) {
    for (const k of cardKeys) if (!(k in v)) errs.push(`cards.${c} 缺字段 ${k}`);
    if (typeof v.attempts !== 'number') errs.push(`cards.${c}.attempts 非数字`);
  }
  for (const a of data.articles) {
    for (const f of ['card', 'title', 'fetchStatus', 'filterResult', 'gateResult', 'ingestStatus']) {
      if (!(f in a)) errs.push(`articles 条目缺字段 ${f}（title=${a.title}）`);
    }
    if (!INGEST_STATES.includes(a.ingestStatus)) errs.push(`articles 条目 ingestStatus 非法：${a.ingestStatus}（title=${a.title}）`);
    // 一致性：ingested 不得由 gate_failed / fetch 失败伪装
    if (a.ingestStatus === 'ingested' && (String(a.gateResult).startsWith('fail') || a.fetchStatus === 'failed')) {
      errs.push(`一致性违例：title=${a.title} 标记为 ingested 但 gateResult/fetchStatus 表明失败`);
    }
  }
  if (errs.length) {
    console.error('校验未通过：');
    for (const e of errs) console.error('  - ' + e);
    process.exit(1);
  }
  console.error('✅ 校验通过：结构与一致性无误。');
}

function cmdMarkIngested(opt, data) {
  if (!opt.card || !opt.title) fail('mark-ingested 需要 --card 与 --title。');
  ensureCard(data, opt.card);
  const card = data.cards[opt.card];
  if (opt.verify) verifyMediaType11(opt, card.folder_id);
  const art = upsertArticle(data, opt.card, opt.title);
  // 强约束：禁止把 gate_failed / failed 伪装为 ingested
  if (String(art.gateResult).startsWith('fail') || art.fetchStatus === 'failed' || art.ingestStatus === 'failed') {
    fail(`title=${opt.title} 当前为 gate_failed / failed 状态，严禁标记为 ingested。`);
  }
  art.ingestStatus = 'ingested';
  if (opt.mediaId) art.note = `media_id=${opt.mediaId}`;
  saveProgress(opt.progress, data);
  console.error(`✅ 已标记 ingested：card=${opt.card} title=${opt.title}${opt.verify ? '（已联机复核 media_type===11）' : ''}`);
}

function cmdMarkFailed(opt, data) {
  if (!opt.card || !opt.title) fail('mark-failed 需要 --card 与 --title。');
  ensureCard(data, opt.card);
  const art = upsertArticle(data, opt.card, opt.title);
  art.ingestStatus = 'failed';
  if (opt.reason) art.note = opt.reason;
  saveProgress(opt.progress, data);
  console.error(`✅ 已标记 failed：card=${opt.card} title=${opt.title} reason=${opt.reason || '(未提供)'}`);
}

function cmdSetAttempts(opt, data) {
  if (!opt.card) fail('set-attempts 需要 --card。');
  if (opt.n === null) fail('set-attempts 需要 --n <整数>。');
  const card = ensureCard(data, opt.card);
  card.attempts = opt.n;
  saveProgress(opt.progress, data);
  console.error(`✅ 已设置 card=${opt.card} attempts=${opt.n}`);
}

function cmdResetAttempts(opt, data) {
  if (!opt.card) fail('reset-attempts 需要 --card。');
  const card = ensureCard(data, opt.card);
  card.attempts = 0;
  saveProgress(opt.progress, data);
  console.error(`✅ 已重置 card=${opt.card} attempts=0`);
}

function cmdReport(opt, data) {
  let shouldIngest = 0, ingested = 0, filtered = 0, failed = 0;
  for (const a of data.articles) {
    if (String(a.filterResult).startsWith('filtered')) { filtered++; continue; }
    if (String(a.gateResult).startsWith('fail') || a.fetchStatus === 'failed' || a.ingestStatus === 'failed') { failed++; continue; }
    if (a.ingestStatus === 'ingested') ingested++;
    if (a.gateResult === 'pass' || !String(a.gateResult).startsWith('fail')) shouldIngest++;
  }
  // 应入库 = 通过闸门且未被过滤（含已入库与待入库）
  shouldIngest = data.articles.filter((a) => !String(a.filterResult).startsWith('filtered') && !String(a.gateResult).startsWith('fail') && a.fetchStatus !== 'failed').length;
  console.log('=== 四栏清单（state.js report）===');
  console.log(`应入库 : ${shouldIngest}`);
  console.log(`实入库 : ${ingested}`);
  console.log(`被过滤 : ${filtered}`);
  console.log(`失败   : ${failed}`);
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.progress) fail('缺少必填 --progress <路径>。');
  if (!opt.command) { usage(); process.exit(2); }
  const data = loadProgress(opt.progress);
  switch (opt.command) {
    case 'validate': cmdValidate(opt, data); break;
    case 'mark-ingested': cmdMarkIngested(opt, data); break;
    case 'mark-failed': cmdMarkFailed(opt, data); break;
    case 'set-attempts': cmdSetAttempts(opt, data); break;
    case 'reset-attempts': cmdResetAttempts(opt, data); break;
    case 'report': cmdReport(opt, data); break;
    default: fail(`未知子命令：${opt.command}`);
  }
}

main();
