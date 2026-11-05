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
 *
 *   --search   检索脚本产出的结果 JSON（含 articles[]）
 *   --limit    仅处理前 N 条（冒烟测试）
 *   --dry-run  只跑过滤与闸门，不抓取不入库
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const __dirname_ = __dirname;
const STATE_JS = path.join(__dirname_, 'state.js');
const RESOLVE_JS = path.join(__dirname_, 'resolve_midlink.js');

// ── 参数解析 ──
function parseArgs(argv) {
  const o = { workspace: '', card: '', search: '', kbId: '', folderId: '', limit: 0, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') o.workspace = argv[++i] || '';
    else if (a === '--card') o.card = argv[++i] || '';
    else if (a === '--search') o.search = argv[++i] || '';
    else if (a === '--kb-id') o.kbId = argv[++i] || '';
    else if (a === '--folder-id') o.folderId = argv[++i] || '';
    else if (a === '--limit') o.limit = parseInt(argv[++i], 10) || 0;
    else if (a === '--dry-run') o.dryRun = true;
  }
  return o;
}

// ── ima-skills 定位（确定性路径解析，不用 $HOME）──
function locateImaApi() {
  const cands = [];
  if (process.env.IMA_API_CJS) cands.push(process.env.IMA_API_CJS);
  const up = process.env.USERPROFILE;
  if (up) cands.push(path.join(up, '.workbuddy', 'skills', 'ima-skills', 'ima_api.cjs'));
  cands.push(path.join(__dirname_, '..', '..', 'ima-skills', 'ima_api.cjs'));
  for (const c of cands) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch (_) { /* next */ }
  }
  return null;
}

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

// ── state.js 调用（F9：进度写入唯一入口）──
function state(cmd, args, allowFail) {
  const res = spawnSync('node', [STATE_JS, '--progress', state.progressPath, cmd, ...args], { encoding: 'utf-8' });
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
  const structured = (html.match(/<(li|tr|table)\b/gi) || []).length;
  const headings = (html.match(/<h[2-6]\b/gi) || []).length;
  return { paragraphs, structured, headings, met: paragraphs >= 3 || structured >= 2 || headings >= 1 };
}

/** 元数据头（S8：锁定内联形态，禁止 YAML front-matter——否则标题会被 front-matter 污染）*/
function buildMd(a, art, title) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const collected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const published = a.datetime || a.date_text || '未知';
  const direct = a.__resolvedUrl || a.url;
  return `# ${title}\n\n来源：${a.source || '未知'}\n发布时间：${published}\n作者：${art.author}\n原文直链：${direct}\n采集日期：${collected}\n\n${htmlToText(art.html)}\n`;
}

const safeFile = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.workspace || !opt.card || !opt.search) {
    console.error('用法：node pipeline.js --workspace <工区> --card <卡> --search "<检索结果.json>" [--kb-id K] [--folder-id F] [--limit N] [--dry-run]');
    process.exit(1);
  }
  const WS = opt.workspace;
  const progressPath = path.join(WS, '_progress.json');
  state.progressPath = progressPath;
  const quarantine = path.join(WS, 'failed_quarantine');

  const imaApiPath = locateImaApi();
  if (!imaApiPath) { console.error('[错误] 未找到 ima_api.cjs（可用 IMA_API_CJS 环境变量指定）'); process.exit(2); }
  const { imaApi } = require(imaApiPath);
  const { resolveMidLink, isMidLink } = require(RESOLVE_JS);
  const { dedupKey } = require(STATE_JS);

  /**
   * 调用 ima 开放接口。
   * ⚠️ `imaApi()` 返回的是**原始响应文本**（不是已解析对象），必须自行 JSON.parse，
   *    否则 `resp.data` 恒为 undefined → 会静默读不到 KB 现有条目、去重失效 → 重复入库
   *    （重复不可逆：开放接口无 delete 端点）。
   */
  async function imaCall(apiPath, body) {
    const text = await imaApi(apiPath, body, {});
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

  // KB 现有条目（前缀去重键，规避服务端 30 字符截断）
  const kb = new Map();
  if (opt.kbId && opt.folderId) {
    try {
      const list = await imaCall('openapi/wiki/v1/get_knowledge_list',
        { knowledge_base_id: opt.kbId, folder_id: opt.folderId, cursor: '', limit: 50 });
      (list.data?.knowledge_list || []).forEach((x) => {
        const k = dedupKey(x.title);
        if (!kb.has(k)) kb.set(k, { mediaId: x.media_id, stored: x.title });
      });
      console.log(`[KB] 目标子目录现有条目 ${kb.size} 条（去重键=归一化标题前 30 字符）`);
    } catch (e) {
      console.log('[KB] 读取现有条目失败（继续，入库时逐篇复验）：' + e.message);
    }
  }

  const stat = { shouldIngest: 0, ingested: 0, filtered: 0, failed: 0, dupSkipped: 0 };
  const detail = { ingested: [], filtered: [], failed: [] };
  const resolveCache = new Map();
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

  const fetchArticle = async (url) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45000);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
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
      state('mark-ingested', ['--card', opt.card, '--title', title, '--media-id', String(hit.mediaId),
        '--no-verify'], true);
      console.log(`${tag} KB已存在跳过 ${title.slice(0, 40)}`);
      continue;
    }

    if (opt.dryRun) { console.log(`${tag} [dry-run] 跳过抓取 ${title.slice(0, 40)}`); continue; }

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
      const rs = '抓取失败：' + (fetchErr ? fetchErr.message : '未知');
      stat.failed++; detail.failed.push({ title, reason: rs });
      state('mark-failed', ['--card', opt.card, '--title', title, '--reason', rs], true);
      console.log(`${tag} 抓取失败 ${fetchErr ? fetchErr.message : ''} | ${title.slice(0, 30)}`);
      await sleep(1200);
      continue;
    }

    const text = htmlToText(art.html);
    const chars = text.replace(/\s/g, '').length;
    const periods = (text.match(/。/g) || []).length;

    // ④ 正文层过滤（仅强特征）
    const bf = matchFilter(text, 'body');
    if (bf) {
      stat.filtered++; detail.filtered.push({ title, reason: bf + '（正文命中）' });
      state('mark-filtered', ['--card', opt.card, '--title', title, '--reason', bf], true);
      console.log(`${tag} 过滤正文(${bf}) ${title.slice(0, 40)}`);
      await sleep(1200);
      continue;
    }

    // ⑤ 完整性闸门
    const aux = auxCriteria(art.html, text);
    let gatePass = true, gateReason = '';
    if (chars < MIN_CHARS) {
      gatePass = false; gateReason = `chars=${chars} < ${MIN_CHARS}`;
    } else if (periods < MIN_PERIODS && !aux.met) {
      gatePass = false; gateReason = `chars=${chars}≥${MIN_CHARS} 但 periods=${periods}<${MIN_PERIODS} 且辅助判据均不满足(段落${aux.paragraphs}/结构${aux.structured}/标题${aux.headings})`;
    } else if (periods < MIN_PERIODS) {
      gateReason = `periods_low(periods=${periods}，辅助判据满足：段落${aux.paragraphs}/结构${aux.structured}/标题${aux.headings})`;
    }
    if (!gatePass) {
      stat.failed++; detail.failed.push({ title, reason: '完整性闸门未通过：' + gateReason });
      fs.mkdirSync(quarantine, { recursive: true });
      fs.writeFileSync(path.join(quarantine, safeFile(title) + '.md'), buildMd(a, art, title), 'utf8');
      state('mark-failed', ['--card', opt.card, '--title', title, '--reason', '完整性闸门未通过:' + gateReason], true);
      console.log(`${tag} 闸门未过 ${gateReason} | ${title.slice(0, 30)}`);
      await sleep(1200);
      continue;
    }

    // ⑥ 入库（笔记模式）
    const md = buildMd(a, art, title);
    const mdPath = path.join(WS, safeFile(title) + '.md');
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
      state('mark-ingested', ['--card', opt.card, '--title', title, '--media-id', String(mediaId),
        '--no-verify'], true);
      kb.set(dedupKey(title), { mediaId, stored: title + '.md' });
      fs.unlinkSync(mdPath); // 成功入库 → 删除本地副本
      console.log(`${tag} ✅ 入库 ${title.slice(0, 40)} | chars=${chars} periods=${periods}${gateReason ? ' | ' + gateReason : ''}`);
    } catch (e) {
      stat.failed++; detail.failed.push({ title, reason: '入库失败：' + e.message });
      fs.mkdirSync(quarantine, { recursive: true });
      try { fs.renameSync(mdPath, path.join(quarantine, safeFile(title) + '.md')); } catch (_) { /* ignore */ }
      state('mark-failed', ['--card', opt.card, '--title', title, '--reason', '入库失败:' + e.message], true);
      console.log(`${tag} ❌ 入库失败 ${e.message} | ${title.slice(0, 30)}`);
    }
    await sleep(1200);
  }

  const summary = { card: opt.card, total: j.total, uniq: uniq.length, ...stat, detail };
  fs.writeFileSync(path.join(WS, '_process_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log('\n=== 采集流水线统计 ===');
  console.log(`去重后候选 : ${uniq.length}`);
  console.log(`应入库     : ${stat.shouldIngest}`);
  console.log(`实入库     : ${stat.ingested}`);
  console.log(`被过滤     : ${stat.filtered}`);
  console.log(`失败       : ${stat.failed}`);
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL', e && e.message ? e.message : e); process.exit(1); });
}

module.exports = { matchFilter, FILTER_RULES, htmlToText, extractContent, extractAuthor, buildMd, auxCriteria, safeFile, dedupKeyOf: (t) => require(STATE_JS).dedupKey(t) };
