#!/usr/bin/env node
/**
 * wechat-article-search · CLI 契约测试（黑盒，子进程调用真实脚本）
 *
 * 缘起：`tests/run_tests.js` 以 vm 沙箱加载脚本**内部函数**做单元/集成断言，
 * 但**命令行契约层**（退出码家族、用法输出、参数截断提示、Cookie 残缺告警）
 * 此前无任何覆盖——而这些恰是调用方（wechat-article-to-ima 等下游）唯一依赖的
 * 外部行为面：退出码 2 = 参数非法、退出码 1 = 检索失败、退出码 0 = 成功。
 *
 * 离线部分（默认，零网络）：参数校验与退出码家族、用法输出、截断提示、Cookie 告警。
 * 真实态部分（--allow-real）：`-o` 落盘 JSON 结构、URL 实体解码。
 *
 * 纪律：零第三方依赖；不反向依赖仓库级入口；临时文件自清理（§9.5）；无绝对路径。
 * 运行：node tests/test_cli_contract.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const SCRIPT = path.join(SKILL_DIR, 'scripts', 'search_wechat.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

/** 以子进程调用真实 CLI */
function cli(args) {
  const r = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8', timeout: 60000 });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

console.log('=== ① 退出码家族：参数非法 = 2（离线，不触网）===');
let r = cli(['-n', '0', '关键词']);
check('-n 0 → 退出码 2', r.code === 2, 'code=' + r.code);
check('-n 0 → stderr 明确报错且给出用法', /参数错误/.test(r.err) && /用法：/.test(r.err), r.err.slice(0, 120));
r = cli(['-n', 'abc', '关键词']);
check('-n abc → 退出码 2', r.code === 2, 'code=' + r.code);
r = cli(['--numm', '20', '关键词']);
check('未知选项 → 退出码 2', r.code === 2, 'code=' + r.code);
r = cli(['-d', '-1', '关键词']);
check('-d 负值 → 退出码 2', r.code === 2, 'code=' + r.code);
r = cli(['-o']);
check('-o 缺值 → 退出码 2', r.code === 2, 'code=' + r.code);
r = cli(['词一', '词二']);
check('多余位置参数 → 退出码 2', r.code === 2, 'code=' + r.code);

console.log('\n=== ② 无参数 → 打印用法并以退出码 0 结束（离线）===');
r = cli([]);
check('无参数 → 退出码 0', r.code === 0, 'code=' + r.code);
check('无参数 → stdout 含用法与各选项说明',
  /用法:/.test(r.out) && /--num/.test(r.out) && /--resolve-url/.test(r.out) && /--cookie/.test(r.out),
  r.out.slice(0, 160));
check('无参数 → stdout 含示例段', /示例:/.test(r.out), r.out.slice(-160));

console.log('\n=== ③ 参数截断与 Cookie 残缺告警（在触网前输出，离线可断言）===');
// 这两例刻意**不带关键词**：截断提示与 Cookie 告警都在检索之前输出，
// 无关键词时脚本打印用法即以退出码 0 结束 —— 全程不发起任何网络请求。
r = cli(['-n', '100']);
check('-n 100 → stderr 提示截断为 50', /上限为 50/.test(r.err), r.err.slice(0, 160));
check('-n 100（无关键词）→ 打印用法后退出码 0，未触网', r.code === 0 && /用法:/.test(r.out), 'code=' + r.code);
r = cli(['-c', 'FOO=bar']);
check('Cookie 缺 SNUID/SUID → stderr 告警但不阻断', /缺少关键键/.test(r.err), r.err.slice(0, 160));
check('残缺 Cookie（无关键词）→ 告警后仍打印用法并退出码 0（不阻断）', r.code === 0, 'code=' + r.code);

console.log('\n=== ④ 静态断言：URL 实体解码已落地（防回归）===');
const src = fs.readFileSync(SCRIPT, 'utf8');
check('源码含 decodeUrlEntities 定义', /function decodeUrlEntities/.test(src), '');
check('href 提取处调用实体解码', /decodeUrlEntities\(titleAnchor\.href/.test(src), '');
check('getRealUrl 入口做防御式解码', /url = decodeUrlEntities\(url\)/.test(src), '');

async function realStateSection() {
  console.log('\n=== ⑤ 真实态：-o 落盘 JSON 结构与实体解码（需 --allow-real）===');
  if (!process.argv.includes('--allow-real')) {
    console.log('  ○ 已跳过（真实态测试默认不运行，须 --allow-real 显式门控，见 §9.3）');
    return;
  }
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'was-cli-test-'));
  try {
    const out = path.join(TMP, 'out.json');
    const rr = cli(['-n', '5', '-r', '-o', out, '工程总承包']);
    if (rr.code !== 0) {
      console.log('  ⚠ 检索未成功（退出码 ' + rr.code + '），常因搜狗反爬；跳过真实态断言：' + rr.err.slice(0, 120));
      return;
    }
    check('-o 落盘文件存在', fs.existsSync(out), out);
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    check('落盘 JSON 含 query/total/articles 三字段',
      typeof j.query === 'string' && typeof j.total === 'number' && Array.isArray(j.articles), JSON.stringify(Object.keys(j)));
    check('每篇文章含 7 个必备字段', (j.articles || []).every((a) =>
      ['title', 'url', 'summary', 'datetime', 'date_text', 'date_description', 'source'].every((k) => k in a)),
      JSON.stringify((j.articles || [])[0] || {}));
    const amp = (j.articles || []).filter((a) => String(a.url).includes('&amp;')).length;
    check('★ 落盘 URL 不含未解码 &amp; 实体', amp === 0, '含实体 ' + amp + ' 条');
    const resolved = (j.articles || []).filter((a) => a.url_resolved === true).length;
    console.log('  已解析直链 ' + resolved + '/' + (j.articles || []).length + '（未解析者须由下游走中转链接解析降级链）');
  } finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

(async () => {
  await realStateSection();
  console.log('\n=== 汇总 ===');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if (fail) {
    console.log('未通过明细：');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(fail ? 1 : 0);
})();
