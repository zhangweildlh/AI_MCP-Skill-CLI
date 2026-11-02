/**
 * 单元测试 + 集成测试台（零活网络：vm + 桩 https）
 * 覆盖：内容完整性(Step3)、全场景/全边界覆盖矩阵(Step4)、cookie 注入集成路径。
 * 运行：node tests/run_tests.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SKILL = path.resolve(__dirname, '..');
const SCRIPT = path.join(SKILL, 'scripts', 'search_wechat.js');
const FX = path.join(__dirname, 'fixtures');
const read = (p) => fs.readFileSync(p, 'utf-8');

// ---------------- 桩 https ----------------
const state = { searchHtml: '', resolve: null, requests: [] };

function makeRes(statusCode, headers, body) {
  const buf = Buffer.from(body || '', 'utf-8');
  const chunks = [buf];
  return {
    statusCode,
    headers,
    on(ev, fn) {
      if (ev === 'data') chunks.forEach(fn);
      if (ev === 'end') fn();
    },
  };
}

function fakeHttpsRequest(reqOptions, cb) {
  state.requests.push({
    hostname: reqOptions.hostname,
    path: reqOptions.path,
    headers: reqOptions.headers || {},
  });
  let res;
  if (reqOptions.path.startsWith('/weixin')) {
    res = makeRes(200, {}, state.searchHtml);
  } else if (reqOptions.path.startsWith('/link')) {
    const r = state.resolve || { statusCode: 302, headers: { location: 'https://mp.weixin.qq.com/s?default=1' }, body: '' };
    res = makeRes(r.statusCode, r.headers, r.body);
  } else {
    res = makeRes(200, {}, '');
  }
  const fakeReq = {
    on(ev, fn) { if (ev === 'error') state.onError = fn; },
    setTimeout() {},
    end() {
      // 模拟网络层失败（如 ECONNRESET）：触发 request() 的 error 回调而非响应回调
      if (state.netError) { if (state.onError) state.onError(new Error(state.netError)); return; }
      cb(res);
    },
  };
  return fakeReq;
}

const fakeRequire = (name) => {
  if (name === 'https') return { request: fakeHttpsRequest };
  if (name === 'zlib') return { gunzipSync: (b) => b, inflateSync: (b) => b, brotliDecompressSync: (b) => b };
  if (name === 'fs') return { writeFileSync() {} };
  throw new Error('unexpected require: ' + name);
};

const sandbox = {
  require: fakeRequire,
  console: { log() {}, error() {}, warn() {} },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout,
  URL,
  Buffer,
  process: { argv: ['node', 'search_wechat.js'], exit() {}, env: {} },
  module: { exports: {}, main: null },
  Date, Math, JSON, RegExp, String, Number, Array, Object,
};
fakeRequire.main = null;

const code = read(SCRIPT);
const context = vm.createContext(sandbox);
vm.runInContext(code, context, { filename: 'search_wechat.js' });

// ---------------- 断言框架 ----------------
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}
async function assertRejects(fn, label, predicate) {
  try { await fn(); check(label, false, '预期抛错但成功返回'); }
  catch (e) { check(label, predicate ? predicate(e) : true, e && e.message ? e.message : String(e)); }
}
function resetRequests() { state.requests = []; }

// ---------------- 测试 ----------------
async function main() {
  const NORMAL = read(path.join(FX, 'sogou_normal.html'));
  const EMPTY = read(path.join(FX, 'sogou_empty.html'));
  const ANTI = read(path.join(FX, 'sogou_antispider.html'));
  const MP = 'https://mp.weixin.qq.com/s?token=KEEP';

  console.log('\n[Step3] 内容完整性核验（真实结构 fixture 解析全字段）');
  state.searchHtml = NORMAL;
  state.resolve = { statusCode: 302, headers: { location: MP }, body: '' };
  const arts = await context.searchWechatArticles('工程总承包', 10, false, 0, '');
  check('解析出 4 篇文章', arts.length === 4, 'got ' + arts.length);
  const reqFields = ['title', 'url', 'summary', 'datetime', 'date_text', 'date_description', 'source'];
  let allFields = true;
  for (const a of arts) for (const f of reqFields) if (a[f] === undefined || a[f] === null) allFields = false;
  check('每篇文章均含全部 7 个字段', allFields);
  check('标题命中目标关键词', arts[0].title === 'EPC工程总承包审计各阶段审什么?', arts[0].title);
  check('来源(all-time-y2)正确', arts[0].source === '工程审计观察', arts[0].source);
  check('来源(a.account)正确', arts[1].source === '项目管理实战', arts[1].source);
  check('相对时间文章有 date_description', typeof arts[2].date_description === 'string' && arts[2].date_description.length > 0);
  check('标准日期文章有 date_text', typeof arts[3].date_text === 'string' && arts[3].date_text.length > 0);
  check('url 为补全的搜狗直链', arts.every((a) => a.url.startsWith('https://weixin.sogou.com/link?url=')));

  console.log('\n[Step4] 全场景覆盖矩阵');
  // 场景A: 反爬拦截（无 cookie）
  state.searchHtml = ANTI;
  await assertRejects(() => context.searchWechatArticles('x', 10, false, 0, ''),
    '场景A-无cookie命中antispider抛ANTI_SPIDER', (e) => e.message.startsWith('ANTI_SPIDER') && !e.message.includes('失效'));
  // 场景B: 反爬拦截（有 cookie 仍被拦）
  await assertRejects(() => context.searchWechatArticles('x', 10, false, 0, 'SNUID=abc'),
    '场景B-有cookie仍被拦抛(失效)ANTI_SPIDER', (e) => e.message.startsWith('ANTI_SPIDER') && e.message.includes('失效'));
  // 场景C: 合法空结果（非 antispider）
  state.searchHtml = EMPTY;
  const emptyArts = await context.searchWechatArticles('x', 10, false, 0, '');
  check('场景C-合法空结果返回 [] 且不抛错', Array.isArray(emptyArts) && emptyArts.length === 0);
  // 场景D: 解析真实直链（-r）
  state.searchHtml = NORMAL;
  state.resolve = { statusCode: 302, headers: { location: MP }, body: '' };
  const resolved = await context.searchWechatArticles('x', 10, true, 0, '');
  check('场景D-真实直链解析成功', resolved.length === 4 && resolved.every((a) => a.url_resolved === true && a.url === MP),
    'resolved sample: ' + JSON.stringify(resolved[0] && { u: resolved[0].url, r: resolved[0].url_resolved }));

  console.log('\n[Step4] 全边界覆盖矩阵');
  // 边界1: maxResults 截断
  state.searchHtml = NORMAL;
  const c2 = await context.searchWechatArticles('x', 2, false, 0, '');
  check('边界1-maxResults=2 截断为 2 条', c2.length === 2, 'got ' + c2.length);
  const c10 = await context.searchWechatArticles('x', 10, false, 0, '');
  check('边界1-maxResults=10 取全部 4 条', c10.length === 4);
  // 边界2: isAntiSpider 各分支
  check('边界2-空串/null 判为 antispider', context.isAntiSpider('') === true && context.isAntiSpider(null) === true);
  check('边界2-含 antispider 关键字判为拦截', context.isAntiSpider('<html>antispider page</html>') === true);
  check('边界2-正常结果页不误判', context.isAntiSpider(NORMAL) === false);
  check('边界2-合法空页(>1KB无news-list)不误判', context.isAntiSpider(EMPTY) === false);
  check('边界2-短页(<1KB无news-list)判为拦截', context.isAntiSpider('<div>too short</div>') === true);
  // 边界3: 时间窗过滤
  const parsed = context.parseArticlesFromSearchHtml(NORMAL, 10);
  const f0 = context.filterByDays(parsed, 0);
  check('边界3-days=0 不过滤', f0.kept.length === 4);
  const f1 = context.filterByDays(parsed, 1);
  check('边界3-days=1 仅保留近期(相对时间)文章', f1.kept.length === 1 && f1.kept[0].title.includes('合同风险防范'),
    'kept=' + f1.kept.length + ' dropped=' + f1.dropped + ' undated=' + f1.undated);
  const f2 = context.filterByDays([{ datetime: '' }, { datetime: '2024-01-15 00:00:00' }], 365);
  check('边界3-无日期计 undated、超窗计 dropped', f2.undated === 1 && f2.dropped === 1 && f2.kept.length === 0);

  console.log('\n[Step4/回归] Round1 缺陷锁定用例（修复前应失败，修复后必须通过）');
  // R1: 合法空结果页（<1000 字符、不含 news-list、含搜狗空结果标记）不得被误判为反爬
  const LEGIT_EMPTY_SHORT = '<html><body><div class="no-result"><p>抱歉，没有找到相关的微信公众号文章。</p></div></body></html>';
  check('R1-短小合法空页不误判为反爬', context.isAntiSpider(LEGIT_EMPTY_SHORT) === false,
    'len=' + LEGIT_EMPTY_SHORT.length + ' 判定=' + context.isAntiSpider(LEGIT_EMPTY_SHORT));
  // R2: 「刚刚」必须产出 datetime（否则该文章被 -d 时间窗计为 undated 丢弃）
  const justNow = context.parseRelativeTime('刚刚');
  check('R2-「刚刚」产出非空 datetime', typeof justNow.datetime === 'string' && justNow.datetime.length > 0,
    JSON.stringify(justNow));
  // R3: 同一绝对时刻，时间戳路径与相对时间路径必须同一时区口径（北京时间墙钟）
  const cnInstant = (s) => Date.parse(s.replace(' ', 'T') + 'Z') - 8 * 3600 * 1000;
  const viaTs = context.formatChinaDateTime(new Date(Date.now() - 3600 * 1000));
  const viaRel = context.parseRelativeTime('1小时前').datetime;
  check('R3-时间戳/相对时间两路径同口径', Math.abs(cnInstant(viaTs) - cnInstant(viaRel)) < 60000,
    '时间戳路径=' + viaTs + ' 相对路径=' + viaRel);
  // R4: 必须提供与运行机时区无关的 UTC+8 解析函数（filterByDays 依赖它）
  check('R4-存在 parseChinaDateTime 且按 UTC+8 解析',
    typeof context.parseChinaDateTime === 'function' &&
    context.parseChinaDateTime('2026-01-01 08:00:00') === Date.UTC(2026, 0, 1, 0, 0, 0),
    typeof context.parseChinaDateTime === 'function'
      ? 'got=' + context.parseChinaDateTime('2026-01-01 08:00:00') + ' want=' + Date.UTC(2026, 0, 1, 0, 0, 0)
      : '函数不存在');
  // R5: CLI 非法参数必须显式报错，不得静默降级为默认值
  const thrown = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
  check('R5a--n 0 被拒绝', thrown(() => context.parseCliArgs(['kw', '-n', '0'])) !== null,
    String(thrown(() => context.parseCliArgs(['kw', '-n', '0']))));
  check('R5b--n abc 被拒绝', thrown(() => context.parseCliArgs(['kw', '-n', 'abc'])) !== null,
    String(thrown(() => context.parseCliArgs(['kw', '-n', 'abc']))));
  check('R5c-未知选项被拒绝', thrown(() => context.parseCliArgs(['kw', '--numm', '20'])) !== null,
    String(thrown(() => context.parseCliArgs(['kw', '--numm', '20']))));
  check('R5d-多余位置参数被拒绝', thrown(() => context.parseCliArgs(['kw', 'kw2'])) !== null,
    String(thrown(() => context.parseCliArgs(['kw', 'kw2']))));
  check('R5e-合法参数仍被接受', thrown(() => context.parseCliArgs(['kw', '-n', '20', '-d', '365'])) === null,
    String(thrown(() => context.parseCliArgs(['kw', '-n', '20', '-d', '365']))));
  // R6: url+= 混合单双引号时必须保持文档出现顺序
  const mixed = context.extractRedirectUrlFromHtml(
    '<script>var url=\'\';url+=\'https://mp.\';url+="weixin.qq.com";url+=\'/s?x=1\';window.location.replace(url);</script>');
  check('R6-混合引号 url+= 顺序正确', mixed === 'https://mp.weixin.qq.com/s?x=1', String(mixed));
  // R7: 首页请求失败（网络层）必须显式报错，不得返回空列表被误读为「没搜到」
  state.netError = 'read ECONNRESET';
  await assertRejects(() => context.searchWechatArticles('x', 10, false, 0, ''),
    'R7-首页请求失败→抛错而非返回空列表',
    (e) => /搜索请求失败/.test(e.message) && /ECONNRESET/.test(e.message));
  state.netError = null;
  state.onError = null;
  state.searchHtml = NORMAL;

  console.log('\n[Step4/集成] Cookie 注入（浏览器驱动降级路径）');
  // 有 cookie：搜索请求 + 直链请求都应带 Cookie
  resetRequests();
  state.searchHtml = NORMAL;
  state.resolve = { statusCode: 302, headers: { location: MP }, body: '' };
  const cArts = await context.searchWechatArticles('x', 10, true, 0, 'SNUID=test123; SUGGEST=xyz');
  const searchReq = state.requests.find((r) => r.path.startsWith('/weixin'));
  const linkReq = state.requests.find((r) => r.path.startsWith('/link'));
  check('Cookie-搜索请求头携带 Cookie', searchReq && searchReq.headers.Cookie === 'SNUID=test123; SUGGEST=xyz',
    searchReq && JSON.stringify(searchReq.headers));
  check('Cookie-直链(/link)请求头携带 Cookie', linkReq && linkReq.headers.Cookie === 'SNUID=test123; SUGGEST=xyz',
    linkReq && JSON.stringify(linkReq.headers));
  check('Cookie-直链解析仍成功', cArts.length === 4 && cArts[0].url === MP);
  // 无 cookie：不应出现 Cookie 头
  resetRequests();
  const noArts = await context.searchWechatArticles('x', 10, true, 0, '');
  const searchReq2 = state.requests.find((r) => r.path.startsWith('/weixin'));
  check('无Cookie-搜索请求不带 Cookie 头', searchReq2 && !('Cookie' in searchReq2.headers), JSON.stringify(searchReq2 && searchReq2.headers));

  console.log('\n[Step4] getRealUrl 多分支直链解析');
  // 非搜狗链接直接返回
  const g1 = await context.getRealUrl('https://mp.weixin.qq.com/s?x=1', '', 1);
  check('getRealUrl-非搜狗直返', g1 === 'https://mp.weixin.qq.com/s?x=1');
  // 302 → mp
  state.resolve = { statusCode: 302, headers: { location: 'https://mp.weixin.qq.com/s?tok=9' }, body: '' };
  const g2 = await context.getRealUrl('https://weixin.sogou.com/link?url=z', '', 1);
  check('getRealUrl-302跳真实域', g2 === 'https://mp.weixin.qq.com/s?tok=9', g2);
  // 200 JS 拼接
  state.resolve = { statusCode: 200, headers: {}, body: "<script>var url='';url+='https://mp.';url+='weixin.qq.com/s?j=1';window.location.replace(url);</script>" };
  const g3 = await context.getRealUrl('https://weixin.sogou.com/link?url=z', '', 1);
  check('getRealUrl-200 JS拼接解析', g3 === 'https://mp.weixin.qq.com/s?j=1', g3);
  // 200 meta refresh
  state.resolve = { statusCode: 200, headers: {}, body: '<meta http-equiv="refresh" content="0;url=https://mp.weixin.qq.com/s?m=2">' };
  const g4 = await context.getRealUrl('https://weixin.sogou.com/link?url=z', '', 1);
  check('getRealUrl-200 meta refresh', g4 === 'https://mp.weixin.qq.com/s?m=2', g4);
  // 200 antispider → 回退原链接（优雅降级）
  state.resolve = { statusCode: 200, headers: {}, body: '<html>antispider</html>' };
  const g5 = await context.getRealUrl('https://weixin.sogou.com/link?url=z', '', 1);
  check('getRealUrl-200含antispider回退原链接', g5.includes('weixin.sogou.com/link?url=z'), g5);

  console.log('\n[Step4/集成] get_sogou_cookie.js 错误路径退出码（子进程集成）');
  {
    const httpMod = require('http');
    const { spawn } = require('child_process');
    const COOKIE_SCRIPT = path.join(SKILL, 'scripts', 'get_sogou_cookie.js');

    // 必须用异步 spawn：spawnSync 会阻塞本进程事件循环，
    // 导致同进程的伪 CDP 服务器无法响应子进程请求（自锁死 → 子进程 http timeout）。
    const runCookieScript = (env) => new Promise((resolve) => {
      const child = spawn(process.execPath, [COOKIE_SCRIPT], { env });
      let out = '', err = '';
      child.stdout.on('data', (c) => (out += c));
      child.stderr.on('data', (c) => (err += c));
      const killer = setTimeout(() => { try { child.kill(); } catch (_) { /* ignore */ } }, 30000);
      child.on('close', (code) => { clearTimeout(killer); resolve({ status: code, stdout: out, stderr: err }); });
    });

    // 伪 CDP：/json/list 正常返回，但 WebSocket 端点返回 404（非 101）
    const srv = httpMod.createServer((req, res) => {
      if (req.url === '/json/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{
          type: 'page',
          url: 'https://weixin.sogou.com/',
          webSocketDebuggerUrl: 'ws://127.0.0.1:' + srv.address().port + '/devtools/page/BOGUS',
        }]));
      } else {
        res.writeHead(404);
        res.end('not a websocket endpoint');
      }
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;

    const r1 = await runCookieScript(Object.assign({}, process.env, { SOGOU_CDP_PORT: String(port) }));
    check('G1-非101响应→退出码非0（不得静默成功）', r1.status !== 0, 'status=' + r1.status);
    check('G2-非101响应→stderr 明确报错', /升级被拒绝/.test(r1.stderr || ''), (r1.stderr || '').trim().slice(0, 140));
    check('G3-非101响应→stdout 无 Cookie 内容', (r1.stdout || '').trim() === '', JSON.stringify(r1.stdout));

    srv.close();

    // 无 CDP 服务（端口已关闭）
    const r2 = await runCookieScript(Object.assign({}, process.env, { SOGOU_CDP_PORT: String(port) }));
    check('G4-无CDP→退出码为1', r2.status === 1, 'status=' + r2.status);
    check('G5-无CDP→stderr 明确报错', /无法连接/.test(r2.stderr || ''), (r2.stderr || '').trim().slice(0, 140));
  }

  console.log('\n================ 结果 ================');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  if (fail > 0) { console.log('失败项:\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('全部通过');
}

main().catch((e) => { console.error('测试台异常:', e); process.exit(2); });
