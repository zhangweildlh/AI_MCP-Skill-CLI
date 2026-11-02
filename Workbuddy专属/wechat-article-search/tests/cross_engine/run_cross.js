/**
 * 跨引擎交叉验证（Step5）：Node 解析器 vs Python 参考解析器
 * 对同一份 fixture 独立解析，比对 title/url/summary/source 一致性。
 * 运行：node tests/cross_engine/run_cross.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync, execSync } = require('child_process');

const SKILL = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(SKILL, 'scripts', 'search_wechat.js');
const FX = path.join(SKILL, 'tests', 'fixtures');
const PY = path.join(__dirname, 'ref_parser.py');
const read = (p) => fs.readFileSync(p, 'utf-8');

// 加载 Node 解析器（仅用 parseArticlesFromSearchHtml，无需真实网络）
const sandbox = {
  require: (n) => {
    if (n === 'https') return { request: () => ({ on() {}, setTimeout() {}, end() {} }) };
    if (n === 'zlib') return { gunzipSync: (b) => b, inflateSync: (b) => b, brotliDecompressSync: (b) => b };
    if (n === 'fs') return { writeFileSync() {} };
    throw new Error('unexpected require: ' + n);
  },
  console: { log() {}, error() {}, warn() {} },
  setTimeout, clearTimeout, URL, Buffer,
  process: { argv: ['node', 's'], exit() {}, env: {} },
  module: { exports: {}, main: null },
  Date, Math, JSON, RegExp, String, Number, Array, Object,
};
const context = vm.createContext(sandbox);
vm.runInContext(read(SCRIPT), context, { filename: 'search_wechat.js' });

function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

// 解析可用的 Python 可执行文件（Windows 多为 python.exe / python.cmd 包装器，需用 shell 解析）
let PY_BIN = null;
function resolvePython() {
  if (PY_BIN) return PY_BIN;
  for (const cand of ['python3', 'python', 'py']) {
    try { execSync(cand + ' --version', { shell: true, stdio: 'ignore' }); PY_BIN = cand; return cand; }
    catch { /* try next */ }
  }
  throw new Error('未找到可用的 Python 解释器（python3/python/python）');
}
function runPython(fixturePath) {
  // shell:true 让 OS shell 通过 PATH/PATHEXT 解析 python(.exe/.cmd)
  return execSync(resolvePython() + ' "' + PY + '" "' + fixturePath + '"', { encoding: 'utf-8', shell: true });
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

console.log('[Step5] 跨引擎交叉验证（Node 解析器 ↔ Python 参考解析器）');
// fixture 须覆盖三类页面：正常结果页、合法空结果页、反爬拦截页
const fixtures = ['sogou_normal.html', 'sogou_empty.html', 'sogou_antispider.html'];
for (const f of fixtures) {
  const html = read(path.join(FX, f));
  const nodeArts = context.parseArticlesFromSearchHtml(html, 50)
    .map((a) => ({ title: a.title, url: a.url, summary: a.summary, source: a.source }));
  let py;
  try {
    py = JSON.parse(runPython(path.join(FX, f)));
  } catch (e) {
    check('Python 参考解析器可执行', false, e.message);
    continue;
  }
  const pyArts = py.articles || [];
  check(`[${f}] 篇数一致`, nodeArts.length === pyArts.length, `node=${nodeArts.length} py=${pyArts.length}`);
  const n = Math.min(nodeArts.length, pyArts.length);
  for (let i = 0; i < n; i++) {
    const a = nodeArts[i], b = pyArts[i];
    const tag = `[${f}#${i}]`;
    check(`${tag} title 一致`, norm(a.title) === norm(b.title), `node=${a.title} | py=${b.title}`);
    check(`${tag} url 一致`, norm(a.url) === norm(b.url), `node=${a.url} | py=${b.url}`);
    check(`${tag} summary 一致`, norm(a.summary) === norm(b.summary), `node=${a.summary} | py=${b.summary}`);
    check(`${tag} source 一致`, norm(a.source) === norm(b.source), `node=${a.source} | py=${b.source}`);
  }
  // 判定层交叉：反爬判定是本技能风险最高的层，必须由两引擎独立给出一致结论
  const nodeAnti = context.isAntiSpider(html);
  const pyAnti = !!py.is_anti_spider;
  check(`[${f}] isAntiSpider 判定一致`, nodeAnti === pyAnti, `node=${nodeAnti} py=${pyAnti}`);
}

console.log('\n================ 跨引擎结果 ================');
console.log('PASS=' + pass + '  FAIL=' + fail);
if (fail > 0) { console.log('失败项:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('跨引擎一致，全部通过');
