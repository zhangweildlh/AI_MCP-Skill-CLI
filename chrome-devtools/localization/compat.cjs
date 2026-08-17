// localization/compat.cjs
// 兼容性定向合并器（幂等）：针对 upstream/ 子技能（纯上游快照）注入本地化约束，
// 解决 1.6→1.7 破坏性变更导致的构建/运行阻断。
//   1) package.json overrides.zod 固定为 3.25.76（避免 zod v4 浮动致 tsc 失败；锁文件已锁 3.25.76，此处强化）
//   2) package.json config.allowScripts 声明意图（实际生效以 .npmrc 的 allow-scripts[] 为准）
//   3) .npmrc 定向合并：保留上游 min-release-age 系列 ∪ 追加本地 allow-scripts[] 5 包白名单（BUG-3 修复）
//   4) puppeteer.config.js 强制 chrome.skipDownload:true（禁止下载 Chrome 内核，复用本机 360Chromex）
// 所有路径按脚本位置相对解析，跨机可用。
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const UPSTREAM = path.join(REPO, 'upstream');
const ZOD_PIN = '3.25.76';

// 本地 allow-scripts[] 白名单（BUG-3 修复：批准原生绑定 install script，避免跨机 unrs-resolver 等缺失）
const ALLOW_SCRIPTS = [
  '@google/genai',
  'core-js',
  'protobufjs',
  'puppeteer',
  'unrs-resolver',
];

// —— 合并 .npmrc：上游 ∪ 本地 allow-scripts[]（幂等）——
function mergeNpmrc(targetPath) {
  const p = targetPath || path.join(UPSTREAM, '.npmrc');
  if (!fs.existsSync(p)) { console.log('[兼容] 上游无 .npmrc，跳过'); return; }
  let lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  // 并集合并（F1 修复）：先保留上游既有 allow-scripts 条目中「非本脚本管理的包」，再确保本地 5 包白名单齐备；
  // 避免原实现整体替换、丢弃上游其他 allow-scripts 条目（原注释宣称「并集」实为「替换」）。
  const upstreamAllow = lines
    .filter(l => l.trim().startsWith('allow-scripts'))
    .map(l => l.trim());
  lines = lines.filter(l => !l.trim().startsWith('allow-scripts'));
  for (const u of upstreamAllow) {
    const pkg = u.replace(/^allow-scripts\[\]=/, '');
    if (!ALLOW_SCRIPTS.includes(pkg)) lines.push(u); // 保留上游独有条目
  }
  let changed = false;
  for (const pkg of ALLOW_SCRIPTS) {
    const needle = 'allow-scripts[]=' + pkg;
    if (!lines.some(l => l.trim() === needle)) {
      lines.push('allow-scripts[]=' + pkg);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(p, lines.join('\n') + '\n', 'utf8');
    console.log('[兼容] 已合并 allow-scripts[] 白名单到 upstream/.npmrc（' + ALLOW_SCRIPTS.length + ' 包）');
  } else {
    console.log('[兼容] upstream/.npmrc allow-scripts[] 已就绪');
  }
}

// —— 强制 puppeteer 跳过 Chrome 内核下载（幂等）——
function forcePuppeteerSkipDownload() {
  const p = path.join(UPSTREAM, 'puppeteer.config.js');
  if (!fs.existsSync(p)) { console.log('[兼容] 上游无 puppeteer.config.js，跳过'); return; }
  let content = fs.readFileSync(p, 'utf8');
  if (/skipDownload:\s*false/.test(content)) {
    content = content.replace(/skipDownload:\s*false/g, 'skipDownload: true');
    fs.writeFileSync(p, content, 'utf8');
    console.log('[兼容] 已强制 puppeteer chrome.skipDownload:true');
  } else if (/skipDownload:\s*true/.test(content)) {
    console.log('[兼容] puppeteer skipDownload 已为 true');
  } else {
    console.log('[兼容] 未在 puppeteer.config.js 发现 skipDownload 字段，跳过');
  }
}

// —— 固定 zod 版本 + 声明 allowScripts（幂等）——
function pinZodAndScripts() {
  const p = path.join(UPSTREAM, 'package.json');
  if (!fs.existsSync(p)) { console.error('[兼容] 未找到 upstream/package.json'); return; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  let changed = false;
  if (!j.overrides) j.overrides = {};
  if (j.overrides.zod !== ZOD_PIN) {
    j.overrides.zod = ZOD_PIN;
    changed = true;
    console.log('[兼容] 已固定 zod=' + ZOD_PIN);
  }
  const cur = (j.config && Array.isArray(j.config.allowScripts)) ? j.config.allowScripts : null;
  const same = cur && cur.length === ALLOW_SCRIPTS.length && ALLOW_SCRIPTS.every(x => cur.includes(x));
  if (!same) {
    if (!j.config) j.config = {};
    j.config.allowScripts = ALLOW_SCRIPTS.slice();
    changed = true;
    console.log('[兼容] 已声明 config.allowScripts');
  }
  // 方案 A：devtools-frontend 由 vendored 构建产物提供，移除上游 prepare 子模块拉取（否则每次 npm install 冲突失败）
  if (j.scripts && j.scripts.prepare) {
    delete j.scripts.prepare;
    changed = true;
    console.log('[兼容] 已移除 scripts.prepare（devtools-frontend 由 vendored 产物提供，无需 submodule 拉取）');
  }
  if (changed) {
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
  } else {
    console.log('[兼容] package.json zod/config 已就绪');
  }
}

function ensure() {
  if (!fs.existsSync(UPSTREAM)) {
    console.error('[兼容] 未找到 upstream/ 子目录。本方案 upstream/ 由 localization/upstream.cjs 按 UPSTREAM_REF 钉版本克隆生成（全新引导/bootstrap），不是手工预先放置的。');
    console.error('       请先运行 node localization/upstream.cjs 完成上游引导（克隆 v1.7.0 → 合并本地化约束 → 注入 → vendoring → 构建 → 生成配置），再视需要运行 deploy.cjs 重新部署。');
    process.exit(1);
  }
  pinZodAndScripts();
  mergeNpmrc();
  forcePuppeteerSkipDownload();
  console.log('[兼容] 定向合并完成（upstream/ 已注入本地化约束）。');
}

// 导出供单元测试（F3）：保持 ensure 可直接调用（兼容 require('./compat.cjs')()），并暴露 mergeNpmrc 以验证并集合并行为。
ensure.mergeNpmrc = mergeNpmrc;
module.exports = ensure;

// 支持直接运行：node localization/compat.cjs（独立验证/手动注入）
if (require.main === module) ensure();
