#!/usr/bin/env node
/**
 * 零依赖：通过 Chrome DevTools Protocol (CDP) 从本机 360Chrome 调试实例
 * 读取 weixin.sogou.com 的 Cookie，输出可直接用于 search_wechat.js -c 的字符串。
 *
 * 解耦说明：本脚本仅依赖 Node 内置模块（零 npm install），直接走 CDP，
 * 不调用 chrome-devtools MCP 工具链，与 wechat-article-search 技能、
 * chrome-devtools 技能均解耦。
 *
 * 前置：360Chrome 必须以 --remote-debugging-port=9223 运行，且用户已在其中
 *       打开并通过人机验证 weixin.sogou.com（Cookie 才会存在）。
 *
 * 用法：node get_sogou_cookie.js
 * 输出：stdout 打印 "SNUID=...; SUGGEST=..." 形式的 Cookie 串（供 -c 使用）
 */

const http = require('http');
const crypto = require('crypto');

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9223;
const TARGET_ORIGIN = 'https://weixin.sogou.com';

// --- 最小 WebSocket 客户端（RFC 6455，零依赖） ---
class CdpWs {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map(); // id -> { resolve, reject }
    this.fragments = [];
    this.fragmentOpcode = null;
    this.eventListener = null;
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._rejectAll(new Error('WebSocket closed')));
    socket.on('error', (e) => this._rejectAll(e));
  }

  on(event, cb) {
    if (event === 'event') this.eventListener = cb;
  }

  _rejectAll(err) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this._parseFrame()) { /* 持续解析直到数据不足 */ }
  }

  _parseFrame() {
    const buf = this.buffer;
    if (buf.length < 2) return false;
    const b0 = buf[0];
    const b1 = buf[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < offset + 2) return false;
      len = buf.readUInt16BE(offset);
      offset += 2;
    } else if (len === 127) {
      if (buf.length < offset + 8) return false;
      const hi = buf.readUInt32BE(offset);
      const lo = buf.readUInt32BE(offset + 4);
      len = hi * 2 ** 32 + lo;
      offset += 8;
    }
    let maskKey = null;
    if (masked) {
      if (buf.length < offset + 4) return false;
      maskKey = buf.slice(offset, offset + 4);
      offset += 4;
    }
    if (buf.length < offset + len) return false;
    let payload = buf.slice(offset, offset + len);
    if (masked) {
      const out = Buffer.alloc(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i % 4];
      payload = out;
    }
    this.buffer = buf.slice(offset + len);

    if (opcode === 0) {
      // 续帧
      if (this.fragmentOpcode === null) return true;
      this.fragments.push(payload);
      if (fin) {
        const full = Buffer.concat(this.fragments);
        const op = this.fragmentOpcode;
        this.fragments = [];
        this.fragmentOpcode = null;
        this._handleMessage(op, full);
      }
    } else if (opcode === 1 || opcode === 2) {
      if (!fin) {
        this.fragmentOpcode = opcode;
        this.fragments = [payload];
      } else {
        this._handleMessage(opcode, payload);
      }
    } else if (opcode === 8) {
      try { this.socket.end(); } catch (_) { /* ignore */ }
      this._rejectAll(new Error('WebSocket closed by peer'));
      return false;
    } else if (opcode === 9) {
      this._send(10, payload); // ping -> pong
    }
    // opcode 10 (pong) 忽略
    return true;
  }

  _handleMessage(opcode, payload) {
    if (opcode !== 1 && opcode !== 2) return;
    let msg;
    try {
      msg = JSON.parse(payload.toString('utf-8'));
    } catch (_) {
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    } else if (msg.method && this.eventListener) {
      this.eventListener(msg);
    }
  }

  _send(opcode, payload) {
    const mask = crypto.randomBytes(4);
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header[2] = (len >>> 8) & 0xff;
      header[3] = len & 0xff;
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header[2] = Math.floor(len / 2 ** 32) & 0xff;
      header[3] = (len >>> 24) & 0xff;
      header[4] = (len >>> 16) & 0xff;
      header[5] = (len >>> 8) & 0xff;
      header[6] = len & 0xff;
      header[7] = 0; header[8] = 0; header[9] = 0;
    }
    header[0] = 0x80 | opcode; // FIN + opcode
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const msg = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this._send(1, Buffer.from(msg, 'utf-8'));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP command timeout: ' + method));
        }
      }, 10000);
    });
  }

  close() {
    try { this._send(8, Buffer.alloc(0)); } catch (_) { /* ignore */ }
    try { this.socket.end(); } catch (_) { /* ignore */ }
  }
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: CDP_HOST, port: CDP_PORT, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('http timeout')));
  });
}

function connectWs(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('upgrade', (_res, socket) => resolve(new CdpWs(socket)));
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // 必须连接「页面级（page）」CDP target，而非浏览器级 target：
  // 浏览器级 target（/json/version 的 webSocketDebuggerUrl）不暴露 Network 域，
  // 只有 page 级 target 才能 Network.enable + Network.getCookies（含 HttpOnly）。
  let targets;
  try {
    targets = await httpGet('/json/list');
  } catch (e) {
    console.error(`[错误] 无法连接 ${CDP_HOST}:${CDP_PORT}（${e.message}）。`);
    console.error(`请确保 360Chrome 以 --remote-debugging-port=${CDP_PORT} 运行：`);
    console.error(`  360chromex.exe --remote-debugging-port=${CDP_PORT} --user-data-dir="<临时目录>" --no-first-run`);
    process.exit(1);
  }

  const list = Array.isArray(targets) ? targets : [];
  const pageTargets = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);

  // 优先选用已在 weixin.sogou.com 上的标签页（Cookie 必然就绪）；
  // 回退到任意 page 标签页（Cookie 仍按 origin 过滤从浏览器 Cookie 库读取）。
  let target =
    pageTargets.find((t) => (t.url || '').includes(TARGET_ORIGIN)) ||
    pageTargets[0];

  if (!target) {
    console.error(`[错误] 未找到可用的 page 级 CDP target。`);
    console.error(`请在 360Chrome 中至少打开一个标签页，再运行本脚本。`);
    process.exit(1);
  }

  let ws;
  try {
    ws = await connectWs(target.webSocketDebuggerUrl);
  } catch (e) {
    console.error(`[错误] 无法建立 CDP WebSocket 连接：${e.message}`);
    process.exit(1);
  }

  try {
    // 启用 Network 域后读取目标域 Cookie（含 HttpOnly）
    await ws.send('Network.enable', {});
    const result = await ws.send('Network.getCookies', { urls: [TARGET_ORIGIN + '/'] });
    const cookies = result.cookies || [];
    if (cookies.length === 0) {
      console.error(`[提示] 未读取到 ${TARGET_ORIGIN} 的 Cookie。`);
      console.error(`请先在 chrome-devtools 驱动的 360Chrome 中打开并通过验证 weixin.sogou.com，再运行本脚本。`);
      process.exit(2);
    }
    // 按名称去重（同名不同 path/domain 时保留最后一次出现），避免 Cookie 串出现重复键。
    const seen = new Map();
    for (const c of cookies) seen.set(c.name, c);
    const cookieStr = Array.from(seen.values())
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    console.error(`[成功] 读取到 ${cookies.length} 个 ${TARGET_ORIGIN} Cookie，可直接用于 -c：`);
    console.log(cookieStr);
  } catch (e) {
    console.error(`[错误] 读取 Cookie 失败：${e.message}`);
    process.exit(1);
  } finally {
    ws.close();
  }
}

main();
