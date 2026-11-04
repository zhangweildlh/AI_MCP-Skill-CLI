// localization/merge_mcp_json.cjs
// 幂等将 chrome-devtools 合并进 WorkBuddy 的 mcp.json（仅覆盖本服务器条目，保留其它条目与用户既有 env）。
// 独立成模块以便单元测试（无 require 期副作用）。
// F2 修复：深度合并嵌套 env —— 保留用户既有环境变量（如代理配置），仅叠加本地化所需 env，
// 避免原 Object.assign 浅合并把整段 env 整体覆盖、抹掉用户原有环境变量的缺陷。
const fs = require('fs');
const path = require('path');

function mergeIntoMcpJson(mcp, opts) {
  const home = (opts && opts.home) || process.env.USERPROFILE || process.env.HOME || '';
  const mcpJsonPath = path.join(home, '.workbuddy', 'mcp.json');
  if (!home || !fs.existsSync(path.dirname(mcpJsonPath))) {
    console.log('[mcp] 未找到 ~/.workbuddy，跳过自动合并（请手动合并 mcp-local-config.json）。');
    return;
  }
  let doc;
  try {
    doc = fs.existsSync(mcpJsonPath) ? JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8')) : {};
  } catch (e) {
    console.log('[mcp] 解析现有 mcp.json 失败，跳过自动合并: ' + e.message);
    return;
  }
  doc.mcpServers = doc.mcpServers || {};
  // 字段级合并：保留既有条目未被覆盖的字段（至少 disabled），仅叠加新 command/args/env；
  // 避免整条目覆盖抹掉用户原有 disabled 等字段、造成启用状态静默反转（BUG-2 修复）。
  const existingEntry = doc.mcpServers['chrome-devtools'] || {};
  const incomingEntry = mcp.mcpServers['chrome-devtools'];
  const mergedEntry = Object.assign({}, existingEntry, incomingEntry);
  // F2 修复：深度合并嵌套 env，保留用户既有环境变量（如代理），仅叠加本地化所需 env。
  mergedEntry.env = Object.assign({}, existingEntry.env, incomingEntry.env);
  doc.mcpServers['chrome-devtools'] = mergedEntry;
  fs.writeFileSync(mcpJsonPath, JSON.stringify(doc, null, 2), 'utf8');
  console.log('[mcp] 已自动合并 chrome-devtools 到 ' + mcpJsonPath);
}

// 问题1修复：把 chrome-devtools 条目 args 中的 --browserUrl 端口同步为实测端口。
// 背景：~/.workbuddy/mcp.json 里的 --browserUrl 是静态硬编码（部署时写死 9223），
// 而真实调试浏览器可能运行在 9222/9224/... 任意端口，直接连会 ECONNREFUSED（用户报的原错误）。
// 幂等且最小侵入：只改写 args 数组中 --browserUrl= 参数的端口部分，
//   不覆盖整个 args（保留用户自传的其它参数）、不动其它 server 条目、不动 env。
// 返回 { changed, previousPort, port }；changed=false 表示无需改动或文件/条目不存在。
function syncBrowserUrlPort(port, opts) {
  const home = (opts && opts.home) || process.env.USERPROFILE || process.env.HOME || '';
  const mcpJsonPath = path.join(home, '.workbuddy', 'mcp.json');
  const p = Number(port);
  if (!home || !Number.isInteger(p) || p <= 0 || p > 65535) {
    return { changed: false, previousPort: null, port: p || null };
  }
  if (!fs.existsSync(mcpJsonPath)) return { changed: false, previousPort: null, port: p };
  let doc;
  try { doc = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8')); }
  catch (e) { return { changed: false, previousPort: null, port: p }; }
  const entry = doc.mcpServers && doc.mcpServers['chrome-devtools'];
  if (!entry || !Array.isArray(entry.args)) return { changed: false, previousPort: null, port: p };
  let previousPort = null, changed = false;
  entry.args = entry.args.map((a) => {
    if (typeof a !== 'string') return a;
    const m = a.match(/^--browserUrl=(?:https?:\/\/[^:]+):(\d+)(\/.*)?$/);
    if (!m) return a;
    previousPort = Number(m[1]);
    if (previousPort === p) return a;
    changed = true;
    return '--browserUrl=' + (m[0].match(/^--browserUrl=(https?:\/\/[^:]+)/)[1]) + ':' + p + (m[2] || '');
  });
  if (!changed) return { changed: false, previousPort, port: p };
  fs.writeFileSync(mcpJsonPath, JSON.stringify(doc, null, 2), 'utf8');
  return { changed: true, previousPort, port: p };
}

module.exports = { mergeIntoMcpJson, syncBrowserUrlPort };
