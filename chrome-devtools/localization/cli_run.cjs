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

function npmGlobalRoot() { return execSync('npm root -g', { encoding: 'utf8' }).trim(); }
// 关键修正：CLI 入口是 chrome-devtools.js（非 MCP 入口 chrome-devtools-mcp.js）
function globalBinPath() { return path.join(npmGlobalRoot(), PKG_NAME, 'build', 'src', 'bin', 'chrome-devtools.js'); }

const bin = globalBinPath();
if (!fs.existsSync(bin)) {
  console.error('[错误] 全局 chrome-devtools-mcp 未安装（预期: ' + bin + '）。请先运行: node localization/deploy.cjs');
  process.exit(1);
}
const cfg = fs.existsSync(path.join(REPO, 'local-config.json'))
  ? JSON.parse(fs.readFileSync(path.join(REPO, 'local-config.json'), 'utf8'))
  : {};
const port = cfg.debugPort || 9222;
const userArgs = process.argv.slice(2);

// 第一段：启动常驻服务并连接已运行的浏览器（仅 start 子命令接受 --browserUrl）
const startArgs = [bin, 'start', '--browserUrl=http://127.0.0.1:' + port, '--no-usage-statistics'];
const startR = spawnSync('node', startArgs, { stdio: 'inherit' });
if (startR.status !== 0) process.exit(startR.status === null ? 1 : startR.status);

// 第二段：调用工具（daemon 已在运行，工具命令直接与之通信，不带 --browserUrl）
const toolR = spawnSync('node', [bin, ...userArgs], { stdio: 'inherit' });
process.exit(toolR.status === null ? 1 : toolR.status);
