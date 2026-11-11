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
  const o = { workspace: '', card: '', search: '', kbId: '', folderId: '', limit: 0, dryRun: false, ingestQuarantine: false, ingestPending: false, skillBase: '' };
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
    else if (a === '--skill-base') o.skillBase = argv[++i] || '';
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
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout || '').trim();
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
    // HTML 源（1 级原生抓取）：直接数 HTML 标签
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
  // 2/3 级 Agent 编排抓取（firecrawl / chrome-devtools）直出 markdown；1 级原生抓取为 HTML，需 htmlToText 转纯文本
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
function pendingKeyOf(url) {
  const base = safeFile(url);
  // 加短哈希后缀防 URL 碰撞（同 safeFile 截断致不同 URL 同文件名）
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;
  return base + '_' + h.toString(16).slice(0, 8);
}
function emitNeedsFetch(a, candidates, reason, ws) {
  const dir = path.join(ws, PENDING_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const key = pendingKeyOf(a.url);
  const lines = [
    NEEDS_FETCH_MARKER,
    `<!-- url: ${a.url} -->`,
    `<!-- candidates: ${candidates.join(' || ')} -->`,
    `<!-- reason: ${reason} -->`,
    `<!-- tried: 0(midlink),1(native) -->`,
    `<!-- created: ${new Date().toISOString()} -->`,
    '',
    '等待 Agent 编排（2 级 web-search→firecrawl / 3 级 chrome-devtools）抓取正文后，',
    `将本文件覆写为文章 markdown（保留文件名 ${key}.md），pipeline.js 经 --ingest-pending 消费。`,
  ];
  fs.writeFileSync(path.join(dir, key + '.md'), lines.join('\n'), 'utf8');
}
function isPendingStub(content) {
  return new RegExp('^' + NEEDS_FETCH_MARKER).test(content || '');
}
// 完整性闸门（纯函数，可离线单测）：从正文文本判定是否达入库门槛。
// 抽离自主流程④⑤，供 --ingest-pending 消费 handback 时复用（G3 强制复验同一判据）。
function evaluateGate(text, html) {
  const chars = text.replace(/\s/g, '').length;
  const periods = (text.match(/。/g) || []).length;
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
    console.error('用法：node pipeline.js --workspace <工区> --card <卡> (--search "<检索结果.json>" | --ingest-quarantine) [--kb-id K] [--folder-id F] [--limit N] [--dry-run]');
    process.exit(1);
  }
  if (!opt.search && !opt.ingestQuarantine) {
    console.error('用法：node pipeline.js --workspace <工区> --card <卡> --search "<检索结果.json>" [--kb-id K] [--folder-id F] [--limit N] [--dry-run]');
    process.exit(1);
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
    const stat = { attempted: 0, ingested: 0, skipped: 0, failed: 0 };
    for (const f of files) {
      const fp = path.join(quarantine, f);
      // 闸 1：带前缀但非本卡 → 跨卡残留，直接跳过
      const hasPrefix = /__.+\.md$/.test(f);
      if (ownPrefix && hasPrefix && !f.startsWith(ownPrefix)) {
        stat.skipped++;
        console.log(`[跳过] 非本卡(${opt.card})隔离残留：${f.slice(0, 40)}`);
        continue;
      }
      const raw = fs.readFileSync(fp, 'utf8');
      const m = raw.match(/^#\s*(.+?)\s*$/m);
      const title = (m ? m[1] : f.replace(/\.md$/, '')).trim();
      const art = (data.articles || []).find((a) => a.card === opt.card && a.title === title);
      // 闸 2：无本卡进度记录 → 他卡残留/孤立文件，跨卡污染防护，跳过（不触发 shouldReingest）
      if (!art) {
        stat.skipped++;
        console.log(`[跳过] 无本卡(${opt.card})进度记录，疑似他卡残留/孤立文件：${title.slice(0, 40)}`);
        continue;
      }
      if (!shouldReingest(title, art)) {
        stat.skipped++;
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
    console.log('\n=== 隔离区补入统计 ===');
    console.log(`尝试 : ${stat.attempted}`);
    console.log(`补入成功 : ${stat.ingested}`);
    console.log(`跳过(质量失败) : ${stat.skipped}`);
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
    console.log('=== 消费 Agent 编排 handback（--ingest-pending：重跑过滤+闸门，G3 强制复验）===');
    const dir = path.join(WS, PENDING_DIR);
    if (!fs.existsSync(dir)) { console.log('[pending] 无 pending_fetch/，跳过。'); return; }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    if (!files.length) { console.log('[pending] 无 .md 待消费。'); return; }
    const stat = { attempted: 0, ingested: 0, skipped: 0, filtered: 0, failed: 0, stillPending: 0 };
    for (const f of files) {
      const fp = path.join(dir, f);
      const raw = fs.readFileSync(fp, 'utf8');
      // 仍含 NEEDS_FETCH 标记 → Agent 尚未取回，跳过（不误判为 handback）
      if (isPendingStub(raw)) {
        stat.skipped++; stat.stillPending++;
        console.log(`[跳过] 仍为 stub，Agent 尚未抓取：${f.slice(0, 40)}`);
        continue;
      }
      const m = raw.match(/^#\s*(.+?)\s*$/m);
      const title = (m ? m[1] : f.replace(/\.md$/, '')).trim();
      const text = raw;
      stat.attempted++;
      // ④ 正文层过滤（仅强特征）
      const bf = matchFilter(text, 'body');
      if (bf) {
        stat.filtered++;
        state('mark-filtered', ['--card', opt.card, '--title', title, '--reason', bf], true);
        fs.unlinkSync(fp);
        console.log(`[已过滤] ${title.slice(0, 40)}（${bf}）`);
        continue;
      }
      // ⑤ 完整性闸门（与主线同一 evaluateGate 判据）
      const gate = evaluateGate(text, '');
      if (!gate.pass) {
        stat.failed++;
        state('mark-failed', ['--card', opt.card, '--title', title, '--reason', '完整性闸门未通过(handback):' + gate.reason], true);
        fs.unlinkSync(fp);
        console.log(`[闸门未过] ${title.slice(0, 40)}`);
        continue;
      }
      // ⑥ 入库（笔记模式）：handback 即最终 markdown 正文（Agent 已生成 # 标题 + 正文形态）
      try {
        const imp = await imaCall('openapi/note/v1/import_doc', { content_format: 1, content: raw });
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
        state('mark-ingested', markIngestedArgs(mediaId, title), true);
        fs.unlinkSync(fp);
        console.log(`[补入] ✅ ${title.slice(0, 40)}`);
      } catch (e) {
        stat.failed++;
        state('mark-failed', ['--card', opt.card, '--title', title, '--reason', 'handback 入库失败:' + e.message], true);
        // 入库失败（多为瞬态）：保留 handback 文件供下次 --ingest-pending 重试，不删
        console.log(`[仍失败] ${e.message} | ${title.slice(0, 30)}`);
      }
    }
    console.log('\n=== pending_fetch 消费统计 ===');
    console.log(`尝试 : ${stat.attempted}`);
    console.log(`补入成功 : ${stat.ingested}`);
    console.log(`被过滤 : ${stat.filtered}`);
    console.log(`失败 : ${stat.failed}`);
    console.log(`待 Agent 抓取(stub) : ${stat.stillPending}`);
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

  const stat = { shouldIngest: 0, ingested: 0, filtered: 0, failed: 0, dupSkipped: 0 };
  const detail = { ingested: [], filtered: [], failed: [] };
  const resolveCache = new Map();

  const fetchArticle = async (url) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45000);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: buildFetchHeaders(),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const inner = extractContent(html);
      if (!inner || inner.replace(/<[^>]+>/g, '').trim().length < 50) {
        throw new Error('js_content 为空或过短（页面异常/内容已删除）');
      }
      return { html: inner, author: extractAuthor(html) };
    } finally { clearTimeout(timer); }
  };


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


    // ③ 抓取（中转链接先经浏览器解析为真实直链 —— 降级链一级）
    let art = null, fetchErr = null;
    const candidates = [];
    if (isMidLink(a.url)) {
      let real = resolveCache.get(a.url);
      if (real === undefined) {
        const r = await resolveMidLink(a.url);
        real = r.ok ? r.url : null;
        resolveCache.set(a.url, real);
        console.log(`      ↳ 中转链接解析：${r.ok ? '成功' : '失败(' + r.reason + ')'}`);
      }
      if (real) candidates.push(real);
      candidates.push(String(a.url).replace(/&amp;/g, '&'));
    } else {
      candidates.push(a.url);
    }
    for (const u of candidates) {
      try { art = await fetchArticle(u); a.__resolvedUrl = u; break; }
      catch (e) { fetchErr = e; }
    }
    if (!art) {
      // 1 级（原生 fetch）全失败：本脚本代码内**不自动调用** 2 级（web-search→firecrawl）/
      // 3 级（chrome-devtools）——二者属 Agent 编排层（见 SKILL.md「下级路由」「硬门禁」）。
      // 此处仅落盘 pending_fetch/<url>.md 移交 Agent 编排，并标记 needs-fetch，不直接判失败，
      // 避免无谓失败计数与限流预算消耗；Agent 回交 handback 后由 --ingest-pending 消费。
      const reason = fetchErr ? fetchErr.message : '未知原生抓取失败';
      emitNeedsFetch(a, candidates, reason, WS);
      state('mark-needs-fetch', ['--card', opt.card, '--title', title, '--reason', reason], true);
      console.log(`${tag} 1 级原生抓取失败，已移交 Agent 编排（pending_fetch）${title.slice(0, 30)}`);
      await sleep(800);
      continue;
    }

    const text = (art.markdown != null) ? art.markdown : htmlToText(art.html);

    // ④ 正文层过滤（仅强特征）
    const bf = matchFilter(text, 'body');
    if (bf) {
      stat.filtered++; detail.filtered.push({ title, reason: bf + '（正文命中）' });
      state('mark-filtered', ['--card', opt.card, '--title', title, '--reason', bf], true);
      console.log(`${tag} 过滤正文(${bf}) ${title.slice(0, 40)}`);
      await sleep(1200);
      continue;
    }

    // ⑤ 完整性闸门（复用 evaluateGate，与 --ingest-pending 消费 handback 同一判据，G3 强制复验）
    const gate = evaluateGate(text, art.html || '');
    const gateReason = gate.reason;
    if (!gate.pass) {
      stat.failed++; detail.failed.push({ title, reason: '完整性闸门未通过：' + gateReason });
      fs.mkdirSync(quarantine, { recursive: true });
      fs.writeFileSync(path.join(quarantine, safeFile(opt.card) + '__' + safeFile(title) + '.md'), buildMd(a, art, title), 'utf8');
      state('mark-failed', ['--card', opt.card, '--title', title, '--reason', '完整性闸门未通过:' + gateReason], true);
      console.log(`${tag} 闸门未过 ${gateReason} | ${title.slice(0, 30)}`);
      await sleep(1200);
      continue;
    }

    // ⑥ 入库（笔记模式）
    const md = buildMd(a, art, title);
    const mdPath = path.join(WS, safeFile(opt.card) + '__' + safeFile(title) + '.md');
    fs.writeFileSync(mdPath, md, 'utf8');
    try {
      // 注意：import_doc 不接受 folder_id（实测 code=310001 文件夹不存在），
      // 故先建笔记（落默认位置），再由 add_knowledge 关联到目标子目录。
      const imp = await imaCall('openapi/note/v1/import_doc', { content_format: 1, content: md });
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

      // 复验：确认 media_type===11 真实存在于目标子目录
      const vl = await imaCall('openapi/wiki/v1/get_knowledge_list',
        { knowledge_base_id: opt.kbId, folder_id: opt.folderId, cursor: '', limit: 50 });
      const hit = (vl.data?.knowledge_list || []).find((x) => String(x.media_id) === String(mediaId));
      if (!hit) throw new Error('复验未命中：media_id 不在目标子目录');
      if (Number(hit.media_type) !== 11) throw new Error('复验 media_type=' + hit.media_type + ' 非笔记(11)');

      stat.shouldIngest++; stat.ingested++;
      detail.ingested.push({ title, note: gateReason || ('note_id=' + noteId) });
      state('mark-ingested', markIngestedArgs(mediaId, title), true);
      kb.set(dedupKey(title), { mediaId, stored: title + '.md' });
      fs.unlinkSync(mdPath); // 成功入库 → 删除本地副本
      console.log(`${tag} ✅ 入库 ${title.slice(0, 40)} | chars=${chars} periods=${periods}${gateReason ? ' | ' + gateReason : ''}`);
    } catch (e) {
      stat.failed++; detail.failed.push({ title, reason: '入库失败：' + e.message });
      fs.mkdirSync(quarantine, { recursive: true });
      try { fs.renameSync(mdPath, path.join(quarantine, safeFile(opt.card) + '__' + safeFile(title) + '.md')); } catch (_) { /* ignore */ }
      state('mark-failed', ['--card', opt.card, '--title', title, '--reason', '入库失败:' + e.message], true);
      console.log(`${tag} ❌ 入库失败 ${e.message} | ${title.slice(0, 30)}`);
    }
    await sleep(1200);
  }

  const summary = { card: opt.card, total: j.total, uniq: uniq.length, ...stat, detail };
  fs.writeFileSync(path.join(WS, '_process_summary_' + safeFile(opt.card) + '.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log('\n=== 采集流水线统计（本轮回填口径）===');
  console.log(`去重后候选 : ${uniq.length}`);
  console.log(`应入库     : ${stat.shouldIngest}（含 KB 已存在跳过 ${stat.dupSkipped} 篇）`);
  console.log(`实入库     : ${stat.ingested}`);
  console.log(`被过滤     : ${stat.filtered}`);
  console.log(`失败       : ${stat.failed}`);

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

module.exports = { matchFilter, FILTER_RULES, htmlToText, extractContent, extractAuthor, buildMd, auxCriteria, safeFile, parseImaResponse, shouldReingest, buildFetchFailureReason, buildFetchHeaders, WECHAT_REFERER, emitNeedsFetch, isPendingStub, pendingKeyOf, evaluateGate, PENDING_DIR, NEEDS_FETCH_MARKER, dedupKeyOf: (t) => require(STATE_JS).dedupKey(t) };
