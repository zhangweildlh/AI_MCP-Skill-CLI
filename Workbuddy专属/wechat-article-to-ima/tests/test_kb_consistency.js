#!/usr/bin/env node
/**
 * wechat-article-to-ima · ima 知识库一致性审计（真实态 + 离线审计逻辑单测）
 *
 * 五维审计（每轮入库后都必须复跑，避免「进度声称已入库」与库内实态脱节）：
 *   ① 进度记录 → KB 命中（含幽灵记录：声称已入库但库中查无此文）
 *   ② KB → 进度 孤儿条目（库中有而进度无记录）
 *   ③ 目录内重复条目（按前缀去重键折叠；重复入库不可逆——开放接口无 delete 端点）
 *   ④ 标题质量：front-matter 污染 / 服务端 30 字符截断
 *   ⑤ 媒体类型分布（须为 11 = 真笔记，非 URL 书签）
 *
 * 用法：
 *   node tests/test_kb_consistency.js                    # 离线：审计逻辑单测（默认，零网络零凭据）
 *   node tests/test_kb_consistency.js --allow-real       # 真实态：审计真实 KB 与真实进度文件
 *   node tests/test_kb_consistency.js --allow-real --kb-id <知识库id> --progress <进度文件>
 *
 * 纪律：零第三方依赖；不反向依赖仓库级入口；不写入任何数据（纯只读审计）；无绝对路径。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const FIXTURE = path.join(SKILL_DIR, 'tests', 'fixtures', 'kb_snapshot_sample.json');
const { dedupKey } = require(path.join(SKILL_DIR, 'scripts', 'state.js'));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

/**
 * 五维一致性审计（纯函数，离线可回归）。
 * @param {Array} progressArticles 进度文件的 articles 数组
 * @param {Object} kbByFolder      { cardId: knowledge_list[] }
 * @returns {Object} 审计结果（计数 + 明细）
 */
function auditSnapshot(progressArticles, kbByFolder) {
  const claimed = (progressArticles || []).filter((a) => a.ingestStatus === 'ingested');
  const duplicates = [];
  const titleIssues = { frontMatter: [], truncated: [] };
  const nonNote = [];
  const byFolder = {};

  for (const [card, list] of Object.entries(kbByFolder || {})) {
    const seen = new Map();
    const mt = {};
    for (const x of list) {
      const t = String(x.title || '');
      const k = dedupKey(t);
      if (seen.has(k)) duplicates.push({ card, title: t, mediaId: x.media_id, firstMediaId: seen.get(k) });
      else seen.set(k, x.media_id);
      mt[x.media_type] = (mt[x.media_type] || 0) + 1;
      if (/^title:\s*["']/.test(t)) titleIssues.frontMatter.push({ card, title: t });
      if (t.endsWith('...')) titleIssues.truncated.push({ card, title: t });
      if (Number(x.media_type) !== 11) nonNote.push({ card, title: t, mediaType: x.media_type });
    }
    byFolder[card] = { count: list.length, uniqueKeys: seen.size, mediaTypes: mt };
  }

  let claimedHits = 0;
  const claimedMisses = [];
  for (const a of claimed) {
    const list = kbByFolder?.[a.card] || [];
    if (list.some((x) => dedupKey(x.title) === dedupKey(a.title))) claimedHits++;
    else claimedMisses.push({ card: a.card, title: a.title });
  }

  const claimedKeys = new Set(claimed.map((a) => dedupKey(a.title)));
  const orphans = [];
  for (const [card, list] of Object.entries(kbByFolder || {})) {
    for (const x of list) if (!claimedKeys.has(dedupKey(x.title))) orphans.push({ card, title: x.title, mediaId: x.media_id });
  }

  return {
    byFolder, duplicates, titleIssues, nonNote,
    claimedTotal: claimed.length, claimedHits, claimedMisses, orphans,
  };
}

console.log('=== ① 离线：五维审计逻辑单测（合成快照，零网络零凭据）===');
const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const audit = auditSnapshot(fx.progress.articles, fx.kb);
check('① 目录内重复条目检出数正确', audit.duplicates.length === fx.expect.duplicates,
  `实得 ${audit.duplicates.length}，期望 ${fx.expect.duplicates}`);
check('② front-matter 污染标题检出数正确', audit.titleIssues.frontMatter.length === fx.expect.frontMatterLeaks,
  `实得 ${audit.titleIssues.frontMatter.length}`);
check('② 服务端截断标题检出数正确', audit.titleIssues.truncated.length === fx.expect.truncated,
  `实得 ${audit.titleIssues.truncated.length}`);
check('③ 非笔记媒体类型检出数正确', audit.nonNote.length === fx.expect.nonNoteEntries,
  `实得 ${audit.nonNote.length}`);
check('④ 进度声称已入库 → 命中数正确', audit.claimedHits === fx.expect.claimedHits,
  `实得 ${audit.claimedHits}，期望 ${fx.expect.claimedHits}`);
check('④ 幽灵记录（声称已入库但库中无）检出数正确', audit.claimedMisses.length === fx.expect.claimedMisses,
  `实得 ${audit.claimedMisses.length}，期望 ${fx.expect.claimedMisses}`);
check('⑤ 孤儿条目（库中有而进度无）检出数正确', audit.orphans.length === fx.expect.orphans,
  `实得 ${audit.orphans.length}，期望 ${fx.expect.orphans}`);
check('★ front-matter 污染标题经去重键归一后可被进度记录命中（可定位而非失联）',
  audit.claimedMisses.every((m) => !m.title.includes('被污染')), JSON.stringify(audit.claimedMisses));
check('每卡条目数与唯一去重键数同时给出（重复即两者不等）',
  audit.byFolder.A.count === 6 && audit.byFolder.A.uniqueKeys === 5,
  JSON.stringify(audit.byFolder.A));
check('媒体类型分布被统计', audit.byFolder.A.mediaTypes['11'] === 5 && audit.byFolder.A.mediaTypes['14'] === 1,
  JSON.stringify(audit.byFolder.A.mediaTypes));

async function realStateSection() {
  console.log('\n=== ② 真实态：审计真实 KB 与真实进度文件（需 --allow-real）===');
  const allowReal = process.argv.includes('--allow-real');
  if (!allowReal) {
    console.log('  ○ 已跳过（真实态测试默认不运行，须 --allow-real 显式门控，见 §9.3）');
    return;
  }
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
  const kbId = arg('--kb-id', process.env.IMA_KB_ID || '');
  const progFile = arg('--progress', '');
  if (!kbId || !progFile || !fs.existsSync(progFile)) {
    console.log('  ⚠ 缺少 --kb-id / --progress（或进度文件不存在），跳过真实态审计');
    return;
  }
  const { imaApi } = require(path.join(process.env.USERPROFILE || '', '.workbuddy', 'skills', 'ima-skills', 'ima_api.cjs'));
  const prog = JSON.parse(fs.readFileSync(progFile, 'utf8'));
  const kbByFolder = {};
  for (const [card, c] of Object.entries(prog.cards || {})) {
    if (!c.folder_id) continue;
    const r = await imaApi('openapi/wiki/v1/get_knowledge_list',
      { knowledge_base_id: kbId, folder_id: c.folder_id, cursor: '', limit: 50 }, {});
    const j = JSON.parse(r || '{}');
    kbByFolder[card] = j.data?.knowledge_list || [];
  }
  const a = auditSnapshot(prog.articles, kbByFolder);
  console.log('  各卡子目录实态：' + JSON.stringify(a.byFolder));
  console.log('  重复条目=' + a.duplicates.length + '  front-matter污染=' + a.titleIssues.frontMatter.length
    + '  截断=' + a.titleIssues.truncated.length + '  非笔记=' + a.nonNote.length);
  console.log('  声称已入库 ' + a.claimedTotal + ' → 命中 ' + a.claimedHits + '，幽灵记录 ' + a.claimedMisses.length
    + '；孤儿条目 ' + a.orphans.length);
  if (a.claimedMisses.length) a.claimedMisses.forEach((m) => console.log('    ✗ 幽灵：card=' + m.card + ' 「' + m.title + '」'));
  if (a.duplicates.length) a.duplicates.forEach((d) => console.log('    ⚠ 重复：card=' + d.card + ' 「' + d.title + '」'));
  check('★ 库内不得存在重复条目（重复不可逆：无 delete 端点）', a.duplicates.length === 0, '重复 ' + a.duplicates.length + ' 条');
  check('★ 库内不得存在 front-matter 污染标题', a.titleIssues.frontMatter.length === 0, '污染 ' + a.titleIssues.frontMatter.length + ' 条');
  check('★ 库内条目须全为笔记（media_type=11）', a.nonNote.length === 0, '非笔记 ' + a.nonNote.length + ' 条');
  check('★ 进度声称已入库的条目须全部能在库中命中（无幽灵记录）', a.claimedMisses.length === 0, '幽灵 ' + a.claimedMisses.length + ' 条');
}

(async () => {
  await realStateSection();
  console.log('\n=== 汇总 ===');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if (fail) {
    console.log('未通过明细：');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(fail ? 1 : 0);
})();
