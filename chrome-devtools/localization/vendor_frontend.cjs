// localization/vendor_frontend.cjs
// 构建前 vendoring：按 localization/UPSTREAM_REF 钉版本，将 ChromeDevTools/devtools-frontend
// 的 front_end 树克隆填充到 upstream/devtools-frontend/（上游以 git submodule 引入，本方案改
// 用 vendored 副本承载，避免 GB 级 .git 入库；该目录已被 chrome-devtools/.gitignore 排除，不随仓库分发）。
// 幂等：目标目录已存在且非空则跳过（不重复克隆）；支持 --dry-run 预检（不联网）。
// 所有路径按脚本位置相对解析，跨机可用。

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

// 复制 front_end 树到目标，排除 .git / node_modules / build（避免嵌套 git 与冗余）
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
  console.log('[DRY-RUN] 将执行：sparse-clone ' + repo + ' (blobless, 仅 front_end) -> 检出 ' + commit + ' -> 拷贝到 ' + TARGET + '（排除 .git）');
  process.exit(0);
}

// 幂等：目标已存在且非空则跳过
if (fs.existsSync(TARGET) && fs.readdirSync(TARGET).length > 0) {
  console.log('[vendor] upstream/devtools-frontend 已存在且非空，跳过（如需强制刷新请先删除该目录）。');
  process.exit(0);
}

fs.mkdirSync(TARGET, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtf-frontend-'));
try {
  const cloneDir = path.join(tmp, 'repo');
  // blobless + sparse：仅拉取 front_end 目录的树与 blob，避免全量克隆 GB 级历史
  sh('git clone --filter=blob:none --sparse "' + repo + '" "' + cloneDir + '"', tmp);
  sh('git -C "' + cloneDir + '" sparse-checkout set front_end', tmp);
  sh('git -C "' + cloneDir + '" checkout ' + commit, tmp);
  const srcFront = path.join(cloneDir, 'front_end');
  if (!fs.existsSync(srcFront)) { console.error('[错误] 克隆产物中无 front_end/（repo=' + repo + ' commit=' + commit + '）'); process.exit(1); }
  copyFrontend(srcFront, TARGET);
  console.log('[vendor] 已 vendoring devtools-frontend -> ' + TARGET + '（commit ' + commit + '）');
} catch (e) {
  console.error('[错误] devtools-frontend vendoring 失败：' + e.message);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('[已清理] 临时克隆目录');
}
