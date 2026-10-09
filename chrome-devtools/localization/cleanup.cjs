// localization/cleanup.cjs
// R5：任务执行完毕后的「自动闭环清理」。
// 设计原则（红线）：仅清理本技能自身产生/落盘的「过程 / 状态 / 临时 / 日志」文件，
// 绝不触碰以下任何一项（避免破坏用户环境与登录态）：
//   - 用户目录 User Data（浏览器登录态 / profile）
//   - 浏览器原始程序（360chromex.exe 等）及其部署目录下非本技能生成的文件
//   - upstream/（上游 vendored 快照）、node_modules/、build/（构建产物）
//   - localization/ 源码、SKILL.md / README.md / fragments / *.example.json（技能定义）
//   - 任何用户个人文件（Desktop / Documents / Downloads 等）
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const removed = [];
const skipped = [];

function rmFile(p) {
  try {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) { fs.unlinkSync(p); removed.push(p); return true; }
  } catch (e) { skipped.push(p + ' (' + e.message + ')'); }
  return false;
}
function rmDir(p) {
  try {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) { fs.rmSync(p, { recursive: true, force: true }); removed.push(p); return true; }
  } catch (e) { skipped.push(p + ' (' + e.message + ')'); }
  return false;
}

console.log('[清理] 开始 chrome-devtools 技能闭环清理（仅移除技能生成物，不动 User Data / 浏览器原始文件）');

// 1) 状态 / 配置（由 verify_browser.cjs / apply_localize.cjs / deploy.cjs 生成的机相关文件）
rmFile(path.join(REPO, 'local-config.json'));
rmFile(path.join(REPO, 'mcp-local-config.json'));

// 2) 本地启动的 CLI 常驻 daemon（chrome-devtools.js stop）：
//    仅清理「本技能经 CLI 形态拉起的常驻服务」，不影响宿主的 MCP stdio 服务与用户正在使用的浏览器。
try {
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const bin = path.join(globalRoot, 'chrome-devtools-mcp', 'build', 'src', 'bin', 'chrome-devtools.js');
  if (fs.existsSync(bin)) {
    const r = spawnSync('node', [bin, 'stop'], { stdio: 'ignore' });
    console.log('[清理] 已尝试停止本地 CLI daemon（chrome-devtools.js stop），退出码 ' + (r.status === null ? 'n/a' : r.status));
  }
} catch (e) { console.log('[清理] 停止 CLI daemon 跳过：' + e.message); }

// 3) OS 临时目录下的 chrome-devtools-mcp-* 临时目录（daemon / 工具未协商 roots 时落盘的临时文件）
const tmp = os.tmpdir();
try {
  const ents = fs.readdirSync(tmp);
  let n = 0;
  for (const e of ents) {
    if (/^chrome-devtools-mcp-/i.test(e)) { if (rmDir(path.join(tmp, e))) n++; }
  }
  console.log('[清理] 临时目录 ' + tmp + ' 下移除 chrome-devtools-mcp-* 目录 ' + n + ' 个');
} catch (e) { skipped.push(tmp + ' (' + e.message + ')'); }

// 4) 日志：仅清理技能目录顶层直接散落的 *.log（不递归，避免误删 upstream 等子目录）
try {
  const ents = fs.readdirSync(REPO);
  let n = 0;
  for (const e of ents) {
    if (/\.log$/i.test(e)) { if (rmFile(path.join(REPO, e))) n++; }
  }
  if (n) console.log('[清理] 移除技能目录顶层日志文件 ' + n + ' 个');
} catch (e) { skipped.push(REPO + ' (' + e.message + ')'); }

console.log('');
console.log('[清理] 已移除 ' + removed.length + ' 项：');
removed.forEach(p => console.log('  - ' + p));
if (skipped.length) {
  console.log('[清理] 跳过 / 失败 ' + skipped.length + ' 项：');
  skipped.forEach(p => console.log('  ! ' + p));
}
console.log('[清理] 完成。User Data / 浏览器原始文件 / upstream / node_modules / build / localization 源码均未触碰，浏览器未关闭（登录态保留）。');
