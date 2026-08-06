// localization/cli_run.cjs
// CLI 模式专用辅助脚本（MCP 模式下可被用户删除的"CLI 相关"实体）。
// 解析全局安装的 chrome-devtools-mcp bin，并以 --browserUrl 连接已启动的浏览器，
// 将后续参数原样转发给服务器（单工具调用），附加 --no-usage-statistics。
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
function globalBinPath() { return path.join(npmGlobalRoot(), PKG_NAME, 'build', 'src', 'bin', 'chrome-devtools-mcp.js'); }

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
const full = [bin, ...userArgs, '--browserUrl=http://127.0.0.1:' + port, '--no-usage-statistics'];
const r = spawnSync('node', full, { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
