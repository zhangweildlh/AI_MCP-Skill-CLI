// localization/install_global.cjs
// 方案一：真实全局安装（非软链接）。
//
// 背景（根因）：chrome-devtools-mcp 的运行时依赖（core-js / yargs / semver / debug /
// @modelcontextprotocol/sdk / zod / ajv / puppeteer-core / @puppeteer/browsers 等）全部声明在
// devDependencies；其发布包按 package.json 的 "files" 字段仅含 build/src + LICENSE + skills，
// 既不含 node_modules（npm pack 本就不打包依赖），也不含 build/devtools-frontend（运行服务器必需，由 vendoring 生成、
// 且被 .gitignore 排除，故不在 files 内）。因此 `npm install -g <pkg>` 或 `npm install -g .tgz`
// 仅解包源码，会缺运行时依赖与 devtools-frontend，服务器启动即报 ERR_MODULE_NOT_FOUND。
//
// 本模块固化「真实安装」完整闭环（复现 `npm install -g <pkg>` 生命周期，但落到真实目录而非软链接）：
//   1) npm pack 上游            -> chrome-devtools-mcp-<ver>.tgz（仅源码/构建产物，可复现发布包）
//   2) npm install -g ./.tgz    -> 真实解包到 $(npm root -g)/chrome-devtools-mcp（非软链接）
//   3) 在全局包目录补装 devDependencies（--ignore-scripts 跳过浏览器内核下载与构建脚本；PUPPETEER_SKIP_DOWNLOAD=1）
//   4) 复制 vendored devtools-frontend -> 全局包 build/devtools-frontend
//
// 可移植性：node_global 一律经 `npm root -g` 实时读取（区分系统变量与用户变量、随 Node 安装位置而定），
// 绝不写死任何绝对路径（如 D:\Tools\Assembly\...），陌生机器照此流程即可复现。
// 所有路径按本脚本位置相对解析，跨机可用。

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const PKG_NAME = 'chrome-devtools-mcp';
const UPSTREAM = path.join(REPO, 'upstream'); // 方案 A：纯上游快照隔离在 upstream/ 子目录

// 跨平台全局环境：恒跳过浏览器内核下载（本机已有 360Chromex，无需 puppeteer 下载 Chromium）
function globalEnv() {
  return Object.assign({}, process.env, { PUPPETEER_SKIP_DOWNLOAD: '1' });
}

// 实时读取全局 node_modules 根（如 D:/Tools/Assembly/nodejs/node_global/node_modules），绝不写死绝对路径
function npmGlobalRoot() {
  return execSync('npm root -g', { encoding: 'utf8' }).trim();
}
// 真实全局包目录：<npm root -g>/chrome-devtools-mcp
function globalPkgPath() {
  return path.join(npmGlobalRoot(), PKG_NAME);
}

// 统一执行封装：默认继承 stdout/stderr（可见进度）；process.exit(1) 在失败时硬停止
function sh(c, cwd, env) {
  console.log('$ ' + c + (cwd ? '  (cwd=' + cwd + ')' : ''));
  try {
    execSync(c, { cwd: cwd || REPO, stdio: 'inherit', env: env || process.env });
  } catch (e) {
    console.error('命令失败: ' + c);
    process.exit(1);
  }
}

// 方案一真实全局安装：返回全局包目录绝对路径（供调用方继续配置 bin / mcp）
function realGlobalInstall() {
  const upstreamPkg = path.join(UPSTREAM, 'package.json');
  if (!fs.existsSync(upstreamPkg)) {
    console.error('[方案一] 未找到 upstream/package.json，无法打包安装。请先运行 `node localization/upstream.cjs` 刷新上游快照（或 bootstrap 引导）。');
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(upstreamPkg, 'utf8'));
  const tgz = pkg.name + '-' + pkg.version + '.tgz'; // 如 chrome-devtools-mcp-1.7.0.tgz
  const tgzPath = path.join(UPSTREAM, tgz);

  // 1) 打包（仅含 package.json "files" 声明的内容：build/src + LICENSE + skills；不含 node_modules / build/devtools-frontend）
  console.log('=== [方案一] 1) npm pack 上游（生成 ' + tgz + '） ===');
  sh('npm pack', UPSTREAM, globalEnv());

  // 2) 真实全局安装（解包到 $(npm root -g)/chrome-devtools-mcp，非软链接）
  console.log('=== [方案一] 2) npm install -g ./' + tgz + '（真实安装，非软链接） ===');
  try {
    sh('npm install -g "./' + tgz + '"', UPSTREAM, globalEnv());
  } catch (e) {
    console.log('[方案一] 首次安装失败，尝试卸载后重装...');
    try { sh('npm uninstall -g ' + PKG_NAME, REPO, globalEnv()); } catch (_) { /* 卸载失败忽略，继续重装 */ }
    sh('npm install -g "./' + tgz + '"', UPSTREAM, globalEnv());
  }

  const gPkg = globalPkgPath();

  // 3) 补装运行时依赖：上游运行时依赖全在 devDependencies，npm install -g 不安装；
  //    在全局包目录执行 npm install（含全部 devDependencies，纯 JS），--ignore-scripts 跳过浏览器内核下载与构建脚本，
  //    既保证服务器运行所需依赖齐全，又不触发 puppeteer 下载 Chromium、不重跑构建脚本（PUPPETEER_SKIP_DOWNLOAD=1 双保险）。
  console.log('=== [方案一] 3) 补装运行时依赖（devDependencies，--ignore-scripts） ===');
  sh('npm install --ignore-scripts', gPkg, globalEnv());

  // 4) 复制 vendored devtools-frontend（npm pack 的 files 字段不含 build/devtools-frontend，运行服务器必需）
  const srcFE = path.join(UPSTREAM, 'build', 'devtools-frontend');
  const dstFE = path.join(gPkg, 'build', 'devtools-frontend');
  if (fs.existsSync(srcFE)) {
    console.log('=== [方案一] 4) 复制 devtools-frontend -> ' + dstFE + ' ===');
    fs.rmSync(dstFE, { recursive: true, force: true });
    fs.cpSync(srcFE, dstFE, { recursive: true });
  } else {
    console.warn('[方案一] 警告：' + srcFE + ' 不存在，跳过 devtools-frontend 复制（vendoring 可能未执行，服务器运行将缺模块）。请确认 deploy.cjs 步骤 2.5 已 vendoring。');
  }

  // 清理打包产物（仅上游快照内的临时 .tgz，可被重新 npm pack 生成，不污染部署副本）
  try { fs.rmSync(tgzPath, { force: true }); } catch (_) { /* 忽略 */ }

  console.log('[方案一] 真实全局安装完成: ' + gPkg);
  return gPkg;
}

module.exports = { realGlobalInstall, npmGlobalRoot, globalPkgPath, globalEnv };
