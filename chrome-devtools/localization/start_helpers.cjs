// localization/start_helpers.cjs
// start.cjs 的可独立测试辅助函数（无 require 期副作用）。
// 从 start.cjs 抽出，便于单元测试 profileLocked / probePort（F3）。
const fs = require('fs');
const path = require('path');
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
// 该锁与调试端口无关：即使 9222 无响应，只要锁存在就说明有实例占用同一 profile。
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

module.exports = { probePort, profileLocked, isBrowserRunning };
