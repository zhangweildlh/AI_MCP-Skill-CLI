// localization/start_helpers.cjs
// start.cjs 的可独立测试辅助函数（无 require 期副作用）。
// 从 start.cjs 抽出，便于单元测试 profileLocked / probePort（F3）。
const fs = require('fs');
const path = require('path');
const http = require('http');

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

module.exports = { probePort, profileLocked };
