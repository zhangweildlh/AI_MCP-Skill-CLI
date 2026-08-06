// localization/upstream.cjs
// 纯网络上游跟踪与升级（不依赖本地 .git）。
// 检测 ChromeDevTools/chrome-devtools-mcp 最新版本；若有更新，下载并重新本地化 +
// 全局卸载/安装/构建（依赖一律位于 $(npm root -g)），保全本地化约束。
// 所有路径按脚本位置相对解析，跨机可用。

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const UPSTREAM = 'ChromeDevTools/chrome-devtools-mcp';
const PKG_NAME = 'chrome-devtools-mcp';
const PKG_PATH = path.join(REPO, 'package.json');

function sh(c, cwd) {
  console.log('$ ' + c);
  execSync(c, { cwd: cwd || REPO, stdio: 'inherit' });
}
function shOut(c, cwd) {
  return execSync(c, { cwd: cwd || REPO, encoding: 'utf8' }).trim();
}
// 跨平台全局安装环境：恒跳过浏览器内核下载
function globalEnv() {
  return Object.assign({}, process.env, { PUPPETEER_SKIP_DOWNLOAD: '1' });
}
function npmGlobalRoot() {
  return execSync('npm root -g', { encoding: 'utf8' }).trim();
}
function globalBinPath() {
  return path.join(npmGlobalRoot(), PKG_NAME, 'build', 'src', 'bin', 'chrome-devtools-mcp.js');
}
// 跨平台目录镜像（取代原 Windows 专有 robocopy），用于选择性同步上游源码。
// 非破坏性：复制 src -> dst，排除 node_modules/build，不删除目标多余文件；出错直接抛出（不再静默吞掉）。
function copyDir(src, dst) {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (p) => {
      const base = path.basename(p);
      // 排除运行时依赖与本地化生成的机器专属配置（local-config.json / mcp-local-config.json 由 deploy/apply_localize 运行时生成，勿随镜像传播）。
      return base !== 'node_modules' && base !== 'build'
        && base !== 'local-config.json' && base !== 'mcp-local-config.json';
    },
  });
}

// 差量剪除（F3）：copyDir 非破坏性，上游删除的文件会在本地 src/scripts 残留，可能随版本构建/加载死代码。
// 仅清理"上游已不存在"的文件；绝不动 localization/ 与本地化新增的 skills/（如 chrome-devtools-cli/），避免误删本地化资产。
// 同时排除 node_modules/build/.git/配置文件，空目录在剪除后一并清理。
function pruneStale(src, dst) {
  if (!fs.existsSync(dst)) return;
  const exclude = new Set(['node_modules', 'build', '.git', 'local-config.json', 'mcp-local-config.json']);
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (exclude.has(e.name)) continue; // 跳过受保护项，且不递归
      const rel = path.relative(dst, p);
      const sp = path.join(src, rel);
      if (e.isDirectory()) {
        walk(p);
        // 剪除后清理已空的目录（受保护项会使其非空而保留）
        try { if (fs.readdirSync(p).length === 0) fs.rmdirSync(p); } catch { /* noop */ }
      } else if (!fs.existsSync(sp)) {
        try { fs.unlinkSync(p); console.log('[剪除] 上游已删除的陈旧文件: ' + rel); }
        catch (err) { console.warn('[警告] 无法删除陈旧文件: ' + rel + ' (' + err.message + ')'); }
      }
    }
  }
  walk(dst);
}


if (!fs.existsSync(PKG_PATH)) {
  console.error('未在仓库内运行，预期仓库根: ' + REPO);
  process.exit(1);
}
const PKG = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const LOCAL_VER = PKG.version;
console.log('本地版本: ' + LOCAL_VER);

// 1) 检测上游最新版本（优先 npm view，其次 gh release list）
let latest;
try {
  latest = shOut('npm view chrome-devtools-mcp version');
} catch (e) {
  try {
    latest = shOut('gh release list -R ' + UPSTREAM + ' --limit 1 --json tagName -q ".[0].tagName"').replace(/^v/, '');
  } catch (e2) {
    console.error('[错误] 无法获取上游版本：需要联网，或安装 gh 并认证后重试。');
    process.exit(1);
  }
}
console.log('上游最新: ' + latest);

if (LOCAL_VER === latest) {
  console.log('[OK] 已是最新，无需升级。');
  process.exit(0);
}
console.log('[!] 检测到上游更新: ' + LOCAL_VER + ' -> ' + latest);

// 2) 从 GitHub 拉取最新源码到临时目录（npm 发布包仅含 build/ 与 README，不含 src/ 与 skills/，故必须用源码仓库同步）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-upstream-'));
try {
  const cloneDir = path.join(tmp, 'repo');
  let cloned = false;
  try {
    sh('git clone --depth 1 https://github.com/' + UPSTREAM + '.git "' + cloneDir + '"', tmp);
    cloned = true;
  } catch (e) {
    try {
      sh('gh repo clone ' + UPSTREAM + ' "' + cloneDir + '" -- --depth 1', tmp);
      cloned = true;
    } catch (e2) {
      console.error('[错误] 无法 clone 上游源码（需联网且 git/gh 可用）。可手动按 README 第 3 步操作。');
      process.exit(1);
    }
  }
  if (!cloned) process.exit(1);

  // 3) 剥离本地化段（还原纯上游原文基线）
  console.log('=== 剥离旧本地化段 ===');
  sh('node "' + path.join(__dirname, 'apply_localize.cjs') + '" --strip');

  // 4) 选择性覆盖源码（保留 localization/、mirror_to_target.cjs、node_modules、build、.git）
  console.log('=== 覆盖上游源码 ===');
  const dirs = ['src', 'skills', 'scripts'];
  for (const d of dirs) {
    const s = path.join(cloneDir, d);
    if (fs.existsSync(s)) {
      copyDir(s, path.join(REPO, d));
      console.log('[覆盖] ' + d + '/');
      // 差量剪除（F3）：仅对纯上游代码目录 src/scripts 清理上游已删除的陈旧文件；
      // skills/ 不动，以免误删本地化新增的 chrome-devtools-cli/ 等资产。
      if (d !== 'skills') pruneStale(s, path.join(REPO, d));
    }
    else { console.log('[跳过] 上游无目录: ' + d); }
  }
  const files = ['README.md', 'package.json', 'server.json', 'puppeteer.config.cjs', 'tsconfig.json', '.npmrc', '.nvmrc', '.gitignore'];
  for (const f of files) {
    const s = path.join(cloneDir, f);
    if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(REPO, f)); console.log('[覆盖] ' + f); }
    else { console.log('[跳过] 上游无文件: ' + f); }
  }

  // 5) 重新注入本地化（含 description 中文化，幂等）
  console.log('=== 重新注入本地化 ===');
  sh('node "' + path.join(__dirname, 'apply_localize.cjs') + '"');

  // 6) 覆盖上游 package.json 后重新固定 zod（避免浮动装 v4 致 build 失败），再全局升级
  console.log('=== 安装依赖/全局符号链接/构建 ===');
  require('./compat.cjs')();
  const gRoot = npmGlobalRoot();
  const pkgGlobal = path.join(gRoot, PKG_NAME);
  // 覆盖上游 package.json 后必须刷新依赖与构建（去除存在性守卫）：
  // 上游可能增删依赖或改动 src，若按 node_modules/build 存在性跳过，全局符号链接会运行陈旧代码/缺模块。
  console.log('[依赖] 强制 npm install 装齐依赖（覆盖 package.json 后必须刷新）...');
  sh('npm install', REPO, globalEnv());
  // 先卸载旧的全局符号链接，确保全新覆盖（避免陈旧文件残留）
  try { sh('npm uninstall -g ' + PKG_NAME, REPO, globalEnv()); } catch (e) { /* 可能未安装，忽略 */ }
  sh('npm install -g .', REPO, globalEnv());
  // 全局构建（src 已被上游覆盖，必须重新构建以避免运行陈旧产物）
  console.log('[构建] 重新构建（src 已更新，强制构建）...');
  sh('npm run build', REPO, globalEnv());

  // 7) 重新部署（生成指向全局 bin 的 mcp 配置 + 接入指引）
  console.log('=== 重新部署 ===');
  sh('node "' + path.join(__dirname, 'deploy.cjs') + '"');

  console.log('\n[完成] 上游已升级至 ' + latest + ' 并重新本地化，本地化约束（--browserUrl 复用登录态 / --executablePath / PUPPETEER_SKIP_DOWNLOAD=1）已保全。');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('[已清理] 临时下载目录');
}
