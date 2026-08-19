// localization/vendor_frontend.cjs
// 构建前 vendoring：按 localization/UPSTREAM_REF 钉版本，将 ChromeDevTools/devtools-frontend
// 的整棵仓库（含 front_end/、mcp/ 等顶层目录）下载 tarball 填充到 upstream/devtools-frontend/。
// 与上游 v1.7.0 tsconfig.json 的构建引用一致（tsconfig 的 include/files 引用 devtools-frontend/front_end/...），
// 且其源码 src/third_party/index.ts 相对导入 devtools-frontend/mcp/mcp.js（提供 LanguageExtensionPlugin 等类型），
// 故必须 vendoring 整棵仓库，仅取 front_end/ 子树会导致构建报 "Cannot find module '../../devtools-frontend/mcp/mcp.js'"。
// 上游以 git submodule 引入，本方案改用 vendored 副本承载，避免 GB 级 .git 入库；该目录已被 chrome-devtools/.gitignore
// 排除，不随仓库分发。
// 幂等：目标目录已存在且非空则跳过（不重复下载）；支持 --dry-run 预检（不联网）。
// 所有路径按脚本位置相对解析，跨机可用。

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto'); // F4 修复：用于 tarball SHA256 完整性校验（钉版本哈希）

const REPO = path.resolve(__dirname, '..');
const UPSTREAM = path.join(REPO, 'upstream');
const TARGET = path.join(UPSTREAM, 'devtools-frontend');
const DRY = process.argv.includes('--dry-run');

function sh(c, cwd) {
  console.log('$ ' + c);
  execSync(c, { cwd: cwd || REPO, stdio: 'inherit' });
}
function shOut(c, cwd) {
  return execSync(c, { cwd: cwd || REPO, encoding: 'utf8' }).trim();
}
// F4 修复：计算文件 SHA256（用于 tarball 完整性校验，依赖 Node 内置 crypto，无外部依赖）。
function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

// 读取 UPSTREAM_REF 钉版本锚点
function readUpstreamRef() {
  const p = path.join(__dirname, 'UPSTREAM_REF');
  if (!fs.existsSync(p)) { console.error('[错误] 未找到 localization/UPSTREAM_REF'); process.exit(1); }
  const m = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const mm = line.match(/^([A-Z_]+)=(.*)$/);
    if (mm) m[mm[1]] = mm[2].trim();
  }
  return m;
}

// 复制整棵 devtools-frontend 仓库到目标，排除 .git / node_modules / build（避免嵌套 git 与冗余）
function copyFrontend(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (p) => {
      const base = path.basename(p);
      if (base === '.git' || base === 'node_modules' || base === 'build') return false;
      return true;
    },
  });
}

const ref = readUpstreamRef();
const repo = ref.DEVTOOLS_FRONTEND_REPO;
const branch = ref.DEVTOOLS_FRONTEND_BRANCH || 'main';
const commit = ref.DEVTOOLS_FRONTEND_COMMIT;
if (!repo || !commit) { console.error('[错误] UPSTREAM_REF 缺少 DEVTOOLS_FRONTEND_REPO / DEVTOOLS_FRONTEND_COMMIT'); process.exit(1); }

console.log('devtools-frontend 钉版本：repo=' + repo + ' branch=' + branch + ' commit=' + commit);

if (DRY) {
  console.log('[DRY-RUN] 将执行：下载钉版本 commit tarball ' + repo.replace(/\.git$/, '') + '/archive/' + commit + '.tar.gz -> 解包 -> 取整棵仓库（含 front_end/、mcp/ 等）拷贝到 ' + TARGET + '（排除 .git/node_modules/build）');
  process.exit(0);
}

// 幂等：目标已存在且非空则跳过
if (fs.existsSync(TARGET) && fs.readdirSync(TARGET).length > 0) {
  console.log('[vendor] upstream/devtools-frontend 已存在且非空，跳过（如需强制刷新请先删除该目录）。');
  process.exit(0);
}

fs.mkdirSync(TARGET, { recursive: true });
// B3 修复（2026-08-18）：弱网大体积 tarball 的健壮下载。
//   原实现将 dtf.tar.gz 落在 tmp 且 finally 清理 tmp，导致「下载失败即丢弃、重试从零」，且 --max-time 900
//   在弱网下仅够下约 40MB 便超时(28)。本次改进：
//   (1) 落盘位置改为 UPSTREAM/devtools-frontend.tar.gz（持久化，不因 tmp 清理而丢失），支撑跨调用断点续传；
//   (2) --max-time 提高到 1800，给弱网单段更充裕时长；
//   (3) 保留 -C - 续传与 --retry-all-errors，配合持久化文件形成「中断→重跑→续拉」闭环；
//   (4) catch 中清理半截 TARGET 与解包目录，保留 DTF_FILE（持久化 tarball）以支持重跑续传，避免幂等误判跳过。
const DTF_FILE = path.join(UPSTREAM, 'devtools-frontend.tar.gz');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtf-frontend-'));
try {
  const repoBase = repo.replace(/\.git$/, '');
  // 钉版本 commit tarball：整树快照（不含 .git），单流下载最可靠。
  // 重要：GitHub partial clone 不支持「路径级按需 fetch blob」——
  //   "git clone --filter=blob:none --no-checkout" + "checkout <commit> -- front_end"
  //   与 "sparse-checkout set front_end + checkout <commit>" 两种方式均会导致 front_end/ 整树为空
  //   （tsc 构建时缺 third_party/acorn/package/dist/acorn.mjs）。故改用 tarball 方案。
  // 注意：Git Bash 的 tar/curl 会把 Windows 绝对路径（含 D:）误判为远程主机，故统一用相对名 + cwd=UPSTREAM。
  const tarUrl = repoBase + '/archive/' + commit + '.tar.gz';
  console.log('[vendor] 下载钉版本 tarball: ' + tarUrl);
  console.log('[vendor] 落盘: ' + DTF_FILE + '（持久化，支持中断后续传）');
  // B1+B2+B3 修复：建连超时 30s；单段总时限 1800s（弱网更充裕）；--retry-all-errors 强制重试错误 18/28；
  // -C - 断点续传（从上次已落盘字节续拉），配合 DTF_FILE 持久化实现跨调用续传闭环。
  sh('curl -fsSL --connect-timeout 30 --max-time 1800 --retry 8 --retry-all-errors --retry-delay 3 -C - "' + tarUrl + '" -o devtools-frontend.tar.gz', UPSTREAM);
  // B1 修复：解包前校验 tarball 已落地且非空，避免空文件导致后续 tar 静默空转。
  const _st = fs.statSync(DTF_FILE);
  if (!_st.size) { console.error('[错误] devtools-frontend tarball 下载为空，已中止，未解包。'); process.exit(1); }
  // F4 修复：解包前校验 tarball SHA256（钉版本哈希，防御传输损坏 / 供应链篡改）。
  // 仅当 UPSTREAM_REF 配置 DEVTOOLS_FRONTEND_SHA256 时强制校验；未配置则告警跳过，保持跨机可用性
  // （GitHub archive 按 commit 生成的 tarball 内容可重现，建议 deliberate 跟版时钉定哈希）。
  const expected = ref.DEVTOOLS_FRONTEND_SHA256;
  const actual = sha256File(DTF_FILE);
  if (expected) {
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      console.error('[错误] tarball SHA256 不匹配（期望 ' + expected + '，实际 ' + actual + '）—— 传输损坏或供应链被篡改，已中止，未解包。');
      process.exit(1);
    }
    console.log('[vendor] tarball SHA256 校验通过');
  } else {
    console.log('[vendor] 未配置 DEVTOOLS_FRONTEND_SHA256，跳过完整性校验（建议 deliberate 跟版时钉定哈希以防御传输损坏/篡改）');
  }
  console.log('[vendor] 解包 tarball...');
  sh('tar -xzf devtools-frontend.tar.gz', UPSTREAM); // 解包到 UPSTREAM（生成 devtools-frontend-<commit>/）
  const baseName = path.basename(repoBase) + '-' + commit; // 如 devtools-frontend-b0a8253...
  const extractedRoot = path.join(UPSTREAM, baseName); // 解包后整棵 devtools-frontend 仓库（含 front_end/、mcp/ 等顶层目录）
  if (!fs.existsSync(extractedRoot)) { console.error('[错误] 解包产物中无 devtools-frontend/ 根目录（repo=' + repo + ' commit=' + commit + '，期望目录 ' + baseName + '）'); process.exit(1); }
  // 注意：上游 v1.7.0 既在 tsconfig 的 include/files 引用 devtools-frontend/front_end/...（顶层路径），
  // 其源码 src/third_party/index.ts 又相对导入 devtools-frontend/mcp/mcp.js（提供 LanguageExtensionPlugin 等类型）。
  // 故必须 vendoring 整棵仓库（front_end/ + mcp/ + 其他顶层目录），仅取 front_end/ 会导致构建报
  // "Cannot find module '../../devtools-frontend/mcp/mcp.js'" 并引发下游 implicitly any / unknown 级联错误。
  copyFrontend(extractedRoot, TARGET);
  console.log('[vendor] 已 vendoring devtools-frontend -> ' + TARGET + '（commit ' + commit + '，含 front_end/ 与 mcp/ 等顶层目录）');
  // 成功：清理解包临时目录与 tarball（省空间；下次如需刷新会重新下载）
  fs.rmSync(extractedRoot, { recursive: true, force: true });
  fs.rmSync(DTF_FILE, { force: true });
} catch (e) {
  console.error('[错误] devtools-frontend vendoring 失败：' + e.message);
  // B3 修复：清理半截 TARGET 与解包目录，保留 DTF_FILE（持久化 tarball）以支持重跑续传。
  try { fs.rmSync(TARGET, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(path.join(UPSTREAM, path.basename(repo.replace(/\.git$/, '')) + '-' + commit), { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('[已清理] 临时解包目录（tarball 持久保留于 ' + DTF_FILE + ' 以支持续传）');
}
