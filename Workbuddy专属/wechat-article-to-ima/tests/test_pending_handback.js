#!/usr/bin/env node
/**
 * wechat-article-to-ima · pending_fetch handback 合同（离线单测）
 *
 * 缘起（Phase 7 重构）：2/3 级抓取从「代码自动调用 firecrawl」改为「pipeline.js 落盘
 * pending_fetch/<url>.md 移交 Agent 编排，Agent 回交覆写后由 --ingest-pending 消费」。
 * 本测试锁定 handback 合同的纯函数与落盘契约：
 *   ① pendingKeyOf：同 URL → 同 key（含 8 位哈希后缀防碰撞），不同 URL → 不同 key；
 *   ② emitNeedsFetch：落盘 stub 文件，内容以 NEEDS_FETCH 标记开头，含 url/候选/原因；
 *   ③ isPendingStub：stub（含标记）→ true；Agent 回交（去除标记）→ false。
 *
 * 纪律：零第三方依赖；复用 pipeline.js 纯函数导出；无网络/凭据；临时目录自清理。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const P = require(path.join(SKILL_DIR, 'scripts', 'pipeline.js'));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}
function call(fn) { try { return fn(); } catch (e) { return '__THREW__:' + e.message; } }

const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-pending-'));
try {
  console.log('=== ① pendingKeyOf：确定性 + 防碰撞 ===');
  check('已导出且为函数', typeof P.pendingKeyOf === 'function');
  const k1 = call(() => P.pendingKeyOf('https://mp.weixin.qq.com/s?__biz=1'));
  const k1b = call(() => P.pendingKeyOf('https://mp.weixin.qq.com/s?__biz=1'));
  const k2 = call(() => P.pendingKeyOf('https://mp.weixin.qq.com/s?__biz=2'));
  check('同 URL → 同 key（确定性）', typeof k1 === 'string' && k1 === k1b);
  check('不同 URL → 不同 key（防碰撞）', typeof k2 === 'string' && k1 !== k2);
  check('key 含 8 位十六进制哈希后缀', typeof k1 === 'string' && /_[0-9a-f]{8}$/.test(k1));
  check('key 仅含安全文件名字符 + 哈希后缀', typeof k1 === 'string' && /^[^\\/:*?"<>|]+_[0-9a-f]{8}$/.test(k1));

  console.log('\n=== ② emitNeedsFetch：落盘 stub 契约 ===');
  check('已导出且为函数', typeof P.emitNeedsFetch === 'function');
  const a = { url: 'https://mp.weixin.qq.com/s?__biz=1&mid=9#rd' };
  const candidates = ['https://mp.weixin.qq.com/s?__biz=1&mid=9', 'https://mp.weixin.qq.com/s?__biz=1&mid=9#rd'];
  const reason = 'js_content 为空或过短';
  call(() => P.emitNeedsFetch(a, candidates, reason, tmpWs));
  const dir = path.join(tmpWs, 'pending_fetch');
  check('pending_fetch/ 目录已创建', fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  check('恰好落盘一个 .md stub', files.length === 1);
  const fp = path.join(dir, files[0]);
  const raw = fs.readFileSync(fp, 'utf8');
  check('stub 以 NEEDS_FETCH 标记开头', raw.startsWith(P.NEEDS_FETCH_MARKER));
  check('stub 含原 URL', raw.includes(a.url));
  check('stub 含候选直链', raw.includes(candidates[0]));
  check('stub 含失败原因', raw.includes(reason));

  console.log('\n=== ③ isPendingStub：stub 与 handback 判别 ===');
  check('已导出且为函数', typeof P.isPendingStub === 'function');
  check('含 NEEDS_FETCH 标记的 stub → true', P.isPendingStub(raw) === true);
  check('空内容 → false', P.isPendingStub('') === false);
  // 模拟 Agent 回交：去除标记、覆写为文章 markdown
  const handback = '# 文章标题\n\n来源：某某公众号\n\n正文第一段。\n\n正文第二段。';
  check('去除标记的 handback → false（可消费）', P.isPendingStub(handback) === false);
  // 一致性：emitNeedsFetch 落盘内容须被 isPendingStub 判为 stub
  check('★ 一致性：emitNeedsFetch 产物恒被 isPendingStub 判为 stub', P.isPendingStub(raw) === true);
} finally {
  fs.rmSync(tmpWs, { recursive: true, force: true });
}

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('未通过明细：'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
