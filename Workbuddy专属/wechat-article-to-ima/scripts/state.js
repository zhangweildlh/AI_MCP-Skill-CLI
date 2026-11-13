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
 *   migrate                                   旧 schema → 新 schema 幂等迁移（历史进度文件兼容）
 *   mark-ingested --card C --title T --media-id M [--no-verify] [--ima-api P] [--kb-id K] [--folder-id F]
 *                                             标记入库（**默认联机复核** media_type===11；--no-verify 显式关闭）
 *   mark-failed   --card C --title T --reason R
 *                                             标记失败
 *   mark-filtered --card C --title T --reason R
 *                                             标记被过滤（filterResult=filtered:<reason>，不计入 failed）
 *   mark-needs-fetch --card C --title T --reason R [--stub-key K] [--batch-id B]
 *                                             标记 1 级抓取失败、移交 Agent 编排（pending_fetch），不计 failed
 *   mark-handback-consumed --card C --title T --media-id M [--stub-key K] [--batch-id B] [--level L]
 *                                             handback 消费成功：fetchStatus needs-fetch→ok 且
 *                                             ingestStatus→ingested（report 第 5 栏归零的唯一路径）
 *   set-attempts  --card C --n N              设置某卡已尝试次数
 *   reset-attempts --card C                   重置某卡已尝试次数为 0
 *   reset-card    --card C                    清空该卡的全部文章记录，并重置卡级累积态（searchedKeywords=[]、failureClass=''），重跑/续跑前重置用（强制全量重搜、解除旧失败类锁定）
 *   update-card   --card C [--last-run R] [--next-due D] [--rotate-index I] [--status S] [--next-retry-at T] [--note N] [--pending-keywords K] [--searched-keywords K] [--clear-searched] [--failure-class C]
 *                                             更新任务卡级字段（步骤 12 轮转规则所需）；--searched-keywords 累积并集写入已搜词、--clear-searched 清空、--failure-class 写 transient/permanent
 *   diff-keywords --card C --keywords "K1;K2;K3"   给定该卡全量关键词，输出尚未搜索的差集（续跑只搜剩余词）；支持 --json
 *   classify-failure --reason "R"                  依据失败原因判定 transient（限流/网络，可重试）或 permanent（凭据失效，交人工）
 *   report                                      输出增强四栏清单：应入库 / 实入库(KB复核确认) / 被过滤 / 失败
 *                                              被过滤/失败栏含逐条原因；实入库栏含目标子目录 + 应入未入根因；
 *                                              幽灵记录（声称 ingested 但 KB 查无）显式标注。
 *                                              可选参数：--kb-id <知识库id> --folder-id <子目录id>（联机复核）
 *                                                        --kb-snapshot <快照json>（离线/审计复核）
 *                                                        --card <卡> 限定单卡 --json 机器可读
 *
 * 强约束（违反即拒绝写入并报错）：
 *   - mark-ingested 默认联机复核目标条目 media_type===11 真实存在；仅在显式 --no-verify 时跳过。
 *   - gate_failed（gateResult 以 "fail" 开头）或被标记 failed / filtered 的条目严禁标记为 ingested。
 *   - pending 与已尝试次数须一致（attempts 仅由 set-attempts / reset-attempts 改写）。
 *   - 每轮结算的四栏清单须由 report 产出，禁止手工拼凑。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCHEMA = '1.1';
const INGEST_STATES = ['pending', 'ingested', 'failed'];

/**
 * ima 服务端会把条目 title 截断到 30 个字符并追加 "..."（2026-11-05 实测）。
 * 因此笔记去重不可用「整标题精确比对」，必须用前缀键，且**先剥除截断标记再切片**
 * ——否则标题长度恰为 30 时截断标记落在切片内，键仍会失配（实测命中 20→22）。
 */
const TITLE_CAP = 30;
const dedupKey = (t) => {
  let s = String(t == null ? '' : t).trim();
  s = s.replace(/^title:\s*["']?/, '').replace(/["']?\s*$/, '');
  s = s.replace(/\.md$/i, '');
  s = s.replace(/[.…]+$/, '');
  return s.replace(/\s+/g, '').replace(/[！？!？?]/g, '').toLowerCase().slice(0, TITLE_CAP);
};

// 文件名安全化（与 pipeline.js 同款实现，避免两处逻辑漂移）；仅用于工作区清理时的卡前缀拼接。
const safeFile = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);

// ── R8 防护：解析出的工作区/进度目录严禁落在技能自身目录树内 ──
// 否则运行产物（.md / 进度 / 隔离区）会污染技能仓库，甚至被误提交（AGENTS.md §4 红线）。
function isInsideDir(child, parent) {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  if (c === p) return true;
  const rel = path.relative(p, c);
  // 跨盘：relative 返回绝对路径（如 C:\...）→ 不在 parent 内部；
  // 同盘但 parent 之外：relative 以 .. 开头 → 亦不在内部。
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
function skillBaseDir() {
  // state.js 位于 <技能>/scripts/state.js → 技能根为 scripts 的上一级
  return path.resolve(__dirname, '..');
}
function assertOutsideSkillDir(targetPath) {
  const skill = skillBaseDir();
  const t = path.resolve(targetPath);
  if (isInsideDir(t, skill)) {
    fail(`解析出的路径落在技能自身目录树内（${t} ⊆ ${skill}），拒绝写入以防污染技能仓库。请将 [WS]/--progress 指定到技能目录之外的独立工作区。`);
  }
}

/**
 * 确定性定位 ima-skills 的 ima_api.cjs（与 pipeline.js 共用，避免两份路径解析逻辑漂移）。
 * 候选顺序（传入 > 内置默认；详见 R7 通用默认参数优先级）：
 *   --skill-base（agent 引导词传入，最高优先级）→ 环境变量 IMA_API_CJS
 *   → $USERPROFILE/.workbuddy/skills/ima-skills/ima_api.cjs
 *   → 技能相邻目录 ../../ima-skills/ima_api.cjs。返回首个存在的文件路径，全缺返回 null。
 * 不使用 $HOME（本环境执行沙箱中 $HOME 被虚拟化为 /HOME，会误判缺失）。
 * @param {object} [opt]  解析选项，可含 { skillBase }
 */
function locateImaApi(opt) {
  const o = opt || {};
  const cands = [];
  // ① agent 引导词传入的「技能基址」：定位为 <skillBase>/../ima-skills/ima_api.cjs（与 __dirname 推导同源）
  if (o.skillBase) cands.push(path.join(path.resolve(o.skillBase), '..', 'ima-skills', 'ima_api.cjs'));
  // ② 直接指定 ima_api.cjs 路径（最高自由度的显式覆盖）
  if (process.env.IMA_API_CJS) cands.push(process.env.IMA_API_CJS);
  const up = process.env.USERPROFILE;
  if (up) cands.push(path.join(up, '.workbuddy', 'skills', 'ima-skills', 'ima_api.cjs'));
  cands.push(path.join(__dirname, '..', '..', 'ima-skills', 'ima_api.cjs'));
  for (const c of cands) {
    try { if (c && fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch (_) { /* next */ }
  }
  return null;
}

function usage() {
  console.error(`用法：node state.js --progress <路径> <子命令> [选项]

子命令：
  validate
  migrate
  mark-ingested --card C --title T --media-id M [--no-verify] [--ima-api P] [--kb-id K] [--folder-id F]
  mark-failed   --card C --title T --reason R
  mark-filtered --card C --title T --reason R
  mark-needs-fetch --card C --title T --reason R [--stub-key K] [--batch-id B]
  mark-handback-consumed --card C --title T --media-id M [--stub-key K] [--batch-id B] [--level L]
  set-attempts  --card C --n N
  reset-attempts --card C
  reset-card    --card C                     （清空文章记录 + 重置 searchedKeywords/failureClass）
  update-card   --card C [--last-run R] [--next-due D] [--rotate-index I] [--status S] [--next-retry-at T] [--note N] [--pending-keywords K] [--searched-keywords K] [--clear-searched] [--failure-class C]
  report [--kb-id K] [--folder-id F] [--kb-snapshot <json>] [--card C] [--json]
  diff-keywords --card C --keywords "K1;K2;K3" [--json]   输出尚未搜索的关键词差集（续跑只搜剩余词）
  resolve-folder --name <ima实际子目录名> --kb-id K [--card C] [--json]   按名实时解析真实 folder_id（禁止硬编码）
  classify-failure --reason "R"                           判定 transient / permanent

通用选项：
  --progress <路径>   读写进度文件的子命令必填；resolve-folder / classify-failure 为纯离线命令，无需此参数。
  -h, --help          打印本帮助。`);
}

function fail(msg) {
  console.error(`[state.js 错误] ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opt = { progress: '', command: '', card: '', title: '', mediaId: '', reason: '', n: null, verify: true, noVerify: false, imaApi: '', kbId: '', folderId: '', kbSnapshot: '', json: false, searchedKeywords: '', clearSearched: false, failureClass: '', keywords: '', skillBase: '', name: '', stubKey: '', level: '', batchId: '' };
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
    else if (a === '--no-verify') opt.noVerify = true;
    else if (a === '--last-run') opt.lastRun = argv[++i] || fail('缺少 --last-run 值');
    else if (a === '--next-due') opt.nextDue = argv[++i] || fail('缺少 --next-due 值');
    else if (a === '--rotate-index') { opt.rotateIndex = parseInt(argv[++i], 10); if (Number.isNaN(opt.rotateIndex)) fail('--rotate-index 必须为整数'); }
    else if (a === '--status') opt.status = argv[++i] || fail('缺少 --status 值');
    else if (a === '--next-retry-at') opt.nextRetryAt = argv[++i] || fail('缺少 --next-retry-at 值');
    else if (a === '--note') opt.note = argv[++i] || fail('缺少 --note 值');
    else if (a === '--pending-keywords') opt.pendingKeywords = argv[++i] || fail('缺少 --pending-keywords 值');
    else if (a === '--searched-keywords') opt.searchedKeywords = argv[++i] || fail('缺少 --searched-keywords 值');
    else if (a === '--clear-searched') opt.clearSearched = true;
    else if (a === '--failure-class') { const fi = ++i; opt.failureClass = (argv[fi] !== undefined) ? argv[fi] : fail('缺少 --failure-class 值'); }
    else if (a === '--ima-api') opt.imaApi = argv[++i] || fail('缺少 --ima-api 值');
    else if (a === '--kb-id') opt.kbId = argv[++i] || fail('缺少 --kb-id 值');
    else if (a === '--folder-id') opt.folderId = argv[++i] || fail('缺少 --folder-id 值');
    else if (a === '--kb-snapshot') opt.kbSnapshot = argv[++i] || fail('缺少 --kb-snapshot 值');
    else if (a === '--keywords') opt.keywords = argv[++i] || '';
    else if (a === '--name') opt.name = argv[++i] || fail('缺少 --name 值');
    else if (a === '--json') opt.json = true;
    else if (a === '--skill-base') opt.skillBase = argv[++i] || fail('缺少 --skill-base 值');
    else if (a === '--stub-key') opt.stubKey = argv[++i] || fail('缺少 --stub-key 值');
    else if (a === '--level') opt.level = argv[++i] || fail('缺少 --level 值');
    else if (a === '--batch-id') opt.batchId = argv[++i] || fail('缺少 --batch-id 值');
    else if (!opt.command) opt.command = a;
    else fail(`未知参数：${a}`);
    i++;
  }
  if (opt.noVerify) opt.verify = false;
  return opt;
}

// 文件锁：防并发进程（独立 Agent / 多开 pipeline）对同卡进度文件做整文件级
// read-modify-write 丢失更新（lost update）。锁粒度 = 每卡文件（_progress_<card>.json.lock），
// 不同卡各自持锁、永不互相争用。锁文件以 'wx' 互斥创建，陈旧（>5min）自动回收。
const LOCK_STALE_MS = 5 * 60 * 1000;
let _lockFd = null;
let _lockPath = null;
function acquireLock(progressPath) {
  _lockPath = progressPath + '.lock';
  try {
    _lockFd = fs.openSync(_lockPath, 'wx');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // 锁已存在：判定是否陈旧（持有进程已崩溃未释放）
    try {
      const st = fs.statSync(_lockPath);
      const stale = (Date.now() - st.mtimeMs) > LOCK_STALE_MS;
      if (stale) { fs.unlinkSync(_lockPath); _lockFd = fs.openSync(_lockPath, 'wx'); return; }
    } catch (_) { /* 统计失败则按占用处理 */ }
    fail(`进度文件锁 ${_lockPath} 已被另一进程持有（可能并发写同卡进度）。请错开并发或等待其结束。`);
  }
}
function releaseLock() {
  if (_lockFd !== null) {
    try { fs.closeSync(_lockFd); } catch (_) { /* ignore */ }
    try { if (_lockPath) fs.unlinkSync(_lockPath); } catch (_) { /* ignore */ }
    _lockFd = null; _lockPath = null;
  }
}

function loadProgress(progressPath) {
  // R8 防护：解析出的进度目录严禁落在技能自身目录树内
  assertOutsideSkillDir(path.dirname(path.resolve(progressPath)));
  let data;
  if (!fs.existsSync(progressPath)) {
    return { schema: SCHEMA, updatedAt: '', cards: {}, articles: [] };
  }
  try {
    data = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  } catch (e) {
    fail(`_progress 解析失败（${e.message}），请先按模板重建。`);
  }
  if (!data || typeof data !== 'object') fail('_progress 结构非法（非对象）。');
  if (!data.cards || typeof data.cards !== 'object') data.cards = {};
  if (!Array.isArray(data.articles)) data.articles = [];
  // 向后兼容：旧进度文件缺省新字段时就地补齐（searchedKeywords / failureClass），validate 不因旧文件缺字段而误拒
  for (const [, v] of Object.entries(data.cards)) {
    if (!Array.isArray(v.searchedKeywords)) v.searchedKeywords = [];
    if (typeof v.failureClass !== 'string') v.failureClass = '';
  }
  return data;
}

function saveProgress(progressPath, data) {
  data.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(path.resolve(progressPath)), { recursive: true });
  // 原子写：先写临时文件再 rename，避免写中途崩溃留下半截 JSON 导致进度损坏
  const tmp = progressPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, progressPath);
}

function ensureCard(data, card) {
  if (!data.cards[card]) {
    data.cards[card] = { name: '', folder_id: '', lastRun: '', nextDue: '', rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0, searchedKeywords: [], failureClass: '' };
  }
  return data.cards[card];
}

// 兼容历史字段名：早期进度文件用 cardId，新结构用 card（读取时两者皆可，写入统一 card）
const cardOf = (a) => a.card || a.cardId || '';

// D2 修复：任务卡展示名（须与 SKILL.md「任务卡配置表」保持一致）。reset-card 重建卡时若 name 为空则回填，
// 消除「初始进度文件 name 字段为空」的展示层缺陷；显式传入 --name 时优先采用（见 cmdResetCard / cmdUpdateCard）。
const CARD_NAMES = { A: '总包', B: '城更', C: '全域土地' };

function findArticle(data, card, title) {
  return data.articles.find((a) => cardOf(a) === card && a.title === title);
}

function upsertArticle(data, card, title) {
  let art = findArticle(data, card, title);
  if (!art) {
    art = { card, title, fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'pending', note: '' };
    data.articles.push(art);
  } else if (!art.card && art.cardId) {
    // 归一化旧字段名，避免同一文件里 card/cardId 混存
    art.card = art.cardId;
    delete art.cardId;
  }
  return art;
}

// 联机复核：调 ima_api.cjs 取目标子目录全量，确认 media_id 对应条目 media_type===11 真实存在。
function verifyMediaType11(opt, folderId) {
  if (!opt.imaApi) opt.imaApi = locateImaApi();
  if (!opt.imaApi) fail('mark-ingested 默认要求联机复核：无法定位 ima_api.cjs（请设置 IMA_API_CJS 环境变量、确保 ima-skills 已安装，或显式加 --no-verify 跳过复核）。');
  if (!opt.kbId) fail('mark-ingested 默认要求联机复核：请提供 --kb-id <knowledge_base_id>（或显式加 --no-verify 跳过复核）。');
  const fid = folderId || opt.folderId;
  if (!fid) fail('mark-ingested 默认要求联机复核：请提供 --folder-id 或从进度卡推导 folder_id（或显式加 --no-verify 跳过复核）。');
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
  const cardKeys = ['name', 'folder_id', 'lastRun', 'nextDue', 'rotateIndex', 'status', 'nextRetryAt', 'attempts', 'searchedKeywords', 'failureClass'];
  for (const [c, v] of Object.entries(data.cards)) {
    for (const k of cardKeys) if (!(k in v)) errs.push(`cards.${c} 缺字段 ${k}`);
    if (typeof v.attempts !== 'number') errs.push(`cards.${c}.attempts 非数字`);
  }
  for (const a of data.articles) {
    if (!cardOf(a)) errs.push(`articles 条目缺所属卡字段（card/cardId）title=${a.title}`);
    for (const f of ['title', 'fetchStatus', 'filterResult', 'gateResult', 'ingestStatus']) {
      if (!(f in a)) errs.push(`articles 条目缺字段 ${f}（title=${a.title}）`);
    }
    if (!INGEST_STATES.includes(a.ingestStatus)) errs.push(`articles 条目 ingestStatus 非法：${a.ingestStatus}（title=${a.title}）`);
    // 一致性：ingested 不得由 gate_failed / fetch 失败伪装
    if (a.ingestStatus === 'ingested' && (String(a.gateResult).startsWith('fail') || a.fetchStatus === 'failed')) {
      errs.push(`一致性违例：title=${a.title} 标记为 ingested 但 gateResult/fetchStatus 表明失败`);
    }
    // 一致性：被过滤的条目不得同时被标记为 ingested
    if (String(a.filterResult).startsWith('filtered') && a.ingestStatus === 'ingested') {
      errs.push(`一致性违例：title=${a.title} 同时为 filtered 与 ingested`);
    }
  }
  if (errs.length) {
    console.error('校验未通过：');
    for (const e of errs) console.error('  - ' + e);
    process.exit(1);
  }
  console.error('✅ 校验通过：结构与一致性无误。');
}

/**
 * 幂等迁移：旧 schema（status/ingested/gatePassed/filtered/cardId）→ 新 schema。
 * 只补齐/归一化 articles 条目与 cardId 字段，**不改动 cards 卡级字段**
 * （lastRun/nextDue/attempts/pendingKeywords/note 一律原样保留）。
 */
function cmdMigrate(opt, data) {
  let migrated = 0;
  let normalized = 0;
  data.articles = data.articles.map((a) => {
    if (typeof a.ingestStatus === 'string') {
      if (!a.card && a.cardId) { a.card = a.cardId; delete a.cardId; normalized++; }
      return a;
    }
    const card = a.card || a.cardId || '';
    let fetchStatus = 'ok', filterResult = 'kept', gateResult = 'pass', ingestStatus = 'pending';
    let note = a.reason || '';
    if (a.filtered) filterResult = 'filtered:' + (a.reason || 'unknown');
    if (a.gatePassed === false) { gateResult = 'fail:' + (a.reason || 'gate'); ingestStatus = 'failed'; }
    if (a.ingested === true) { ingestStatus = 'ingested'; gateResult = 'pass'; filterResult = 'kept'; }
    else if (a.status === 'gate_failed') { gateResult = 'fail:' + (a.reason || 'gate'); ingestStatus = 'failed'; }
    else if (a.status === 'failed') { ingestStatus = 'failed'; }
    migrated++;
    return { card, title: a.title, fetchStatus, filterResult, gateResult, ingestStatus, note };
  });
  saveProgress(opt.progress, data);
  console.error(`✅ 迁移完成：新写入 ${migrated} 条，仅归一化 cardId→card ${normalized} 条；cards 卡级字段未改动。`);
}

function cmdMarkIngested(opt, data) {
  if (!opt.card || !opt.title) fail('mark-ingested 需要 --card 与 --title。');
  ensureCard(data, opt.card);
  const card = data.cards[opt.card];
  const art = upsertArticle(data, opt.card, opt.title);
  const isFailed = String(art.gateResult).startsWith('fail') || art.fetchStatus === 'failed' || art.ingestStatus === 'failed';
  const isFiltered = String(art.filterResult).startsWith('filtered');
  // 强约束：未联机复核时，禁止把 failed / gate_failed / filtered 伪装为 ingested（防误报成功；segment ④ 契约要求 --no-verify 时拒绝）
  if ((isFailed || isFiltered) && !opt.verify) {
    fail(`title=${opt.title} 当前为 ${isFiltered ? 'filtered' : 'gate_failed/failed'} 状态，严禁在未联机复核情况下标记为 ingested（如需重跑请先 reset-card --card ${opt.card}）。`);
  }
  // 联机复核（默认开启）：failed/filtered 条目仅在有联机证据（KB 确已存在该 media_type===11 条目）时翻正为 ingested；
  // 这正是隔离区补入（定向续跑③）等合法重入场景 —— 旧实现因强约束无条件拒绝，导致隔离区补入静默失效（文件被删、进度仍 failed）。
  if (opt.verify) verifyMediaType11(opt, card.folder_id);
  art.ingestStatus = 'ingested';
  // F-02 根因修复：handback 成功消费后若 fetchStatus 仍为 needs-fetch，report 第 5 栏
  // 「移交Agent编排」永不归零、classifyReport.closed 恒为 false → 闭环不可达。
  // 所有 mark-ingested 调用点（主流程 / 隔离区补入 / handback 消费）统一在此迁移。
  if (art.fetchStatus === 'needs-fetch') art.fetchStatus = 'ok';
  if (opt.mediaId) art.note = `media_id=${opt.mediaId}`;
  saveProgress(opt.progress, data);
  console.error(`✅ 已标记 ingested：card=${opt.card} title=${opt.title}${opt.verify ? '（已联机复核 media_type===11）' : '（未联机复核：--no-verify）'}`);
}

/**
 * handback 消费成功的状态机归零（F-02 显式语义入口）。
 *
 * 与 mark-ingested 的差别：① 强制把 fetchStatus 从 needs-fetch 迁移为 ok、gateResult 归 pass，
 * 使 report 第 5 栏存在归零路径；② 额外记录 stubKey / batchId / provenance.level，
 * 让「哪一篇经哪一批次、哪一级降级链回交」可审计。
 *
 * 不做联机复核：pipeline.js 消费端已用 listAllKb() 全量分页复验 media_type===11 且确在目标
 * 子目录；此处若再跑 verifyMediaType11 的单页 limit:50 复核，反而会在子目录 >50 条时误判
 * 「未真正入库」并把已成功入库的条目打回失败。
 */
function cmdMarkHandbackConsumed(opt, data) {
  if (!opt.card || !opt.title) fail('mark-handback-consumed 需要 --card 与 --title。');
  ensureCard(data, opt.card);
  const art = upsertArticle(data, opt.card, opt.title);
  art.fetchStatus = 'ok';
  art.ingestStatus = 'ingested';
  art.gateResult = 'pass';
  if (opt.mediaId) art.note = `media_id=${opt.mediaId}`;
  if (opt.stubKey) art.stubKey = opt.stubKey;
  if (opt.batchId) art.batchId = opt.batchId;
  if (opt.level) art.provenance = { level: String(opt.level), verifiedBy: 'pipeline.js --verify-batch' };
  saveProgress(opt.progress, data);
  console.error(`✅ handback 已消费：card=${opt.card} title=${opt.title} fetchStatus=needs-fetch→ok ingestStatus=ingested${opt.stubKey ? ' stubKey=' + opt.stubKey : ''}`);
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

function cmdMarkFiltered(opt, data) {
  if (!opt.card || !opt.title) fail('mark-filtered 需要 --card 与 --title。');
  ensureCard(data, opt.card);
  const art = upsertArticle(data, opt.card, opt.title);
  // 被过滤文章：filterResult 记 filtered:<reason>，ingestStatus 保持 pending（不计入 failed）
  art.filterResult = 'filtered:' + (opt.reason || 'unknown');
  saveProgress(opt.progress, data);
  console.error(`✅ 已标记 filtered：card=${opt.card} title=${opt.title} reason=${opt.reason || '(未提供)'}`);
}

function cmdMarkNeedsFetch(opt, data) {
  if (!opt.card || !opt.title) fail('mark-needs-fetch 需要 --card 与 --title。');
  ensureCard(data, opt.card);
  const art = upsertArticle(data, opt.card, opt.title);
  // 1 级抓取失败、移交 Agent 编排（2/3 级）：不计 failed（未真正失败，待 Agent 兜底），
  // 也不计 ingested；ingestStatus 保持 pending，fetchStatus 标 needs-fetch 供 report 单列。
  art.fetchStatus = 'needs-fetch';
  art.ingestStatus = 'pending';
  // 缺陷 E 修复：置 gateResult='' 而非沿用 upsertArticle 默认的 'pass'，
  // 避免「未过闸却被标 pass」的误导性状态（该条目尚未经 G3 闸门复验）。
  art.gateResult = '';
  if (opt.reason) art.note = opt.reason;
  // F-06/F-14：把 stub 确定性键与批次 ID 写进进度条目，供批次门禁按 stubKey 反查 triedLevels
  if (opt.stubKey) art.stubKey = opt.stubKey;
  if (opt.batchId) art.batchId = opt.batchId;
  saveProgress(opt.progress, data);
  console.error(`✅ 已标记 needs-fetch（移交 Agent 编排）：card=${opt.card} title=${opt.title} reason=${opt.reason || '(未提供)'}`);
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

// E1/E5/D6：全量重搜前清理本卡在工作区的残余文件，杜绝「断点残留陷阱」。
// 仅清理与本卡强关联的残留，不碰其他文件、不跨卡污染；工作区位于技能目录外（R8 守卫已对 progressPath 所在目录校验）。
// 清理对象：
//   ① pending_fetch/<dedupKey(标题)>.md —— 按本卡文章标题映射，删本卡遗留的 1 级抓取失败 stub；
//   ② failed_quarantine/<卡>__*.md —— 卡前缀隔离残留；
//   ③ _process_summary_<卡>.json —— 过程汇总（若存在）。
function cleanCardResidue(opt, data) {
  const ws = path.dirname(path.resolve(opt.progress));
  assertOutsideSkillDir(ws); // 二次守卫：确保清理不会触达技能目录
  const card = opt.card;
  const prefix = safeFile(card) + '__';
  const deleted = [];
  const tryUnlink = (p) => {
    try { if (fs.existsSync(p)) { fs.unlinkSync(p); deleted.push(path.basename(p)); return true; } } catch (_) { /* 忽略单文件失败，不阻断重置 */ }
    return false;
  };
  // ① 本卡 pending_fetch stub：按本卡文章标题 dedupKey 映射（过滤前先取标题，避免被清掉）
  const titles = data.articles.filter((a) => cardOf(a) === card).map((a) => a.title);
  for (const t of titles) {
    const key = dedupKey(t);
    if (key) tryUnlink(path.join(ws, 'pending_fetch', key + '.md'));
  }
  // ①b F-06：新 stub 带 `<card>__` 前缀，旧 ① 的「按标题 dedupKey」映射已覆盖不到；
  //     按前缀精确清理，绝不误删他卡残留（与 ② 的隔离区闸 1 同款）。
  const pdEarly = path.join(ws, 'pending_fetch');
  if (fs.existsSync(pdEarly)) {
    for (const f of fs.readdirSync(pdEarly)) {
      if (f.startsWith(prefix) && f.endsWith('.md')) tryUnlink(path.join(pdEarly, f));
    }
  }
  // ①c 批次清单：reset-card 是「强制全量重搜」起点，旧批次条目不得混入新一轮门禁
  if (fs.existsSync(ws)) {
    const bp = '_batch_' + safeFile(card) + '_';
    for (const f of fs.readdirSync(ws)) {
      if (f.startsWith(bp) && f.endsWith('.json')) tryUnlink(path.join(ws, f));
    }
  }
  // ② failed_quarantine 卡前缀残留
  const qd = path.join(ws, 'failed_quarantine');
  if (fs.existsSync(qd)) {
    for (const f of fs.readdirSync(qd)) {
      if (f.startsWith(prefix) && f.endsWith('.md')) tryUnlink(path.join(qd, f));
    }
  }
  // ③ 过程汇总文件（若存在）
  tryUnlink(path.join(ws, `_process_summary_${card}.json`));
  // ④ 清理后若 pending_fetch/ 变空则移除空目录（避免空目录被误判为残留）
  const pd = path.join(ws, 'pending_fetch');
  try { if (fs.existsSync(pd) && fs.readdirSync(pd).length === 0) fs.rmdirSync(pd); } catch (_) { /* ignore */ }
  return deleted;
}

function cmdResetCard(opt, data) {
  if (!opt.card) fail('reset-card 需要 --card。');
  // E1/E5/D6：全量重搜前先清理本卡工作区残余（pending_fetch stub / failed_quarantine 卡前缀 / 过程汇总）
  const cleaned = cleanCardResidue(opt, data);
  const before = data.articles.length;
  data.articles = data.articles.filter((a) => cardOf(a) !== opt.card);
  // 重置卡级累积态：searchedKeywords 清空 → 重跑时强制全量重搜（不被旧差集误导）；
  // failureClass 清空 → 解除 permanent/transient 锁，避免旧失败类沿用至新一周期。
  // 注意：仅清本卡，不影响其他卡的累积态（多卡并存时互不污染）。
  const prevName = data.cards[opt.card] ? data.cards[opt.card].name : ''; // E6 防御：保留既有卡显示名（此处 card 尚未声明，须用 opt.card）
  const card = ensureCard(data, opt.card); // 已存在则保留全部既有字段（含 name）
  // D2 修复：重建卡时若展示名缺失，从任务卡配置表常量回填（首次 reset 时 ensureCard 落成 name=''）；
  // 显式 --name 优先（调度方/引导词可显式传入，避免与常量不一致）。
  if (opt.name) card.name = opt.name;
  else if (!card.name) card.name = CARD_NAMES[opt.card] || card.name;
  card.searchedKeywords = [];
  card.failureClass = '';
  // 审计 E-07：原实现不清 status/note/attempts/pendingKeywords，reset 后 status 仍为上一轮
  // `completed` → 续跑守护误判「已完成」而跳过续跑（静默不可恢复断点），旧 note 还会污染步骤 10 记忆。
  // 强制全量重搜须把状态机一并归零；lastRun/nextDue 属调度信息，由步骤 12 收尾轮转覆盖，此处保留。
  card.status = 'pending';
  card.note = '';
  card.attempts = 0;
  card.nextRetryAt = null;
  card.pendingKeywords = [];
  saveProgress(opt.progress, data);
  console.error(`✅ 已清空 card=${opt.card} 的文章记录：${before} → ${data.articles.length}；已清理本卡工作区残余 ${cleaned.length} 个文件（${cleaned.join(', ') || '无'}）；并重置 searchedKeywords=[]、failureClass=''、status=pending、note=''、attempts=0、pendingKeywords=[]、nextRetryAt=null` + (prevName ? `、保留 name=${prevName}` : ''));
}

function cmdUpdateCard(opt, data) {
  if (!opt.card) fail('update-card 需要 --card。');
  const card = ensureCard(data, opt.card);
  if (opt.name) card.name = opt.name; // D2 修复：支持显式回填/修正展示名
  if (opt.lastRun !== undefined) card.lastRun = opt.lastRun;
  if (opt.nextDue !== undefined) card.nextDue = opt.nextDue;
  if (opt.rotateIndex !== undefined) card.rotateIndex = opt.rotateIndex;
  if (opt.status !== undefined) card.status = opt.status;
  if (opt.nextRetryAt !== undefined) card.nextRetryAt = opt.nextRetryAt;
  if (opt.note !== undefined) card.note = opt.note;
  if (opt.pendingKeywords !== undefined) {
    // 缺陷 A 修复：累积并集（与 --searched-keywords 同款实现）。
    // 原实现为「覆盖写入」，引导词 D4 的逐词调用（每词一次 --pending-keywords）会静默吞掉已记录的词，
    // 导致 F4a 熔断后「待续跑关键词」丢失、续跑守护漏搜。改为 Set 并集累积，重复自动去重。
    const add = String(opt.pendingKeywords).split(/[,，;；]/).map((s) => s.trim()).filter(Boolean);
    const set = new Set(card.pendingKeywords || []);
    add.forEach((k) => set.add(k));
    card.pendingKeywords = Array.from(set);
  }
  if (opt.clearSearched) {
    card.searchedKeywords = [];
  }
  if (opt.searchedKeywords !== undefined) {
    // 累积并集：跨多次部分运行累加已搜词（重复自动去重），支撑「只搜剩余词」定向续跑
    const add = String(opt.searchedKeywords).split(/[,，;；]/).map((s) => s.trim()).filter(Boolean);
    const set = new Set(card.searchedKeywords || []);
    add.forEach((k) => set.add(k));
    card.searchedKeywords = Array.from(set);
  }
  if (opt.failureClass !== undefined) {
    const fc = opt.failureClass;
    if (fc !== '' && fc !== 'transient' && fc !== 'permanent') fail(`--failure-class 仅接受 transient / permanent / 空串（清除），收到: ${fc}`);
    card.failureClass = fc;
  }
  saveProgress(opt.progress, data);
  console.error(`✅ 已更新 card=${opt.card} 字段（lastRun=${card.lastRun} nextDue=${card.nextDue} rotateIndex=${card.rotateIndex} status=${card.status} nextRetryAt=${card.nextRetryAt} failureClass=${card.failureClass} searchedKeywords=${card.searchedKeywords.length}）`);
}

function parseMediaIdFromNote(note) {
  if (!note) return null;
  const m = String(note).match(/media_id=([^\s；;]+)/);
  return m ? m[1].trim() : null;
}

// 失败类型分类（纯函数，可离线单测）：瞬时限流/网络 vs 永久凭据失效。
// 永久失败不置 retry 态、交人工；守护据此类不重试。
const FAILURE_PERMANENT = /(401|403|unauthorized|forbidden|invalid[ _-]?(api[ _-]?key|client[ _-]?id|token|credential)|凭证|凭据|鉴权|认证失败|未授权|api[ _-]?key[ \s]*无效|client[ _-]?id[ \s]*无效|key[ \s]*过期|token[ \s]*过期|secret[ \s]*无效)/i;
const FAILURE_TRANSIENT = /(限流|antispider|anti[ _-]?spider|429|too many requests|rate[ _-]?limit|频繁|网络|network|econnreset|etimedout|timeout|超时|连接|connection|503|502|504|服务暂不可用|busy|服务忙)/i;
function classifyFailure(reason) {
  const r = String(reason || '');
  if (FAILURE_PERMANENT.test(r)) return 'permanent';
  if (FAILURE_TRANSIENT.test(r)) return 'transient';
  return 'unknown';
}

// 读取 KB 快照文件（离线/审计用），归一为 [{media_id, title}]
function readKbSnapshot(p) {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && raw.knowledge_list) list = raw.knowledge_list;
  else if (raw && raw.data && (raw.data.knowledge_list || raw.data.list)) list = raw.data.knowledge_list || raw.data.list;
  else if (raw && raw.list) list = raw.list;
  return list.map((it) => ({ media_id: String(it.media_id != null ? it.media_id : it.mediaId), title: it.title || it.name || '' }));
}

// 联机拉取目标子目录全量条目（分页），返回 [{media_id, title}]
function fetchKbEntries(opt, folderId) {
  if (!opt.imaApi) opt.imaApi = locateImaApi();
  if (!opt.imaApi) throw new Error('无法定位 ima_api.cjs（请设置 IMA_API_CJS 或确保 ima-skills 已安装，或使用 --kb-snapshot 传入快照）');
  if (!opt.kbId) throw new Error('请提供 --kb-id');
  const fid = folderId || opt.folderId;
  if (!fid) throw new Error('请提供 --folder-id 或从进度卡推导 folder_id');
  const out = [];
  let cursor = '';
  let pages = 0;
  do {
    const body = JSON.stringify({ knowledge_base_id: opt.kbId, folder_id: fid, cursor, limit: 50 });
    const res = spawnSync('node', [opt.imaApi, 'openapi/wiki/v1/get_knowledge_list', body], { encoding: 'utf-8', timeout: 60000 });
    if (res.error) throw new Error('调用 ima_api.cjs 失败：' + res.error.message);
    if (res.status !== 0) throw new Error('ima_api.cjs 退出码 ' + res.status + '：' + (((res.stderr || '').trim() || (res.stdout || '').trim()).slice(0, 200)));
    let json;
    try { json = JSON.parse(res.stdout); } catch (e) { throw new Error('ima_api.cjs 输出非 JSON：' + res.stdout.slice(0, 200)); }
    const list = (json && json.data && (json.data.knowledge_list || json.data.list)) || [];
    for (const it of list) out.push({ media_id: String(it.media_id), title: it.title || '' });
    const next = (json && json.data && (json.data.cursor || json.data.next_cursor)) || '';
    if (!next || next === cursor) break;
    cursor = next;
    pages++;
  } while (pages < 100);
  return out;
}

function reasonOf(a) {
  if (a.ingestStatus === 'failed') return a.note || '(未提供原因)';
  if (String(a.gateResult).startsWith('fail')) return String(a.gateResult).replace(/^fail:?/, '') || '(未提供原因)';
  if (a.fetchStatus === 'failed') return '抓取失败';
  return '(未提供原因)';
}

/**
 * 纯分类函数（可离线单测）：依据进度文件 + 可选 KB 条目，产出四栏清单结构化结果。
 * @param {object} data                _progress.json 解析对象
 * @param {Array<{media_id,title}>|null} kbEntries  KB 子目录全量条目；null=离线（不做跨库核对）
 * @param {object} opts                { cardFilter }
 */
function classifyReport(data, kbEntries, opts) {
  const cardFilter = (opts && opts.cardFilter) || '';
  const arts = data.articles.filter((a) => !cardFilter || cardOf(a) === cardFilter);
  const kbSet = kbEntries ? new Set(kbEntries.map((e) => String(e.media_id))) : null;
  const kbTitleKeys = kbEntries ? new Set(kbEntries.map((e) => dedupKey(e.title))) : null;

  const filteredItems = [];
  const failedItems = [];
  const ghostItems = [];
  const needsFetchItems = [];
  let shouldIngest = 0, ingestedClaimed = 0, filtered = 0, failed = 0, needsFetch = 0;

  for (const a of arts) {
    const card = cardOf(a);
    const isFiltered = String(a.filterResult).startsWith('filtered');
    const isFailed = String(a.gateResult).startsWith('fail') || a.fetchStatus === 'failed' || a.ingestStatus === 'failed';
    if (isFiltered) {
      filtered++;
      filteredItems.push({ card, title: a.title, reason: String(a.filterResult).replace(/^filtered:?/, '') || '(未提供原因)' });
      continue;
    }
    if (isFailed) {
      failed++;
      failedItems.push({ card, title: a.title, reason: reasonOf(a) });
      continue;
    }
    // 移交 Agent 编排（1 级失败，待 2/3 级兜底）：单列，不计入 failed、不计入应入库
    if (a.fetchStatus === 'needs-fetch') {
      needsFetch++;
      needsFetchItems.push({ card, title: a.title, reason: a.note || '(未提供原因)' });
      continue;
    }
    // 通过闸门（未被过滤、未失败）
    shouldIngest++;
    if (a.ingestStatus === 'ingested') {
      ingestedClaimed++;
      if (kbSet) {
        const mid = parseMediaIdFromNote(a.note);
        const inByMedia = mid && kbSet.has(mid);
        const inByTitle = kbTitleKeys.has(dedupKey(a.title));
        if (!inByMedia && !inByTitle) {
          ghostItems.push({ card, title: a.title, mediaId: mid, note: a.note || '', reason: '进度声称 ingested，但 KB 子目录未找到匹配条目（media_id 或去重键均未命中）' });
        }
      }
    }
  }
  const kbVerified = !!kbEntries;
  const confirmed = kbVerified ? Math.max(0, ingestedClaimed - ghostItems.length) : ingestedClaimed;
  const pending = Math.max(0, shouldIngest - ingestedClaimed);
  const shouldButNotIngested = Math.max(0, shouldIngest - confirmed);
  return {
    cardFilter, kbVerified,
    shouldIngest, ingestedClaimed, confirmed, filtered, failed, needsFetch,
    pending, ghost: ghostItems.length,
    ghostItems, filteredItems, failedItems, needsFetchItems,
    shouldButNotIngested,
    // 审计 E-12：四栏齐全但「移交 Agent 编排」>0 / 待入库卡死 / 幽灵记录时不得判闭环。
    closed: needsFetch === 0 && pending === 0 && ghostItems.length === 0,
  };
}

function cmdReport(opt, data) {
  let kbEntries = null;
  let kbErr = null;
  if (opt.kbSnapshot) {
    try { kbEntries = readKbSnapshot(opt.kbSnapshot); }
    catch (e) { kbErr = '读取 --kb-snapshot 失败：' + e.message; }
  } else if (opt.kbId && opt.folderId) {
    try { kbEntries = fetchKbEntries(opt, opt.folderId); }
    catch (e) { kbErr = 'KB 联机复核失败，降级为离线口径：' + e.message; }
  }
  const rep = classifyReport(data, kbEntries, { cardFilter: opt.card });
  // ── 目录残留 + 批次门禁（F-06/F-14）──
  // classifyReport 是纯函数、不读文件系统，故目录侧证据在此注入；provenanceValid 需 CDP
  // 独立取证，report 不伪造，明确交由 pipeline.js --verify-batch 给出权威值。
  const ws = path.dirname(path.resolve(opt.progress));
  const card = opt.card || '';
  const prefix = card ? safeFile(card) + '__' : '';
  const listPrefixed = (d) => {
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((f) => f.endsWith('.md') && (!prefix || f.startsWith(prefix)));
  };
  rep.pendingFetchFiles = listPrefixed(path.join(ws, 'pending_fetch'));
  rep.quarantineFiles = listPrefixed(path.join(ws, 'failed_quarantine'));
  let batchDone = null;
  if (fs.existsSync(ws)) {
    // 引导词的复验命令 `report --kb-id K --folder-id F` **不带 --card**，若仅按 opt.card
    // 扫描批次清单，batchDone 会恒为 null，文档承诺的闭环机读值在真实命令下不可得。
    // 故：指定卡时只扫该卡；未指定时按进度文件里全部卡（report 默认全卡口径）聚合。
    const cardKeys = card ? [card] : Object.keys(data.cards || {});
    const prefixes = cardKeys.map((c) => '_batch_' + safeFile(c) + '_');
    const mfs = fs.readdirSync(ws).filter((f) => f.endsWith('.json') && (
      prefixes.length ? prefixes.some((p) => f.startsWith(p)) : f.startsWith('_batch_')
    ));
    if (mfs.length) {
      let total = 0, done = 0;
      for (const f of mfs) {
        try {
          const m = JSON.parse(fs.readFileSync(path.join(ws, f), 'utf8'));
          for (const it of (m.items || [])) { total++; if (it.state === 'done') done++; }
        } catch (_) { /* 损坏清单跳过，不计入 total */ }
      }
      if (total > 0) batchDone = (done === total);
    }
  }
  rep.batchDone = batchDone;
  rep.provenanceValid = null; // 权威值由 --verify-batch 独立 CDP 取证给出
  const dirBlockers = [];
  if (rep.pendingFetchFiles.length) dirBlockers.push(`pending_fetch/ 本卡残留 ${rep.pendingFetchFiles.length} 个`);
  if (rep.quarantineFiles.length) dirBlockers.push(`failed_quarantine/ 本卡残留 ${rep.quarantineFiles.length} 个`);
  if (batchDone === false) dirBlockers.push('batchDone=false（批次清单仍有未完成篇目）');
  rep.dirBlockers = dirBlockers;
  // 审计 E-12 延伸：四栏 + 第 5 栏齐全仍可能被目录残留 / 未完成批次卡死，闭环判定必须一并纳入
  rep.closed = rep.closed && dirBlockers.length === 0;
  if (opt.json) { process.stdout.write(JSON.stringify(rep, null, 2) + '\n'); return; }

  const L = [];
  L.push('=== 四栏清单（state.js report' + (rep.kbVerified ? ' · KB 复核模式' : ' · 离线模式（未 KB 复核）') + '）===');
  if (opt.kbId) L.push('目标子目录：kb_id=' + opt.kbId + '  folder_id=' + (opt.folderId || '(未提供)'));
  else if (opt.kbSnapshot) L.push('目标子目录：来自快照 ' + opt.kbSnapshot);
  L.push(`应入库 : ${rep.shouldIngest}`);
  L.push(`实入库 : ${rep.confirmed}` + (rep.kbVerified && rep.ingestedClaimed !== rep.confirmed ? `  （进度声称 ${rep.ingestedClaimed}，幽灵 ${rep.ghost}）` : ''));
  L.push(`被过滤 : ${rep.filtered}`);
  L.push(`失败   : ${rep.failed}`);
  L.push(`移交Agent编排 : ${rep.needsFetch}`);
  L.push('');
  L.push(`【应入库但未入库】 : ${rep.shouldButNotIngested} 篇`);
  L.push(`   - 失败导致      : ${rep.failed} 篇（见失败明细）`);
  L.push(`   - 幽灵记录      : ${rep.ghost} 篇（进度声称 ingested，KB 查无）`);
  L.push(`   - 待入库/卡死   : ${rep.pending} 篇（通过闸门但 ingestStatus 仍为 pending）`);
  L.push(`   - 移交Agent编排 : ${rep.needsFetch} 篇（第 5 栏，pending_fetch 待回交，不计入四栏）`);
  L.push('');
  L.push(`【被过滤明细】(${rep.filtered} 篇)`);
  rep.filteredItems.forEach((x, i) => L.push(`   ${i + 1}. [${x.card}] ${x.title} — 原因：${x.reason}`));
  if (!rep.filteredItems.length) L.push('   （无）');
  L.push('');
  L.push(`【失败明细】(${rep.failed} 篇)`);
  rep.failedItems.forEach((x, i) => L.push(`   ${i + 1}. [${x.card}] ${x.title} — 原因：${x.reason}`));
  if (!rep.failedItems.length) L.push('   （无）');
  if (rep.needsFetch) {
    L.push('');
    L.push(`【移交 Agent 编排明细】(${rep.needsFetch} 篇)  ⚠️`);
    rep.needsFetchItems.forEach((x, i) => L.push(`   ${i + 1}. [${x.card}] ${x.title} — ${x.reason}`));
  }
  if (rep.ghost) {
    L.push('');
    L.push(`【幽灵记录明细】(${rep.ghost} 篇)  ⚠️`);
    rep.ghostItems.forEach((x, i) => L.push(`   ${i + 1}. [${x.card}] ${x.title} — ${x.reason}（note=${x.note || '(空)'}）`));
  }
  L.push('');
  // 审计 E-12：四栏全 0 + 移交 Agent 编排 >0 会呈现「零差额假闭环」。
  // 输出显式闭环判定，调度方不得只看四栏齐全即写 status=completed。
  const blockers = [];
  if (rep.needsFetch) blockers.push(`移交Agent编排 ${rep.needsFetch} 篇`);
  if (rep.pending) blockers.push(`待入库/卡死 ${rep.pending} 篇`);
  if (rep.ghost) blockers.push(`幽灵记录 ${rep.ghost} 篇`);
  rep.dirBlockers.forEach((b) => blockers.push(b));
  L.push(`本卡目录残留 : pending_fetch/ ${rep.pendingFetchFiles.length} 个、failed_quarantine/ ${rep.quarantineFiles.length} 个（已纳入闭环判定）`);
  L.push(`batchDone=${rep.batchDone === null ? '(无批次清单)' : rep.batchDone}  provenanceValid=由 --verify-batch 独立取证给出（report 不伪造）`);
  L.push(blockers.length
    ? `闭环判定 : ❌ 未闭环（${blockers.join('、')}）；四栏齐全≠闭环，禁止写 status=completed`
    : '闭环判定 : ✅ 四栏无待办、本卡目录残留为 0；仍须另核 --verify-batch 的 provenanceValid=true');
  L.push('提示：status=completed 须同时满足 batchDone=true、provenanceValid=true、needsFetch=0、无幽灵记录。');
  L.push('');
  if (rep.kbVerified) L.push('复核说明：实入库 ' + rep.confirmed + ' 篇均经 get_knowledge_list 复核 media_type===11 真实存在。');
  else L.push('⚠️ 离线模式：实入库为进度文件声称值，未经 KB 复核，幽灵记录检测不可用。请加 --kb-id/--folder-id（或 --kb-snapshot）复验。');
  if (kbErr) L.push('⚠️ ' + kbErr);
  process.stdout.write(L.join('\n') + '\n');
}

function cmdDiffKeywords(opt, data) {
  if (!opt.card) fail('diff-keywords 需要 --card。');
  const card = ensureCard(data, opt.card);
  if (!opt.keywords) fail('diff-keywords 需要 --keywords "<逗号/分号分隔全量关键词>"。');
  const all = String(opt.keywords).split(/[,，;；]/).map((s) => s.trim()).filter(Boolean);
  const done = new Set(card.searchedKeywords || []);
  const remain = all.filter((k) => !done.has(k));
  if (opt.json) {
    process.stdout.write(JSON.stringify({ card: opt.card, total: all.length, searched: all.length - remain.length, remaining: remain }, null, 2) + '\n');
    return;
  }
  process.stdout.write(remain.join('\n') + (remain.length ? '\n' : ''));
}

function cmdClassifyFailure(opt) {
  process.stdout.write(classifyFailure(opt.reason || '') + '\n');
}

/**
 * resolve-folder：按「ima 实际子目录名」实时解析真实 folder_id（media_id）。
 *
 * 【为什么需要】
 * 任务卡配置表不应硬编码 folder_id（子目录 media_id 服务端可变更，硬编码会随时失效）；
 * 改为每次执行时按 folder_name 向 ima 开放接口实时探查，取出真实 folder_id。
 *
 * 【契约】
 * 根目录列举（folder_id=''）返回文件夹 media_type=99、笔记 media_type=11；
 * 仅匹配 media_type!==11 的文件夹，按归一化标题（dedupKey）与 --name 比对。
 * 命中后将 folder_id 打印到 stdout（便于被 pipeline / Agent 直接消费）；--json 输出结构化。
 */
function cmdResolveFolder(opt) {
  if (!opt.name) fail('resolve-folder 需要 --name <ima 实际子目录名>（按名实时解析 folder_id，禁止硬编码）。');
  if (!opt.kbId) fail('resolve-folder 需要 --kb-id <knowledge_base_id>。');
  if (!opt.imaApi) opt.imaApi = locateImaApi();
  if (!opt.imaApi) fail('resolve-folder 无法定位 ima_api.cjs（设置 IMA_API_CJS 或确保 ima-skills 已安装）。');
  const nameKey = dedupKey(opt.name);
  const folders = [];
  let cursor = '';
  let pages = 0;
  do {
    const body = JSON.stringify({ knowledge_base_id: opt.kbId, folder_id: '', cursor, limit:50 });
    const res = spawnSync('node', [opt.imaApi, 'openapi/wiki/v1/get_knowledge_list', body], { encoding: 'utf-8', timeout: 60000 });
    if (res.error) fail('调用 ima_api.cjs 失败：' + res.error.message);
    if (res.status !== 0) fail('ima_api.cjs 退出码 ' + res.status + '：' + (((res.stderr || '').trim() || (res.stdout || '').trim()).slice(0, 200)));
    let json;
    try { json = JSON.parse(res.stdout); } catch (e) { fail('ima_api.cjs 输出非 JSON：' + res.stdout.slice(0, 200)); }
    const list = (json && json.data && (json.data.knowledge_list || json.data.list)) || [];
    for (const it of list) {
      if (Number(it.media_type) !== 11) folders.push({ media_id: String(it.media_id), title: it.title || '', media_type: it.media_type });
    }
    const next = (json && json.data && (json.data.cursor || json.data.next_cursor)) || '';
    if (!next || next === cursor) break;
    cursor = next; pages++;
  } while (pages < 100);
  const hit = folders.find((x) => dedupKey(x.title) === nameKey);
  if (!hit) {
    console.error('[resolve-folder] 未命中：在知识库根目录未找到与「' + opt.name + '」匹配的文件夹（已扫描 ' + folders.length + ' 个文件夹）。');
    if (folders.length) console.error('[resolve-folder] 现有文件夹：' + folders.map((x) => x.title + '(' + x.media_id + ')').join('、'));
    process.exit(1);
  }
  if (opt.json) console.log(JSON.stringify({ folder_id: hit.media_id, title: hit.title, card: opt.card || null }, null, 2));
  else console.log(hit.media_id);
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.command) { usage(); process.exit(2); }
  // 纯离线/无状态子命令：不触碰进度文件，无需 --progress / 文件锁，提前分流。
  // 审计 E-24：classify-failure 仅做失败原因字符串分类，原实现却被下方 --progress 必填守卫拦住，
  // 与 SKILL.md「离线判定」及引导词「无需 --progress / --card」自相矛盾，实跑必然 exit=1。
  if (opt.command === 'resolve-folder') { cmdResolveFolder(opt); return; }
  if (opt.command === 'classify-failure') { cmdClassifyFailure(opt); return; }
  if (!opt.progress) fail('缺少必填 --progress <路径>。');
  if (!opt.command) { usage(); process.exit(2); }
  // R8 防护：先判定位（禁止在技能目录树内写任何产物，含锁文件），再持锁
  assertOutsideSkillDir(path.dirname(path.resolve(opt.progress)));
  // 文件锁：覆盖 read-modify-write 全程（loadProgress 读 → 命令改 → saveProgress 写）
  acquireLock(opt.progress);
  // 任意退出路径（含 fail() 的 process.exit / 异常）均释放锁，避免脏锁残留
  process.on('exit', () => { try { releaseLock(); } catch (_) {} });
  const data = loadProgress(opt.progress);
  switch (opt.command) {
    case 'validate': cmdValidate(opt, data); break;
    case 'migrate': cmdMigrate(opt, data); break;
    case 'mark-ingested': cmdMarkIngested(opt, data); break;
    case 'mark-failed': cmdMarkFailed(opt, data); break;
    case 'mark-filtered': cmdMarkFiltered(opt, data); break;
    case 'mark-needs-fetch': cmdMarkNeedsFetch(opt, data); break;
    case 'mark-handback-consumed': cmdMarkHandbackConsumed(opt, data); break;
    case 'set-attempts': cmdSetAttempts(opt, data); break;
    case 'reset-attempts': cmdResetAttempts(opt, data); break;
    case 'reset-card': cmdResetCard(opt, data); break;
    case 'update-card': cmdUpdateCard(opt, data); break;
    case 'report': cmdReport(opt, data); break;
    case 'diff-keywords': cmdDiffKeywords(opt, data); break;
    case 'resolve-folder': cmdResolveFolder(opt); break;
    case 'classify-failure': cmdClassifyFailure(opt); break;
    default: fail(`未知子命令：${opt.command}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { dedupKey, TITLE_CAP, cardOf, locateImaApi, classifyReport, fetchKbEntries, readKbSnapshot, parseMediaIdFromNote, classifyFailure, assertOutsideSkillDir, cmdResolveFolder, cmdMarkHandbackConsumed };
