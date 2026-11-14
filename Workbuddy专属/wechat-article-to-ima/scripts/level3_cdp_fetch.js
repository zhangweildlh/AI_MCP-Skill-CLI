#!/usr/bin/env node
/**
 * Level-3 有头逃逸舱自动化驱动（B-01/续跑守护配套工具）。
 *
 * 设计要点：
 *  - 直连真实调试浏览器（默认 9223，由 localization/start.cjs 拉起的 360Chromex，带登录态、非 Electron），
 *    通过 CDP HTTP(/json/new,/json/list,/json/close) + 页面级 WebSocket(Runtime.evaluate) 取回 #js_content。
 *  - 这与「无头代抓」有本质区别：verify-batch 会经 resolve_midlink.verifyHeadedSession 独立复核
 *    9223 端口确为真实浏览器且目标文章页标签确实打开，故本脚本刻意保留标签直至 ingest-pending 完成。
 *  - 仅当取回内容确能通过完整性闸门（chars>=800 且 段落>=3 或 辅助判据）时才写合格 handback；
 *    删除页/反爬页/过短页一律不写（留待 retire 或重试），避免污染 KB（开放接口无 delete）。
 *
 * 用法：
 *   node level3_cdp_fetch.js --ws <工区> --card A --port 9223 --batch 8
 *   node level3_cdp_fetch.js --ws <工区> --card A --port 9223 --close-tabs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const CDP_PORT = Number(process.env.CDP_PORT || 9223);
const WORKSPACE = process.argv.includes('--ws') ? process.argv[process.argv.indexOf('--ws') + 1] : '';
const CARD = process.argv.includes('--card') ? process.argv[process.argv.indexOf('--card') + 1] : 'A';
const PORT = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : CDP_PORT);
const BATCH = Number(process.argv.includes('--batch') ? process.argv[process.argv.indexOf('--batch') + 1] : 8);
const CLOSE = process.argv.includes('--close-tabs');
const DRY = process.argv.includes('--dry-run');
// --direct：优先使用 stub.candidates 中的 mp.weixin.qq.com 真实直链，绕过搜狗 link 中转。
// 连续多轮访问后搜狗会限流/弹验证码（errHits>=2、len=0），此时直链常仍可用。
const DIRECT = process.argv.includes('--direct');

const PENDING_DIR = 'pending_fetch';
const NEEDS_FETCH_MARKER = '<!-- NEEDS_FETCH -->';
const ERROR_MARKERS = ['VerifyCode', 'antispider', '此验证码用于确认', '需要您协助验证', '提交后没解决问题', '搜狗搜索'];
// 永久不可达语义（真实 mp 页面但内容不可取）→ 应退役，不可当作「限流」无限重试。
// 实测 2026-11-14：搜狗 link 被限流到 antispider，而 mp 直链可达却返回「根据作者隐私设置，无法查看该内容」。
const PERM_MARKERS = [
  '根据作者隐私设置，无法查看该内容', '该内容已被发布者删除', '此内容已被发布者删除',
  '该内容已被删除', '内容已删除', '此内容因违规无法查看', '参数错误', '链接已过期',
  '该链接已失效', '页面不存在', '此账号已被屏蔽', '该账号已注销', '公众号已迁移',
];

function httpReq(method, p, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method }, (res) => {
      let s = ''; res.on('data', (d) => (s += d)); res.on('end', () => resolve(s));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('http timeout ' + method + ' ' + p)));
    req.end();
  });
}

// 新建标签：PUT /json/new?<encoded-url>（360Chromex 不支持 POST，且避免超长链接走 body 触发 socket hang up）
function httpNewTab(url, timeoutMs = 15000) {
  const p = '/json/new?' + encodeURIComponent(url);
  return httpReq('PUT', p, timeoutMs);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 建立单条 CDP 连接并轮询页面状态，直至 cond(data) 成立或超时（避免固定长等待，显著提速）。
async function cdpPoll(wsUrl, expression, cond, maxMs = 9000, stepMs = 500) {
  const ws = new WebSocket(wsUrl);
  // Node 全局 WebSocket(undici) 使用 addEventListener，而非 .on()
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('ws-open-timeout')), 12000);
    ws.addEventListener('open', () => { clearTimeout(to); res(); });
    ws.addEventListener('error', (e) => { clearTimeout(to); rej(new Error('ws-error:' + (e && e.message || e))); });
  });
  let id = 0;
  const pending = {};
  ws.addEventListener('message', (raw) => {
    let m; try { m = JSON.parse(raw.data.toString()); } catch (_) { return; }
    if (m.id && pending[m.id]) { pending[m.id](m); }
  });
  const send = (method, params) => new Promise((resolve) => {
    const myId = ++id; pending[myId] = resolve;
    ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
  });
  await send('Runtime.enable');
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < maxMs) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    const v = r && r.result && r.result.result ? r.result.result.value : null;
    let data = null;
    try { data = typeof v === 'string' ? JSON.parse(v) : v; } catch (_) {}
    last = data;
    if (data && cond(data)) break;
    await wait(stepMs);
  }
  try { ws.close(); } catch (_) {}
  return last;
}

function readStubMeta(content) {
  const get = (name) => {
    const m = content.match(new RegExp('<!--\\s*' + name + ':\\s*([\\s\\S]*?)\\s*-->', 'i'));
    return m ? m[1].trim() : '';
  };
  return {
    url: get('url'),
    candidates: get('candidates'),
    stubKey: get('stubKey'),
    card: get('card'),
  };
}

function isPending(content) { return new RegExp('^' + NEEDS_FETCH_MARKER).test(content || ''); }

// 抽取网页标题/正文/错误的页面内脚本（返回 JSON 字符串，避免大段文本经 CDP 传输截断）
const EXTRACT_FN = `(function(){
  var markers=${JSON.stringify(ERROR_MARKERS)};
  var perm=${JSON.stringify(PERM_MARKERS)};
  var a=document.querySelector('#activity-name');
  var og=document.querySelector('meta[property="og:title"]');
  var c=document.getElementById('js_content');
  var dt=(document.title||'').trim();
  var title=(a&&a.innerText.trim())||(og&&og.content.trim())||((dt&&dt!=='微信公众平台')?dt:'');
  var content=c?c.innerText:'';
  var bodyTxt=document.body?document.body.innerText:'';
  var err=0; for(var i=0;i<markers.length;i++){ if(bodyTxt.indexOf(markers[i])>=0) err++; }
  var permHit=''; for(var j=0;j<perm.length;j++){ if(bodyTxt.indexOf(perm[j])>=0){permHit=perm[j];break;} }
  var deleted=/该内容已被发布者删除|此内容已被发布者删除/.test(bodyTxt);
  var lines=content.split(/\\n/).map(function(x){return x.trim();}).filter(function(x){return x.length>=20;});
  return JSON.stringify({title:title, content:content, url:location.href, len:content.replace(/\\s/g,'').length, hasContent:!!c, errHits:err, deleted:deleted, permHit:permHit, blocks:lines.length, bodyHead:bodyTxt.slice(0,120)});
})()`;

async function main() {
  if (!WORKSPACE) { console.error('缺少 --ws'); process.exit(2); }
  const dir = path.join(WORKSPACE, PENDING_DIR);
  const prefix = CARD + '__';
  const openLog = path.join(WORKSPACE, '_l3_open_tabs_' + CARD + '.json');

  // 关闭模式：仅关闭「对应 handback 已被成功消费（文件消失）」的标签页；
  // 文件仍在（入库失败待重试）时保留标签页与 openLog 条目，供下一轮 verify-batch 独立 CDP 复核。
  if (CLOSE) {
    let recs = []; try { recs = JSON.parse(fs.readFileSync(openLog, 'utf8') || '[]'); } catch (_) {}
    if (!Array.isArray(recs)) recs = [];
    const recs2 = recs.map((r) => (typeof r === 'string' ? { tid: r, key: '' } : r));
    const remain = []; let closed = 0;
    for (const r of recs2) {
      const fp = r.key ? path.join(dir, r.key + '.md') : '';
      if (fp && fs.existsSync(fp)) { remain.push(r); continue; } // 仍在途，保留证据标签
      try { await httpReq('GET', '/json/close/' + r.tid); closed++; } catch (e) { console.log('关闭失败', r.tid, e.message); remain.push(r); }
    }
    console.log(`[close-tabs] 已关闭 ${closed} 个已消费标签，保留 ${remain.length} 个在途证据标签`);
    if (remain.length) fs.writeFileSync(openLog, JSON.stringify(remain));
    else { try { fs.unlinkSync(openLog); } catch (_) {} }
    return;
  }

  if (!fs.existsSync(dir)) { console.log('无 pending_fetch/'); return; }
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.md') && isPending(fs.readFileSync(path.join(dir, f), 'utf8')));
  console.log(`[l3] 待处理 stub（仍含 NEEDS_FETCH）：${files.length}，本批上限 ${BATCH}`);
  const todo = files.slice(0, BATCH);
  // 合并上轮「在途证据标签」记录（入库失败待重试时保留），避免 openLog 被本批覆盖导致证据标签失管
  let opened = [];
  try { const prev = JSON.parse(fs.readFileSync(openLog, 'utf8') || '[]'); if (Array.isArray(prev)) opened = prev.map((r) => (typeof r === 'string' ? { tid: r, key: '' } : r)); } catch (_) {}
  let ok = 0, fail = 0;
  const failLog = [];
  const retirePath = path.join(WORKSPACE, '_l3_retire_' + CARD + '.json');
  const retryPath = path.join(WORKSPACE, '_l3_retry_' + CARD + '.json');
  const loadList = (p) => { try { const a = JSON.parse(fs.readFileSync(p, 'utf8')); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
  const retireList = loadList(retirePath);
  const retryList = loadList(retryPath);

  for (const f of todo) {
    const fp = path.join(dir, f);
    const content = fs.readFileSync(fp, 'utf8');
    const meta = readStubMeta(content);
    const key = f.replace(/\.md$/, '');
    const cands = meta.candidates ? meta.candidates.split(' || ').map((x) => x.trim()).filter(Boolean) : [];
    const direct = cands.find((u) => /^https?:\/\/mp\.weixin\.qq\.com\//i.test(u));
    const target = (DIRECT && direct) || meta.url || cands[0] || '';
    if (!target) { console.log(`[跳过] 无目标链接 ${f.slice(0, 30)}`); continue; }
    if (DIRECT && direct) console.log(`  ↳ --direct：改用 mp 真实直链（绕过搜狗中转）`);
    else if (DIRECT) console.log(`  ↳ [fallback] --direct 未找到 mp 真实直链候选，回退 ${/sogou\.com/i.test(target) ? '搜狗中转链' : '原始链接'}（可能触发 antispider）`);
    console.log(`\n[l3] 处理 ${key.slice(0, 30)}...`);
    // 新建标签导航到搜狗中转链（让真实浏览器完成 JS 跳转至 mp 真实直链）
    let target2;
    try {
      const r = await httpNewTab(target);
      target2 = JSON.parse(r);
    } catch (e) { console.log(`  ✗ 打开标签失败 ${e.message}`); fail++; failLog.push({ key, reason: 'open-tab-fail:' + e.message }); continue; }
    const tid = target2.id || (target2.targetId);
    const wsUrl = target2.webSocketDebuggerUrl;
    if (!wsUrl) { console.log('  ✗ 无 webSocketDebuggerUrl'); fail++; failLog.push({ key, reason: 'no-ws' }); continue; }
    // 智能轮询：正文非空 / 已删除 / 命中反爬 任一成立即返回（搜狗中转需 JS 跳转，故轮询等待而非固定 sleep）
    let data;
    try {
      data = await cdpPoll(wsUrl, EXTRACT_FN, (x) => (x.hasContent && x.len >= 200) || x.deleted || x.errHits >= 2 || !!x.permHit);
    } catch (e) { console.log('  ✗ 求值失败 ' + e.message); fail++; failLog.push({ key, reason: 'eval-fail:' + e.message }); continue; }
    if (!data) { console.log('  ✗ 抽取结果为空'); fail++; failLog.push({ key, reason: 'empty' }); continue; }
    // 懒加载兜底：页头/日期已渲染但 #js_content 为空或极短 → 滚动到底触发图片与段落渲染后重取一次
    if (data.hasContent && data.len < 100 && !data.deleted && !data.permHit && data.errHits < 2) {
      try {
        const d2 = await cdpPoll(wsUrl, 'window.scrollTo(0, document.body.scrollHeight); ' + EXTRACT_FN,
          (x) => (x.hasContent && x.len >= 100) || !!x.permHit, 4500, 700);
        if (d2) { data = d2; console.log(`  ↳ 滚动兜底后 len=${data.len}`); }
      } catch (_) { /* 兜底失败沿用原判定 */ }
    }
    // 只判定「是否取到真实正文」。完整性闸门（MIN_CHARS / periods / aux）由 pipeline
    // --ingest-pending 对整份 handback 文件裁决（其 chars 含标题与元数据行，比纯正文更宽）；
    // 若在此越权用 800 字硬门槛预判，会把 500~700 字的真实短讯误挡在队列外，
    // 且其 needs-fetch 条目永远无法归零 → 闭环判据④不可达。
    // 不越权预判质量：是否有有效段落由 pipeline 的 auxCriteria/evaluateGate 判定（其分段口径为 \\n{2,}，
    // 与本脚本 blocks 的「单行≥20字」口径不同）。取回层只确认「拿到真实正文容器 + 非反爬 + 非永久不可达」。
    // 低于闸门门槛的短文会由 --ingest-pending 判 mark-failed 并删文件，进度条目经 F-02 补全迁移出 needs-fetch。
    const pass = data.hasContent && data.len >= 30 && data.errHits < 2 && !data.deleted && !data.permHit;
    if (!pass) {
      console.log(`  ✗ 内容不达标 len=${data.len} blocks=${data.blocks} err=${data.errHits} deleted=${data.deleted} → 不写回交，保留 stub`);
      // 关闭该标签（避免堆积）；删除页/反爬页分别记入退役 / 重试清单，供状态机批量处理
      try { await httpReq('GET', '/json/close/' + tid); } catch (_) {}
      if (data.deleted || data.permHit) {
        // 永久不可达：记入退役清单（带精确理由），由驱动脚本经 --retire-stub 走状态机
        retireList.push({ key, reason: 'Level-3 有头实探确认永久不可达：' + (data.permHit || '文章已被发布者删除') });
      } else if (data.errHits < 2 && !data.hasContent) {
        // 页面可达、非反爬，但始终无 #js_content 容器（多为纯图片/视频或作者限制）：
        // 已含滚动兜底二次实探，仍无正文 → 记入退役清单并注明「需人工复核」；
        // pipeline.js --retire-stub 会按该 reason 把 .md 移入 failed_quarantine/ 保留（B2），不销毁待复核对象。
        retireList.push({ key, reason: 'Level-3 有头实探（含滚动触发）确认无文本正文：#js_content 缺失，疑似纯图片/视频或作者限制，需人工复核' });
      } else if (data.errHits < 2 && data.hasContent && data.len < 30) {
        retireList.push({ key, reason: 'Level-3 有头实探确认 #js_content 文本过短（<30字），疑似纯图片/视频，需人工复核' });
      } else {
        retryList.push(key); // 反爬限流（errHits>=2）：保留 stub 待限流缓解后重试
      }
      fail++;
      failLog.push({ key, reason: `content-unfit:len=${data.len},blocks=${data.blocks},err=${data.errHits},deleted=${data.deleted},perm=${data.permHit || '-'}`, bodyHead: (data.bodyHead || '').replace(/\s+/g, ' ').slice(0, 60), pageUrl: data.url });
      continue;
    }
    // 写合格 handback（去除 NEEDS_FETCH 标记，附 provenance level=3 证据行）
    const title = (data.title || key).replace(/[\r\n]+/g, ' ').trim();
    const collected = new Date().toISOString().slice(0, 10);
    const pageUrl = data.url;
    const body = data.content.trim();
    const wholeFile = `# ${title}\n\n来源：微信公众号（有头取回）\n发布时间：未知\n作者：未知\n原文直链：${pageUrl}\n采集日期：${collected}\n\n${body}\n`;
    // B7：chars 必须是「纯正文」长度 —— validateHandback ⑦ 与 pipeline 入库前二次校验均按纯正文核对。
    const bodyLen = body.replace(/\s/g, '').length;
    const provObj = { level: 3, cdpPort: PORT, pageUrl, agentSkill: 'chrome-devtools 主 SKILL.md', extractedAt: new Date().toISOString(), chars: bodyLen, batchId: 'default', stubKey: key };
    const prov = `<!-- provenance: level=3; cdpPort=${PORT}; pageUrl=${pageUrl}; agentSkill=chrome-devtools 主 SKILL.md; extractedAt=${provObj.extractedAt}; chars=${bodyLen}; batchId=default; stubKey=${key} -->`;
    // HTML 注释会被 import_doc 剥离，故另写可见行，使 KB 内可反查完整取证链（B7）。
    const visible = '采集证据：' + Object.keys(provObj).filter((k) => provObj[k] !== undefined && provObj[k] !== '')
      .map((k) => `${k}=${provObj[k]}`).join('; ');
    const out = wholeFile + '\n' + visible + '\n\n' + prov + '\n';
    if (DRY) {
      console.log(`  [dry] 将写回交 len=${data.len} bodyLen=${bodyLen} title=${title.slice(0, 30)}`);
      try { await httpReq('GET', '/json/close/' + tid); } catch (_) {} // dry-run 不留标签，避免堆积
    } else {
      fs.writeFileSync(fp, out, 'utf8');
      opened.push({ tid, key }); // 保留标签供 verify-batch 独立复核；close-tabs 按 key 是否已消费决定关闭
      const ri = retryList.indexOf(key); if (ri >= 0) retryList.splice(ri, 1); // B1：成功即出队
      console.log(`  ✅ 已写回交 len=${data.len} bodyLen=${bodyLen} 标签保留`);
      ok++;
    }
  }
  // 清单累积去重写回（跨批次续跑不丢失）。retire 条目为 {key,reason}，兼容早期纯字符串格式。
  const norm = (x) => (typeof x === 'string' ? { key: x, reason: 'Level-3 有头实探确认文章已被发布者删除' } : x);
  const uniqRetire = [...new Map(retireList.map(norm).filter((x) => x && x.key).map((x) => [x.key, x])).values()];
  const retireKeys = new Set(uniqRetire.map((x) => x.key));
  const uniqRetry = [...new Set(retryList.filter((k) => k && !retireKeys.has(k)))];
  try { fs.writeFileSync(openLog, JSON.stringify(opened)); } catch (_) {}
  if (!DRY) {
    try { fs.writeFileSync(retirePath, JSON.stringify(uniqRetire)); } catch (_) {}
    try { fs.writeFileSync(retryPath, JSON.stringify(uniqRetry)); } catch (_) {}
  }
  console.log(`\n=== 本批结束：写回交 ${ok} / 不达标保留stub ${fail}（删除页待退役 ${retireList.length}、反爬待重试 ${retryList.length}）===`);
  if (failLog.length) { console.log('不达标明细:'); failLog.forEach((x) => console.log('  -', x.key, x.reason, '| body:', x.bodyHead || '-')); }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
