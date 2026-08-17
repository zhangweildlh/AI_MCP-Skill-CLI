// localization/verify_browser.cjs
// 自动检测本地可用浏览器（360Chromex / Chrome），写入 local-config.json。
// 检测策略：优先"已注册到系统"的安装（Program Files、已知安装目录、Windows 注册表）；
// 仅当只找到 PATH 中未注册/便携版时才提示用户确认，避免误用便携版（未注册、登录态不可靠）。
// 跨平台：Windows 重点搜索 360Chromex.exe / chrome.exe；macOS/Linux 搜索常见 Chrome 路径。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const REPO = path.resolve(__dirname, '..');
const cfgPath = path.join(REPO, 'local-config.json');
const isWin = process.platform === 'win32';
// 本机 360Chromex 常见安装根（可用环境变量覆盖，避免源码写死机器路径）。
// 惰性读取（F3 修复：便于测试经环境变量覆盖，且保持运行时可被环境覆盖的一致性），而非模块加载时定死。
function local360Dir() { return process.env['CHROME_DEVTOOLS_360_DIR'] || 'D:\\Tools\\360Chrome'; }

function load() { return fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {}; }
function save(c) { fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2), 'utf8'); }
function verify(p) {
  if (!p || !fs.existsSync(p)) return false;
  if (isWin) return /\.exe$/i.test(p);
  // 非 Windows：接受存在的可执行文件（macOS 的 .app 是目录，故目录也算）
  try {
    const st = fs.statSync(p);
    return st.isFile() || st.isDirectory();
  } catch { return false; }
}

// 候选收集：{ path, name, registered }
function collect() {
  const found = [];
  const seen = new Set();
  function add(p, registered, name) {
    if (!p) return;
    let norm;
    try { norm = path.normalize(p); } catch (e) { return; }
    if (seen.has(norm.toLowerCase())) return;
    if (!fs.existsSync(norm)) return;
    seen.add(norm.toLowerCase());
    found.push({ path: norm, name: name || path.basename(norm), registered: !!registered });
  }
  if (isWin) {
    const PF = process.env.ProgramFiles || 'C:\\Program Files';
    const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    // 已知安装位置（视为已注册）
    add(path.join(local360Dir(), '360chromex.exe'), true, '360Chromex');
    add(path.join(PF, 'Google', 'Chrome', 'Application', 'chrome.exe'), true, 'Chrome');
    add(path.join(PF86, 'Google', 'Chrome', 'Application', 'chrome.exe'), true, 'Chrome');
    add(path.join(PF, '360Chrome', '360chromex.exe'), true, '360Chromex');
    add(path.join(PF86, '360Chrome', '360chromex.exe'), true, '360Chromex');
    // 注册表 App Paths
    for (const key of [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\360chrome.exe',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
    ]) {
      try {
        const out = execSync('reg query "' + key + '" /ve', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const m = out.match(/REG_SZ\s+(.+?\.(exe|EXE))/);
        if (m) add(m[1].trim(), true, path.basename(m[1].trim()));
      } catch (e) {}
    }
    // 注册表卸载项枚举已安装的 chrome.exe / 360chrome.exe
    try {
      const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "chrome.exe"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      (out.match(/.+?\\chrome\.exe/gi) || []).forEach(p => add(p.trim(), true, 'Chrome'));
    } catch (e) {}
    try {
      const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "360chrome.exe"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      (out.match(/.+?\\360chrome\.exe/gi) || []).forEach(p => add(p.trim(), true, '360Chromex'));
    } catch (e) {}
    // PATH 中的候选（未注册，需确认）
    for (const nm of ['360chromex.exe', 'chrome.exe']) {
      try {
        const out = execSync('where ' + nm, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        out.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(p => add(p, false, nm));
      } catch (e) {}
    }
  } else {
    add('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', true, 'Chrome');
    add('/usr/bin/google-chrome', true, 'Chrome');
    add('/usr/bin/google-chrome-stable', true, 'Chrome');
  }
  return found;
}

// 计算用户数据目录：优先系统标准位置，否则取 exe 同级 User Data
function userDataFor(exe, name) {
  const dir = path.dirname(exe);
  const lower = exe.toLowerCase();
  if (lower.includes('360') || name.toLowerCase().includes('360')) {
    const std = path.join(local360Dir(), 'User Data');
    if (fs.existsSync(std)) return std;
  } else if (lower.includes('chrome')) {
    const la = process.env.LOCALAPPDATA;
    if (la) {
      const std = path.join(la, 'Google', 'Chrome', 'User Data');
      if (fs.existsSync(std)) return std;
    }
  }
  return path.join(dir, 'User Data');
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => { rl.question(q, a => { rl.close(); res(a.trim()); }); });
}

if (require.main === module) { (async () => {
const cands = collect();
const registered = cands.filter(c => c.registered);
// 非交互环境且无已注册浏览器：直接失败并给出明确指引，避免 ask() 永久挂起（RC-D）。
if (registered.length === 0 && !process.stdin.isTTY) {
  console.error('[错误] 非交互环境中未检测到已注册浏览器，无法交互询问路径。');
  console.error('请先在 local-config.json 显式设置 browserPath（或设置环境变量 CHROME_DEVTOOLS_BROWSER_PATH），再运行部署。');
  process.exit(1);
}
// 优先已注册：360Chromex（登录态）> Chrome
let pick = null;
  if (registered.length) {
    pick = registered.find(c => /360/i.test(c.name)) || registered.find(c => /chrome/i.test(c.name));
  }
  if (pick) {
    const cfg = load();
    cfg.browserPath = pick.path;
    if (!cfg.browserUserDataDir) cfg.browserUserDataDir = userDataFor(pick.path, pick.name);
    if (!cfg.debugPort) cfg.debugPort = 9222;
    save(cfg);
    console.log('[OK] 已自动检测并写入本地浏览器（已注册安装）: ' + pick.path);
    console.log('     用户数据目录: ' + cfg.browserUserDataDir);
    process.exit(0);
  }

  // 仅找到未注册/PATH 候选（可能为便携版）
  const unreg = cands.filter(c => !c.registered);
  if (unreg.length) {
    console.log('[!] 仅在 PATH 中发现以下浏览器（未注册到系统，可能为便携版，登录态不可靠）：');
    unreg.forEach((c, i) => console.log('   ' + (i + 1) + ') ' + c.path));
    console.log('   为避免误用便携版，请确认使用哪一个，或明文输入已注册浏览器的绝对路径。');
    const a = await ask('输入序号或绝对路径（留空则要求手动输入）: ');
    if (/^\d+$/.test(a)) {
      const idx = parseInt(a, 10) - 1;
      if (idx >= 0 && idx < unreg.length) {
        const c = unreg[idx];
        const cfg = load();
        cfg.browserPath = c.path;
        if (!cfg.browserUserDataDir) cfg.browserUserDataDir = userDataFor(c.path, c.name);
        if (!cfg.debugPort) cfg.debugPort = 9222;
        save(cfg);
        console.log('[已写入(未注册，请谨慎)] ' + c.path);
        process.exit(0);
      }
    } else if (verify(a)) {
      const cfg = load();
      cfg.browserPath = a;
      if (!cfg.browserUserDataDir) cfg.browserUserDataDir = userDataFor(a, path.basename(a));
      if (!cfg.debugPort) cfg.debugPort = 9222;
      save(cfg);
      console.log('[已写入] ' + a);
      process.exit(0);
    }
  }

  // 无候选：要求用户明文输入
  console.log('[!] 未检测到本地浏览器。');
  let input = await ask('请明文输入 360Chromex(或 Chrome) 可执行文件绝对路径: ');
  while (!verify(input)) input = await ask('路径无效，请重新输入 .exe 绝对路径: ');
  const cfg = load();
  cfg.browserPath = input;
  if (!cfg.browserUserDataDir) cfg.browserUserDataDir = userDataFor(input, path.basename(input));
  if (!cfg.debugPort) cfg.debugPort = 9222;
  save(cfg);
    console.log('[已写入] local-config.json -> browserPath: ' + input);
  })();
}

// 导出供单元测试（F3）：保持直接运行行为不变（require.main 守卫），并暴露 userDataFor 以验证用户数据目录解析。
module.exports = { userDataFor };
