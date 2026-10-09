// localization/start.cjs
// 按 local-config.json（由 verify_browser.cjs 自动检测写入）启动浏览器远程调试端口，并输出全局路径的 MCP 接入信息。
// 复用登录态：恒用 --user-data-dir 指向本机 User Data；禁用 --isolated（会丢登录态）。
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { probePort, profileLocked, isBrowserRunning, isTargetBrowserOnPort } = require('./start_helpers.cjs'); // F3：抽出为独立可测模块；F10：新增 isBrowserRunning 用于浏览器运行状态检测；R4：isTargetBrowserOnPort 判定端口占用者是否为 360

const REPO = path.resolve(__dirname, '..');
const cfgPath = path.join(REPO, 'local-config.json');
function save(c) { fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2), 'utf8'); }

// 确保已检测到浏览器
if (!fs.existsSync(cfgPath) || !(function () { try { return !!JSON.parse(fs.readFileSync(cfgPath, 'utf8')).browserPath; } catch (e) { return false; } })()) {
  console.log('[*] 未配置浏览器，先运行 verify_browser.cjs 自动检测...');
  execSync('node "' + path.join(__dirname, 'verify_browser.cjs') + '"', { cwd: REPO, stdio: 'inherit' });
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const browser = cfg.browserPath;
const userData = cfg.browserUserDataDir || path.join(path.dirname(browser), 'User Data');
const basePort = cfg.debugPort || 9223;
const MAX_PORT = basePort + 10; // 端口扫描窗口上限（R4：避免无限扫描）
if (!fs.existsSync(browser)) {
  console.error('[错误] 浏览器不存在: ' + browser + '，请运行: node "' + path.join(__dirname, 'verify_browser.cjs') + '"');
  process.exit(1);
}
console.log('[启动] ' + browser + '  调试端口(目标) ' + basePort + '  用户数据: ' + userData);

// 检测 user-data-dir 是否已被某个浏览器实例占用（Chrome 在 profile 目录写入 SingletonLock / SingletonCookie）。
// 该锁与调试端口无关：即使 9223 无响应，只要锁存在就说明有实例占用同一 profile，
// 此时再 spawn 同 profile 的带端口实例会因锁冲突静默失败（F9 边界盲区修复）。
// 实现见 localization/start_helpers.cjs（F3 抽出为独立可测模块）。

function npmGlobalRoot() { return execSync('npm root -g', { encoding: 'utf8' }).trim(); }
const PKG = 'chrome-devtools-mcp';
const bin = path.join(npmGlobalRoot(), PKG, 'build', 'src', 'bin', 'chrome-devtools-mcp.js');

// 端口预检 + 端口兼容性（R4）：从 basePort 起向上扫描（窗口 +10）：
//  - 端口空闲 → 在此启动浏览器；
//  - 端口已被 360Chromex 占用 → 复用（保留登录态）；
//  - 端口被其它浏览器（如 WorkBuddy Electron）占用 → 跳到下一端口。
(async () => {
  let chosen = null, action = null;
  for (let p = basePort; p <= MAX_PORT; p++) {
    const occupied = await probePort(p);
    if (!occupied) { chosen = p; action = 'start'; break; }
    if (await isTargetBrowserOnPort(p)) { chosen = p; action = 'reuse'; break; }
    console.log('[跳过] 端口 ' + p + ' 被非 360 浏览器占用（如 WorkBuddy Electron），尝试下一端口');
  }
  if (!chosen) {
    console.error('[错误] 在 ' + basePort + '~' + MAX_PORT + ' 范围内未找到可用调试端口（均被占用且非 360 浏览器）。');
    process.exit(1);
  }
  const port = chosen;
  if (cfg.debugPort !== port) { cfg.debugPort = port; save(cfg); } // 记录实际选用端口（CLI/MCP 配置同步）

  if (action === 'reuse') {
    console.log('[复用] 端口 ' + port + ' 已有 360Chromex DevTools 端点，直接复用，不再启动（保留登录态）。');
  } else {
    // F10：检查浏览器进程是否在运行
    const browserState = isBrowserRunning(browser);
    if (browserState.running) {
      console.error('[提示] 浏览器进程已在运行（PID=' + browserState.pid + '），但未开放调试端口 ' + port + '。');
      console.error('        请关闭当前浏览器实例后重新运行本脚本，或使用独立临时 profile（--user-data-dir=<新空目录>）。');
      console.error('        切勿关闭用户正在使用的浏览器——本脚本仅在当前浏览器未开放调试端口时才会启动新实例。');
      process.exit(1);
    }
    if (profileLocked(userData)) {
      console.error('[错误] 用户数据目录 "' + userData + '" 已被一个浏览器实例占用（该实例未开放调试端口，' + port + ' 无响应）。');
      console.error('        直接启动带调试端口的实例会因 profile 锁冲突失败。请选择其一：');
      console.error('        1) 关闭当前已运行的浏览器实例，再重新运行本脚本启动带调试端口的实例（复用登录态）；');
      console.error('        2) 为已运行实例手动开启远程调试（重启时加 --remote-debugging-port=' + port + '），再用 --browserUrl 连接；');
      console.error('        3) 如需独立隔离测试实例，改用其他空目录作为 --user-data-dir。');
      process.exit(1);
    }
    const child = spawn(browser, ['--remote-debugging-port=' + port, '--user-data-dir=' + userData], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => { console.error('[错误] 浏览器启动失败: ' + err.message); process.exit(1); });
    child.unref();
    // F1（P2 修复）：spawn 后必须实测调试端口真正就绪，再报告成功；
    // 否则浏览器启动慢/静默失败会被误报为 [OK]，导致后续 MCP 连接全部失败。
    let ready = false;
    for (let i = 0; i < 20; i++) {
      if (await probePort(port)) { ready = true; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    if (!ready) {
      console.error('[错误] 浏览器已 spawn，但端口 ' + port + ' 在 10 秒内始终无 DevTools 端点响应（启动失败或被拦截）。');
      console.error('        请检查：浏览器路径是否正确、是否被安全软件拦截、或 User Data 锁冲突。');
      process.exit(1);
    }
    console.log('[OK] 浏览器已在端口 ' + port + ' 启动（已实测 DevTools 端点就绪）。');
  }

  if (port !== basePort) {
    console.log('[注意] 默认端口 ' + basePort + ' 不可用，已自动改用 ' + port + '。');
    console.log('        若使用 MCP 直连（形态一），请将 mcp.json 的 --browserUrl 同步改为 http://127.0.0.1:' + port + '（或重跑 node localization/deploy.cjs 重新生成 mcp-local-config.json）。');
  }

  // MCP 接入信息：端口确定后再输出，避免异步探针未落定时误报。
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
