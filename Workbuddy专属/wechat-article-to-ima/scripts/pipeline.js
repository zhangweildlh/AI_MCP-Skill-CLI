#!/usr/bin/env node
/**
 * wechat-article-to-ima 采集流水线（抓取 → 过滤 → 完整性闸门 → 笔记入库 → 状态回写）。
 *
 * 【为什么要有这个脚本】
 * SKILL.md 的「抓取降级链」「笔记去重」此前只有散文、没有可执行实现，导致：
 *   - 中转链接从未被解析（实测 23 篇抓取失败中 21 篇因此失败，占 91%）；
 *   - 笔记去重用整标题精确比对，而 ima 服务端会把标题截断到 30 字符 → 续跑重复入库，
 *     且开放接口**无删除端点**、重复不可逆。
 * 本脚本把该链路固化为可重放的确定性实现。
 *
 * 【零依赖】仅用 Node 内置模块（fs / path / child_process / 全局 fetch）。
 *   - ima 开放接口：以 `require()` 方式引入 ima-skills 的 ima_api.cjs（取其导出的
 *     imaApi()），**避免长 Markdown 正文走 CLI 位置参数触发长度上限**；
 *   - 状态回写：一律经 `scripts/state.js` 子命令（F9 硬约束：进度文件唯一写入口）。
 *
 * 【用法】
 *   node pipeline.js --workspace <工区绝对路径> --card A --search "<检索结果.json>" \
 *                    [--kb-id <知识库id>] [--folder-id <子目录id>] [--limit N] [--dry-run]
 *   node pipeline.js --workspace <工区> --card A --ingest-pending --kb-id <知识库id> --folder-id <子目录id>
 *
 *   --search          检索脚本产出的结果 JSON（含 articles[]）
 *   --limit           仅处理前 N 条（冒烟测试）
 *   --dry-run         只跑过滤与闸门，不抓取不入库
 *   --ingest-pending  消费 Agent 编排回交的 handback：读取 pending_fetch/*.md（去除 NEEDS_FETCH
 *                     标记的已回交文章 markdown），重跑过滤+完整性闸门后入库（2/3 级降级链消费端）
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const __dirname_ = __dirname;
const STATE_JS = path.join(__dirname_, 'state.js');
const RESOLVE_JS = path.join(__dirname_, 'resolve_midlink.js');

// 透传给 state.js 子进程的额外参数（--skill-base 由 agent 引导词传入，优先级高于内置默认）
let STATE_EXTRA = [];

// ── 参数解析 ──
function parseArgs(argv) {
  const o = { workspace: '', card: '', search: '', kbId: '', folderId: '', limit: 0, dryRun: false, ingestQuarantine: false, ingestPending: false, verifyBatch: false, batchId: '', skillBase: '', json: false, sweepOrphans: false, retireStub: false, stubKey: '', reason: '', dedupProgress: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') o.workspace = argv[++i] || '';
    else if (a === '--card') o.card = argv[++i] || '';
    else if (a === '--search') o.search = argv[++i] || '';
    else if (a === '--kb-id') o.kbId = argv[++i] || '';
    else if (a === '--folder-id') o.folderId = argv[++i] || '';
    else if (a === '--limit') o.limit = parseInt(argv[++i], 10) || 0;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--ingest-quarantine') o.ingestQuarantine = true;
    else if (a === '--ingest-pending') o.ingestPending = true;
    else if (a === '--verify-batch') o.verifyBatch = true;
    else if (a === '--batch-id') o.batchId = argv[++i] || '';
    else if (a === '--skill-base') o.skillBase = argv[++i] || '';
    else if (a === '--json') o.json = true;
    else if (a === '--sweep-orphans') o.sweepOrphans = true;
    else if (a === '--retire-stub') o.retireStub = true;
    else if (a === '--stub-key') o.stubKey = argv[++i] || '';
    else if (a === '--reason') o.reason = argv[++i] || '';
    else if (a === '--dedup-progress') o.dedupProgress = true;
  }
  return o;
}

// ── ima-skills 定位：复用 state.js 的 locateImaApi（单一事实源，避免两份路径解析）──

// ── 过滤规则（S3：词族分层 + 上下文模式 + 词边界守卫）──
// strong：命中即判定为该类公告。
//         标题层：命中任一 strong 即拦截；
//         正文层：**须同族命中 ≥2 个不同 strong** 才拦截（单次顺带提及不算公告类，
//                 如新闻正文里出现一次「中标公示」不应把整篇行业报道丢掉）。
// weak  ：该词在目标领域属高频通用词，**仅标题层**在上下文模式同时命中时拦截；
//         正文层一律不拦截（实测正文层的「评标/中标/推广/开工/动工」多为法规原文与政策套话）。
const FILTER_RULES = {
  中标类: {
    strong: ['中标公示', '中标公告', '成交公告', '中标候选人', '中标候选人名单', '开标记录', '评标结果公告', '评标结果', '招标公告', '招标编号', '中标通知书', '预中标公示', '中标结果公告', '成交通知书', '中标金额'],
    weak: [
      { w: '中标', p: /(中标|预中标)(公告|公示|候选人|结果|通知书|候选人名单|金额)/ },
      { w: '开标', p: /(开标|唱标)记录/ },
    ],
  },
  开工类: {
    strong: ['开工仪式', '开工典礼', '正式开工公告', '奠基仪式', '破土动工', '开工动员'],
    weak: [
      { w: '开工', p: /(正式|隆重|顺利|如期|集中)?开工(仪式|典礼|建设|启动|动员)?$/ },
      { w: '动工', p: /(破土|正式|如期)动工/ },
    ],
  },
  招商类: {
    strong: ['招商公告', '招募令', '加盟合作', '招商热线', '投资招募公告', '招商合作'],
    weak: [{ w: '招募', p: /(招募|招商)(令|公告|合作|计划)/ }],
  },
  广告类: {
    strong: ['商务合作', '广告投放', '赞助合作', '带货直播', '微信公众号广告', '广告合作', '商业推广'],
    weak: [{ w: '推广', p: /(广告|商业|市场)(推广|投放)/ }],
  },
};

/**
 * 命中返回族名，未命中返回 null。
 * @param {string} text 待判定文本
 * @param {'title'|'body'} layer 判定层
 */
function matchFilter(text, layer) {
  if (!text) return null;
  for (const [fam, rule] of Object.entries(FILTER_RULES)) {
    // 强特征：标题层任一命中即拦截；正文层须同族 ≥2 个不同强特征
    const hits = rule.strong.filter((s) => text.includes(s));
    if (hits.length && (layer !== 'body' || hits.length >= 2)) return fam;
    if (layer !== 'title') continue; // 弱特征仅在标题层生效
    for (const weak of rule.weak) {
      if (!text.includes(weak.w)) continue;
      if (weak.p.test(text)) return fam;
    }
  }
  return null;
}

// ── 完整性闸门参数（与 SKILL.md 参数配置区一致）──
const MIN_CHARS = 800;
const MIN_PERIODS = 5;

// ── 错误页 / 反爬页语义否决（审计 E-17）──
// 2 级 firecrawl 抓搜狗中转链接会返回 exit=0 但内容实为 antispider 验证码页；
// 该页 chars≥MIN_CHARS 且段落数≥3 会命中 aux.met 豁免 MIN_PERIODS，原闸门判 pass=true，
// 一旦经 handback 回交即被 import_doc 写进 KB（开放接口无 delete，不可逆）。
const ERROR_PAGE_MARKERS = [
  'VerifyCode', 'antispider', '此验证码用于确认', '需要您协助验证',
  '提交后没解决问题', '搜狗搜索',
];
function looksLikeErrorPage(text) {
  const s = String(text || '');
  let hits = 0;
  for (const m of ERROR_PAGE_MARKERS) if (s.includes(m)) hits++;
  return hits >= 2 || s.includes('此验证码用于确认') || s.includes('VerifyCode');
}
/**
 * 抓取结果归因（纯函数，离线可回归）——缺陷 D 修复核心：
 * 反爬/验证码页语义否决必须优先于「正文为空」判定。
 * 顺序即契约：先识别反爬页（looksLikeErrorPage），再判 js_content 长度。
 * 否则「无浏览器→中转链接未解析→取回反爬页」会被误报为「js_content 为空（内容已删除）」，
 * 掩盖真实根因，误导诊断、续跑决策与 report 归因。
 * @returns {{kind:'error-page'|'empty'|'ok', err?:string, inner?:string, author?:string}}
 */
function classifyFetchResult(html) {
  if (looksLikeErrorPage(html)) {
    return { kind: 'error-page', err: '命中反爬/验证码页（疑似无浏览器→中转链接未解析，或搜狗限流；非内容已删除）' };
  }
  const inner = extractContent(html);
  if (!inner || inner.replace(/<[^>]+>/g, '').trim().length < 50) {
    return { kind: 'empty', err: 'js_content 为空或过短（页面异常/内容已删除）' };
  }
  return { kind: 'ok', inner, author: extractAuthor(html) };
}
/**
 * 采集统计摘要（纯函数，离线可回归）——缺陷 C 修复核心：
 * 内联摘要「实入库」口径与 state.js report 四栏对齐（KB 已存在跳过不计入新入）。
 * 实入库 = ingested - dupSkipped（Math.max 兜底非负），KB 已存在跳过单独披露。
 * @param {{shouldIngest?:number,ingested?:number,filtered?:number,failed?:number,dupSkipped?:number}} stat
 */
function computeIngestSummary(stat) {
  const newlyIngested = Math.max(0, (stat.ingested || 0) - (stat.dupSkipped || 0));
  return {
    shouldIngest: stat.shouldIngest || 0,
    newlyIngested,
    dupSkipped: stat.dupSkipped || 0,
    filtered: stat.filtered || 0,
    failed: stat.failed || 0,
  };
}
// ── 可机读合同（F-01/F-16）：provenance 证据行 ──
// 格式：<!-- provenance: level=3; cdpPort=9223; pageUrl=...; agentSkill=...; extractedAt=...; chars=...; batchId=...; stubKey=... -->
// 证据行由 Agent 写，但**验收不由 Agent 自证**：level=3 的 pageUrl/cdpPort 另经
// resolve_midlink.js 的 verifyHeadedSession() 直连 CDP 独立复核（见 --verify-batch）。
const PROVENANCE_FIELDS = ['level', 'cdpPort', 'pageUrl', 'agentSkill', 'extractedAt', 'chars', 'batchId', 'stubKey'];

/** 解析 provenance 注释行；缺失返回 null。 */
function parseProvenance(raw) {
  const s = String(raw || '');
  const m = s.match(/<!--\s*provenance:\s*([\s\S]*?)-->/i);
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(/[;；]/)) {
    const kv = part.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*?)\s*$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

/** 生成 provenance 注释行（供 Agent 回交合同与测试复用，避免手拼格式漂移）。 */
function buildProvenanceLine(p) {
  const o = p || {};
  return '<!-- provenance: ' + PROVENANCE_FIELDS
    .map((k) => `${k}=${o[k] == null ? '' : String(o[k]).replace(/-->/g, '')}`)
    .join('; ') + ' -->';
}

/**
 * Agent 回交 handback 的形态验收（G3 增强，审计 E-17 + F-09 七条硬门禁；统一第 3 级）。
 * 不合格一律拒收并保留文件；stubMeta 可选，用于比对批次合同（triedLevels / stubKey）。
 * @returns {{ok:boolean,reason:string,provenance:(object|null)}}
 */
function validateHandback(raw, stubMeta) {
  const s = String(raw || '');
  // ① 反爬/验证码页语义否决（优先于一切数值判据）
  if (looksLikeErrorPage(s)) return { ok: false, reason: '命中反爬/验证码页语义（禁止入库，避免不可逆污染）', provenance: null };
  // ② 未解析的搜狗中转链接
  if (/weixin\.sogou\.com\/(?:link\?|antispider)/i.test(s) && !/mp\.weixin\.qq\.com/i.test(s)) {
    return { ok: false, reason: '原文直链仍为搜狗中转/反爬链接，未取回真实正文', provenance: null };
  }
  // ③ 元数据头
  if (!/^#\s+\S/m.test(s)) return { ok: false, reason: '缺少 `# 文章标题` 元数据头（不符合 SKILL.md 锁定格式）', provenance: null };
  // ④ provenance 必填：无证据不入库（F-01 根因）
  const pv = parseProvenance(s);
  if (!pv) return { ok: false, reason: '缺少 provenance 机器可读证据行（无证据不入库）', provenance: null };
  // ⑤ 统一第 3 级 + G2 顺级（0 级链接解析 → 3 级有头采集，禁止跳级/伪造层级）
  if (String(pv.level) !== '3') {
    return { ok: false, reason: 'provenance.level 须为 3（统一有头采集，禁止 1/2 级回交）', provenance: pv };
  }
  const tried = (stubMeta && Array.isArray(stubMeta.triedLevels)) ? stubMeta.triedLevels.map(Number) : null;
  if (tried && !tried.includes(0)) {
    return { ok: false, reason: 'triedLevels 缺 0 级（中转链接解析），违反 G2 顺级', provenance: pv };
  }
  // 统一第 3 级后 stub 的 triedLevels 恒为 [0]：0 级只解析中转直链，正文一律由第 3 级有头采集。
  // [0,1] 等旧形态来自已摘除的 1 级无头 HTTP 抓取链路，拒收以防证据链形态回退。
  if (tried && !(tried.length === 1 && tried[0] === 0)) {
    return { ok: false, reason: 'triedLevels 须为 [0]（0 级中转链解析 → 3 级有头采集），旧形态 [0,1] 拒收', provenance: pv };
  }
  // ⑥ level=3 必须携带完整有头实例证据
  if (String(pv.level) === '3') {
    for (const k of ['cdpPort', 'pageUrl', 'agentSkill']) {
      if (!pv[k]) return { ok: false, reason: `level=3 缺 provenance.${k}（有头实例证据不全）`, provenance: pv };
    }
    if (!/^https?:\/\/mp\.weixin\.qq\.com\//i.test(String(pv.pageUrl))) {
      return { ok: false, reason: 'provenance.pageUrl 非 mp.weixin.qq.com 真实直链', provenance: pv };
    }
    if (!Number.isFinite(Number(pv.cdpPort)) || Number(pv.cdpPort) <= 0) {
      return { ok: false, reason: 'provenance.cdpPort 非合法端口', provenance: pv };
    }
    if (!/chrome-devtools/i.test(String(pv.agentSkill))) {
      return { ok: false, reason: 'provenance.agentSkill 未指向 chrome-devtools 主 SKILL.md', provenance: pv };
    }
  }
  // ⑦ 正文量级自洽（防张冠李戴 / 伪造正文）
  if (!Number.isFinite(Number(pv.chars)) || Number(pv.chars) <= 0) {
    return { ok: false, reason: 'provenance.chars 缺失或非正数（无法核对正文量级）', provenance: pv };
  }
  const bodyLen = stripEvidenceComments(s).replace(/\s/g, '').length;
  if (bodyLen > 0 && (Number(pv.chars) > bodyLen * 2 || Number(pv.chars) < bodyLen / 2)) {
    return { ok: false, reason: `provenance.chars=${pv.chars} 与纯正文量级 ${bodyLen} 不符（疑似张冠李戴或伪造）`, provenance: pv };
  }
  return { ok: true, reason: '', provenance: pv };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 微信文章直连需带 Referer（否则易被反爬/防盗链拦截返回空正文或验证页；
// 2026-11-10 卡片A 实跑 31 篇原生抓取失败即疑似缺此头，加回零风险、零行为退化）。
const WECHAT_REFERER = 'https://mp.weixin.qq.com/';
function buildFetchHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: WECHAT_REFERER,
  };
}

// ── state.js 调用（F9：进度写入唯一入口）──
function state(cmd, args, allowFail) {
  const res = spawnSync('node', [STATE_JS, '--progress', state.progressPath, ...STATE_EXTRA, cmd, ...args], { encoding: 'utf-8' });
  const msg = (res.stderr || res.stdout || '').trim();
  // B6 修复：state.js 的所有提示/警告走 stderr，原实现成功时只存进 msg 不回显，
  // allowFail=true 的 mark-* 回写失败会完全静默（KB 已写、进度未更新的半态无人察觉）。
  // 统一在此回显，调用方无需各写一套；失败时附命令名便于定位。
  if (msg) console.error(res.status !== 0 ? `[state.js ${cmd}] ${msg}` : msg);
  if (res.status !== 0) {
    if (allowFail) return { ok: false, msg };
    throw new Error(`state.js ${cmd} 失败：${msg}`);
  }
  return { ok: true, msg: (res.stderr || '').trim() };
}

// ── HTML → 正文 ──
function extractContent(html) {
  const m = html.match(/id="js_content"[^>]*>([\s\S]*?)<\/div>\s*<script/i) ||
    html.match(/id="js_content"[^>]*>([\s\S]*?)<\/div>/);
  return m ? m[1] : '';
}
function extractAuthor(html) {
  const pats = [
    /id="js_author_name"[^>]*>([\s\S]{0,80}?)</,
    /<meta[^>]+property="og:article:author"[^>]+content="([^"]*)"/,
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m) {
      const v = m[1].replace(/<[^>]+>/g, '').trim();
      if (v && v !== 'undefined' && v !== 'null') return v;
    }
  }
  return '未知';
}
function htmlToText(html) {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<h1[^>]*>/gi, '\n# ').replace(/<\/h1>/gi, '\n\n');
  s = s.replace(/<h2[^>]*>/gi, '\n## ').replace(/<\/h2>/gi, '\n\n');
  s = s.replace(/<h3[^>]*>/gi, '\n### ').replace(/<\/h3>/gi, '\n\n');
  s = s.replace(/<h[4-6][^>]*>/gi, '\n#### ').replace(/<\/h[4-6]>/gi, '\n\n');
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|section|tr|blockquote)>/gi, '\n\n');
  s = s.replace(/<(p|div|section|tr|blockquote)[^>]*>/gi, '\n');
  s = s.replace(/<img[^>]+src="([^"]*)"[^>]*>/gi, (mm, src) => `\n![图片](${src})\n`);
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
function auxCriteria(html, text) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0).length;
  let structured, headings;
  if (html && html.trim()) {
    // HTML 源形态（历史 1 级输入；现仍用于 handback 附带的 HTML 片段辅助判据）：直接数 HTML 标签
    structured = (html.match(/<(li|tr|table)\b/gi) || []).length;
    headings = (html.match(/<h[2-6]\b/gi) || []).length;
  } else {
    // markdown 源（2/3 级 Agent 编排抓取直出 markdown，无 HTML 标签）：用 markdown 语法近似
    // （修复前 structured/headings 恒为 0 → 含 2 列表 + 1 标题的优质 markdown 被误关）
    structured = (text.match(/^\s*[-*]\s+/gm) || []).length + (text.match(/^\s*\|.+\|/gm) || []).length;
    headings = (text.match(/^\s{0,3}#{1,6}\s+/gm) || []).length;
  }
  return { paragraphs, structured, headings, met: paragraphs >= 3 || structured >= 2 || headings >= 1 };
}

/** 元数据头（S8：锁定内联形态，禁止 YAML front-matter——否则标题会被 front-matter 污染）*/
function buildMd(a, art, title) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const collected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const published = a.datetime || a.date_text || '未知';
  const direct = a.__resolvedUrl || a.url;
  // 统一第 3 级后回交物为 markdown；buildMd/htmlToText 仍被隔离区补入与既有测试复用，故保留
  const body = (art && art.markdown != null) ? art.markdown : htmlToText(art.html);
  return `# ${title}\n\n来源：${a.source || '未知'}\n发布时间：${published}\n作者：${art.author}\n原文直链：${direct}\n采集日期：${collected}\n\n${body}\n`;
}

/**
 * 解析 ima 开放接口响应（纯函数，可离线单测）。
 *
 * ⚠️ `ima_api.cjs` 的 `imaApi()` 返回的是**原始响应文本**而非已解析对象。
 *    若调用方直接 `resp.data`，读到的恒为 undefined → 会静默读不到 KB 现有条目
 *    → 去重失效 → 重复入库（而开放接口无 delete 端点，重复**不可逆**）。
 *    本函数是唯一的响应解析入口，业务码非 0 一律抛错（禁止当成功处理）。
 *
 * @param {string} apiPath 仅用于错误信息定位
 * @param {string} text    imaApi() 返回的原始响应文本
 * @returns {object} 解析后的业务对象
 */
function parseImaResponse(apiPath, text) {
  let j;
  try { j = JSON.parse(text || '{}'); }
  catch (e) { throw new Error(apiPath + ' 响应非 JSON：' + String(text).slice(0, 200)); }
  if (j && j.code !== undefined && j.code !== 0) {
    const err = new Error(apiPath + ' code=' + j.code + ' msg=' + j.msg);
    err.imaCode = j.code;
    throw err;
  }
  return j;
}

/**
 * 隔离区补入判定（纯函数，可离线单测）：该篇 .md 是否值得重新尝试入库。
 *  - 无进度记录 → 尝试（信息不足，交给入库流程判定）；
 *  - 闸门未过（gateResult 以 fail 开头，属质量不达标）→ 不重入（重入必再次失败，浪费限流预算）；
 *  - 闸门通过但入库失败（多为瞬态：网络/限流/凭据）→ 尝试。
 * @param {string} title 文章标题（用于定位进度条目）
 * @param {object|undefined} art 进度文件 articles 条目
 */
function shouldReingest(title, art) {
  if (!art) return true;
  if (String(art.gateResult || '').startsWith('fail')) return false;
  return true;
}

const safeFile = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);

// 标题归一化（与 --search 主流程同款：去首尾空白 + 去所有空白 + 全小写），用于 B-01 根因预防的
// 同文跨词去重判定。近重复标题（归一化后不同）不会被误合并（实测存在「总包的三笔账…」一对近重名）。
const normalizeTitle = (t) => String(t == null ? '' : t).trim().replace(/\s+/g, '').toLowerCase();

/**
 * 抓取失败原因构造（纯函数，可离线单测）：原生抓取（1 级）与 Agent 编排兜底（2/3 级）的
 * 双路失败原因必须分别保留，不得合并成一句笼统的兜底不可用——否则真实根因（HTTP 4xx /
 * js_content 为空 / 超时）被淹没，既无法诊断也无法驱动 test_fetch_failure_taxonomy 分类器。
 * 注：2/3 级（web-search→firecrawl / chrome-devtools）本属 Agent 编排层，pipeline.js 不自动调用；
 * 此函数保留为通用原因合并工具，供上层在 Agent 兜底失败时组合原生原因与编排原因。
 * @param {Error|string|null} nativeErr 原生抓取错误（已逐候选尝试后仍非空）
 * @param {string} agentReason Agent 编排兜底（2/3 级）的失败原因（空串表示未触发）
 */
function buildFetchFailureReason(nativeErr, agentReason) {
  const nat = nativeErr ? String(nativeErr.message != null ? nativeErr.message : nativeErr) : '';
  const ag = String(agentReason || '');
  if (nat && ag) return `原生抓取失败：${nat}｜Agent 编排兜底失败：${ag}`;
  if (nat) return `原生抓取失败：${nat}`;
  if (ag) return `Agent 编排兜底失败：${ag}`;
  return '未知抓取失败（原生与编排兜底均无可用原因）';
}

// ── 2/3 级抓取为 Agent 编排路径（web-search→firecrawl / chrome-devtools），不在本脚本
//    代码内自动调用；1 级失败改由 emitNeedsFetch 落盘 pending_fetch/<url>.md 移交 Agent 编排 ──

// pending_fetch 移交（降级链 2/3 级为 Agent 编排层，不在本脚本代码内自动调用）：
//   1 级（原生 fetch）失败时，把待抓取需求落盘 pending_fetch/<key>.md 移交 Agent 编排；
//   Agent 经 2 级（web-search→firecrawl）或 3 级（chrome-devtools）取到正文后，把文章
//   markdown 覆写到同一 <key>.md（去除 NEEDS_FETCH 标记）作为 handback；pipeline.js 再由
//   --ingest-pending 模式消费该 handback，重跑过滤 + 完整性闸门后入库（见 SKILL.md「硬门禁·G3」）。
const PENDING_DIR = 'pending_fetch';
const NEEDS_FETCH_MARKER = '<!-- NEEDS_FETCH -->';
function pendingKeyOf(url, card) {
  const base = safeFile(url);
  // 加短哈希后缀防 URL 碰撞（同 safeFile 截断致不同 URL 同文件名）
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;
  const key = base + '_' + h.toString(16).slice(0, 8);
  const c = String(card || '').trim();
  // F-06：卡前缀使「本卡 stub 残留 0」可由目录名直接判定（与 failed_quarantine 的 <card>__ 对齐）。
  // 未传 card 时保持旧格式，兼容既有调用与离线测试。
  return c ? safeFile(c) + '__' + key : key;
}

/** 批次清单路径（F-14）：确定性命名，供主 Agent 按批次派发与断点续跑。 */
function batchManifestPath(ws, card, batchId) {
  return path.join(ws, '_batch_' + safeFile(card) + '_' + safeFile(batchId || 'default') + '.json');
}

/** 原子写入（F-15）：先写 .tmp 再 rename，避免中断产生半截文件。 */
function atomicWriteJson(fp, obj) {
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

/**
 * A3/B2 公共落点：把「未成功入库」的 handback 移入 failed_quarantine/ 保留，供人工复核或下轮续跑。
 * 依据 SKILL.md 步骤 12「严禁删除尚未成功入库的本地 .md 副本」。原三处 fs.unlinkSync 会直接销毁
 * 待复核对象（实测卡片 A 中「疑似纯图片/视频，需人工复核」条目即因此永久丢失）。
 * 成功入库的本地副本删除不在此列（SKILL.md「入库流程」允许）。
 */
function quarantineStub(ws, card, stubKey, content, reason) {
  const qdir = path.join(ws, 'failed_quarantine');
  fs.mkdirSync(qdir, { recursive: true });
  const name = safeFile(card) + '__' + safeFile(stubKey) + '.md';
  const body = String(content || '') + '\n\n<!-- quarantine-reason: ' + String(reason || '未成功入库') + ' -->\n';
  fs.writeFileSync(path.join(qdir, name), body, 'utf8');
  try { fs.unlinkSync(path.join(ws, PENDING_DIR, stubKey + '.md')); } catch (_) {}
  return name;
}

/** 更新批次清单中某篇状态：pending → inflight → done（F-14 断点与幂等）。 */
function updateBatchItem(ws, card, batchId, stubKey, stateName, provenance) {
  const fp = batchManifestPath(ws, card, batchId);
  if (!fs.existsSync(fp)) return null;
  let m;
  try { m = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { return null; }
  const it = (m.items || []).find((x) => x.stubKey === stubKey);
  if (!it) return null;
  it.state = stateName;
  if (stateName === 'inflight') it.attempts = Number(it.attempts || 0) + 1;
  if (stateName === 'done') it.doneAt = new Date().toISOString();
  if (provenance) it.provenance = provenance;
  atomicWriteJson(fp, m);
  return m;
}

function emitNeedsFetch(a, candidates, reason, ws, card, batchId) {
  const dir = path.join(ws, PENDING_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const c = String(card || '').trim();
  const bid = String(batchId || 'default');
  const nt = normalizeTitle(a.title);
  // B-01 根因预防：同文跨关键词以不同搜狗签名落两 stub → 只留其一。
  // 已存在本卡 stub 且 <!-- title: NORM:nt --> 一致（同一篇文章），复用其 key，不再新建文件；
  // 近重复标题（归一化标题不同）各自保留独立 stub，避免误合并（实测「总包的三笔账…」一对近重名）。
  let key = null;
  if (c && nt) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith(c + '__') || !f.endsWith('.md')) continue;
        const fp = path.join(dir, f);
        const content = fs.readFileSync(fp, 'utf8');
        const m = content.match(/<!--\s*title:\s*NORM:([\s\S]*?)\s*-->/i);
        if (!m || m[1].replace(/[<>]/g, '') !== nt) continue;
        const existingKey = f.replace(/\.md$/, '');
        if (isPendingStub(content)) { key = existingKey; }
        else { return existingKey; } // 已是 handback，文章已取回，直接复用本 key
        break;
      }
    } catch (_) { /* 扫描失败则走新建分支 */ }
  }
  if (!key) key = pendingKeyOf(a.url, card);
  const lines = [
    NEEDS_FETCH_MARKER,
    `<!-- url: ${a.url} -->`,
    `<!-- title: NORM:${nt} -->`,
    `<!-- candidates: ${candidates.join(' || ')} -->`,
    `<!-- reason: ${reason} -->`,
    `<!-- tried: 0(midlink) ; 正文统一由 3 级有头采集 -->`,
    `<!-- created: ${new Date().toISOString()} -->`,
    c ? `<!-- card: ${c} ; batchId: ${bid} ; stubKey: ${key} -->` : `<!-- batchId: ${bid} ; stubKey: ${key} -->`,
    '',
    '<!-- handback-required: 经 level3_cdp_fetch.js 有头采集后覆写本文件：① 去除 NEEDS_FETCH 标记 ② provenance 须为 level=3 且带 cdpPort/pageUrl/agentSkill/chars/batchId/stubKey ③ 写可见「采集证据：」行（入库后可在 KB 反查）④ 原文直链填 mp.weixin.qq.com 真实直链 ⑤ 严禁回交反爬/验证码页；不合格者 --ingest-pending 一律拒收 -->',
    buildProvenanceLine({ level: '', cdpPort: '', pageUrl: '', agentSkill: '', extractedAt: '', chars: '', batchId: bid, stubKey: key }),
    '等待第 3 级有头采集（level3_cdp_fetch.js / level3_drive.js 驱动真实 360Chromex CDP）抓取正文后，',
    `将本文件覆写为文章 markdown（保留文件名 ${key}.md），pipeline.js 经 --ingest-pending 消费。`,
  ];
  // F-15：stub 与回交物共用路径，统一原子写，避免中断产生半截 .md
  const tmp = path.join(dir, key + '.md.tmp');
  fs.writeFileSync(tmp, lines.join('\n'), 'utf8');
  fs.renameSync(tmp, path.join(dir, key + '.md'));

  // F-14：批次清单登记（每卡每批次一份，累积并集，重复 stubKey 不重复追加）
  if (c) {
    const fp = batchManifestPath(ws, c, bid);
    let m = { card: c, batchId: bid, createdAt: new Date().toISOString(), items: [] };
    if (fs.existsSync(fp)) {
      try { m = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { /* 损坏则重建 */ }
    }
    if (!Array.isArray(m.items)) m.items = [];
    if (!m.items.some((x) => x.stubKey === key)) {
      m.items.push({ stubKey: key, url: a.url, candidates: candidates.slice(), triedLevels: [0], state: 'pending', attempts: 0, deadline: null, provenance: null });
    }
    atomicWriteJson(fp, m);
  }
  return key;
}
function isPendingStub(content) {
  return new RegExp('^' + NEEDS_FETCH_MARKER).test(content || '');
}

/**
 * B-02 修复：批次清单对账（batchDone 可达性）。
 *
 * 【根因】B-01 的 sweepOrphanStubs 只删孤儿 stub 文件，未同步清理批次清单里对应的条目；
 * 这些条目 state 仍为 pending、文件却已不存在 → verifyBatchClosure 判「handback 文件缺失且
 * 批次状态非 done」计入 missing → batchDone 恒为 false → 闭环判据④结构性不可达。
 * （实测卡片 A：清单 95 条中 8 条为清扫遗留的 pending 孤儿，进度中无任何 article 与之对应。）
 *
 * 对账规则（保守，只处理「文件已不存在」的条目）：
 *  - state=done                     → 保留（合法已消费历史）
 *  - pending_fetch/ 中仍有该文件   → 保留（在途）
 *  - 进度存在该 stubKey 且 ingested → 补记 state=done（文件已消费、进度已入库，仅清单漏标）
 *  - 其余（文件与进度皆无）         → 移除（清扫遗留的孤儿条目）
 * 绝不把在途或已 done 的条目误删；多份清单逐一处理，改动均走 atomicWriteJson。
 * @returns {{markedDone:number, removed:number, files:number}}
 */
function reconcileBatchManifest(ws, card) {
  const c = String(card || '').trim();
  const out = { markedDone: 0, removed: 0, files: 0 };
  if (!c || !fs.existsSync(ws)) return out;
  const dir = path.join(ws, PENDING_DIR);
  const present = new Set();
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.md')) present.add(f.replace(/\.md$/, ''));
  }
  const ingested = new Set();
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ws, '_progress_' + safeFile(c) + '.json'), 'utf8'));
    for (const a of (d.articles || [])) {
      if ((a.card || a.cardId) === c && a.stubKey && a.ingestStatus === 'ingested') ingested.add(String(a.stubKey));
    }
  } catch (_) { /* 进度缺失按空处理，不影响对账 */ }
  const prefix = '_batch_' + safeFile(c) + '_';
  for (const f of fs.readdirSync(ws)) {
    if (!f.startsWith(prefix) || !f.endsWith('.json')) continue;
    const fp = path.join(ws, f);
    let m; try { m = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { continue; }
    if (!Array.isArray(m.items)) continue;
    let changed = false, localDone = 0, localRemoved = 0;
    const kept = [];
    for (const it of m.items) {
      const k = String(it.stubKey || '');
      if (it.state === 'done') { kept.push(it); continue; }
      if (present.has(k)) { kept.push(it); continue; }
      if (ingested.has(k)) {
        it.state = 'done'; it.doneAt = new Date().toISOString();
        it.reconciled = 'B-02 对账补记（文件已消费、进度 ingested）';
        kept.push(it); localDone++; changed = true; continue;
      }
      localRemoved++; changed = true;
    }
    if (changed) {
      m.items = kept; atomicWriteJson(fp, m);
      out.files++; out.markedDone += localDone; out.removed += localRemoved;
    }
  }
  return out;
}

/**
 * B-01 修复：无主 stub 清扫（闭环判据②可达性）。
 * 删除 pending_fetch/ 中 <card>__ 前缀、但「既不在进度 stubKey、也不在任何批次清单 stubKey」的孤儿文件。
 * 这些孤儿由「同文跨关键词以不同搜狗签名落两 stub、文章去重仅留其一」产生，常规
 * --ingest-pending / --ingest-quarantine 既不消费也不移除，导致判据②(残留=0)结构性不可达。
 * 安全边界：仅删 <card>__ 前缀文件；引用集 = 进度文章 stubKey ∪ 全部批次清单 stubKey，绝不误删在途 stub。
 * 兜底：引用集为空时（进度/批次清单均无 stubKey）跳过清扫，防止异常态下误删在途 stub。
 * B-02：进入即先做清单对账（与是否真的删到文件无关），一次性补齐历史遗留的孤儿清单条目。
 * @returns {number} 删除的孤儿文件数
 */
function sweepOrphanStubs(ws, card) {
  const c = String(card || '').trim();
  if (!c) return 0;
  const rec = reconcileBatchManifest(ws, c);
  if (rec.removed || rec.markedDone) {
    console.log(`[对账] 批次清单：补记 done ${rec.markedDone}、移除孤儿条目 ${rec.removed}（涉及 ${rec.files} 份清单，B-02 修复）`);
  }
  const dir = path.join(ws, PENDING_DIR);
  if (!fs.existsSync(dir)) return 0;
  const ownPrefix = safeFile(c) + '__';
  const referenced = new Set();
  // 进度文件是「本卡真实文章」的唯一事实源：article.stubKey 指向仍需处理的 stub。
  // 批次清单会过度登记（同文跨词以不同搜狗签名落两 stub、文章去重仅留其一 → 另一 stub 仍为清单条目），
  // 故不能以清单判定是否孤儿——仅以进度 article.stubKey 为准。
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ws, '_progress_' + safeFile(c) + '.json'), 'utf8'));
    for (const a of (d.articles || [])) {
      if ((a.card || a.cardId) === c && a.stubKey) referenced.add(String(a.stubKey));
    }
  } catch (_) { /* 进度缺失不阻断清扫 */ }
  if (referenced.size === 0) {
    console.log('[清扫] 进度引用集为空（无 article.stubKey），跳过清扫以防误删在途 stub');
    return 0;
  }
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md') || !f.startsWith(ownPrefix)) continue;
    const key = f.replace(/\.md$/, '');
    if (referenced.has(key)) continue; // 在途/已登记，保留
    try { fs.unlinkSync(path.join(dir, f)); removed++; console.log(`[清扫] 无主 stub（B-01 修复）：${f.slice(0, 64)}`); }
    catch (_) { /* 单文件失败忽略 */ }
  }
  if (removed) console.log(`[清扫] 共移除 ${removed} 个无主 stub`);
  return removed;
}

/**
 * 退役「Agent 经 3 级有头实探确认永久不可达」的 pending stub（如微信「该内容已被发布者删除」）。
 * 闭环缺口修复：原无命令可把这类 stub 移出 pending_fetch（既不能 handback 入库、也不该永久占据残留），
 * 导致判据②(pending_fetch 残留=0)与 needsFetch=0 不可达。本命令：删 stub 文件 + 从批次清单移除条目
 * + 将进度中「仍处于 needs-fetch」的文章标记 failed（离开 needs-fetch），使两类判据均可达；
 * 仅 failureClass=permanent 交人工，退役本身不新增 failed_quarantine 残量，故判据③不退化。
 */
function retireUnreachableStub(ws, card, stubKey, reason) {
  const c = String(card || '').trim();
  const k = String(stubKey || '').trim();
  if (!c || !k) { console.error('[retire-stub] 需要 --card 与 --stub-key'); process.exit(2); }
  const dir = path.join(ws, PENDING_DIR);
  let fileRemoved = false, quarantined = false;
  const fp = path.join(dir, k + '.md');
  // B2：标注「需人工复核」的条目（疑似纯图片/视频、作者限制等）不是永久不可达，
  // 不得直接销毁 —— 移入隔离区保留，供人工判定或下轮续跑。
  const needReview = /需人工复核|疑似纯图片|无文本正文|文本过短/i.test(String(reason || ''));
  if (fs.existsSync(fp)) {
    try {
      if (needReview) { quarantineStub(ws, c, k, fs.readFileSync(fp, 'utf8'), reason); quarantined = true; }
      else {
        // 永久不可达（文章已删除 / 404 / 作者注销等）：此文件仍是 NEEDS_FETCH 占位 stub，
        // 无任何正文可保留。若一并移入 failed_quarantine/，闭环判据③「隔离区本卡残留=0」
        // 将永久不可达。故此处是 SKILL.md「未成功入库的 .md 不得删除」的唯一有意例外：
        // 仅限无正文占位 stub，绝不触碰已回交的 handback（后者一律走 quarantineStub）。
        fs.unlinkSync(fp); fileRemoved = true;
      }
    } catch (_) { /* 单文件失败忽略 */ }
  }
  // 批次清单移除该条目（避免 --verify-batch 将其判 missing 阻断 batchDone）
  const bp = '_batch_' + safeFile(c) + '_';
  for (const f of fs.readdirSync(ws)) {
    if (!f.startsWith(bp) || !f.endsWith('.json')) continue;
    const fp = path.join(ws, f);
    try {
      const m = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const before = (m.items || []).length;
      m.items = (m.items || []).filter((it) => String(it.stubKey) !== k);
      if (m.items.length !== before) atomicWriteJson(fp, m);
    } catch (_) { /* 损坏清单跳过 */ }
  }
  // 进度文章标记 failed（仅作用于仍处于 needs-fetch 的条目，不误伤已入库的重复条目）
  const pp = path.join(ws, '_progress_' + safeFile(c) + '.json');
let marked = 0;
  try {
    const d = JSON.parse(fs.readFileSync(pp, 'utf8'));
    for (const a of (d.articles || [])) {
      if ((a.card || a.cardId) === c && a.stubKey === k && a.fetchStatus === 'needs-fetch') {
        a.fetchStatus = 'failed';
        a.ingestStatus = 'failed';
        a.note = (reason || '永久不可达') + ' [退役stub]';
        marked++;
      }
    }
    if (marked) atomicWriteJson(pp, d);
  } catch (_) { /* 进度损坏按空处理 */ }
  console.log(`[retire-stub] 已退役 stub=${k} 文件删除=${fileRemoved} 移入隔离区=${quarantined} 进度标记=${marked} 清单条目移除=是`);
  return { fileRemoved, quarantined, marked };
}

/** 按 stubKey 在全部批次清单中反查条目（跨批次续跑时仍可定位 triedLevels / 门禁状态）。 */
function findStubMeta(ws, card, stubKey) {
  const c = String(card || '').trim();
  if (!c || !stubKey || !fs.existsSync(ws)) return null;
  const prefix = '_batch_' + safeFile(c) + '_';
  for (const f of fs.readdirSync(ws)) {
    if (!f.startsWith(prefix) || !f.endsWith('.json')) continue;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(ws, f), 'utf8'));
      const it = (m.items || []).find((x) => x.stubKey === stubKey);
      if (it) return { file: path.join(ws, f), manifest: m, item: it };
    } catch (_) { /* 损坏清单跳过 */ }
  }
  return null;
}

/**
 * 批次闭环门控（F-01 / F-14 / F-16）：收尾前对整批 handback 做「可机读合同 + 独立取证」复核。
 *
 * 【根因】Agent 自己写 provenance 声明 level=3，证据源与被审计方同源 → 「无证据不入库」
 * 形同虚设。本函数对 level=3 一律经 verifyFn（默认 `resolve_midlink.js` 直连 CDP 的
 * verifyHeadedSession）独立复核实例身份与目标页，不采信 Agent 自述。
 *
 * 【职责边界】只判定「批次是否可交付给 --ingest-pending」。needsFetch / 幽灵记录属
 * 消费后判据，由 state.js report 复核，故此处输出但不计入 ok。verifyFn 可注入以便离线回归。
 *
 * @param {{ws:string,card:string,batchId?:string,verifyFn?:Function,progressPath?:string}} o
 */
async function verifyBatchClosure(o) {
  const opts = o || {};
  const ws = opts.ws;
  const card = String(opts.card || '');
  const batchId = String(opts.batchId || 'default');
  const verifyFn = opts.verifyFn || (async (port, pageUrl) => require(RESOLVE_JS).verifyHeadedSession(port, pageUrl));
  let fp = batchManifestPath(ws, card, batchId);
  const res = {
    card, batchId, manifest: fp, note: '',
    ok: false, total: 0, done: 0, pending: 0, missing: 0, rejected: 0,
    batchDone: false, provenanceValid: true,
    needsFetch: null,
    pendingFetchFiles: [], quarantineFiles: [],
    blockers: [], items: [],
  };
  if (!ws || !card) { res.blockers.push('缺少 --workspace / --card'); return res; }

  // 目录残留（卡前缀隔离，F-06）：只统计本卡，绝不把他卡残留算到本卡头上
  const ownPrefix = safeFile(card) + '__';
  const pdir = path.join(ws, PENDING_DIR);
  if (fs.existsSync(pdir)) {
    res.pendingFetchFiles = fs.readdirSync(pdir).filter((f) => f.endsWith('.md') && f.startsWith(ownPrefix));
  }
  const qdir = path.join(ws, 'failed_quarantine');
  if (fs.existsSync(qdir)) {
    res.quarantineFiles = fs.readdirSync(qdir).filter((f) => f.endsWith('.md') && f.startsWith(ownPrefix));
  }
  // 进度侧第 5 栏（只读，消费前预期 >0，不计入 ok）
  const pp = opts.progressPath || path.join(ws, '_progress_' + safeFile(card) + '.json');
  if (fs.existsSync(pp)) {
    try {
      const d = JSON.parse(fs.readFileSync(pp, 'utf8'));
      const arts = (d.articles || []).filter((x) => (x.card || x.cardId) === card);
      res.needsFetch = arts.filter((x) => x.fetchStatus === 'needs-fetch').length;
    } catch (_) { /* 损坏按未知处理 */ }
  }

  // 引导词里 `--search` 不带 --batch-id（emitNeedsFetch 默认落 `default` 清单），而收尾
  // 门禁会带一个「本轮批次ID」。二者不一致时门禁不应假失败：优先精确批次；精确清单缺失时
  // 回退到该卡**唯一**现有清单并以清单内声明的 batchId 为准；存在多份清单则拒绝猜测。
  if (!fs.existsSync(fp) && fs.existsSync(ws)) {
    const bp = '_batch_' + safeFile(card) + '_';
    const found = fs.readdirSync(ws).filter((f) => f.startsWith(bp) && f.endsWith('.json')).sort();
    if (found.length === 1) {
      fp = path.join(ws, found[0]);
      res.note = `指定 batchId=${batchId} 清单不存在，已回退到该卡唯一现有清单 ${found[0]}（批次 ID 以清单内声明为准）`;
    } else if (found.length > 1) {
      res.note = `指定 batchId=${batchId} 清单不存在，且该卡存在 ${found.length} 份清单，无法自动判定；请显式传正确的 --batch-id`;
    }
  }
  res.manifest = fp;
  if (!fs.existsSync(fp)) {
    res.blockers.push('批次清单不存在（未 emitNeedsFetch 或 batchId 不匹配）：' + path.basename(fp));
    if (res.note) res.blockers.push(res.note);
    return res;
  }
  let m;
  try { m = JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { res.blockers.push('批次清单解析失败：' + e.message); return res; }
  const items = Array.isArray(m.items) ? m.items : [];
  res.total = items.length;
  if (!items.length) res.blockers.push('批次清单为空（无待回交篇目）');

  let changed = false;
  for (const it of items) {
    const rec = { stubKey: it.stubKey, state: it.state || 'pending', ok: false, level: null, reason: '' };
    const stubPath = path.join(pdir, String(it.stubKey) + '.md');
    if (!fs.existsSync(stubPath)) {
      if (it.state === 'done') { rec.ok = true; rec.reason = '已消费（handback 文件已移除）'; res.done++; }
      else {
        res.missing++; rec.reason = 'handback 文件缺失且批次状态非 done';
        res.blockers.push(it.stubKey + '：' + rec.reason);
      }
      res.items.push(rec); continue;
    }
    const raw = fs.readFileSync(stubPath, 'utf8');
    if (isPendingStub(raw)) {
      res.pending++; rec.reason = '仍为 NEEDS_FETCH stub，Agent 未回交';
      res.blockers.push(it.stubKey + '：' + rec.reason); res.items.push(rec); continue;
    }
    const hv = validateHandback(raw, it);
    if (!hv.ok) {
      res.rejected++; res.provenanceValid = false;
      rec.reason = 'handback 验收拒收：' + hv.reason;
      res.blockers.push(it.stubKey + '：' + rec.reason); res.items.push(rec); continue;
    }
    const pv = hv.provenance;
    rec.level = String(pv.level);
    if (pv.stubKey && String(pv.stubKey) !== String(it.stubKey)) {
      res.rejected++; res.provenanceValid = false;
      rec.reason = 'provenance.stubKey 与批次条目不一致（张冠李戴）';
      res.blockers.push(it.stubKey + '：' + rec.reason); res.items.push(rec); continue;
    }
    // 以清单内声明的 batchId 为准（精确/回退两种模式下都成立），避免「门禁批次 ≠ 生产批次」误杀
    const declaredBatch = (m && m.batchId) || batchId;
    if (pv.batchId && String(pv.batchId) !== String(declaredBatch)) {
      res.rejected++; res.provenanceValid = false;
      rec.reason = 'provenance.batchId 与所属批次清单不一致（跨批次串货）';
      res.blockers.push(it.stubKey + '：' + rec.reason); res.items.push(rec); continue;
    }
    if (String(pv.level) === '3') {
      let vr;
      try { vr = await verifyFn(Number(pv.cdpPort), String(pv.pageUrl)); }
      catch (e) { vr = { ok: false, reason: '独立取证异常：' + e.message }; }
      if (!vr || !vr.ok) {
        res.rejected++; res.provenanceValid = false;
        rec.reason = 'level=3 独立 CDP 取证失败：' + ((vr && vr.reason) || '无返回');
        res.blockers.push(it.stubKey + '：' + rec.reason); res.items.push(rec); continue;
      }
      rec.evidence = { browser: vr.browser || '', port: vr.port || null, matchedTab: !!vr.matchedTab };
    }
    if (it.state !== 'done') { it.state = 'done'; it.doneAt = new Date().toISOString(); changed = true; }
    res.done++; rec.ok = true; rec.state = 'done'; rec.reason = 'ok';
    res.items.push(rec);
  }
  if (changed) atomicWriteJson(fp, m);
  res.batchDone = res.total > 0 && res.done === res.total && res.pending === 0 && res.missing === 0 && res.rejected === 0;
  res.ok = res.batchDone && res.provenanceValid;
  if (!res.batchDone) res.blockers.push(`批次未全量完成：done=${res.done}/${res.total} pending=${res.pending} missing=${res.missing} rejected=${res.rejected}`);
  if (!res.provenanceValid) res.blockers.push('provenance 校验未全通过（含 level=3 独立 CDP 取证）');
  return res;
}

/**
 * 闸门判定输入 = 纯正文。剥离四类非正文内容：
 *   ① HTML 注释证据行（provenance / handback-required）；② 元数据头（来源/发布时间/作者/原文直链/采集日期）；
 *   ③ 可见「采集证据：」行（B7：入库后可在 KB 反查，同样不得计入正文字数）；④ `# 标题` 行。
 *
 * 【B-03 根因】原实现把整份 handback 交给 evaluateGate 计 chars，provenance 的 pageUrl（mp 直链含
 * signature）与 stubKey 可达 500+ 非空白字符，短正文靠机器元数据凑过 MIN_CHARS=800 → 误入库且不可逆
 * （实测 2026-11-14 卡片 A「总包牛马vs劳务牛马互怼」正文仅 54 字仍被判通过）。
 * 【A2 补强】B-03 首修仍保留约 60 字元数据头，752/776 字边界样本按现行闸门仍会入库；现将元数据头
 * 一并剥离，使 chars 严格等于纯正文。入库仍传 raw（含可见证据行），validateHandback 亦仍读 raw。
 */
function stripEvidenceComments(s) {
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*(来源|发布时间|作者|原文直链|采集日期|采集证据)\s*[:：].*$\n?/gm, '')
    .replace(/^\s*#\s+.*$\n?/gm, '');
}

/** B7：生成「可见」证据行。HTML 注释会被 import_doc 剥离，故另写一行普通文本随正文入库。 */
function buildVisibleEvidenceLine(p) {
  const o = p || {};
  return '采集证据：' + PROVENANCE_FIELDS
    .filter((k) => o[k] !== undefined && o[k] !== '')
    .map((k) => `${k}=${o[k]}`).join('; ');
}

/** B7：旧 handback 可能没有可见证据行，入库前补齐，保证 KB 内可反查 level=3 取证链。 */
function ensureVisibleEvidence(raw, pv) {
  const s = String(raw || '');
  if (!pv || /^\s*采集证据\s*[:：]/m.test(s)) return s;
  const line = buildVisibleEvidenceLine(pv);
  return s.replace(/\s*$/, '') + '\n\n' + line + '\n';
}

// 完整性闸门（纯函数，可离线单测）：从正文文本判定是否达入库门槛。
// 抽离自主流程④⑤，供 --ingest-pending 消费 handback 时复用（G3 强制复验同一判据）。
function evaluateGate(text, html) {
  const chars = text.replace(/\s/g, '').length;
  const periods = (text.match(/。/g) || []).length;
  // ★ 错误页语义否决优先于一切数值判据（审计 E-17）：反爬页可能 chars/段落均达标。
  if (looksLikeErrorPage(text)) {
    return { chars, periods, pass: false, reason: 'error_page(反爬/验证码/错误页语义命中，禁止入库)' };
  }
  const aux = auxCriteria(html || '', text);
  let pass = true, reason = '';
  if (chars < MIN_CHARS) {
    pass = false; reason = `chars=${chars} < ${MIN_CHARS}`;
  } else if (periods < MIN_PERIODS && !aux.met) {
    pass = false; reason = `chars=${chars}≥${MIN_CHARS} 但 periods=${periods}<${MIN_PERIODS} 且辅助判据均不满足(段落${aux.paragraphs}/结构${aux.structured}/标题${aux.headings})`;
  } else if (periods < MIN_PERIODS) {
    reason = `periods_low(periods=${periods}，辅助判据满足：段落${aux.paragraphs}/结构${aux.structured}/标题${aux.headings})`;
  }
  return { chars, periods, pass, reason };
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.workspace || !opt.card) {
    console.error('用法：node pipeline.js --workspace <工区> --card <卡> (--search "<检索结果.json>" | --ingest-pending | --ingest-quarantine | --verify-batch --batch-id B | --sweep-orphans | --dedup-progress | --retire-stub --stub-key K --reason R) [--kb-id K] [--folder-id F] [--limit N] [--dry-run] [--json]');
    process.exit(1);
  }
  // 四种合法模式：--search（主流程）/ --ingest-pending（handback 回收）/ --ingest-quarantine（隔离区补入）
  // / --verify-batch（收尾前离线批次门禁）。
  // 审计 E-23：原守卫漏了 ingestPending，导致引导词中的 handback 回收命令 exit=1 只打印用法。
  // F-14：--verify-batch 是纯离线门控，不触碰 KB、不依赖 ima_api.cjs，故不要求 --kb-id/--folder-id。
  if (!opt.search && !opt.ingestPending && !opt.ingestQuarantine) {
    if (!opt.verifyBatch && !opt.sweepOrphans && !opt.retireStub && !opt.dedupProgress) {
      console.error('用法：node pipeline.js --workspace <工区> --card <卡> (--search "<检索结果.json>" | --ingest-pending | --ingest-quarantine | --verify-batch --batch-id B | --sweep-orphans | --dedup-progress | --retire-stub --stub-key K --reason R) [--kb-id K] [--folder-id F] [--limit N] [--dry-run] [--json]');
      process.exit(1);
    }
  }
  const WS = opt.workspace;
  // STATE_EXTRA：将 agent 引导词传入的 --skill-base 透传给每个 state.js 子进程（传入 > 内置默认）
  STATE_EXTRA = opt.skillBase ? ['--skill-base', opt.skillBase] : [];
  const { dedupKey, TITLE_CAP, locateImaApi, assertOutsideSkillDir } = require(STATE_JS);
  const { resolveMidLink, isMidLink } = require(RESOLVE_JS);
  // R8 防护：工作区严禁落在技能自身目录树内，否则 .md / 进度 / 隔离区会污染技能仓库
  assertOutsideSkillDir(WS);
  // 文件名隔离：每卡独立进度文件（_progress_<card>.json），避免多卡共享整文件导致整文件级 lost update
  const progressPath = path.join(WS, '_progress_' + safeFile(opt.card) + '.json');
  state.progressPath = progressPath;
  const quarantine = path.join(WS, 'failed_quarantine');

  // B-01 修复：独立清扫模式（--sweep-orphans），无需 KB 调用，立即移除无主 stub 使判据②可达
  if (opt.sweepOrphans) {
    const n = sweepOrphanStubs(WS, opt.card);
    console.log(`[sweep-orphans] 已清扫 ${n} 个无主 stub（闭环判据②可达性修复）`);
    process.exit(0);
  }

  // 退役永久不可达 stub（闭环缺口修复）：删文件 + 移清单条目 + 标 failed，使判据②与 needsFetch 可达
  if (opt.retireStub) {
    retireUnreachableStub(WS, opt.card, opt.stubKey, opt.reason);
    process.exit(0);
  }

  // D3 修复：进度去重清理（陈旧重复条目根治）。先经 state.js dedup-progress 移除同(stubKey)冗余条目，
  // 再追加 sweepOrphanStubs 清扫被移除条目遗留的悬空 pending_fetch 文件，确保判据②可达。
  if (opt.dedupProgress) {
    const args = ['--card', opt.card];
    if (opt.dryRun) args.push('--dry-run');
    const r = state('dedup-progress', args, true);
    if (!opt.dryRun) {
      const n = sweepOrphanStubs(WS, opt.card);
      console.log(`[dedup-progress] 已清扫 ${n} 个悬空 stub（闭环判据②可达性复核）`);
    }
    process.exit(0);
  }

  // ── 收尾前批次门禁（F-01/F-14/F-16）：纯离线，先于任何 KB 调用与 handback 消费 ──
  // 引导词要求置于 --ingest-pending 之前；未通过则禁止消费 handback 与写 status=completed。
  if (opt.verifyBatch) {
    const v = await verifyBatchClosure({ ws: WS, card: opt.card, batchId: opt.batchId, progressPath });
    if (opt.json) {
      process.stdout.write(JSON.stringify(v, null, 2) + '\n');
    } else {
      const L = [];
      L.push('=== 批次闭环门禁（--verify-batch | 收尾前，须在 --ingest-pending 之前）===');
      L.push(`card=${v.card}  batchId=${v.batchId}`);
      L.push(`批次清单 : ${v.manifest}`);
      if (v.note) L.push(`批次回退 : ${v.note}`);
      L.push(`篇目     : ${v.done}/${v.total} 已通过（pending=${v.pending} missing=${v.missing} rejected=${v.rejected}）`);
      L.push(`batchDone=${v.batchDone}  provenanceValid=${v.provenanceValid}  needsFetch=${v.needsFetch === null ? '(进度文件缺失)' : v.needsFetch}`);
      L.push(`本卡 pending_fetch/ 残留      : ${v.pendingFetchFiles.length}`);
      L.push(`本卡 failed_quarantine/ 残留 : ${v.quarantineFiles.length}`);
      if (v.blockers.length) {
        L.push('阻断项：');
        v.blockers.forEach((b, i) => L.push(`  ${i + 1}. ${b}`));
      }
      L.push(v.ok
        ? '闭环判定 : ✅ 批次门禁通过（batchDone=true / provenanceValid=true），可执行 --ingest-pending；消费后仍须经 report 复核 needsFetch=0 与幽灵记录'
        : '闭环判定 : ❌ 批次门禁未通过，禁止 --ingest-pending 与 status=completed（须补齐 handback 或重跑独立取证）');
      process.stdout.write(L.join('\n') + '\n');
    }
    process.exit(v.ok ? 0 : 1);
  }

  const imaApiPath = locateImaApi({ skillBase: opt.skillBase });
  if (!imaApiPath) { console.error('[错误] 未找到 ima_api.cjs（可用 IMA_API_CJS 环境变量或 --skill-base 指定）'); process.exit(2); }
  const { imaApi } = require(imaApiPath);

  // mark-ingested 参数装配：接通 state.js 默认联机复核（传入 ima_api 路径 + kb-id + folder-id，去掉 --no-verify），
  // 使「入库前查重/复核」真正落库（修复文档所述默认复核在手动流程不可达的问题）。
  function markIngestedArgs(mediaId, title) {
    const args = ['--card', opt.card, '--title', title, '--media-id', String(mediaId)];
    if (imaApiPath) args.push('--ima-api', imaApiPath);
    if (opt.kbId) args.push('--kb-id', opt.kbId);
    if (opt.folderId) args.push('--folder-id', opt.folderId);
    return args;
  }

  /**
   * handback 消费专用状态迁移参数（F-02）。
   * 消费端已完成 listAllKb 全量分页复验（media_type===11 且确在目标子目录），故显式
   * --no-verify 跳过 state.js 的单页复核（后者在子目录 >50 条时会误判「未真正入库」）。
   */
  function markHandbackConsumedArgs(mediaId, title, stubKey, pv) {
    const args = ['--card', opt.card, '--title', title, '--media-id', String(mediaId),
      '--stub-key', stubKey, '--level', String((pv && pv.level) || '3'), '--no-verify'];
    if (pv && pv.batchId) args.push('--batch-id', String(pv.batchId));
    if (pv) args.push('--provenance', JSON.stringify(pv));
    return args;
  }

  /**
   * 调用 ima 开放接口。
   * ⚠️ `imaApi()` 返回的是**原始响应文本**（不是已解析对象），必须自行 JSON.parse，
   *    否则 `resp.data` 恒为 undefined → 会静默读不到 KB 现有条目、去重失效 → 重复入库
   *    （重复不可逆：开放接口无 delete 端点）。
   */
  async function imaCall(apiPath, body) {
    return parseImaResponse(apiPath, await imaApi(apiPath, body, {}));
  }

  /**
   * 联机拉取目标子目录全量条目（游标分页），返回原始条目数组（保留 media_id/title/media_type）。
   * 修复：原内联调用均为单页 limit:50 无游标循环，子目录条目 >50 时去重/复验不全 → 重复入库（不可逆）。
   * 统一改用本分页函数（与 state.js fetchKbEntries 同分页契约：limit=50、循环至 is_end / 无 next_cursor）。
   */
  async function listAllKb(kbId, folderId) {
    const all = [];
    let cursor = '';
    for (let page = 0; page < 200; page++) {
      const r = await imaCall('openapi/wiki/v1/get_knowledge_list',
        { knowledge_base_id: kbId, folder_id: folderId, cursor, limit: 50 });
      const list = (r.data?.knowledge_list || []);
      if (list.length) all.push(...list);
      const next = (r.data?.next_cursor) || (r.data?.cursor) || '';
      const isEnd = r.data?.is_end === true || !next || next === cursor;
      if (isEnd) break;
      cursor = next;
    }
    return all;
  }

  // 隔离区补入模式（定向续跑③）：消费 failed_quarantine/ 下未入库的 .md，直接补入库而非重搜。
  async function ingestQuarantine() {
    if (!opt.kbId || !opt.folderId) { console.error('[错误] --ingest-quarantine 需要 --kb-id 与 --folder-id 才能关联到目标子目录。'); process.exit(1); }
    console.log('=== 隔离区补入模式（定向续跑③：消费 failed_quarantine/ 未入库 .md，不再重搜）===');
    if (!fs.existsSync(quarantine)) { console.log('[隔离区] 无 failed_quarantine/，跳过。'); return; }
    let data = { cards: {}, articles: [] };
    try { data = JSON.parse(fs.readFileSync(progressPath, 'utf8')); } catch (_) { /* 进度损坏按空处理 */ }
    const files = fs.readdirSync(quarantine).filter((f) => f.endsWith('.md'));
    if (!files.length) { console.log('[隔离区] 无 .md 待补入。'); return; }
    // 跨卡污染防护（缺陷 C）：共享 failed_quarantine/ 目录，旧实现会因「他卡残留 .md + 本卡无进度记录」
    // 误将他卡内容入库本卡；若两卡标题相同还会误食对方文件内容。
    // 修复 = 卡级文件前缀（写入时加 safeFile(card)+'__'，见下文两处 writeFileSync/renameSync）+ 双重闸（读取时）：
    //   闸 1：文件名带 __ 前缀但非本卡前缀 → 跨卡残留，跳过（不读内容、不调用 ima）；
    //   闸 2：无本卡进度记录的（他卡残留/孤立文件）→ 跳过，绝不触发 shouldReingest 误入本卡。
    const ownPrefix = opt.card ? safeFile(opt.card) + '__' : null;
    const stat = { attempted: 0, ingested: 0, skipped: 0, failed: 0, admittedOrphans: 0, skippedOtherCard: 0, skippedNoProgress: 0, skippedGate: 0 };
    for (const f of files) {
      const fp = path.join(quarantine, f);
      // 闸 1：带前缀但非本卡 → 跨卡残留，直接跳过
      const hasPrefix = /__.+\.md$/.test(f);
      if (ownPrefix && hasPrefix && !f.startsWith(ownPrefix)) {
        stat.skipped++; stat.skippedOtherCard++;
        console.log(`[跳过] 非本卡(${opt.card})隔离残留：${f.slice(0, 40)}`);
        continue;
      }
      const raw = fs.readFileSync(fp, 'utf8');
      const m = raw.match(/^#\s*(.+?)\s*$/m);
      const title = (m ? m[1] : f.replace(/\.md$/, '')).trim();
      let art = (data.articles || []).find((a) => a.card === opt.card && a.title === title);
      // 闸 2：无本卡进度记录 → 他卡残留/孤立文件，跨卡污染防护，跳过。
      // ★ 审计 E-16 例外：文件名带**本卡前缀**的历史残留，在 reset-card 清空 articles 后
      //   恰恰没有进度记录；若一并跳过，则「强制全量重搜 + 隔离残留清零」永远不可达。
      //   闸 1 已拦下所有非本卡前缀，故此处按文件内容重建最小进度条目，交后续闸门/KB 去重判定。
      if (!art) {
        if (!(ownPrefix && f.startsWith(ownPrefix))) {
          stat.skipped++; stat.skippedNoProgress++;
          console.log(`[跳过] 无本卡(${opt.card})进度记录，疑似他卡残留/孤立文件：${title.slice(0, 40)}`);
          continue;
        }
        art = { card: opt.card, title, fetchStatus: 'ok', filterResult: 'kept', gateResult: 'pass', ingestStatus: 'pending' };
        stat.admittedOrphans++;
        console.log(`[接纳] 本卡前缀历史残留，重建最小进度记录：${title.slice(0, 40)}`);
      }
      if (!shouldReingest(title, art)) {
        stat.skipped++; stat.skippedGate++;
        console.log(`[跳过] 闸门未过/质量失败，重入库无意义：${title.slice(0, 40)}`);
        continue;
      }
      stat.attempted++;
      // KB 去重：已存在则不重入，直接标 ingested 并移除隔离（全量分页，避免 >50 篇漏判）
      let kbHit = null;
      try {
        const entries = await listAllKb(opt.kbId, opt.folderId);
        kbHit = entries.find((x) => dedupKey(x.title) === dedupKey(title)) || null;
      } catch (e) { console.log('[KB] 读取现有条目失败（继续，入库时复验）：' + e.message); }
      if (kbHit) {
        state('mark-ingested', markIngestedArgs(kbHit.media_id, title), true);
        fs.unlinkSync(fp);
        stat.ingested++;
        console.log(`[已存在] KB 已有，标记 ingested 并移除隔离：${title.slice(0, 40)}`);
        continue;
      }
      try {
        const imp = await imaCall('openapi/note/v1/import_doc', { content_format: 1, content: raw });
        const noteId = imp.data?.note_id || imp.data?.noteId;
        if (!noteId) throw new Error('import_doc 未返回 note_id：' + JSON.stringify(imp).slice(0, 200));
        const add = await imaCall('openapi/wiki/v1/add_knowledge', {
          media_type: 11, note_info: { content_id: String(noteId) }, title: title + '.md',
          knowledge_base_id: opt.kbId, folder_id: opt.folderId,
        });
        const mediaId = add.data?.media_id || add.data?.knowledge_id || add.data?.id;
        const vl = await listAllKb(opt.kbId, opt.folderId);
        const hit = vl.find((x) => String(x.media_id) === String(mediaId));
        if (!hit) throw new Error('复验未命中：media_id 不在目标子目录');
        if (Number(hit.media_type) !== 11) throw new Error('复验 media_type=' + hit.media_type + ' 非笔记(11)');
        state('mark-ingested', markIngestedArgs(mediaId, title), true);
        fs.unlinkSync(fp);
        stat.ingested++;
        console.log(`[补入] ✅ ${title.slice(0, 40)}`);
      } catch (e) {
        stat.failed++;
        state('mark-failed', ['--card', opt.card, '--title', title, '--reason', '隔离区补入失败:' + e.message], true);
        console.log(`[仍失败] ${e.message} | ${title.slice(0, 30)}`);
      }
    }
    const swept = sweepOrphanStubs(WS, opt.card);
    console.log('\n=== 隔离区补入统计 ===');
    console.log(`尝试 : ${stat.attempted}`);
    console.log(`补入成功 : ${stat.ingested}`);
    console.log(`跳过合计 : ${stat.skipped}`);
    console.log(`  其中 跨卡残留(闸1) : ${stat.skippedOtherCard}`);
    console.log(`  其中 无进度记录且非本卡前缀(闸2) : ${stat.skippedNoProgress}`);
    console.log(`  其中 闸门未过/质量失败 : ${stat.skippedGate}`);
    console.log(`接纳本卡前缀孤立残留(E-16) : ${stat.admittedOrphans}`);
    console.log(`无主 stub 清扫     : ${swept}（B-01 修复）`);
    console.log(`仍失败 : ${stat.failed}`);
    if (opt.kbId && opt.folderId) {
      const rr = spawnSync('node', [STATE_JS, '--progress', progressPath, ...STATE_EXTRA, 'report', '--kb-id', opt.kbId, '--folder-id', opt.folderId], { encoding: 'utf-8', timeout: 120000 });
      if (rr.status === 0) console.log('\n' + (rr.stdout || '').trim());
    }
  }

  // 消费 Agent 编排 handback（定向续跑④）：读取 pending_fetch/ 下已回交的 handback
  // （去除 NEEDS_FETCH 标记的文章 markdown），重跑本技能过滤 + 完整性闸门（G3 强制复验）后入库。
  async function consumePending() {
    if (!opt.kbId || !opt.folderId) {
      console.error('[错误] --ingest-pending 需要 --kb-id 与 --folder-id 才能关联到目标子目录入库。');
      process.exit(1);
    }
    console.log('=== 消费 Agent 编排 handback（--ingest-pending：批次门禁 + 过滤 + 闸门，G3 强制复验）===');
    const dir = path.join(WS, PENDING_DIR);
    if (!fs.existsSync(dir)) { console.log('[pending] 无 pending_fetch/，跳过。'); return; }
    // F-06：只消费本卡前缀 stub 与无前缀旧格式；带他卡前缀的一律跳过（与隔离区闸 1 同款，防跨卡污染）
    const ownPrefix = safeFile(opt.card) + '__';
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    const files = all.filter((f) => f.startsWith(ownPrefix) || !/__.+\.md$/.test(f));
    const skippedOtherCard = all.length - files.length;
    if (!files.length) { console.log('[pending] 无本卡 .md 待消费。'); return; }
    const stat = { attempted: 0, ingested: 0, skipped: 0, filtered: 0, failed: 0, stillPending: 0, rejected: 0, blockedByBatch: 0 };
    for (const f of files) {
      const fp = path.join(dir, f);
      const raw = fs.readFileSync(fp, 'utf8');
      // 仍含 NEEDS_FETCH 标记 → Agent 尚未取回，跳过（不误判为 handback）
      if (isPendingStub(raw)) {
        stat.skipped++; stat.stillPending++;
        console.log(`[跳过] 仍为 stub，Agent 尚未抓取：${f.slice(0, 40)}`);
        continue;
      }
      // G3 增强：handback 形态验收（审计 E-17）。不合格者保留文件供 Agent 重新回交，
      // 绝不进入 import_doc —— 反爬验证码页一旦入库即不可逆（无 delete 端点）。
      // G3 增强（F-09/F-16）：注入批次条目做 triedLevels 顺级校验，杜绝跳过 0/1 级直接回交
      const stubKey = f.replace(/\.md$/, '');
      const meta = findStubMeta(WS, opt.card, stubKey);
      const hv = validateHandback(raw, meta && meta.item);
      if (!hv.ok) {
        stat.rejected++;
        state('mark-failed', ['--card', opt.card, '--title', stubKey, '--stub-key', stubKey, '--reason', 'handback 验收未过:' + hv.reason], true);
        console.log(`[拒收] ${hv.reason} | ${f.slice(0, 40)}（文件保留待重新回交）`);
        continue;
      }
      // 硬门禁（F-01）：level=3 必须已通过 --verify-batch 的独立 CDP 取证（批次条目 state=done）。
      // 这样即使调度方跳过批次门禁直接跑 --ingest-pending，也无法把「无头冒充有头」写进 KB。
      if (String(hv.provenance.level) === '3' && !(meta && meta.item && meta.item.state === 'done')) {
        stat.blockedByBatch++;
        console.log(`[门禁拦截] level=3 未经 --verify-batch 独立取证通过，禁止入库：${f.slice(0, 40)}（文件保留）`);
        continue;
      }
      const m = raw.match(/^#\s*(.+?)\s*$/m);
      const title = (m ? m[1] : f.replace(/\.md$/, '')).trim();
      const text = raw;
      // A2/B-03：判定输入 = 纯正文（元数据头、证据注释与可见证据行全部剥离）。
      const gateText = stripEvidenceComments(raw);
      const bodyChars = gateText.replace(/\s/g, '').length;
      stat.attempted++;
      // ④ 正文层过滤（仅强特征）
      const bf = matchFilter(gateText, 'body');
      if (bf) {
        stat.filtered++;
        state('mark-filtered', ['--card', opt.card, '--title', title, '--stub-key', stubKey, '--reason', bf], true);
        quarantineStub(WS, opt.card, stubKey, raw, '正文层过滤命中：' + bf);
        console.log(`[已过滤→隔离区] ${title.slice(0, 40)}（${bf}）`);
        continue;
      }
      // ⑤ 完整性闸门（与主线同一 evaluateGate 判据；B-03：用剥离证据行的 gateText）
      const gate = evaluateGate(gateText, '');
      if (!gate.pass) {
        stat.failed++;
        state('mark-failed', ['--card', opt.card, '--title', title, '--stub-key', stubKey, '--reason', '完整性闸门未通过(handback):' + gate.reason], true);
        quarantineStub(WS, opt.card, stubKey, raw, '完整性闸门未通过：' + gate.reason);
        console.log(`[闸门未过→隔离区] ${title.slice(0, 40)}`);
        continue;
      }
      // ⑥ 入库前二次校验（A2）：闸门已用纯正文计字，此处再独立确认，防证据行/元数据回归凑字。
      const ingestText = ensureVisibleEvidence(raw, hv.provenance);
      if (bodyChars < MIN_CHARS) {
        stat.failed++;
        state('mark-failed', ['--card', opt.card, '--title', title, '--stub-key', stubKey, '--reason', `入库前纯正文二次校验未过: bodyChars=${bodyChars} < ${MIN_CHARS}`], true);
        quarantineStub(WS, opt.card, stubKey, raw, '入库前纯正文二次校验未过');
        console.log(`[二次校验拦截→隔离区] bodyChars=${bodyChars} | ${title.slice(0, 40)}`);
        continue;
      }
      // ⑦ 入库（笔记模式）：ingestText 含可见证据行，import_doc 不会剥离普通文本故 KB 内可反查。
      try {
        const imp = await imaCall('openapi/note/v1/import_doc', { content_format: 1, content: ingestText });
        const noteId = imp.data?.note_id || imp.data?.noteId;
        if (!noteId) throw new Error('import_doc 未返回 note_id：' + JSON.stringify(imp).slice(0, 200));
        const add = await imaCall('openapi/wiki/v1/add_knowledge', {
          media_type: 11,
          note_info: { content_id: String(noteId) },
          title: title + '.md',
          knowledge_base_id: opt.kbId,
          folder_id: opt.folderId,
        });
        const mediaId = add.data?.media_id || add.data?.knowledge_id || add.data?.id;
        const vl = await listAllKb(opt.kbId, opt.folderId);
        const hit = vl.find((x) => String(x.media_id) === String(mediaId));
        if (!hit) throw new Error('复验未命中：media_id 不在目标子目录');
        if (Number(hit.media_type) !== 11) throw new Error('复验 media_type=' + hit.media_type + ' 非笔记(11)');
        stat.ingested++;
        // F-02：handback 消费是唯一能把 fetchStatus='needs-fetch' 归零的路径。
        // 原 mark-ingested 只改 ingestStatus，导致 report 第 5 栏永不归零、闭环不可达。
        state('mark-handback-consumed', markHandbackConsumedArgs(mediaId, title, stubKey, hv.provenance), true);
        updateBatchItem(WS, opt.card, String(hv.provenance.batchId || opt.batchId || 'default'), stubKey, 'done', hv.provenance);
        fs.unlinkSync(fp); // 成功入库后删除本地副本（SKILL.md 允许）
        // E-22 契约：成功日志必须输出 gate.chars / gate.periods（禁止裸 chars/periods 未定义引用）；
        // 另附 A2 的 bodyChars，便于核对「纯正文计字」与闸门判据是否一致。
        console.log(`[补入] ✅ ${title.slice(0, 40)} | chars=${gate.chars} | periods=${gate.periods} | bodyChars=${bodyChars}`);
      } catch (e) {
        stat.failed++;
        state('mark-failed', ['--card', opt.card, '--title', title, '--stub-key', stubKey, '--reason', 'handback 入库失败:' + e.message], true);
        // 入库失败（多为瞬态）：保留 handback 文件供下次 --ingest-pending 重试，不删
        console.log(`[仍失败] ${e.message} | ${title.slice(0, 30)}`);
      }
    }
    // B-01 修复：消费结束后清扫无主 stub，闭环判据②(pending_fetch 残留=0)方可达
    const swept = sweepOrphanStubs(WS, opt.card);
    console.log('\n=== pending_fetch 消费统计 ===');
    console.log(`尝试 : ${stat.attempted}`);
    console.log(`补入成功 : ${stat.ingested}`);
    console.log(`被过滤 : ${stat.filtered}`);
    console.log(`失败 : ${stat.failed}`);
    console.log(`待 Agent 抓取(stub) : ${stat.stillPending}`);
    console.log(`handback 验收拒收 : ${stat.rejected}（文件保留，需重新回交）`);
    console.log(`批次门禁拦截     : ${stat.blockedByBatch}（level=3 须先跑 --verify-batch 独立取证）`);
    console.log(`跳过他卡前缀残留 : ${skippedOtherCard}`);
    console.log(`无主 stub 清扫     : ${swept}（B-01 修复）`);
    if (opt.kbId && opt.folderId) {
      const rr = spawnSync('node', [STATE_JS, '--progress', progressPath, ...STATE_EXTRA, 'report', '--kb-id', opt.kbId, '--folder-id', opt.folderId], { encoding: 'utf-8', timeout: 120000 });
      if (rr.status === 0) console.log('\n' + (rr.stdout || '').trim());
    }
  }

  if (opt.ingestQuarantine) {
    await ingestQuarantine();
    return;
  }

  if (opt.ingestPending) {
    await consumePending();
    return;
  }

  const j = JSON.parse(fs.readFileSync(opt.search, 'utf8'));
  const arts = j.articles || [];
  console.log(`[载入] ${path.basename(opt.search)} total=${j.total} articles=${arts.length}`);

  // 去重（同批内按归一化标题）
  const seen = new Set();
  const uniq = [];
  for (const a of arts) {
    const k = String(a.title || '').trim().replace(/\s+/g, '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(a);
  }
  console.log(`[去重] ${arts.length} → ${uniq.length}`);
  const queue = opt.limit > 0 ? uniq.slice(0, opt.limit) : uniq;

  // KB 现有条目（前缀去重键，规避服务端 30 字符截断）——全量分页拉取，避免 >50 篇时去重不全
  const kb = new Map();
  if (opt.kbId && opt.folderId) {
    try {
      const entries = await listAllKb(opt.kbId, opt.folderId);
      entries.forEach((x) => {
        const k = dedupKey(x.title);
        if (!kb.has(k)) kb.set(k, { mediaId: x.media_id, stored: x.title });
      });
      console.log(`[KB] 目标子目录现有条目 ${kb.size} 条（全量分页去重键=归一化标题前 ${TITLE_CAP} 字符）`);
    } catch (e) {
      console.log('[KB] 读取现有条目失败（继续，入库时逐篇复验）：' + e.message);
    }
  }

  const stat = { shouldIngest: 0, ingested: 0, filtered: 0, failed: 0, dupSkipped: 0, handedOff: 0 };
  const detail = { ingested: [], filtered: [], failed: [] };
  const resolveCache = new Map();

  for (let i = 0; i < queue.length; i++) {
    const a = queue[i];
    const tag = `[${i + 1}/${queue.length}]`;
    const title = String(a.title || '').trim();

    // ⓪ --dry-run 必须在任何写操作之前短路（否则「预演」会污染进度文件与 KB）
    if (opt.dryRun) {
      const tfDry = matchFilter(title, 'title');
      console.log(`${tag} [dry-run] ${tfDry ? '将被过滤(' + tfDry + ')' : '将通过过滤'} ${title.slice(0, 40)}`);
      continue;
    }

    // ① 标题层过滤
    const tf = matchFilter(title, 'title');
    if (tf) {
      stat.filtered++; detail.filtered.push({ title, reason: tf + '（标题命中）' });
      state('mark-filtered', ['--card', opt.card, '--title', title, '--reason', tf], true);
      console.log(`${tag} 过滤(${tf}) ${title.slice(0, 40)}`);
      continue;
    }

    // ② KB 前缀去重
    if (kb.has(dedupKey(title))) {
      const hit = kb.get(dedupKey(title));
      stat.dupSkipped++; stat.shouldIngest++; stat.ingested++;
      detail.ingested.push({ title, note: 'KB 已存在，跳过重复创建（media_id=' + hit.mediaId + '）' });
      state('mark-ingested', markIngestedArgs(hit.mediaId, title), true);
      console.log(`${tag} KB已存在跳过 ${title.slice(0, 40)}`);
      continue;
    }


    // ③ 统一第 3 级有头采集：0 级只解析候选直链，绝不在无头 HTTP 层抓正文。
    // 实测 mp 直链对无头请求普遍返回验证页；1 级与 3 级双轨会造成同一 KB 内证据链不一致。
    // 现每篇一律落 stub 移交 level3_cdp_fetch.js / level3_drive.js，回交后由 --ingest-pending 复验入库。
    const candidates = [];
    if (isMidLink(a.url)) {
      let real = resolveCache.get(a.url);
      if (real === undefined) {
        const r = await resolveMidLink(a.url);
        real = r.ok ? r.url : null;
        resolveCache.set(a.url, real);
        console.log(`      ↳ 0 级中转链接解析：${r.ok ? '成功' : '失败(' + r.reason + ')'}`);
      }
      if (real) candidates.push(real);
      candidates.push(String(a.url).replace(/&amp;/g, '&'));
    } else {
      candidates.push(a.url);
    }
    const stubKey = emitNeedsFetch(a, candidates, '统一移交第 3 级有头采集', WS, opt.card, opt.batchId);
    state('mark-needs-fetch', ['--card', opt.card, '--title', title, '--reason', '统一移交第 3 级有头采集', '--stub-key', stubKey], true);
    stat.handedOff++;
    console.log(`${tag} 已移交第 3 级有头采集（pending_fetch）${title.slice(0, 30)}`);
    await sleep(200);
  }

  const summary = { card: opt.card, total: j.total, uniq: uniq.length, ...stat, detail };
  fs.writeFileSync(path.join(WS, '_process_summary_' + safeFile(opt.card) + '.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log('\n=== 采集流水线统计（本轮回填口径）===');
  console.log(`去重后候选 : ${uniq.length}`);
  console.log(`移交第3级  : ${stat.handedOff} 篇（--search 不再直接入库，须跑 level3_drive.js 完成回交/消费闭环）`);
  // 缺陷 C 修复：内联摘要与 state.js report 四栏口径对齐。
  // 原「实入库」把「KB 已存在跳过」也计入，导致与 report 的「实入库」口径不一致（如内联显 14、report 显 2）。
  // 现「实入库」仅计本批新入，KB 已存在跳过单独列出、明确不计入新入（computeIngestSummary 纯函数锁定口径）。
  const sum = computeIngestSummary(stat);
  console.log(`应入库     : ${sum.shouldIngest}（含 KB 已存在跳过 ${sum.dupSkipped} 篇）`);
  console.log(`实入库     : ${sum.newlyIngested}（本批新入；KB 已存在跳过 ${sum.dupSkipped} 篇不计入，与 report 四栏口径一致）`);
  console.log(`被过滤     : ${sum.filtered}`);
  console.log(`失败       : ${sum.failed}`);

  // 权威四栏清单：给定 --kb-id/--folder-id 时，自动经 state.js report 产出「KB 复核模式」增强清单
  // （含逐条原因、实入库 KB 复核确认、目标子目录、应入未入根因、幽灵记录标注）。
  if (opt.kbId && opt.folderId) {
    const reportArgs = ['--progress', state.progressPath, ...STATE_EXTRA, 'report', '--kb-id', opt.kbId, '--folder-id', opt.folderId];
    if (imaApiPath) reportArgs.push('--ima-api', imaApiPath);
    const rr = spawnSync('node', [STATE_JS, ...reportArgs], { encoding: 'utf-8', timeout: 120000 });
    if (rr.status === 0) {
      console.log('\n' + (rr.stdout || '').trim());
    } else {
      console.log('\n[告警] 自动生成 KB 复核四栏清单失败（不影响本轮回填）：' + ((rr.stderr || rr.stdout || '').trim().slice(0, 240)));
    }
  } else {
    // 未提供 KB 参数：仅出离线四栏（无 KB 复核、无幽灵检测），并提示补参以复验。
    const rr = spawnSync('node', [STATE_JS, '--progress', state.progressPath, ...STATE_EXTRA, 'report'], { encoding: 'utf-8', timeout: 60000 });
    if (rr.status === 0) console.log('\n' + (rr.stdout || '').trim());
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL', e && e.message ? e.message : e); process.exit(1); });
}

module.exports = { matchFilter, FILTER_RULES, htmlToText, extractContent, extractAuthor, buildMd, auxCriteria, safeFile, parseImaResponse, shouldReingest, buildFetchFailureReason, buildFetchHeaders, WECHAT_REFERER, emitNeedsFetch, isPendingStub, pendingKeyOf, evaluateGate, looksLikeErrorPage, classifyFetchResult, computeIngestSummary, validateHandback, parseProvenance, buildProvenanceLine, PROVENANCE_FIELDS, batchManifestPath, atomicWriteJson, updateBatchItem, verifyBatchClosure, stripEvidenceComments, buildVisibleEvidenceLine, ensureVisibleEvidence, quarantineStub, PENDING_DIR, NEEDS_FETCH_MARKER, dedupKeyOf: (t) => require(STATE_JS).dedupKey(t) };
