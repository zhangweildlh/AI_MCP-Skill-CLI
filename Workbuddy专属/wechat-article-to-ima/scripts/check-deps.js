#!/usr/bin/env node
/**
 * wechat-article-to-ima 前置依赖核查器（代码级，零依赖）。
 *
 * 【为什么需要】
 * SKILL.md 的「前置依赖检查」原是一段长散文，全靠 Agent 手动逐条执行，易漏导致运行期
 * 才暴露依赖缺失（静默失败）。本脚本把它固化为**确定性、可机器判定的核查**：
 *   - 硬依赖（缺失即阻断）：ima-skills（提供 ima_api.cjs）、wechat-article-search（提供检索/取 Cookie 脚本）。
 *   - 软依赖（缺失仅告警 + 记录文档回退，不阻断，均经 Agent 编排委派，本技能代码不自行探查/调用）：
 *     chrome-devtools（调试浏览器端口探查与拉起经 Agent 编排委派 chrome-devtools MCP 连接器）、
 *     web-search / web-search/firecrawl（2 级抓取兜底，firecrawl 官方 CLI 探查/调用经 Agent 编排委派 web-search）。
 *
 * 【复用】
 *   - checkBrowser：复用 resolve_midlink.js 的 CDP 端口探活（避免重复实现）。
 *   - locateImaApi：复用 state.js 的定位逻辑（单一事实源，避免两份路径解析漂移）。
 *
 * 【用法】
 *   node scripts/check-deps.js [--json] [--base <技能基址>] [--skills-dir <DIR>]
 *                              [--cookie-file <文件>] [--require-headed]
 *   --json            仅输出 JSON 结果（便于被其它脚本消费）
 *   --require-headed  B 有头兜底路径的条件硬依赖门控：除常规硬依赖外，还要求 CDP 实例
 *                     可辨识且非 WorkBuddy Electron、且 --cookie-file 的 E3 预检通过；
 *                     不通过即退出码 1，禁止进入 3 级有头正文抽取。A 主检索路径不要加此参数。
 *   退出码：0 = 硬依赖齐全（含被要求的门控项）；1 = 任一硬依赖/门控项缺失
 *
 * 注：firecrawl / chrome-devtools 的「CLI 探查 / 端口探查 / 浏览器拉起」均经 Agent 编排委派对应技能完成，
 * 本检查器只判定「委派目标是否存在 + 密钥是否就绪」这一硬门禁，避免本技能重复造轮子并消除 Windows 下的误报。
 *
 * 注意：不使用 $HOME（执行沙箱中 $HOME 被虚拟化为 /HOME，会误判缺失）；
 * 技能基址解析与 SKILL.md §59-64 完全一致。
 */

'use strict';
const fs = require('fs');
const path = require('path');

const __dirname_ = __dirname;
const STATE_JS = path.join(__dirname_, 'state.js');
const RESOLVE_JS = path.join(__dirname_, 'resolve_midlink.js');

// ── 参数 ──
function parseArgs(argv) {
  const o = { json: false, base: '', skillsDir: '', fixBrowser: false, cookieFile: '', requireHeaded: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--base') o.base = argv[++i] || '';
    else if (a === '--skills-dir') o.skillsDir = argv[++i] || '';
    else if (a === '--cookie-file') o.cookieFile = argv[++i] || '';
    else if (a === '--require-headed') o.requireHeaded = true;
  }
  return o;
}

// E3 预检（可选，附加式、非阻断）：校验检索 Cookie 关键标识是否齐全。
// 根因：SUV 是搜狗会话级访客标识，若 get_sogou_cookie.js 取到的 Cookie 缺 SUV，
// 检索会立刻命中反爬（ANTI_SPIDER）而提前熔断；此处确定性预检，早于检索失败暴露，避免空耗一轮。
// 仅当 Agent 将 Cookie 暂存为文件并显式传入 --cookie-file 时生效；不传则不校验（保持向后兼容）。
function checkCookieCompleteness(cookieFile) {
  if (!cookieFile) return { checked: false };
  try {
    const txt = fs.readFileSync(cookieFile, 'utf8').replace(/\s+/g, '');
    // F 类缺陷：0 字节 Cookie 文件此前被笼统报成「三键全缺」，掩盖了真实根因
    // （get_sogou_cookie.js 尚未取到任何 Cookie / 浏览器未加载搜狗主域）。二者补救动作不同，
    // 必须分开诊断，否则 Agent 会反复「刷新 Cookie」却永远修不好。
    if (!txt) {
      return { checked: true, ok: false, empty: true, suv: false, snuid: false, suid: false,
        warn: 'Cookie 文件为空（0 字节）：尚未取得任何 Cookie，须经有头浏览器完整加载 www.sogou.com 主域后重新提取；这不是「三键缺失」' };
    }
    const has = (k) => new RegExp('(?:^|;)' + k + '=').test(txt);
    const suv = has('SUV'), snuid = has('SNUID'), suid = has('SUID');
    const ok = suv && (snuid || suid);
    return { checked: true, ok, suv, snuid, suid,
      warn: ok ? '' : ('Cookie 不完整' + (suv ? '' : '：缺 SUV（会话级访客标识，缺失将触发搜狗反爬熔断）') + (!snuid && !suid ? (suv ? '；缺 SNUID/SUID' : '；缺 SNUID/SUID') : '')) };
  } catch (e) {
    return { checked: true, ok: false, error: e.message };
  }
}

// ── 技能基址解析（与 SKILL.md §59-64 完全一致）──
function resolveSkillsBase(override) {
  if (override) {
    if (fs.existsSync(override) && fs.readdirSync(override).length) return override;
  }
  if (process.env.WORKBUDDY_SKILLS_DIR) {
    const p = process.env.WORKBUDDY_SKILLS_DIR;
    if (fs.existsSync(p) && fs.readdirSync(p).length) return p;
  }
  const up = process.env.USERPROFILE;
  if (up) {
    const p = path.join(up, '.workbuddy', 'skills');
    if (fs.existsSync(p)) return p; // 即便为空目录也回退返回，由下游判缺
  }
  return null;
}

function dirHasSkill(dir) {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'SKILL.md'));
  } catch (_) { return false; }
}
function fileOk(p) {
  try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch (_) { return false; }
}
function relExists(base, rel, expectFile) {
  const full = path.join(base, rel);
  return expectFile ? fileOk(full) : dirHasSkill(full);
}

// firecrawl 密钥探测（只判有无，不读取值、不回显）。
// 注意：firecrawl 官方 CLI 的「存在性探查 / 调用」统一经 Agent 编排委派 web-search 完成（web-search 的 firecrawl 适配层封装），
// 本技能代码不自行 spawn firecrawl（Windows 下裸 spawn 全局无扩展名 bash 脚本会 ENOENT 误报缺失，属重复造轮子），
// 故此处仅校验「委派目标（web-search/firecrawl 技能）存在 + 密钥就绪」这一硬门禁，CLI 可用性交由 web-search 运行时判定。
function firecrawlKeyPresent(base) {
  if (process.env.FIRECRAWL_API_KEY) return true;
  const envPath = path.join(base, 'web-search', '.env');
  if (!fileOk(envPath)) return false;
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    return txt.split('\n').some((l) => /^\s*FIRECRAWL_API_KEY\s*=\s*.+/i.test(l));
  } catch (_) { return false; }
}

// 缺陷 B 修复：ima 凭证就绪探针（离线、无网络）。
// SKILL.md 前置依赖要求「ima 凭证可用」，但本检查器原只查 ima_api.cjs 文件存在，不查凭证是否配置；
// 缺失时运行期（入库阶段）才暴露 → 静默失败。此处确定性预检，早于入库失败暴露根因。
// 判定口径与 ima-skills 实际凭证解析对齐（env: IMA_CLIENT_ID/IMA_OPENAPI_CLIENTID + IMA_API_KEY/IMA_OPENAPI_APIKEY；
// 或配置文件：<homedir>/.config/ima/client_id、api_key，长度需 ≥16 且非 dummy）。
function imaCredentialReady() {
  const has = (k) => { const v = process.env[k]; return !!v && String(v).trim() && String(v).trim() !== 'dummy'; };
  const envOk = (has('IMA_CLIENT_ID') || has('IMA_OPENAPI_CLIENTID')) && (has('IMA_API_KEY') || has('IMA_OPENAPI_APIKEY'));
  if (envOk) return { ready: true, via: 'env' };
  try {
    const up = process.env.USERPROFILE || require('os').homedir();
    const cid = path.join(up, '.config', 'ima', 'client_id');
    const key = path.join(up, '.config', 'ima', 'api_key');
    if (fileOk(cid) && fileOk(key)) {
      const cidV = fs.readFileSync(cid, 'utf8').trim();
      const keyV = fs.readFileSync(key, 'utf8').trim();
      if (cidV.length >= 16 && keyV.length >= 16 && cidV !== 'dummy' && keyV !== 'dummy') return { ready: true, via: 'file' };
    }
  } catch (_) { /* 读配置失败视为未配置 */ }
  return { ready: false, via: null };
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const base = resolveSkillsBase(opt.base || opt.skillsDir);

  const result = {
    base: base || null,
    baseResolved: !!base,
    hard: {},
    soft: {},
    resolved: {},
    ok: true,
    hardMissing: [],
  };

  if (!base) {
    result.ok = false;
    result.hardMissing.push('skills-base');
    result.error = '无法解析技能基址（WORKBUDDY_SKILLS_DIR / $USERPROFILE/.workbuddy/skills 均不存在或为空）。';
  }

  // ── 硬依赖 ──
  // ima-skills：提供入库所需的 ima_api.cjs
  const { locateImaApi } = require(STATE_JS);
  const imaApiPath = base ? locateImaApi() : null;
  result.hard.imaSkills = { present: !!imaApiPath, imaApiCjs: imaApiPath };
  if (!imaApiPath) result.hardMissing.push('ima-skills');

  // 缺陷 B 修复：ima 凭证就绪探针（离线预检，不阻断——仅告警，避免运行期静默失败）。
  const imaCred = imaCredentialReady();
  result.hard.imaCredentials = imaCred;

  // wechat-article-search：提供 search_wechat.js 与 get_sogou_cookie.js
  let wasOk = false, wasScripts = { search: false, cookie: false };
  if (base) {
    wasOk = relExists(base, 'wechat-article-search', false);
    wasScripts.search = relExists(base, 'wechat-article-search/scripts/search_wechat.js', true);
    wasScripts.cookie = relExists(base, 'wechat-article-search/scripts/get_sogou_cookie.js', true);
  }
  result.hard.wechatArticleSearch = { present: wasOk, searchWechatJs: wasScripts.search, getSogouCookieJs: wasScripts.cookie };
  if (!wasOk || !wasScripts.search || !wasScripts.cookie) result.hardMissing.push('wechat-article-search');

  // ── 软依赖 ──
  // chrome-devtools：调试浏览器端口探查与拉起经 Agent 编排委派 chrome-devtools MCP 连接器完成，
  // 本技能代码不自行读 local-config.json / 不自行拉起（避免重复造轮子 + 陈旧配置误报）。
  // 硬门禁 = chrome-devtools 委派目标（技能目录）存在；端口连通性仅作实时信息（以编排回传的 SOGOU_CDP_PORT 探活）。
  const { checkBrowser } = require(RESOLVE_JS);
  let cdOk = null, cdPort = null, cdInstalled = false, cdReason = '';
  if (base) {
    cdInstalled = relExists(base, 'chrome-devtools/localization/start.cjs', true)
      && relExists(base, 'chrome-devtools/local-config.json', true);
    // 实时探活编排回传的端口（SOGOU_CDP_PORT；注意：缺省 9222 是 WorkBuddy 自身 Electron 端口，resolve_midlink.js / get_sogou_cookie.js
    // 按 UA 正则甄别并拒绝，真实调试浏览器须落 9223+）；不读陈旧 local-config.json。
    const chk = await checkBrowser();
    cdOk = chk.ok;
    // D1 修复：浏览器未就绪（ok=false）时 checkBrowser 仍回传缺省 9222（Electron，不可用）；此时绝不把 9222
    // 当作可用端口输出，改置 null（解析产物显示「— 不可用」），避免调度方误信而导致 0 级中转链接解析必然失败。
    cdPort = (cdOk && chk.port != null) ? chk.port : null;
    cdReason = chk.reason || '';
  }
  result.soft.chromeDevtools = { installed: cdInstalled, cdpReachable: cdOk, port: cdPort, reason: cdReason || undefined,
    delegated: '端口探查与调试浏览器拉起经 Agent 编排委派 chrome-devtools（MCP 连接器）；本技能仅按编排回传的 SOGOU_CDP_PORT 连接，不自行发现/拉起',
    fallback: '端口不可达 → 检索走免 Cookie 降级；中转链接解析失败 → 用解码后原始链接兜底（pipeline 已实现）' };
  if (!cdInstalled) result.soft.chromeDevtools.note = '委派目标未安装：调试浏览器不可用，Cookie 提取与中转链接解析将整体降级（需 Agent 经 chrome-devtools 技能拉起）';
  else if (!cdOk) {
    result.soft.chromeDevtools.note = '委派目标已安装但当前端口未连通：请经 Agent 编排调用 chrome-devtools 拉起调试浏览器并回传 SOGOU_CDP_PORT 后再探活';
  }

  // web-search / firecrawl：2 级抓取兜底（经 Agent 编排委派 web-search，firecrawl CLI 探查/调用由 web-search 完成）
  const wsOk = base ? relExists(base, 'web-search', false) : false;
  const fcSkillOk = base ? relExists(base, 'web-search/firecrawl', false) : false;
  const fcKey = base ? firecrawlKeyPresent(base) : false;
  result.soft.webSearch = { present: wsOk };
  result.soft.firecrawl = {
    skillPresent: fcSkillOk,
    keyPresent: fcKey,
    cliDelegated: true,
    usable: fcSkillOk && fcKey,
    delegatedTo: 'web-search（Agent 编排调用，firecrawl CLI 探查/调用由 web-search 的 firecrawl 适配层负责，本技能不自行 spawn）',
    fallback: '不可用 → 1 级失败即移交 Agent 编排（pending_fetch），2 级留作 Agent 经 web-search 兜底',
  };

  // ── 解析对外产物 ──
  result.resolved.searchScriptDir = base ? path.join(base, 'wechat-article-search', 'scripts') : null;
  result.resolved.imaApiCjs = imaApiPath;
  result.resolved.cdpPort = cdPort;
  result.resolved.firecrawlUsable = fcSkillOk && fcKey;

  // E3 预检（可选）：检索 Cookie 完整性（缺失 SUV 将触发反爬熔断）
  const cookieCheck = checkCookieCompleteness(opt.cookieFile);
  result.cookie = cookieCheck;
  if (cookieCheck.checked && !cookieCheck.ok) {
    result.soft.cookieWarn = cookieCheck.warn || (cookieCheck.error ? ('Cookie 文件读取失败：' + cookieCheck.error) : 'Cookie 不完整');
  }

  // ── B 兜底路径条件硬依赖门控（--require-headed）──
  // A 主检索路径下 chrome-devtools 只是软依赖（缺失仅告警）；只有 B 有头兜底路径才升级为
  // 硬依赖。三条判据：① CDP 端口可达且实例身份非 WorkBuddy Electron（V-03 辨识）；
  // ② 优先取编排注入的 SOGOU_CDP_PORT；③ Cookie 关键标识齐全（E3）。
  // 任一不满足 → hardMissing 非空 → 退出码 1，禁止进入 3 级正文抽取。
  if (opt.requireHeaded) {
    const { verifyHeadedSession } = require(RESOLVE_JS);
    const injected = process.env.SOGOU_CDP_PORT ? Number(process.env.SOGOU_CDP_PORT) : null;
    const port = (injected && Number.isFinite(injected) && injected > 0) ? injected : (cdPort || null);
    const vr = port
      ? await verifyHeadedSession(port, '')
      : { ok: false, reason: '未注入 SOGOU_CDP_PORT 且无可用 CDP 端口（缺省 9222 是 WorkBuddy 自身 Electron，不得当作有头实例）', browser: '', port: null, tabs: [] };
    const ck = result.cookie;
    const cookieOk = ck.checked ? !!ck.ok : null;
    result.headed = {
      required: true,
      port,
      portInjected: !!injected,
      cdpOk: !!vr.ok,
      browser: vr.browser || '',
      tabs: (vr.tabs || []).length,
      reason: vr.reason || '',
      cookieChecked: ck.checked,
      cookieOk,
      ok: !!vr.ok && cookieOk === true,
    };
    if (!vr.ok) result.hardMissing.push('headed-browser(CDP 实例不可辨或为 Electron)');
    if (cookieOk === null) result.hardMissing.push('cookie-file(须显式 --cookie-file 做 E3 预检)');
    else if (cookieOk === false) result.hardMissing.push('cookie-incomplete(E3 关键键缺失或文件为空)');
  } else {
    result.headed = { required: false, note: 'A 主检索路径：chrome-devtools 为软依赖，仅记录不阻断' };
  }

  result.ok = result.hardMissing.length === 0;

  // ── 输出 ──
  if (opt.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const L = [];
    L.push('════ 前置依赖核查 ════');
    L.push('技能基址   : ' + (base || '（解析失败）'));
    L.push('');
    L.push('【硬依赖 · 缺失即阻断】');
    L.push('  ima-skills            : ' + (result.hard.imaSkills.present ? '✅ ' + result.hard.imaSkills.imaApiCjs : '❌ 缺失 ima_api.cjs'));
    L.push('  ima 凭证就绪        : ' + (result.hard.imaCredentials.ready ? ('✅ (' + result.hard.imaCredentials.via + ')') : '⚠️ 未配置（请从 ima.qq.com/agent-interface 获取 Client ID/API Key 后写入 ~/.config/ima/ 或设 IMA_CLIENT_ID/IMA_API_KEY 环境变量）'));
    L.push('  wechat-article-search : ' + (result.hard.wechatArticleSearch.present
      ? (result.hard.wechatArticleSearch.searchWechatJs && result.hard.wechatArticleSearch.getSogouCookieJs ? '✅ 脚本齐全' : '⚠️ 目录在但脚本缺失')
      : '❌ 缺失'));
    L.push('');
    L.push('【软依赖 · 缺失仅告警 + 文档回退】');
    L.push('  chrome-devtools       : 安装=' + (result.soft.chromeDevtools.installed ? '✅' : '❌')
      + ' 调试浏览器就绪=' + (result.soft.chromeDevtools.cdpReachable ? '✅:' + result.soft.chromeDevtools.port : '⚠️ 否'));
    if (cdReason) L.push('    原因 : ' + cdReason);
    L.push('  web-search            : ' + (result.soft.webSearch.present ? '✅' : '❌（2 级兜底委派目标不可用）'));
    L.push('  firecrawl(委派web-search): ' + (result.soft.firecrawl.usable ? '✅ 可用' : '⚠️ 不可用')
      + '（skill=' + result.soft.firecrawl.skillPresent + ' Key=' + result.soft.firecrawl.keyPresent + '）');
    L.push('');
    L.push('【解析产物】');
    L.push('  search_script_dir : ' + (result.resolved.searchScriptDir || '—'));
    L.push('  ima_api.cjs      : ' + (result.resolved.imaApiCjs || '—'));
    L.push('  cdp_port         : ' + (result.resolved.cdpPort != null ? result.resolved.cdpPort : '—'));
    L.push('  firecrawl 可用   : ' + (result.resolved.firecrawlUsable ? '是' : '否'));
    if (result.cookie && result.cookie.checked) {
      L.push('  cookie 预检      : ' + (result.cookie.ok ? '✅ 关键标识齐全（SNUID/SUID + SUV）' : ('⚠️ ' + (result.cookie.warn || '不完整'))));
    }
    if (result.headed.required) {
      L.push('');
      L.push('【B 兜底路径 · 条件硬依赖门控（--require-headed）】');
      L.push('  CDP 实例   : ' + (result.headed.cdpOk ? '✅ ' + result.headed.browser + ' @' + result.headed.port : '❌ ' + result.headed.reason));
      L.push('  端口注入   : ' + (result.headed.portInjected ? '✅ SOGOU_CDP_PORT=' + result.headed.port : '⚠️ 未注入（按探活可用端口回退）'));
      L.push('  Cookie E3  : ' + (result.headed.cookieOk === true ? '✅ 关键键齐全'
        : result.headed.cookieOk === null ? '❌ 未传 --cookie-file'
          : '❌ ' + (result.cookie.warn || result.cookie.error || '不完整')));
      L.push('  门控结论   : ' + (result.headed.ok ? '✅ 通过，可进入 3 级有头正文抽取'
        : '❌ 未通过，禁止进入 3 级；相关篇目停留 pending_fetch 待下一轮'));
    }
    L.push('');
    if (result.ok) L.push('结论：硬依赖齐全，可继续。软依赖缺失项将按上述回退方案降级运行。');
    else L.push('结论：硬依赖缺失 → ' + result.hardMissing.join('、') + '，必须补齐后方可执行检索/入库。');
    process.stdout.write(L.join('\n') + '\n');
  }

  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => { console.error('[FATAL]', e && e.message ? e.message : e); process.exit(1); });
}

module.exports = { resolveSkillsBase, relExists, firecrawlKeyPresent, checkCookieCompleteness, imaCredentialReady };
