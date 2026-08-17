// localization/deploy.cjs
// 自包含部署（全局安装模式）：
//   1) 核查本地浏览器（verify_browser.cjs，自动检测 360Chromex/Chrome，避免便携版）
//   2) 本地安装全部依赖（npm install，PUPPETEER_SKIP_DOWNLOAD=1）到本文件夹 node_modules
//      —— 关键点：chrome-devtools-mcp 的运行时依赖（puppeteer-core / @modelcontextprotocol/sdk 等）
//         全部在 devDependencies；从注册表 `npm i -g chrome-devtools-mcp` 安装到的发布包不含运行时依赖，
//         会导致服务器缺模块。因此必须用“本地文件夹安装”（npm install 装齐依赖 + npm install -g . 建符号链接）。
//   3) 全局符号链接 $(npm root -g)/chrome-devtools-mcp -> 本文件夹，并防御性确保 bin 命令可用
//      —— npm install -g . 对“本地文件夹”仅创建符号链接（不会拷贝、也不会装依赖）；
//         随后 ensureGlobalBinLinks() 显式创建 bin 符号链接（npm 可能跳过，故不依赖它）。
//   4) 于本文件夹构建（tsc -> build/）
//   5) 幂等重注入本地化（apply_localize.cjs）
//   6) 生成 mcp-local-config.json 并幂等合并进 ~/.workbuddy/mcp.json（含 no-update-check env）
// 跨机可用：所有路径按脚本位置相对解析。拷贝即走——把本文件夹（无需 node_modules/build）复制到任意位置，
// 运行 node localization/deploy.cjs 即自动装依赖、建符号链接、构建并生成配置。

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { mergeIntoMcpJson } = require('./merge_mcp_json.cjs'); // F2 修复：抽出为独立可测模块（深度合并嵌套 env）

const REPO = path.resolve(__dirname, '..');
const PKG_NAME = 'chrome-devtools-mcp';
const UPSTREAM = path.join(REPO, 'upstream'); // 方案 A：构建目录隔离在 upstream/ 子技能
require('./compat.cjs')(); // 确保 upstream/package.json 固定 zod 兼容版本，避免 npm install 浮动装 v4 导致编译失败

// 跨平台全局安装/构建环境：恒跳过浏览器内核下载
function globalEnv() {
  return Object.assign({}, process.env, { PUPPETEER_SKIP_DOWNLOAD: '1' });
}
function sh(c, cwd, env) {
  console.log('$ ' + c + (cwd ? '  (cwd=' + cwd + ')' : ''));
  try {
    execSync(c, { cwd: cwd || REPO, stdio: 'inherit', env: env || process.env });
  } catch (e) {
    console.error('命令失败: ' + c);
    process.exit(1);
  }
}
function npmGlobalRoot() {
  return execSync('npm root -g', { encoding: 'utf8' }).trim();
}
function globalBinPath() {
  return path.join(npmGlobalRoot(), PKG_NAME, 'build', 'src', 'bin', 'chrome-devtools-mcp.js');
}
function isWin() { return process.platform === 'win32'; }
function isSymlink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch (_) { return false; } }

// 防御性全局 bin 链接：
// npm 对“本地文件夹全局安装（符号链接）”模式会静默跳过 bin 链接创建，且部分环境下 <prefix>/bin 目录本就不存在。
// 此处显式确保 bin 目录存在，并创建 chrome-devtools-mcp / chrome-devtools 的 bin 符号链接（Windows 额外生成 .cmd 包装），
// 使命令在任意机器均可用，不依赖 npm 是否建 bin（根治“全局 bin 符号链接缺失”跨机复发）。
function ensureGlobalBinLinks() {
  let root;
  try { root = npmGlobalRoot(); } catch (e) { console.log('[bin] 无法探测全局目录（npm root -g 失败），跳过 bin 链接创建: ' + e.message); return; }
  const prefix = path.dirname(root);
  const binDir = path.join(prefix, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true }); // 用户授权：bin 目录不存在时允许创建
    console.log('[bin] 已创建全局 bin 目录: ' + binDir);
  }
  const pkgLink = path.join(root, PKG_NAME); // <prefix>/node_modules/chrome-devtools-mcp（npm install -g 建的符号链接）
  const bins = [
    { name: 'chrome-devtools-mcp', target: path.join(pkgLink, 'build', 'src', 'bin', 'chrome-devtools-mcp.js') },
    { name: 'chrome-devtools',      target: path.join(pkgLink, 'build', 'src', 'bin', 'chrome-devtools.js') },
  ];
  for (const b of bins) {
    if (!fs.existsSync(b.target)) { console.log('[bin] 跳过 ' + b.name + '：目标文件尚不存在 ' + b.target); continue; }
    const linkPath = path.join(binDir, b.name);
    if (isWin()) {
      // Windows: 生成 .cmd 包装（无需提权，cmd/PowerShell 可直接调用），并尽力建符号链接
      const cmdPath = linkPath + '.cmd';
      const content = '@echo off\r\n"' + process.execPath + '" "' + b.target + '" %*\r\n';
      fs.writeFileSync(cmdPath, content, 'utf8');
      console.log('[bin] 已创建 ' + cmdPath);
      try { if (fs.existsSync(linkPath) || isSymlink(linkPath)) fs.rmSync(linkPath, { force: true }); fs.symlinkSync(path.relative(binDir, b.target), linkPath, 'file'); console.log('[bin] 已创建符号链接: ' + linkPath); }
      catch (_) { /* 无符号链接权限则忽略，.cmd 已兜底 */ }
    } else {
      try { if (fs.existsSync(linkPath) || isSymlink(linkPath)) fs.rmSync(linkPath, { force: true }); fs.symlinkSync(path.relative(binDir, b.target), linkPath, 'file'); console.log('[bin] 已创建符号链接: ' + linkPath); }
      catch (e) { console.log('[bin] 符号链接创建失败: ' + e.message); }
    }
  }
}

// 幂等将 chrome-devtools 合并进 WorkBuddy 的 ~/.workbuddy/mcp.json（仅覆盖本服务器条目，保留其它条目）。
// 实现见 localization/merge_mcp_json.cjs（F2 修复：深度合并嵌套 env，保留用户既有环境变量）。
// 根治“手工漏配导致 mcp.json 缺 CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS env”的跨机复发。

console.log('=== 1) 核查本地浏览器 ===');
sh('node "' + path.join(__dirname, 'verify_browser.cjs') + '"'); // F2: 经 sh() 统一捕获子进程非零退出，避免未处理异常崩溃

console.log('=== 2) 本地安装全部依赖（PUPPETEER_SKIP_DOWNLOAD=1） ===');
console.log('[依赖] 安装依赖（装齐 devDependencies，含 puppeteer-core 等运行时）...');
console.log('[依赖] 安装脚本批准由 .npmrc 的 allow-scripts[] 在安装时即生效（无需额外步骤）。');
sh('npm install', UPSTREAM, globalEnv());

console.log('=== 2.4) 剥离 @paulirish/trace_engine 冲突全局声明（TS2717 上游 workaround，须于 tsc 前执行） ===');
sh('node "' + path.join(__dirname, 'fix_trace_engine_dts.cjs') + '"');

console.log('=== 2.5) vendoring devtools-frontend（按 UPSTREAM_REF 钉版本；构建前必需，且已被 .gitignore 排除不随仓库分发） ===');
sh('node "' + path.join(__dirname, 'vendor_frontend.cjs') + '"');

console.log('=== 3) 构建（tsc -> build/，必须在全局符号链接之前，否则 bin 目标不存在导致 npm 跳过 bin 符号链接） ===');
console.log('[构建] 重新构建（强制，避免运行陈旧产物）...');
sh('npm run build', UPSTREAM, globalEnv());

console.log('=== 4) 全局符号链接 $(npm root -g)/chrome-devtools-mcp -> 本文件夹，并确保 bin 命令可用 ===');
if (fs.existsSync(globalBinPath())) {
  console.log('[全局] 已存在: ' + globalBinPath() + ' — 跳过（如需重装可先 npm uninstall -g ' + PKG_NAME + '）。');
} else {
  console.log('[全局] 创建全局符号链接...');
  try {
    sh('npm install -g ./upstream', REPO, globalEnv());
  } catch (e) {
    console.log('[全局] 首次失败，尝试卸载后重装...');
    try { sh('npm uninstall -g ' + PKG_NAME, REPO, globalEnv()); } catch (_) {}
    sh('npm install -g ./upstream', REPO, globalEnv());
  }
}
ensureGlobalBinLinks(); // 防御：npm 可能跳过 bin 链接或 <prefix>/bin 不存在，显式确保 bin 命令可用

console.log('=== 5) 重新注入本地化 ===');
sh('node "' + path.join(__dirname, 'apply_localize.cjs') + '"'); // F9: 与步骤 1 同样经 sh() 捕获，避免未处理异常崩溃

console.log('=== 6) 生成 MCP 配置并输出指引 ===');
const cfgFile = path.join(REPO, 'local-config.json');
const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
const port = cfg.debugPort || 9222;
const mcp = {
  mcpServers: {
    'chrome-devtools': {
      command: 'node',
      args: [globalBinPath(), '--browserUrl=http://127.0.0.1:' + port, '--no-usage-statistics'],
      // 关闭每次调用背后的 npm registry 版本检查（避免无谓出站网络请求）；telemetry 已由 --no-usage-statistics 关闭。
      env: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' }
    }
  }
};
fs.writeFileSync(path.join(REPO, 'mcp-local-config.json'), JSON.stringify(mcp, null, 2), 'utf8');
console.log('已生成 mcp-local-config.json（全局 bin: ' + globalBinPath() + '）');
mergeIntoMcpJson(mcp); // 幂等合并进 ~/.workbuddy/mcp.json（根治人工漏配 env）
console.log('\n=== 部署指引 ===');
console.log('1) 已自动合并 chrome-devtools 到 ~/.workbuddy/mcp.json（如需手工核对，参照 mcp-local-config.json）。');
console.log('2) 在 WorkBuddy 连接器管理页"信任" chrome-devtools 服务器。');
console.log('3) 启动浏览器: node "' + path.join(__dirname, 'start.cjs') + '"');
console.log('4) 任一 Agent 阅读 README.md 的"上游跟进与本地化更新"即可自行跟进上游并保持本地化特性。');
