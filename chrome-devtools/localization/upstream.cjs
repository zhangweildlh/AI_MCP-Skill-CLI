// localization/upstream.cjs
// 方案 A 上游跟进脚本：将 ChromeDevTools/chrome-devtools-mcp 最新源码同步到 upstream/ 子技能（纯上游快照），
// 保全根父技能本地化资产，定向合并本地化约束（.npmrc / puppeteer.config.js / package.json），最后重注入本地化并重新部署。
// 支持 --dry-run 预检（不联网、不安装）；读取 localization/UPSTREAM_REF 作为钉版本锚点（文档/未来扩展）。
// 所有路径按脚本位置相对解析，跨机可用。

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const UPSTREAM = path.join(REPO, 'upstream');
const PKG_NAME = 'chrome-devtools-mcp';
const UPSTREAM_REPO = 'ChromeDevTools/chrome-devtools-mcp';
const UPSTREAM_PKG = path.join(UPSTREAM, 'package.json');
const DRY = process.argv.includes('--dry-run');

// 受保护排除集：全树拷贝（cloneDir -> upstream/）时永不覆盖/删除的项。
// 主要针对 upstream/ 内不应被上游覆盖的本地资产/生成物：
//   devtools-frontend（vendored 构建产物，非 submodule，保留本地产物）
//   node_modules / build（运行时生成，避免破坏已装依赖与构建产物）
const PROTECTED = new Set([
  'devtools-frontend',
  'node_modules',
  'build',
  '.gitmodules', // 上游用 submodule 承载 devtools-frontend；本方案改用 vendored 产物，故不引入 .gitmodules
]);

function sh(c, cwd) {
  console.log('$ ' + c);
  execSync(c, { cwd: cwd || REPO, stdio: 'inherit' });
}
function shOut(c, cwd) {
  return execSync(c, { cwd: cwd || REPO, encoding: 'utf8' }).trim();
}
function globalEnv() {
  return Object.assign({}, process.env, { PUPPETEER_SKIP_DOWNLOAD: '1' });
}

// 读取 UPSTREAM_REF 锚点（文档/未来钉具体 commit 使用）
function readUpstreamRef() {
  const p = path.join(__dirname, 'UPSTREAM_REF');
  if (!fs.existsSync(p)) return null;
  const m = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const mm = line.match(/^([A-Z_]+)=(.*)$/);
    if (mm) m[mm[1]] = mm[2].trim();
  }
  return m;
}

// 全树拷贝（受保护排除集）：从 src 拷贝到 dst，排除 node_modules/build/受保护项。
// 当某目录命中受保护项时，其整个子树都不拷贝（保留 dst 侧已有内容）。
function copyTree(src, dst, protectedSet) {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (p) => {
      const base = path.basename(p);
      // 排除 node_modules / build（任意层级）与 .git：cloneDir 含 .git，整树拷贝会将其拷入 upstream/.git，
      // 形成嵌套 git 仓库污染父仓（git status 异常、可能误判 gitlink）。pruneStale 已同样排除 .git。
      if (base === 'node_modules' || base === 'build' || base === '.git') return false;
      const rel = path.relative(dst, p);
      if (protectedSet && protectedSet.has(rel)) return false;
      return true;
    },
  });
}

// 差量剪除：清理"上游已删除、本地仍残留"的陈旧文件（仅对纯上游代码目录 src/scripts/skills）。
// devtools-frontend / node_modules / build 永不剪除。
function pruneStale(src, dst) {
  if (!fs.existsSync(dst)) return;
  const exclude = new Set(['node_modules', 'build', '.git', 'local-config.json', 'mcp-local-config.json', 'devtools-frontend']);
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (exclude.has(e.name)) continue;
      const rel = path.relative(dst, p);
      const sp = path.join(src, rel);
      if (e.isDirectory()) {
        walk(p);
        try { if (fs.readdirSync(p).length === 0) fs.rmdirSync(p); } catch { /* noop */ }
      } else if (!fs.existsSync(sp)) {
        try { fs.unlinkSync(p); console.log('[剪除] 上游已删除: ' + rel); }
        catch (err) { console.warn('[警告] 无法删除: ' + rel + ' (' + err.message + ')'); }
      }
    }
  }
  walk(dst);
}

if (!fs.existsSync(UPSTREAM_PKG)) {
  console.error('[错误] 未找到 upstream/package.json，请先完成脚手架迁移（G1a）。');
  process.exit(1);
}

// 1) 检测上游最新版本（优先 npm view，其次 gh release）
let latest;
try {
  latest = shOut('npm view chrome-devtools-mcp version');
} catch (e) {
  try {
    latest = shOut('gh release list -R ' + UPSTREAM_REPO + ' --limit 1 --json tagName -q ".[0].tagName"').replace(/^v/, '');
  } catch (e2) {
    console.error('[错误] 无法获取上游版本（需联网或 gh 认证）。');
    process.exit(1);
  }
}
const localVer = JSON.parse(fs.readFileSync(UPSTREAM_PKG, 'utf8')).version;
console.log('本地 upstream 版本: ' + localVer + ' / 上游最新: ' + latest);

if (DRY) {
  console.log('[DRY-RUN] 将执行：clone 上游(main) -> strip 本地化 -> 全树拷贝到 upstream/(受保护排除) -> pruneStale(src/scripts/skills) -> 定向合并(compat) -> 重注入 -> deploy');
  console.log('[DRY-RUN] 受保护排除集: ' + [...PROTECTED].join(', '));
  console.log('[DRY-RUN] devtools-frontend 为 vendored 构建产物，upgrade 时保留本地产物（不参与上游镜像）。');
  process.exit(0);
}

if (localVer === latest) {
  console.log('[OK] 已是最新（' + localVer + '），仍重新注入本地化并合并约束（幂等），确保不漂移。');
}

// 2) clone 上游到临时目录（不带子模块；devtools-frontend 由 vendored 产物承载）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-upstream-'));
try {
  const cloneDir = path.join(tmp, 'repo');
  let cloned = false;
  try {
    sh('git clone --depth 1 https://github.com/' + UPSTREAM_REPO + '.git "' + cloneDir + '"', tmp);
    cloned = true;
  } catch (e) {
    try {
      sh('gh repo clone ' + UPSTREAM_REPO + ' "' + cloneDir + '" -- --depth 1', tmp);
      cloned = true;
    } catch (e2) {
      console.error('[错误] 无法 clone 上游源码（需联网且 git/gh 可用）。可手动按 README 操作。');
      process.exit(1);
    }
  }
  if (!cloned) process.exit(1);

  // 3) 剥离旧本地化段（还原纯上游基线）
  console.log('=== 剥离旧本地化段 ===');
  sh('node "' + path.join(__dirname, 'apply_localize.cjs') + '" --strip');

  // 4) 全树拷贝（受保护排除集）：cloneDir -> upstream/
  console.log('=== 全树拷贝上游到 upstream/（受保护排除集）===');
  copyTree(cloneDir, UPSTREAM, PROTECTED);

  // 5) 差量剪除过时文件（src/scripts/skills）
  console.log('=== 差量剪除陈旧文件 ===');
  for (const d of ['src', 'scripts', 'skills']) {
    pruneStale(path.join(cloneDir, d), path.join(UPSTREAM, d));
  }

  // 6) 定向合并本地化约束（.npmrc / puppeteer.config.js / package.json）
  console.log('=== 定向合并本地化约束 ===');
  require('./compat.cjs')();

  // 7) 重新注入本地化（含 description 中文化，幂等）
  console.log('=== 重新注入本地化 ===');
  sh('node "' + path.join(__dirname, 'apply_localize.cjs') + '"');

  // 8) 重新部署（compat + install + build + 全局安装 + mcp 配置）
  console.log('=== 重新部署 ===');
  sh('node "' + path.join(__dirname, 'deploy.cjs') + '"');

  console.log('\n[完成] 已同步上游至 ' + latest + ' 并保全本地化约束（--browserUrl 复用登录态 / --executablePath / PUPPETEER_SKIP_DOWNLOAD=1）。');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('[已清理] 临时下载目录');
}
