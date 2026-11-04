// localization/start_helpers.cjs
// start.cjs 的可独立测试辅助函数（无 require 期副作用）。
// 从 start.cjs 抽出，便于单元测试 profileLocked / probePort（F3）。
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync } = require('child_process');

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

// 检测 user-data-dir 是否已被某个浏览器实例占用（Chrome 在 profile 目录写入 SingletonLock / SingletonCookie）。
// 该锁与调试端口无关：即使 9223 无响应，只要锁存在就说明有实例占用同一 profile。
function profileLocked(userDataDir) {
  try {
    return fs.existsSync(path.join(userDataDir, 'SingletonLock')) ||
           fs.existsSync(path.join(userDataDir, 'SingletonCookie'));
  } catch {
    return false;
  }
}

// F10：检测指定浏览器进程是否在运行（跨平台）。
// Windows: 通过 tasklist 过滤 exe 名；macOS/Linux: 通过 pgrep。
// 返回 { running: boolean, pid: number|null }。
function isBrowserRunning(browserPath) {
  const exeName = path.basename(browserPath).toLowerCase();
  if (!exeName) return { running: false, pid: null };
  try {
    if (process.platform === 'win32') {
      // tasklist /FI 支持 Unicode；过滤 IMAGENAME 精确匹配（忽略大小写）
      // 输出格式：CSV，每行 "名称","PID","会话","会话#","内存","状态"
      const out = execSync(
        'tasklist /NH /FO CSV /FI "IMAGENAME eq ' + exeName.replace(/"/g, '""') + '"',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const lines = out.trim().split(/\r?\n/).filter(l => l.trim() && !l.includes('"进程名"'));
      for (const line of lines) {
        const fields = line.split(',').map(f => f.replace(/"/g, '').trim());
        if (fields[0] && fields[1]) {
          return { running: true, pid: parseInt(fields[1], 10) || null };
        }
      }
    } else {
      // macOS / Linux: pgrep -x 精确匹配（去掉 .exe 后缀）
      const name = exeName.replace(/\.exe$/i, '');
      const out = execSync('pgrep -x ' + name, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
      });
      const pid = parseInt(out.trim().split(/\s+/)[0], 10);
      return { running: !isNaN(pid) && pid > 0, pid: isNaN(pid) ? null : pid };
    }
  } catch {
    // 进程不存在或命令失败，视为未运行
  }
  return { running: false, pid: null };
}

// R4：取某端口 DevTools 端点的 User-Agent，用于判定端口占用者是否为目标 360 浏览器
function browserUA(p) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: p, path: '/json/version', timeout: 1000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)['User-Agent'] || ''); } catch (e) { resolve(''); } });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

// R4（修正）：端口上是否为「可被本技能安全驱动的真实调试浏览器」。
// 判定：CDP /json/version 必须返回非空 UA，且 UA 不得包含 WorkBuddy / Electron，
// 以避免误连 WorkBuddy 自身 Electron（9222，不支持 CDP 新建标签页）。
// 覆盖 Chrome / 360Chromex / Edge / Brave 等跨机、跨平台调试浏览器（UA 命中的真实内核），
// 不再依赖 360/qihu 字面量（定制 Chromium 构建的 DevTools UA 常为通用 Chrome UA，未必带 360 字样）。
async function isTargetBrowserOnPort(p) {
  const ua = await browserUA(p);
  if (!ua) return false; // 无 UA 视为非真实浏览器端点
  return !/workbuddy|electron/i.test(ua);
}

// 问题1修复：Chromium profile 单实例锁文件名（拷贝 User Data 时必须排除，否则新实例会因孤儿锁判定 profile 被占用）
// 注：仅当使用「真实 profile 直连」(--no-temp-profile) 才需关心锁冲突；临时 profile 拷贝已排除锁，天然隔离。
const PROFILE_LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];

// 关键登录态文件（相对 User Data 根）：这些被跳过即意味着登录态未完整继承，必须显式告知用户。
// Default/Network/Cookies 为站点 Cookie 主库（运行中的浏览器会独占锁定 → 必被跳过）；
// Login Data / Local State / Preferences / Local Storage 为凭据与站点存储，锁定概率低。
const CRITICAL_PROFILE_FILES = [
  'Default/Network/Cookies',
  'Default/Login Data',
  'Local State',
  'Default/Preferences',
];

// 健壮递归拷贝：逐文件复制，遇「文件被占用/锁（EBUSY/EPERM/ENOENT/EACCES）」则跳过该文件并继续，
// 绝不因单个运行时锁文件（如 Default/Network/Cookies 被运行中的浏览器独占）而整体中断拷贝。
// 这解决了 fs.cpSync 在首个锁文件处直接抛错、导致整段拷贝失败并被迫回退真实 profile 的缺陷（实测 EBUSY）。
// onSkip(relPath, err)：relPath 为相对源根的路径（用于判定是否关键文件）。
function copyDirRobust(src, dst, { exclude, onSkip, rel = '' }) {
  fs.mkdirSync(dst, { recursive: true });
  let entries;
  try { entries = fs.readdirSync(src, { withFileTypes: true }); }
  catch (e) { onSkip(rel || path.basename(src), e); return; }
  for (const ent of entries) {
    if (exclude.has(ent.name)) continue; // 排除锁文件（任意层级）
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    const childRel = rel ? rel + '/' + ent.name : ent.name;
    try {
      if (ent.isDirectory()) {
        copyDirRobust(s, d, { exclude, onSkip, rel: childRel });
      } else if (ent.isFile()) {
        try {
          fs.copyFileSync(s, d);
        } catch (e) {
          // 锁/占用文件（如 Default/Network/Cookies）→ 跳过，不阻断整体拷贝
          onSkip(childRel, e);
        }
      }
      // 符号链接/其它类型：跳过
    } catch (e) {
      onSkip(childRel, e);
    }
  }
}

// 问题2修复：将真实 User Data 全量拷贝到系统临时目录下的稳定目录，
// 以继承登录态 / Cookie，但隔离新实例写入、避免污染真实 profile 与单实例锁冲突。
// 返回 { path, reused, skipped, skippedFiles, missingCritical }：
//   reused=true 复用既有拷贝（不重新全量拷贝，省去 GB 级数据重复拷贝开销）；
//   skipped=本次全量拷贝中被跳过（锁/占用/不可读）的文件数（0 表示完整拷贝）；
//   skippedFiles=被跳过的相对路径列表（诊断用）；
//   missingCritical=因被跳过而缺失的「关键登录态文件」列表（登录态未完整继承的判定依据）。
// 跨机 / 跨平台通用：临时目录经 os.tmpdir() 解析（Windows 即 %temp%），不写死绝对路径。
// 可选 dst 参数（默认 os.tmpdir()/chrome-devtools-profile）仅用于单元测试隔离，生产路径固定。
function prepareTempProfile(srcUserDir, { refresh = false, dst = path.join(os.tmpdir(), 'chrome-devtools-profile') } = {}) {
  if (!srcUserDir || !fs.existsSync(srcUserDir) || !fs.statSync(srcUserDir).isDirectory()) {
    throw new Error('源 User Data 不存在或非目录: ' + srcUserDir);
  }
  let reused = false;
  let skipped = 0;
  const skippedFiles = [];
  if (fs.existsSync(dst)) {
    if (refresh) {
      fs.rmSync(dst, { recursive: true, force: true });
    } else {
      reused = true; // 复用既有拷贝（登录态快照仍有效）
    }
  }
  if (!reused) {
    // 手动递归拷贝（非 fs.cpSync）：逐个文件复制，锁文件/被占用文件跳过而非抛错，
    // 保证「浏览器正在运行时」也能成功生成临时 profile 拷贝（实测 EBUSY 不阻断）。
    copyDirRobust(srcUserDir, dst, {
      exclude: new Set(PROFILE_LOCK_FILES),
      onSkip: (rel) => { skipped++; skippedFiles.push(rel); },
    });
  }
  // 判定「关键登录态文件是否缺失」：既看本次被跳过的，也看目标中确实不存在的（更全面）。
  const missingCritical = CRITICAL_PROFILE_FILES.filter(
    (f) => !fs.existsSync(path.join(dst, f.split('/').join(path.sep)))
  );
  return { path: dst, reused, skipped, skippedFiles, missingCritical };
}

// 问题1修复：扫描 [min,max] 端口，返回首个「已响应且属于目标浏览器(360/Chrome)」的端口；
// 找不到目标浏览器时返回 null（不返回 WorkBuddy Electron 等非目标端点，避免误连）。
async function findTargetCdpPort(min = 9222, max = 9240) {
  for (let p = min; p <= max; p++) {
    if (await probePort(p) && await isTargetBrowserOnPort(p)) return p;
  }
  return null;
}

// 扫描 [min,max] 端口，返回首个「已响应」的端口（不限浏览器类型），仅作兜底探测用途。
async function findAnyCdpPort(min = 9222, max = 9240) {
  for (let p = min; p <= max; p++) {
    if (await probePort(p)) return p;
  }
  return null;
}

module.exports = {
  probePort, profileLocked, isBrowserRunning, browserUA, isTargetBrowserOnPort,
  PROFILE_LOCK_FILES, CRITICAL_PROFILE_FILES, prepareTempProfile, findTargetCdpPort, findAnyCdpPort,
};
