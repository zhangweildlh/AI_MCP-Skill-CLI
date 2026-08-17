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

module.exports = { mergeIntoMcpJson };
