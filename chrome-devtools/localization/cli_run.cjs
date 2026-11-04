// localization/cli_run.cjs
// CLI 模式专用辅助脚本（MCP 模式下可被用户删除的"CLI 相关"实体）。
// 采用「先 start 连接常驻服务、再调用工具」的两段式，与 chrome-devtools CLI 实际接口一致：
//   - 使用 CLI 入口 chrome-devtools.js（非 MCP 入口 chrome-devtools-mcp.js，后者不解析 <tool> 位置参数）；
//   - --browserUrl / --no-usage-statistics 仅属于 start 子命令（常驻服务连接参数），不能跟在工具命令后。
//
// 用法（跨环境统一走全局路径，严禁 npx -y）：
//   node localization/cli_run.cjs <tool> [参数...]
// 例如：
//   node localization/cli_run.cjs take_snapshot
//   node localization/cli_run.cjs navigate_page --url https://example.com
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const PKG_NAME = 'chrome-devtools-mcp';
const { realGlobalInstall } = require('./install_global.cjs'); // 方案一：真实全局安装（非软链接）

function npmGlobalRoot() { return execSync('npm root -g', { encoding: 'utf8' }).trim(); }
// 关键修正：CLI 入口是 chrome-devtools.js（非 MCP 入口 chrome-devtools-mcp.js）
function globalBinPath() { return path.join(npmGlobalRoot(), PKG_NAME, 'build', 'src', 'bin', 'chrome-devtools.js'); }

const bin = globalBinPath();
if (!fs.existsSync(bin)) {
  console.error('[错误] 全局 chrome-devtools-mcp 未安装（预期: ' + bin + '）。正在尝试方案一真实自动安装...');
  try {
    // 方案一：真实全局安装（npm pack + install -g .tgz + 补运行时依赖 + 复制 devtools-frontend），
    // 严格遵循纪律：npm install -g，禁 npx -y，跳过浏览器内核下载；产出可用真实安装而非缺依赖的注册表包。
    realGlobalInstall();
    console.log('[OK] 真实安装成功，继续...');
  } catch (e) {
    console.error('[失败] 自动安装失败。请手动运行: node localization/deploy.cjs');
    process.exit(1);
  }
}
const cfgPath = path.join(REPO, 'local-config.json');

// 问题1修复：先确保浏览器已启动并自动探测到真实 CDP 端口（复用或新启），写入 local-config.json，
// 再读取实际端口连接——不再盲连硬编码的 9223（本机真实调试浏览器可能运行在 9222/9224/... 任意端口）。
// start.cjs 默认以临时 profile 拷贝启动（继承登录态且不污染真实 profile，问题2修复）。
console.log('[*] 确保本地浏览器以远程调试端口运行（自动探测端口）...');
try {
  execSync('node "' + path.join(__dirname, 'start.cjs') + '"', { cwd: REPO, stdio: 'inherit' });
} catch (e) {
  console.error('[失败] 浏览器启动/端口探测失败，无法继续。请检查 localization/start.cjs 输出。');
  process.exit(1);
}

// 重新读取探测后的端口（start.cjs 已写入 cfg.debugPort）
const cfg = fs.existsSync(cfgPath)
  ? JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  : {};
const port = cfg.debugPort || 9223;
const userArgs = process.argv.slice(2);

// 第一段：启动常驻服务并连接已运行的浏览器（仅 start 子命令接受 --browserUrl）
// 注意：上游 chrome-devtools.js 将 --isolated 和 --headless 默认设为 true（仅当 userDataDir 未指定时注入）。
// 此处必须显式传 --no-isolated --no-headless 覆盖默认值，否则启动临时 profile 丢登录态。
const startArgs = [bin, 'start', '--browserUrl=http://127.0.0.1:' + port, '--no-usage-statistics', '--no-isolated', '--no-headless'];
const startR = spawnSync('node', startArgs, { stdio: 'inherit' });
if (startR.status !== 0) process.exit(startR.status === null ? 1 : startR.status);

// 第二段：调用工具（daemon 已在运行，工具命令直接与之通信，不带 --browserUrl）
const toolR = spawnSync('node', [bin, ...userArgs], { stdio: 'inherit' });
process.exit(toolR.status === null ? 1 : toolR.status);
