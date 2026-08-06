// localization/start.cjs
// 按 local-config.json（由 verify_browser.cjs 自动检测写入）启动浏览器远程调试端口，并输出全局路径的 MCP 接入信息。
// 复用登录态：恒用 --user-data-dir 指向本机 User Data；禁用 --isolated（会丢登录态）。
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// 探测调试端口是否已被占用（浏览器可能已在运行）。
function probePort(p) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: p, path: '/json/version', timeout: 1000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

const REPO = path.resolve(__dirname, '..');
const cfgPath = path.join(REPO, 'local-config.json');

// 确保已检测到浏览器
if (!fs.existsSync(cfgPath) || !(function () { try { return !!JSON.parse(fs.readFileSync(cfgPath, 'utf8')).browserPath; } catch (e) { return false; } })()) {
  console.log('[*] 未配置浏览器，先运行 verify_browser.cjs 自动检测...');
  execSync('node "' + path.join(__dirname, 'verify_browser.cjs') + '"', { cwd: REPO, stdio: 'inherit' });
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const browser = cfg.browserPath;
const userData = cfg.browserUserDataDir || path.join(path.dirname(browser), 'User Data');
const port = cfg.debugPort || 9222;
if (!fs.existsSync(browser)) {
  console.error('[错误] 浏览器不存在: ' + browser + '，请运行: node "' + path.join(__dirname, 'verify_browser.cjs') + '"');
  process.exit(1);
}
console.log('[启动] ' + browser + '  调试端口 ' + port + '  用户数据: ' + userData);

// 取 DevTools 端点暴露的浏览器标识，确认端口占用者确为预期浏览器（F7 轻量校验）。
function browserVersion(p) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: p, path: '/json/version', timeout: 1000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body).Browser || ''); } catch { resolve(''); } });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function npmGlobalRoot() { return execSync('npm root -g', { encoding: 'utf8' }).trim(); }
const PKG = 'chrome-devtools-mcp';
const bin = path.join(npmGlobalRoot(), PKG, 'build', 'src', 'bin', 'chrome-devtools-mcp.js');

// 端口预检（RC-D）：已占用则复用，避免重复启动导致 --user-data-dir 锁冲突。
// 统一在探针落定后再打印接入信息，避免异步探针未落定时误报"已启动"（F4）；spawn 增加 error 监听。
(async () => {
  const already = await probePort(port);
  if (already) {
    const ver = await browserVersion(port);
    const who = ver ? '（占用者: ' + ver + '）' : '（已响应 DevTools 端点，但无法读取标识）';
    console.log('[复用] 调试端口 ' + port + ' 已被占用，确认为 DevTools 端点' + who + '，直接复用，不再启动。');
  } else {
    const child = spawn(browser, ['--remote-debugging-port=' + port, '--user-data-dir=' + userData], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => { console.error('[错误] 浏览器启动失败: ' + err.message); process.exit(1); });
    child.unref();
    console.log('[OK] 浏览器已启动。');
  }

  // MCP 接入信息：端口预检与启动结果确定后再输出，避免异步探针未落定时误报。
  console.log('请在 WorkBuddy mcp.json 加入（全局路径）:');
  console.log(JSON.stringify({
    mcpServers: {
      'chrome-devtools': {
        command: 'node',
        args: [bin, '--browserUrl=http://127.0.0.1:' + port, '--no-usage-statistics'],
        env: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' }
      }
    }
  }, null, 2));
})();
