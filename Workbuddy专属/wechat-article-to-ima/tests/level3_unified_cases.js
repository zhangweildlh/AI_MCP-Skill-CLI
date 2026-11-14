#!/usr/bin/env node
/**
 * 统一第 3 级有头采集 + 13 项问题修复 —— 回归用例集（辅助模块，非独立测试入口）。
 *
 * 由已登记的 tests/test_pipeline_contract.js 直接调用，共享其 check()/汇总/退出码；
 * 依 §9.4「扫描优先 / 复用优先」不另造平行测试入口，故不单独登记 test_manifest.py
 * （§9.7 清单登记的是测试入口，本文件属被入口引用的用例模块，与 fixtures/ 同理）。
 *
 * 覆盖矩阵（对应「卡片 A 未修复问题汇总」5 个修复批次）：
 *   ① 统一 Level-3 主链路；② G3 门禁 / 纯正文计字；③ B7 可见证据行；
 *   ④ A3/B2 隔离区；⑤ A1/A4/B4/B3 状态机；⑥ B1/B3/B9/B8/B6 续跑守护 + 2 级依赖移除。
 * 纪律：零第三方依赖、零网络、零凭据、临时目录自清理（§9.5）。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function runLevel3UnifiedCases(check, deps) {
  const P = deps.P;
  const PIPE_SRC = deps.PIPE_SRC;
  const SKILL_DIR = deps.SKILL_DIR;
  const SCRIPTS = path.join(SKILL_DIR, 'scripts');
  const STATE_JS = path.join(SCRIPTS, 'state.js');
  const src = (f) => fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
  const STATE_SRC = src('state.js');
  const DRIVE_SRC = src('level3_drive.js');
  const FETCH_SRC = src('level3_cdp_fetch.js');
  const DEPS_SRC = src('check-deps.js');
  const SKILL_SRC = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const call = (fn) => { try { return fn(); } catch (e) { return '__THREW__:' + e.message; } };
  const cli = (args) => {
    const r = spawnSync('node', [STATE_JS, ...args], { encoding: 'utf-8', timeout: 30000 });
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  };

  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-l3-unified-'));
  try {
    // ==================== ① 统一 Level-3 主链路 ====================
    console.log('\n=== ⑬ 统一第 3 级采集契约与 13 项修复回归 ===');
    console.log('--- ① 主链路 ---');
    check('★ 1 级无头 HTTP 抓取器 fetchArticle 已从 pipeline.js 删除',
      !/function\s+fetchArticle\s*\(/.test(PIPE_SRC) && !/await\s+fetchArticle\s*\(/.test(PIPE_SRC));
    check('★ SKILL.md 已升 version 1.4.0 并声明统一第 3 级权威口径',
      /version:\s*1\.4\.0/.test(SKILL_SRC) && /统一第 3 级采集契约（v1\.4\.0 起唯一权威口径）/.test(SKILL_SRC));
    check('★ --search 主流程含「统一移交第 3 级有头采集」', /统一移交第 3 级有头采集/.test(PIPE_SRC));

    const wsStub = path.join(tmpWs, 'stub_ws');
    fs.mkdirSync(wsStub, { recursive: true });
    const art = { url: 'https://mp.weixin.qq.com/s?x=1', title: '统一三级测试文章', summary: '', source: '' };
    const stubKey = call(() => P.emitNeedsFetch(art, [art.url], '统一移交第 3 级有头采集', wsStub, 'A', 'b1'));
    check('★ 每篇候选必落 pending_fetch stub',
      typeof stubKey === 'string' && fs.existsSync(path.join(wsStub, 'pending_fetch', stubKey + '.md')));
    const stubBody = fs.existsSync(path.join(wsStub, 'pending_fetch', stubKey + '.md'))
      ? fs.readFileSync(path.join(wsStub, 'pending_fetch', stubKey + '.md'), 'utf8') : '';
    check('★ stub 文案指向第 3 级有头采集（不再提 2 级 web-search）',
      /第 3 级/.test(stubBody) && !/web-search/.test(stubBody));
    const bmPath = path.join(wsStub, '_batch_A_b1.json');
    const bm = fs.existsSync(bmPath) ? JSON.parse(fs.readFileSync(bmPath, 'utf8')) : { items: [] };
    check('★ 批次清单 triedLevels 恒为 [0]', !!bm.items[0] && JSON.stringify(bm.items[0].triedLevels) === '[0]');
    check('★ 批次清单 provenance 初始为 null（未取证不得预置）', !!bm.items[0] && bm.items[0].provenance === null);

    // ==================== ② G3 门禁 / 闸门口径 ====================
    console.log('--- ② G3 门禁与纯正文计字 ---');
    const MP = 'https://mp.weixin.qq.com/s?x=1';
    const BODY = '正文内容。'.repeat(300);
    const mk = (over, forceChars) => {
      const base = { level: '3', cdpPort: '9223', pageUrl: MP, agentSkill: 'chrome-devtools/SKILL.md',
        extractedAt: '2026-11-14T00:00:00.000Z', chars: '', batchId: 'b1', stubKey: 'k1' };
      const pv = Object.assign({}, base, over || {});
      const head = '# 文章标题\n\n来源：某公众号\n发布时间：2026-11-14\n作者：某\n原文直链：' + MP + '\n采集日期：2026-11-14\n\n' + BODY + '\n';
      const line = (c) => P.buildProvenanceLine(Object.assign({}, pv, { chars: String(c) }));
      if (forceChars != null) return head + line(forceChars);
      const n = P.stripEvidenceComments(head + line(1000)).replace(/\s/g, '').length;
      return head + line(n);
    };
    check('★ 合规 level=3 完整有头证据通过验收', P.validateHandback(mk()).ok === true);
    check('★ level=2 旧形态拒收', P.validateHandback(mk({ level: '2' })).ok === false);
    check('★ triedLevels=[0,1] 旧形态拒收（G2 新顺级）', P.validateHandback(mk(), { triedLevels: [0, 1] }).ok === false);
    check('★ triedLevels 缺 0 级拒收', P.validateHandback(mk(), { triedLevels: [3] }).ok === false);
    check('★ triedLevels=[0] 合法形态放行', P.validateHandback(mk(), { triedLevels: [0] }).ok === true);
    check('★ provenance.chars 按纯正文核对（张冠李戴拒收）', P.validateHandback(mk({}, '99999999')).ok === false);

    const shortRaw = '# 短标题\n\n' + '短文。'.repeat(20) + '\n';
    const longEvidence = '采集证据：' + 'x=1; '.repeat(400) + '\n\n<!-- provenance: level=3; chars=3000 -->\n';
    const padded = shortRaw + longEvidence;
    check('★ A2/B-03：证据行 + 注释确实能把裸文本凑过 800 字（判据自身有效）',
      P.evaluateGate(padded, '').chars >= 800, 'chars=' + P.evaluateGate(padded, '').chars);
    const pure = P.stripEvidenceComments(padded);
    check('★ A2/B-03：剥离后短正文不过闸（禁止凑字入库）', P.evaluateGate(pure, '').pass === false,
      'chars=' + P.evaluateGate(pure, '').chars);
    check('★ stripEvidenceComments 剥离标题 / 元数据 / 可见证据 / HTML 注释',
      !pure.includes('# 短标题') && !pure.includes('来源：') && !pure.includes('采集证据：') &&
      !pure.includes('<!--') && pure.includes('短文。'));
    check('★ 长正文剥离元数据后仍过闸（不误杀）', P.evaluateGate(P.stripEvidenceComments(mk()), '').pass === true);

    // ==================== ③ 证据持久化（B7） ====================
    console.log('--- ③ B7 可见证据行 ---');
    const pv = { level: 3, cdpPort: 9223, pageUrl: MP, agentSkill: 'chrome-devtools/SKILL.md',
      extractedAt: '2026-11-14T00:00:00.000Z', chars: 1200, batchId: 'b1', stubKey: 'k1' };
    const vline = P.buildVisibleEvidenceLine(pv);
    check('buildVisibleEvidenceLine 以「采集证据：」开头', vline.startsWith('采集证据：'));
    check('★ 可见证据行含 level / cdpPort / pageUrl / agentSkill',
      /level=3/.test(vline) && /cdpPort=9223/.test(vline) && /pageUrl=/.test(vline) && /agentSkill=/.test(vline));
    const once = P.ensureVisibleEvidence('# 标题\n\n正文\n', pv);
    const twice = P.ensureVisibleEvidence(once, pv);
    check('★ ensureVisibleEvidence 幂等（重复消费不叠加证据行）',
      (once.match(/采集证据：/g) || []).length === 1 && twice === once);
    const back = P.parseProvenance(P.buildProvenanceLine({ level: '3', cdpPort: '9223', pageUrl: MP,
      agentSkill: 'chrome-devtools/SKILL.md', extractedAt: 'x', chars: '1', batchId: 'b1', stubKey: 'k1' }));
    check('buildProvenanceLine / parseProvenance 往返一致', !!back && String(back.level) === '3');
    check('★ level3_cdp_fetch.js 写可见证据行并按纯正文计 chars',
      /采集证据：/.test(FETCH_SRC) && /bodyLen/.test(FETCH_SRC));

    // ==================== ④ 隔离区（A3 + B2） ====================
    console.log('--- ④ A3/B2 隔离区 ---');
    const wsQ = path.join(tmpWs, 'quarantine_ws');
    fs.mkdirSync(path.join(wsQ, 'pending_fetch'), { recursive: true });
    const qKey = 'A__q_12345678';
    fs.writeFileSync(path.join(wsQ, 'pending_fetch', qKey + '.md'), '# 标题\n\n正文', 'utf8');
    const qName = call(() => P.quarantineStub(wsQ, 'A', qKey, '# 标题\n\n正文', '完整性闸门未通过'));
    check('★ quarantineStub 把文件移入 failed_quarantine/',
      typeof qName === 'string' && fs.existsSync(path.join(wsQ, 'failed_quarantine', qName)));
    check('★ 隔离文件含 quarantine-reason（可追溯）',
      /quarantine-reason/.test(fs.readFileSync(path.join(wsQ, 'failed_quarantine', qName), 'utf8')));
    check('★ pending_fetch 源文件已移出（避免闭环判据残留）',
      !fs.existsSync(path.join(wsQ, 'pending_fetch', qKey + '.md')));
    check('★ A3/B2：过滤 / 闸门 / 二次校验 / 需人工复核 四类路径统一走 quarantineStub',
      (PIPE_SRC.match(/quarantineStub\(/g) || []).length >= 5,
      'quarantineStub 出现 ' + (PIPE_SRC.match(/quarantineStub\(/g) || []).length + ' 次');
    check('★ 唯一非入库删除例外：永久不可达无正文 stub 占位文件（有注释、不触碰 handback）',
      /永久不可达（文章已删除 \/ 404/.test(PIPE_SRC));

    // ==================== ⑤ 状态机（A1 / A4 / B4 / B3） ====================
    console.log('--- ⑤ 状态机 ---');
    const wsState = path.join(tmpWs, 'state_ws');
    fs.mkdirSync(wsState, { recursive: true });
    const pp = path.join(wsState, '_progress_A.json');
    const writeProgress = (articles) => fs.writeFileSync(pp, JSON.stringify({
      schema: '1.1', updatedAt: '', cards: { A: { name: '总包', folder_id: 'f1', lastRun: '', nextDue: '',
        rotateIndex: 0, status: 'pending', nextRetryAt: null, attempts: 0, searchedKeywords: [], failureClass: '' } },
      articles,
    }, null, 2), 'utf8');

    writeProgress([]);
    let r = cli(['--progress', pp, 'report', '--json']);
    let rep = null;
    try { rep = JSON.parse(r.out); } catch (_) {}
    check('★ A1 正向：闭环（空 articles、目录干净）report EXIT 0', r.code === 0, 'code=' + r.code + ' ' + r.err);
    check('★ A4：report --json 含 provenanceSource / provenanceValidNote，且 provenanceValid 恒为 null',
      !!rep && rep.provenanceValid === null && /verify-batch/.test(rep.provenanceSource || '') &&
      /禁止把 null 当作 true/.test(rep.provenanceValidNote || ''));
    writeProgress([{ card: 'A', title: '待抓取', fetchStatus: 'needs-fetch', ingestStatus: 'pending' }]);
    r = cli(['--progress', pp, 'report', '--json']);
    check('★ A1 反向：needs-fetch 未清零时 report EXIT 1', r.code === 1, 'code=' + r.code);

    writeProgress([
      { card: 'A', title: '甲-已过滤终态', stubKey: 'A__dup_11111111', fetchStatus: 'filtered', ingestStatus: 'filtered' },
      { card: 'A', title: '甲-待抓取', stubKey: 'A__dup_11111111', fetchStatus: 'needs-fetch', ingestStatus: 'pending' },
    ]);
    r = cli(['--progress', pp, 'dedup-progress', '--card', 'A']);
    const after = JSON.parse(fs.readFileSync(pp, 'utf8'));
    check('★ B4：dedup-progress 保留 filtered 终态、删除 needs-fetch（组合定序）',
      r.code === 0 && after.articles.length === 1 && after.articles[0].fetchStatus === 'filtered',
      JSON.stringify(after.articles));

    writeProgress([]);
    r = cli(['--progress', pp, 'update-card', '--card', 'A', '--l3-checkpoint',
      JSON.stringify({ phase: 'verify', round: 2, remain: 3, reason: '无进展停机' })]);
    const cp = JSON.parse(fs.readFileSync(pp, 'utf8')).cards.A.l3Checkpoint;
    check('★ B3：续跑断点写入 card.l3Checkpoint（唯一事实源）',
      r.code === 0 && !!cp && cp.phase === 'verify' && cp.round === 2 && cp.remain === 3, r.err);
    r = cli(['--progress', pp, 'update-card', '--card', 'A', '--note', '普通更新']);
    check('★ P3 回归：未带 --l3-checkpoint 的 update-card 不再 JSON.parse 空串报错', r.code === 0, r.err);
    check('★ B5：state.js usage 含 dedup-progress / --dry-run / --l3-checkpoint',
      /dedup-progress/.test(STATE_SRC) && /--dry-run/.test(STATE_SRC) && /--l3-checkpoint/.test(STATE_SRC));
    check('★ B5：pipeline.js usage 含 --retire-stub / --stub-key',
      /--retire-stub/.test(PIPE_SRC) && /--stub-key/.test(PIPE_SRC));

    // ==================== ⑥ 续跑守护 / 依赖移除 ====================
    console.log('--- ⑥ 续跑守护与 2 级依赖移除 ---');
    check('★ B1：level3_drive.js 启动对账 retry 清单（reconcileRetry）', /reconcileRetry\s*\(/.test(DRIVE_SRC));
    check('★ B3：level3_drive.js 每阶段写 checkpoint',
      /function\s+checkpoint\s*\(/.test(DRIVE_SRC) && (DRIVE_SRC.match(/checkpoint\(/g) || []).length >= 4);
    check('★ B9：stubs() 统计本卡全部 .md（不只 NEEDS_FETCH）',
      /f\.startsWith\(CARD \+ '__'\) && f\.endsWith\('\.md'\)/.test(DRIVE_SRC));
    check('★ B8：level3_cdp_fetch.js 无 mp 候选时显式 fallback 告警', /fallback/i.test(FETCH_SRC));
    check('★ B6：pipeline.js state() 统一回显 state.js 的 stderr',
      /console\.error\(r\.msg|console\.error\(.*msg/.test(PIPE_SRC));
    check('★ 2 级依赖移除：check-deps.js 不再导出/登记 firecrawl 字段',
      !/firecrawlKeyPresent/.test(DEPS_SRC) && !/firecrawlUsable/.test(DEPS_SRC) && !/soft\.firecrawl/.test(DEPS_SRC));
    check('★ SKILL.md 脚本清单登记两个第 3 级脚本',
      /level3_cdp_fetch\.js/.test(SKILL_SRC) && /level3_drive\.js/.test(SKILL_SRC));
  } finally {
    fs.rmSync(tmpWs, { recursive: true, force: true });
  }
};
