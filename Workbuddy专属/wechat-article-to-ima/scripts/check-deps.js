#!/usr/bin/env node
/**
 * wechat-article-to-ima 前置依赖核查器（代码级，零依赖）。
 *
 * 【为什么需要】
 * SKILL.md 的「前置依赖检查」原是一段长散文，全靠 Agent 手动逐条执行，易漏导致运行期
 * 才暴露依赖缺失（静默失败）。本脚本把它固化为**确定性、可机器判定的核查**：
 *   - 硬依赖（缺失即阻断）：ima-skills（提供 ima_api.cjs）、wechat-article-search（提供检索/取 Cookie 脚本）。
 *   - 软依赖（缺失仅告警 + 记录文档回退，不阻断）：chrome-devtools（调试浏览器端口）、
 *     web-search / web-search/firecrawl（3 级抓取兜底）、firecrawl 官方 CLI。
 *
 * 【复用】
 *   - checkBrowser：复用 resolve_midlink.js 的 CDP 端口探活（避免重复实现）。
 *   - locateImaApi：复用 state.js 的定位逻辑（单一事实源，避免两份路径解析漂移）。
 *
 * 【用法】
 *   node scripts/check-deps.js [--json] [--base <技能基址>] [--skills-dir <DIR>] [--fix-browser]
 *   --json        仅输出 JSON 结果（便于被其它脚本消费）
 *   --fix-browser 端口不可达且 chrome-devtools 已安装时，按 chrome-devtools 流程重新拉起并复探（以连通性为准）
 *   退出码：0 = 硬依赖齐全；1 = 任一硬依赖缺失
 *
 * 注意：不使用 $HOME（执行沙箱中 $HOME 被虚拟化为 /HOME，会误判缺失）；
 * 技能基址解析与 SKILL.md §59-64 完全一致。
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const __dirname_ = __dirname;
const STATE_JS = path.join(__dirname_, 'state.js');
const RESOLVE_JS = path.join(__dirname_, 'resolve_midlink.js');

// ── 参数 ──
function parseArgs(argv) {
  const o = { json: false, base: '', skillsDir: '', fixBrowser: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--fix-browser') o.fixBrowser = true;
    else if (a === '--base') o.base = argv[++i] || '';
    else if (a === '--skills-dir') o.skillsDir = argv[++i] || '';
  }
  return o;
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

// firecrawl 密钥探测（只判有无，不读取值、不回显）
function firecrawlKeyPresent(base) {
  if (process.env.FIRECRAWL_API_KEY) return true;
  const envPath = path.join(base, 'web-search', '.env');
  if (!fileOk(envPath)) return false;
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    return txt.split('\n').some((l) => /^\s*FIRECRAWL_API_KEY\s*=\s*.+/i.test(l));
  } catch (_) { return false; }
}
function firecrawlCliOk() {
  try {
    const r = spawnSync(process.env.FIRECRAWL_BIN || 'firecrawl', ['--version'], { encoding: 'utf-8', timeout: 15000 });
    return r.status === 0;
  } catch (_) { return false; }
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
  // chrome-devtools：提供调试浏览器端口（Cookie 提取 + 中转链接解析的基础）
  const { checkBrowser } = require(RESOLVE_JS);
  let cdOk = null, cdPort = null, cdInstalled = false;
  let cdLaunchInfo = null;
  if (base) {
    cdInstalled = relExists(base, 'chrome-devtools/localization/start.cjs', true)
      && relExists(base, 'chrome-devtools/local-config.json', true);
    const chk = await checkBrowser();
    cdOk = chk.ok; cdPort = chk.ok ? chk.port : null;
  }
  // 端口不可达且显式 --fix-browser：按 chrome-devtools 流程尝试重新拉起并复探（对齐 SKILL.md:91）。
  // 该动作仅在用户显式传 --fix-browser 时执行，且以连通性为准——拉起后必须再次探活，不读配置值即判定成功。
  if (!cdOk && opt.fixBrowser && cdInstalled && base) {
    const startCjs = path.join(base, 'chrome-devtools', 'localization', 'start.cjs');
    try {
      const r = spawnSync('node', [startCjs], { encoding: 'utf-8', timeout: 30000, stdio: 'ignore' });
      const chk2 = await checkBrowser();
      if (chk2.ok) { cdOk = true; cdPort = chk2.port; cdLaunchInfo = '已重新拉起并复探成功'; }
      else { cdLaunchInfo = `拉起脚本已执行（退出码 ${r.status}）但复探仍不可达`; }
    } catch (e) {
      cdLaunchInfo = '拉起失败：' + e.message;
    }
  }
  result.soft.chromeDevtools = { installed: cdInstalled, cdpReachable: cdOk, port: cdPort,
    fixBrowser: opt.fixBrowser, autoLaunch: cdLaunchInfo,
    fallback: '端口不可达 → 检索走免 Cookie 降级；中转链接解析失败 → 用解码后原始链接兜底（pipeline 已实现）' };
  if (!cdInstalled) result.soft.chromeDevtools.note = '技能未安装：调试浏览器不可用，Cookie 提取与中转链接解析将整体降级';
  else if (!cdOk && !opt.fixBrowser) {
    result.soft.chromeDevtools.launchCommand = `node ${(path.join(base, 'chrome-devtools', 'localization', 'start.cjs'))}`;
    result.soft.chromeDevtools.note = '端口不可达：可加 --fix-browser 自动按 chrome-devtools 流程拉起并复探，或手动执行上方 launchCommand 后再探活';
  }

  // web-search / firecrawl：3 级抓取兜底
  const wsOk = base ? relExists(base, 'web-search', false) : false;
  const fcSkillOk = base ? relExists(base, 'web-search/firecrawl', false) : false;
  const fcCli = firecrawlCliOk();
  const fcKey = base ? firecrawlKeyPresent(base) : false;
  result.soft.webSearch = { present: wsOk };
  result.soft.firecrawl = {
    skillPresent: fcSkillOk,
    cliAvailable: fcCli,
    keyPresent: fcKey,
    usable: fcCli && fcKey,
    fallback: '不可用 → 1 级失败即标记抓取失败，2 级（浏览器自动化）留作 Agent 手动兜底',
  };

  // ── 解析对外产物 ──
  result.resolved.searchScriptDir = base ? path.join(base, 'wechat-article-search', 'scripts') : null;
  result.resolved.imaApiCjs = imaApiPath;
  result.resolved.cdpPort = cdPort;
  result.resolved.firecrawlUsable = fcCli && fcKey;

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
    L.push('  wechat-article-search : ' + (result.hard.wechatArticleSearch.present
      ? (result.hard.wechatArticleSearch.searchWechatJs && result.hard.wechatArticleSearch.getSogouCookieJs ? '✅ 脚本齐全' : '⚠️ 目录在但脚本缺失')
      : '❌ 缺失'));
    L.push('');
    L.push('【软依赖 · 缺失仅告警 + 文档回退】');
    L.push('  chrome-devtools       : 安装=' + (result.soft.chromeDevtools.installed ? '✅' : '❌')
      + ' 端口可达=' + (result.soft.chromeDevtools.cdpReachable ? '✅:' + result.soft.chromeDevtools.port : '⚠️ 不可达'));
    if (result.soft.chromeDevtools.autoLaunch) L.push('                        自动拉起：' + result.soft.chromeDevtools.autoLaunch);
    if (result.soft.chromeDevtools.launchCommand) L.push('                        手动拉起：' + result.soft.chromeDevtools.launchCommand);
    L.push('  web-search            : ' + (result.soft.webSearch.present ? '✅' : '❌（3 级兜底不可用）'));
    L.push('  firecrawl(CLI+Key)    : ' + (result.soft.firecrawl.usable ? '✅ 可用' : '⚠️ 不可用（CLI=' + result.soft.firecrawl.cliAvailable + ' Key=' + result.soft.firecrawl.keyPresent + '）'));
    L.push('');
    L.push('【解析产物】');
    L.push('  search_script_dir : ' + (result.resolved.searchScriptDir || '—'));
    L.push('  ima_api.cjs      : ' + (result.resolved.imaApiCjs || '—'));
    L.push('  cdp_port         : ' + (result.resolved.cdpPort != null ? result.resolved.cdpPort : '—'));
    L.push('  firecrawl 可用   : ' + (result.resolved.firecrawlUsable ? '是' : '否'));
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

module.exports = { resolveSkillsBase, relExists, firecrawlKeyPresent, firecrawlCliOk };
