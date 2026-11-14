#!/usr/bin/env node
/**
 * wechat-article-to-ima · pending_fetch handback 合同（离线单测）
 *
 * 缘起（Phase 7 重构）：2/3 级抓取从「代码自动调用 firecrawl」改为「pipeline.js 落盘
 * pending_fetch/<url>.md 移交 Agent 编排，Agent 回交覆写后由 --ingest-pending 消费」。
 * 本测试锁定 handback 合同的纯函数与落盘契约：
 *   ① pendingKeyOf：同 URL → 同 key（含 8 位哈希后缀防碰撞），不同 URL → 不同 key；
 *   ② emitNeedsFetch：落盘 stub 文件，内容以 NEEDS_FETCH 标记开头，含 url/候选/原因；
 *   ③ isPendingStub：stub（含标记）→ true；Agent 回交（去除标记）→ false。
 *
 * 纪律：零第三方依赖；复用 pipeline.js 纯函数导出；无网络/凭据；临时目录自清理。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const P = require(path.join(SKILL_DIR, 'scripts', 'pipeline.js'));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}
function call(fn) { try { return fn(); } catch (e) { return '__THREW__:' + e.message; } }

const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-pending-'));
try {
  console.log('=== ① pendingKeyOf：确定性 + 防碰撞 ===');
  check('已导出且为函数', typeof P.pendingKeyOf === 'function');
  const k1 = call(() => P.pendingKeyOf('https://mp.weixin.qq.com/s?__biz=1'));
  const k1b = call(() => P.pendingKeyOf('https://mp.weixin.qq.com/s?__biz=1'));
  const k2 = call(() => P.pendingKeyOf('https://mp.weixin.qq.com/s?__biz=2'));
  check('同 URL → 同 key（确定性）', typeof k1 === 'string' && k1 === k1b);
  check('不同 URL → 不同 key（防碰撞）', typeof k2 === 'string' && k1 !== k2);
  check('key 含 8 位十六进制哈希后缀', typeof k1 === 'string' && /_[0-9a-f]{8}$/.test(k1));
  check('key 仅含安全文件名字符 + 哈希后缀', typeof k1 === 'string' && /^[^\\/:*?"<>|]+_[0-9a-f]{8}$/.test(k1));

  console.log('\n=== ② emitNeedsFetch：落盘 stub 契约 ===');
  check('已导出且为函数', typeof P.emitNeedsFetch === 'function');
  const a = { url: 'https://mp.weixin.qq.com/s?__biz=1&mid=9#rd' };
  const candidates = ['https://mp.weixin.qq.com/s?__biz=1&mid=9', 'https://mp.weixin.qq.com/s?__biz=1&mid=9#rd'];
  const reason = 'js_content 为空或过短';
  call(() => P.emitNeedsFetch(a, candidates, reason, tmpWs));
  const dir = path.join(tmpWs, 'pending_fetch');
  check('pending_fetch/ 目录已创建', fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  check('恰好落盘一个 .md stub', files.length === 1);
  const fp = path.join(dir, files[0]);
  const raw = fs.readFileSync(fp, 'utf8');
  check('stub 以 NEEDS_FETCH 标记开头', raw.startsWith(P.NEEDS_FETCH_MARKER));
  check('stub 含原 URL', raw.includes(a.url));
  check('stub 含候选直链', raw.includes(candidates[0]));
  check('stub 含失败原因', raw.includes(reason));

  console.log('\n=== ③ isPendingStub：stub 与 handback 判别 ===');
  check('已导出且为函数', typeof P.isPendingStub === 'function');
  check('含 NEEDS_FETCH 标记的 stub → true', P.isPendingStub(raw) === true);
  check('空内容 → false', P.isPendingStub('') === false);
  // 模拟 Agent 回交：去除标记、覆写为文章 markdown
  const handback = '# 文章标题\n\n来源：某某公众号\n\n正文第一段。\n\n正文第二段。';
  check('去除标记的 handback → false（可消费）', P.isPendingStub(handback) === false);
  // 一致性：emitNeedsFetch 落盘内容须被 isPendingStub 判为 stub
  check('★ 一致性：emitNeedsFetch 产物恒被 isPendingStub 判为 stub', P.isPendingStub(raw) === true);

  console.log('\n=== ④ handback 形态验收（审计 E-17 回归 + 新合同 provenance 强制）===');
  check('已导出 validateHandback', typeof P.validateHandback === 'function');
  check('已导出 buildProvenanceLine / parseProvenance / PROVENANCE_FIELDS',
    typeof P.buildProvenanceLine === 'function' && typeof P.parseProvenance === 'function' && Array.isArray(P.PROVENANCE_FIELDS));
  check('stub 含 handback-required 回交契约说明', raw.includes('handback-required'));

  // —— provenance 证据行构造助手：chars 取「全文去空白长度」，恒落 [bodyLen/6, bodyLen*3] ——
  const MP = 'https://mp.weixin.qq.com/s?x=1';
  const BODY = '正文。'.repeat(300);
  function makeRaw(pv, forceChars) {
    // 统一第 3 级：合规基线改为完整有头实例证据（level=3 + cdpPort + mp 直链 + chrome-devtools）。
    const base = { level: '3', cdpPort: '9223', pageUrl: MP, agentSkill: 'chrome-devtools/SKILL.md',
      extractedAt: '2026-11-13T00:00:00.000Z', chars: '', batchId: 'b1', stubKey: 'k1' };
    const p = Object.assign({}, base, pv || {});
    const head = '# 文章标题\n\n来源：某某公众号\n\n' + BODY + '\n';
    const line = (chars) => P.buildProvenanceLine(Object.assign({}, p, { chars: String(chars) }));
    if (forceChars != null) return head + line(forceChars);
    // G3 ⑦ 已改为按纯正文核对 chars，测试须复用同一 stripEvidenceComments 口径，勿另造解析。
    const bodyLen = P.stripEvidenceComments(head + line(1000)).replace(/\s/g, '').length;
    return head + line(bodyLen);
  }
  const NO_PV = '# 文章标题\n\n来源：某某公众号\n\n' + BODY;

  check('★ 合规 handback（含 provenance，level=3 完整有头证据）通过验收', P.validateHandback(makeRaw()).ok === true);
  // 统一第 3 级后，旧 1/2 级回交形态必须被拒收（契约变更的反向判据）。
  check('★ level=2 旧形态回交被拒收', P.validateHandback(makeRaw({ level: '2' })).ok === false);
  check('★ triedLevels=[0,1] 旧形态被拒收', P.validateHandback(makeRaw(), { triedLevels: [0, 1] }).ok === false);
  check('★ 反爬验证码页被拒收',
    P.validateHandback('# 搜狗搜索\n\nVerifyCode：abc\n\n此验证码用于确认这些请求是您的正常行为').ok === false);
  check('★ 未解析的中转链接回交被拒收',
    P.validateHandback('# 标题\n\n原文直链：https://weixin.sogou.com/link?url=x\n\n正文').ok === false);
  check('★ 缺 # 标题被拒收', P.validateHandback('只有正文没有标题。').ok === false);
  check('★ 无 provenance 证据行 → false（无证据不入库）', P.validateHandback(NO_PV).ok === false);
  check('★ level=3 缺 cdpPort → false（有头实例证据不全）',
    P.validateHandback(makeRaw({ level: '3', cdpPort: '', pageUrl: MP, agentSkill: 'chrome-devtools/SKILL.md' })).ok === false);
  check('★ level=3 的 pageUrl 非 mp.weixin.qq.com → false',
    P.validateHandback(makeRaw({ level: '3', cdpPort: '9223', pageUrl: 'https://example.com/x', agentSkill: 'chrome-devtools/SKILL.md' })).ok === false);
  check('★ level=3 的 agentSkill 不含 chrome-devtools → false',
    P.validateHandback(makeRaw({ level: '3', cdpPort: '9223', pageUrl: MP, agentSkill: 'web-search/firecrawl' })).ok === false);
  check('★ chars 与正文量级严重不符 → false（防伪造/张冠李戴）',
    P.validateHandback(makeRaw({}, '99999999')).ok === false);
  check('★ stubMeta.triedLevels 缺 0 级 → false（G2 顺级 0→3，禁止跳级）',
    P.validateHandback(makeRaw(), { triedLevels: [3] }).ok === false);
  check('★ stubMeta.triedLevels=[0] → true（统一第 3 级合法形态）',
    P.validateHandback(makeRaw(), { triedLevels: [0] }).ok === true);
  check('★ provenance.level 非法（9）→ false', P.validateHandback(makeRaw({ level: '9' })).ok === false);
  check('★ 合规 level=3 handback（完整有头实例证据）通过验收',
    P.validateHandback(makeRaw({ level: '3', cdpPort: '9223', pageUrl: MP, agentSkill: 'chrome-devtools/SKILL.md' })).ok === true);
  check('★ buildProvenanceLine / parseProvenance 往返一致', (() => {
    const p = { level: '3', cdpPort: '9223', pageUrl: MP, agentSkill: 'chrome-devtools/SKILL.md',
      extractedAt: '2026-11-13T00:00:00.000Z', chars: '1200', batchId: 'b1', stubKey: 'k1' };
    const back = P.parseProvenance(P.buildProvenanceLine(p));
    return back && P.PROVENANCE_FIELDS.every((k) => String(back[k]) === String(p[k]));
  })());

  console.log('\n=== ⑤ 卡前缀与批次清单（F-06/F-14 回归）===');
  const kA = P.pendingKeyOf(a.url, 'A');
  check('pendingKeyOf(url, card) 以 A__ 卡前缀开头', typeof kA === 'string' && kA.startsWith('A__'));
  check('pendingKeyOf(url, card) 仍以 8 位十六进制哈希结尾', /_[0-9a-f]{8}$/.test(kA));
  check('未传 card 时保持旧格式（向后兼容）', !P.pendingKeyOf(a.url).startsWith('A__'));
  const wsBatch = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-batch-'));
  try {
    const bKey = P.emitNeedsFetch(a, candidates, reason, wsBatch, 'A', 'b1');
    const bDir = path.join(wsBatch, 'pending_fetch');
    const bFiles = fs.readdirSync(bDir).filter((f) => f.endsWith('.md'));
    check('带卡前缀的 stub 文件名以 A__ 开头', bFiles.length === 1 && bFiles[0].startsWith('A__'));
    check('emitNeedsFetch 返回的 stubKey 与文件名一致', bFiles[0] === bKey + '.md');
    const mfp = path.join(wsBatch, '_batch_A_b1.json');
    check('_batch_A_b1.json 批次清单存在', fs.existsSync(mfp));
    const bm = JSON.parse(fs.readFileSync(mfp, 'utf8'));
    const bit = Array.isArray(bm.items) && bm.items[0];
    check('批次清单 items[0].triedLevels 为 [0]（统一第 3 级）', !!bit && JSON.stringify(bit.triedLevels) === '[0]');
    check('批次清单 items[0].state === pending', !!bit && bit.state === 'pending');
    check('批次清单 items[0].stubKey 与文件名一致', !!bit && bit.stubKey === bKey);
    check('batchManifestPath 为确定性命名', P.batchManifestPath(wsBatch, 'A', 'b1') === mfp);
  } finally {
    fs.rmSync(wsBatch, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(tmpWs, { recursive: true, force: true });
}

// ⑥ verifyBatchClosure 离线闭环（async）：注入 CDP 取证桩，零浏览器、零 KB 凭据
(async () => {
  const wsV = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-closure-'));
  try {
    console.log('\n=== ⑥ verifyBatchClosure 离线闭环（F-01/F-14/F-16）===');
    const vA = { url: 'https://mp.weixin.qq.com/s?__biz=closure&mid=7' };
    const vCandidates = ['https://mp.weixin.qq.com/s?__biz=closure&mid=7'];
    const vKey = P.emitNeedsFetch(vA, vCandidates, '原生抓取失败，移交有头实例', wsV, 'A', 'bV');
    const vManifest = JSON.parse(fs.readFileSync(P.batchManifestPath(wsV, 'A', 'bV'), 'utf8'));
    const stubKey = vManifest.items[0].stubKey;
    check('emitNeedsFetch 生成的 stubKey 与批次清单条目一致', stubKey === vKey);
    const hbHead = '# 文章标题\n\n来源：某某公众号\n\n' + '正文。'.repeat(300) + '\n';
    const hbLine = (chars) => P.buildProvenanceLine({
      level: '3', cdpPort: '9223', pageUrl: 'https://mp.weixin.qq.com/s?x=1',
      agentSkill: 'chrome-devtools/SKILL.md', extractedAt: '2026-11-13T00:00:00.000Z',
      chars: String(chars), batchId: 'bV', stubKey,
    });
    let hbRaw = hbHead + hbLine(1000);
    const bodyLen = hbRaw.replace(/\s/g, '').length;
    hbRaw = hbHead + hbLine(bodyLen);
    const stubPath = path.join(wsV, 'pending_fetch', stubKey + '.md');
    fs.writeFileSync(stubPath, hbRaw, 'utf8');

    const good = await P.verifyBatchClosure({
      ws: wsV, card: 'A', batchId: 'bV',
      verifyFn: async () => ({ ok: true, browser: 'Chrome/132', port: 9223, matchedTab: {} }),
    });
    check('★ verifyBatchClosure（注入 CDP 成功桩）ok=true', good.ok === true,
      'ok=' + good.ok + ' blockers=' + good.blockers.join(' | '));
    check('★ batchDone=true', good.batchDone === true);
    check('★ provenanceValid=true', good.provenanceValid === true);
    check('★ done === total', good.total > 0 && good.done === good.total, 'done=' + good.done + '/' + good.total);

    // 复核前置：显式重写 handback（上一轮不删 stub，此处防御实现变化）
    fs.writeFileSync(stubPath, hbRaw, 'utf8');
    const bad = await P.verifyBatchClosure({
      ws: wsV, card: 'A', batchId: 'bV',
      verifyFn: async () => ({ ok: false, reason: 'CDP 端口不可达' }),
    });
    check('★ verifyBatchClosure（注入 CDP 失败桩）ok=false', bad.ok === false);
    check('★ provenanceValid=false', bad.provenanceValid === false);
    check('★ blockers 含「独立 CDP 取证失败」',
      bad.blockers.some((b) => b.includes('独立 CDP 取证失败')), bad.blockers.join(' | '));
  } finally {
    fs.rmSync(wsV, { recursive: true, force: true });
  }
})().then(() => {
  console.log('\n=== 汇总 ===');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if (fail) { console.log('未通过明细：'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  console.error('异步闭环段落异常：' + (e && e.message ? e.message : e));
  process.exit(1);
});
