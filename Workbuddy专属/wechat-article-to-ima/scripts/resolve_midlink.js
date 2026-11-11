#!/usr/bin/env node
/**
 * 中转链接解析器（抓取降级链 · 一级）：把搜狗中转链接 `weixin.sogou.com/link?url=…`
 * 解析为真实 `mp.weixin.qq.com/s?…` 直链。
 *
 * 【为什么必须有这个脚本】
 * 搜狗检索结果中 `url_resolved=false` 的条目，其 url 为中转链接，且其中的 `&`
 * 被写成 HTML 实体 `&amp;`。**不解码则 URL 畸形**，直连会被重定向到
 * `weixin.sogou.com/antispider/`（搜狗反爬页），正文永远取不到（2026-11-05 实测：
 * 23 篇抓取失败中 21 篇即此因，占 91%）。而搜狗跳转页必须由浏览器执行 JS 才
 * 拼接出真实地址，纯 HTTP 请求无法解析。
 *
 * 【实现方式】
 * 走 Chrome DevTools 的 HTTP 端点（`/json/new` + `/json/list` + `/json/close`），
 * 复用真实调试浏览器（由 chrome-devtools 经 Agent 编排拉起）的登录态与 JS 执行环境。
 * **不需要 WebSocket、不依赖 chrome-devtools MCP**，与 wechat-article-search 保持解耦。
 *
 * 【端口契约（重要）】
 * 调试浏览器端口由 chrome-devtools 经 Agent 编排负责探查与拉起（其 start.cjs 扫描 9222~9240 并回传真实端口），
 * 本脚本**不自行读 local-config.json、不自行扫描端口、不自行拉起**——只连接编排回传的端口。
 * 端口来源：环境变量 SOGOU_CDP_PORT（编排注入）；缺省 9222（chrome-devtools 扫描区间起点，真实监听端口）。
 * 使用前建议先 `node resolve_midlink.js --check` 探活 `GET http://127.0.0.1:<port>/json/version`。
 *
 * 【用法】
 *   node resolve_midlink.js "<中转链接>"                  # 单条：成功输出真实直链（stdout）
 *   node resolve_midlink.js --file "<检索结果.json>" [--out "<映射.json>"]
 *                                                          # 批量：输出 {原url: {ok,url,reason}} 映射
 *   node resolve_midlink.js --check                        # 仅探活调试端口
 *
 * 【退出码】0=成功（或批量完成）；1=参数错误；2=调试端口不可达
 */

'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');

/**
 * 解析调试浏览器端口（仅取编排回传值，不自行发现/拉起）：
 *   SOGOU_CDP_PORT 环境变量（由 Agent 编排调用 chrome-devtools 拉起后注入）→ 缺省 9222。
 * 本脚本不读 chrome-devtools/local-config.json、不扫描端口——端口探查与浏览器拉起属 chrome-devtools 职责
 * （经 Agent 编排的 MCP 连接器完成），避免「读陈旧配置 / 自行造轮子」导致的端口误报不可达。
 */
function resolveCdpPort() {
  if (process.env.SOGOU_CDP_PORT) return Number(process.env.SOGOU_CDP_PORT) || 9222;
  return 9222;
}
const CDP_PORT = resolveCdpPort();
const HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 25000;

function httpReq(method, p, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: CDP_PORT, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('CDP HTTP timeout')); });
    req.end();
  });
}

async function listTargets() {
  try {
    return JSON.parse(await httpReq('GET', '/json/list'));
  } catch (_) {
    return [];
  }
}

/** 探活调试端口 */
async function checkBrowser() {
  try {
    const v = JSON.parse(await httpReq('GET', '/json/version'));
    // 审计 E-02/E-08：端口有响应 ≠ 是搜狗登录态调试浏览器。
    // WorkBuddy 自身 Electron 常驻 9222 且不支持 /json/new（返回纯文本），
    // 原判据仅探 /json/version 可达即 ok:true，把 0 级断点误报为「✅ 就绪」。
    const ident = String(v.Browser || '') + ' ' + String(v['User-Agent'] || v.userAgent || '');
    if (/WorkBuddy|Electron/i.test(ident)) {
      return { ok: false, browser: v.Browser || '', port: CDP_PORT,
        reason: 'workbuddy-electron（该端口是 WorkBuddy 自身 Electron，非调试浏览器；须经 Agent 编排拉起真实浏览器并注入 SOGOU_CDP_PORT）' };
    }
    return { ok: true, browser: v.Browser || '', port: CDP_PORT };
  } catch (e) {
    return { ok: false, reason: e.message, port: CDP_PORT };
  }
}

/** 解码 URL 语境下的 HTML 实体（搜狗中转链接的 `&` 被写作 `&amp;`） */
function decodeUrlEntities(u) {
  return String(u == null ? '' : u)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** 是否为搜狗中转链接 */
const isMidLink = (u) => /weixin\.sogou\.com\/link/i.test(String(u || ''));

/**
 * 解析单条中转链接。
 * @returns {Promise<{ok:boolean,url?:string,reason?:string}>}
 */
async function resolveMidLink(midUrl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  // ① 解码 HTML 实体（关键：不解码则 URL 畸形，必被重定向到 antispider）
  const decoded = decodeUrlEntities(midUrl);
  // ② 在调试浏览器中新建标签并导航，等待搜狗的 JS 跳转完成
  let tid = '';
  try {
    const raw = await httpReq('PUT', '/json/new?' + decoded);
    tid = (JSON.parse(raw) || {}).id || '';
  } catch (e) {
    return { ok: false, reason: 'create-target-failed:' + e.message };
  }
  if (!tid) return { ok: false, reason: 'create-target-failed(no id)' };

  const deadline = Date.now() + timeoutMs;
  let last = '';
  try {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 700));
      const t = (await listTargets()).find((x) => x.id === tid);
      if (!t) { last = last || 'target-closed'; break; }
      last = String(t.url || '');
      if (last.includes('mp.weixin.qq.com/s')) return { ok: true, url: last };
      if (last.includes('/antispider/')) return { ok: false, reason: 'antispider', url: last };
    }
    return { ok: false, reason: 'timeout', url: last };
  } finally {
    try { await httpReq('GET', '/json/close/' + tid); } catch (_) { /* 关闭失败不影响主流程 */ }
  }
}

/** 批量解析：逐条串行（避免并发压垮浏览器），返回 Map<原始url, 结果> */
async function resolveAll(midUrls, onProgress) {
  const out = new Map();
  let i = 0;
  for (const u of midUrls) {
    i++;
    const r = await resolveMidLink(u);
    out.set(u, r);
    if (onProgress) onProgress(i, midUrls.length, r, u);
    if (r.ok) await new Promise((x) => setTimeout(x, 500));
  }
  return out;
}

function usage() {
  console.error(`用法：
  node resolve_midlink.js "<中转链接>"                       单条解析（成功输出真实直链）
  node resolve_midlink.js --file "<检索结果.json>" [--out M]  批量解析
  node resolve_midlink.js --check                           仅探活调试端口

环境变量：
  SOGOU_CDP_PORT   调试浏览器端口（由 Agent 编排调用 chrome-devtools 拉起后注入；缺省 9222）`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }

  if (args.includes('--check')) {
    const r = await checkBrowser();
    if (r.ok) { console.log(`OK 调试浏览器就绪：${r.browser} @ 127.0.0.1:${r.port}`); process.exit(0); }
    console.error(`[不可达] 127.0.0.1:${r.port}：${r.reason}\n请经 Agent 编排调用 chrome-devtools（MCP 连接器）拉起调试浏览器并回传 SOGOU_CDP_PORT 后再探活（本脚本不自行拉起）。`);
    process.exit(2);
  }

  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0) {
    const file = args[fileIdx + 1];
    if (!file) { console.error('[错误] --file 需要指定检索结果 JSON 路径'); usage(); process.exit(1); }
    let articles = [];
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      articles = j.articles || (Array.isArray(j) ? j : []);
    } catch (e) {
      console.error('[错误] 读取检索结果失败：' + e.message); process.exit(1);
    }
    const mid = articles.filter((a) => isMidLink(a.url)).map((a) => a.url);
    console.error(`[批量] 共 ${articles.length} 条，其中中转链接 ${mid.length} 条待解析`);
    const map = await resolveAll(mid, (i, n, r) => {
      console.error(`  [${i}/${n}] ${r.ok ? '成功' : '失败(' + r.reason + ')'}`);
    });
    const outObj = {};
    map.forEach((v, k) => { outObj[k] = v; });
    const outIdx = args.indexOf('--out');
    if (outIdx >= 0 && args[outIdx + 1]) {
      fs.writeFileSync(args[outIdx + 1], JSON.stringify(outObj, null, 2), 'utf8');
      console.error(`[批量] 映射已写入 ${args[outIdx + 1]}`);
    } else {
      process.stdout.write(JSON.stringify(outObj, null, 2));
    }
    process.exit(0);
  }

  const target = args.find((a) => !a.startsWith('-'));
  if (!target) { usage(); process.exit(1); }
  const r = await resolveMidLink(target);
  if (r.ok) {
    console.log(r.url);
    process.exit(0);
  }
  console.error(`[解析失败] ${r.reason || '未知'}${r.url ? '（落点：' + r.url.slice(0, 120) + '）' : ''}`);
  process.exit(1);
}

if (require.main === module) {
  main().catch((e) => { console.error('[FATAL]', e && e.message ? e.message : e); process.exit(1); });
}

module.exports = { resolveMidLink, resolveAll, checkBrowser, decodeUrlEntities, isMidLink, CDP_PORT };
