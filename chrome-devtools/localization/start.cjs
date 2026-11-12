// localization/start.cjs
// 按 local-config.json（由 verify_browser.cjs 自动检测写入）确保本地浏览器以远程调试端口运行，
// 并输出全局路径的 MCP 接入信息。
//
// 问题1修复（自动探测 CDP 端口，不硬绑定唯一端口）：
//   激活技能后扫描 9222~9240，优先复用已运行的「真实调试浏览器」（UA 非 WorkBuddy Electron，
//   自动跳过 9222 上的 WorkBuddy 自身），找不到则在本技能默认启动端口（9223）起的窗口内新启实例。
//   兼容跨机 / 跨平台：不写死端口，每次都实测端口是否就绪。
//
// 问题2修复（继承登录态但不污染真实 profile）：
//   默认将真实 User Data 全量拷贝到系统临时目录（%temp%/chrome-devtools-profile），
//   再以该拷贝 --user-data-dir 启动，继承登录态 / Cookie，但写入隔离在临时副本、
//   不触碰真实 User Data、且避开 SingletonLock 冲突。支持 --no-temp-profile 回退真实 profile、
//   --refresh 强制重新全量拷贝。
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  probePort, profileLocked, isBrowserRunning,
  prepareTempProfile, findTargetCdpPort, findAnyCdpPort,
} = require('./start_helpers.cjs'); // F3：抽出为独立可测模块；问题1/2：端口探测与临时 profile 拷贝
const { syncBrowserUrlPort } = require('./merge_mcp_json.cjs'); // 问题1修复：把实测端口同步进 ~/.workbuddy/mcp.json（形态一 MCP 直连不再连错端口）

const REPO = path.resolve(__dirname, '..');
const cfgPath = path.join(REPO, 'local-config.json');
function save(c) { fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2), 'utf8'); }

// CLI 参数：--no-temp-profile 回退真实 profile；--refresh 强制重新全量拷贝临时 profile
const argv = process.argv.slice(2);
const USE_TEMP_PROFILE = !argv.includes('--no-temp-profile');
const REFRESH_PROFILE = argv.includes('--refresh');

// 扫描窗口（问题1）：兼容跨机 / 跨平台，扫 9222..9240；9222 即便存在也由 findTargetCdpPort 跳过 WorkBuddy Electron
const MIN_PORT = 9222;
const MAX_PORT = 9240;

// 确保已检测到浏览器
if (!fs.existsSync(cfgPath) || !(function () { try { return !!JSON.parse(fs.readFileSync(cfgPath, 'utf8')).browserPath; } catch (e) { return false; } })()) {
  console.log('[*] 未配置浏览器，先运行 verify_browser.cjs 自动检测...');
  execSync('node "' + path.join(__dirname, 'verify_browser.cjs') + '"', { cwd: REPO, stdio: 'inherit' });
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const browser = cfg.browserPath;
// 问题2：默认启动端口（README 纪律：避开 9222=WorkBuddy Electron），仅作为「新启实例」的起始探测端口
const defaultStartPort = cfg.debugPort || 9223;
const realUserData = cfg.browserUserDataDir || path.join(path.dirname(browser), 'User Data');

if (!fs.existsSync(browser)) {
  console.error('[错误] 浏览器不存在: ' + browser + '，请运行: node "' + path.join(__dirname, 'verify_browser.cjs') + '"');
  process.exit(1);
}

function npmGlobalRoot() { return execSync('npm root -g', { encoding: 'utf8' }).trim(); }
const PKG = 'chrome-devtools-mcp';
const bin = path.join(npmGlobalRoot(), PKG, 'build', 'src', 'bin', 'chrome-devtools-mcp.js');

// 问题1修复：端口选择（不硬绑定 9223）
//   1) 优先复用已运行的「真实调试浏览器」（UA 非 WorkBuddy Electron，自动跳过 9222 的 WorkBuddy 自身）；
//   2) 无已运行目标浏览器 → 在默认启动端口（9223）起的窗口内找首个空闲端口新启（temp profile 拷贝）。
async function selectPort() {
  const reused = await findTargetCdpPort(MIN_PORT, MAX_PORT);
  if (reused !== null) return { port: reused, action: 'reuse' };
  const startMax = Math.max(MAX_PORT, defaultStartPort + 17);
  for (let p = defaultStartPort; p <= startMax; p++) {
    if (!(await probePort(p))) return { port: p, action: 'start' };
  }
  // 兜底：任意空闲端口（极少触发）
  const any = await findAnyCdpPort(MIN_PORT, MAX_PORT);
  if (any !== null) return { port: any, action: 'start' };
  return null;
}

(async () => {
  const sel = await selectPort();
  if (!sel) {
    console.error('[错误] 在 ' + MIN_PORT + '~' + MAX_PORT + ' 范围内未找到可用调试端口（均被占用且非真实调试浏览器）。');
    process.exit(1);
  }
  const port = sel.port;
  const action = sel.action;

  // 仅在新启实例时准备临时 profile（reuse 直接连接已运行实例，无需拷贝）
  let userData = realUserData;
  let profileMode = 'real';
  let loginStateComplete = true; // 关键登录态文件是否已完整拷入临时 profile
  if (action === 'start' && USE_TEMP_PROFILE) {
    try {
      const tmp = prepareTempProfile(realUserData, { refresh: REFRESH_PROFILE });
      userData = tmp.path;
      profileMode = tmp.reused ? 'temp-reused' : 'temp-fresh';
      if (!tmp.reused && tmp.skipped > 0) {
        console.log('      (注意：' + tmp.skipped + ' 个文件因被占用/锁被跳过：' + tmp.skippedFiles.slice(0, 5).join('、') + ')');
      }
      // 登录态完整性判定：关键登录态文件（站点 Cookie / 凭据 / 本地存储）缺失 → 显式告知，
      // 否则用户会误以为「已继承登录态」却发现站点仍需重新登录（实测：浏览器运行中时
      // Default/Network/Cookies 被独占锁定 → 站点 Cookie 无法拷贝）。
      if (tmp.missingCritical.length > 0) {
        loginStateComplete = false;
        console.log('');
        console.log('      [登录态未完整继承] 以下关键文件未能拷入临时 profile: ' + tmp.missingCritical.join('、'));
        console.log('        原因：浏览器正在运行并独占锁定这些文件（运行中无法复制 Cookie 库）。');
        console.log('        影响：站点 Cookie 未继承（部分站点可能需重新登录）；凭据 / 本地存储已继承。');
        console.log('        解决（二选一）：');
        console.log('          A) 关闭浏览器主实例后重跑本脚本（加 --refresh 强制重新全量拷贝）→ 登录态完整继承；');
        console.log('          B) 保持浏览器运行，直接复用其已开放的调试端口（--browserUrl）→ 登录态天然完整。');
        console.log('');
      }
    } catch (e) {
      console.error('[警告] 准备临时 profile 失败（' + e.message + '），回退使用真实 User Data（注意：可能有锁冲突 / 污染风险）。');
      userData = realUserData;
      profileMode = 'real';
    }
  }

  if (cfg.debugPort !== port) { cfg.debugPort = port; save(cfg); } // 记录实际选用端口（CLI/MCP 配置同步）

  // 问题1修复：把实测端口同步进 ~/.workbuddy/mcp.json 的 --browserUrl，
  // 否则形态一（MCP 直连）仍按部署时的静态端口连接 → ECONNREFUSED（用户报的原错误）。
  try {
    const sync = syncBrowserUrlPort(port);
    if (sync.changed) {
      console.log('      已同步 ~/.workbuddy/mcp.json 的 --browserUrl 端口: ' + sync.previousPort + ' → ' + sync.port
        + '（形态一 MCP 直连需重启 WorkBuddy / 重新信任该连接器后生效）');
    }
  } catch (e) {
    console.log('      (注意：同步 ~/.workbuddy/mcp.json 端口失败：' + e.message + '；CLI 形态不受影响)');
  }

  console.log('[启动] ' + browser);
  console.log('      调试端口(实测) ' + port + '  动作 ' + action + '  profile 模式 ' + profileMode
    + '  登录态 ' + (loginStateComplete ? '完整继承' : '部分继承（站点 Cookie 缺失，见上方提示）'));
  if (profileMode === 'temp-fresh') console.log('      (临时 profile 已全量拷贝自 ' + realUserData + ' → ' + userData + '，隔离运行、不污染真实 profile)');
  if (profileMode === 'temp-reused') console.log('      (复用既有临时 profile 拷贝：' + userData + '；如需刷新登录态快照请加 --refresh)');

  if (action === 'reuse') {
    console.log('[复用] 端口 ' + port + ' 已有真实调试浏览器 DevTools 端点，直接复用，不再启动（保留登录态）。');
  } else {
    // 仅当使用真实 profile 直连时才需检查「进程已运行 / 锁冲突」；
    // temp profile 拷贝已排除锁且为独立目录，与正在运行的真实浏览器互不冲突，无需检查。
    if (profileMode === 'real') {
      const browserState = isBrowserRunning(browser);
      if (browserState.running) {
        console.error('[提示] 浏览器进程已在运行（PID=' + browserState.pid + '），但未开放调试端口 ' + port + '。');
        console.error('        请关闭当前浏览器实例后重新运行本脚本，或使用临时 profile（默认即开启，加 --no-temp-profile 可关闭）。');
        process.exit(1);
      }
      if (profileLocked(userData)) {
        console.error('[错误] 用户数据目录 "' + userData + '" 已被一个浏览器实例占用（该实例未开放调试端口，' + port + ' 无响应）。');
        console.error('        直接启动带调试端口的实例会因 profile 锁冲突失败。请选择其一：');
        console.error('        1) 关闭当前已运行的浏览器实例，再重新运行本脚本启动带调试端口的实例（复用登录态）；');
        console.error('        2) 为已运行实例手动开启远程调试（重启时加 --remote-debugging-port=' + port + '），再用 --browserUrl 连接；');
        console.error('        3) 改用临时 profile（默认开启）以隔离方式启动，避免锁冲突。');
        process.exit(1);
      }
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

  if (port !== defaultStartPort) {
    console.log('[注意] 默认启动端口 ' + defaultStartPort + ' 不可用，已自动改用 ' + port + '。');
    console.log('        若使用 MCP 直连（形态一），请将 mcp.json 的 --browserUrl 同步改为 http://127.0.0.1:' + port + '（或重跑 node localization/install.cjs 重新生成 mcp-local-config.json）。');
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
