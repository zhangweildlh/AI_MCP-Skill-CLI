// mirror_to_target.cjs
// 将主副本（拷贝即走：源码 + localization + skills + 本地化注入；不含 node_modules/build）覆盖安装到
// WorkBuddy 本地使用副本；并在副本顶层放置 SKILL.md（供 WorkBuddy 加载）。
// 运行时依赖（node_modules/build）位于全局 $(npm root -g)，故镜像排除，保持副本最小化。
// 路径按脚本位置 / USERPROFILE 相对解析，跨机可用；中文规范目录（Workbuddy专属）已废弃，不再镜像。
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SRC = __dirname; // 仓库根
// 目标用户目录用 os.homedir() 动态解析，去除硬编码用户名（跨机可用）。
const TARGET = path.join(os.homedir(), '.workbuddy', 'skills', 'chrome-devtools');

// 跨平台目录镜像（取代原 Windows 专有 robocopy）：
// - 非破坏性：复制 src -> dst，不删除目标中源没有的文件；
// - 排除 node_modules/build（运行时依赖在全局 $(npm root -g)）；
// - 出错直接抛出（不再静默吞掉），使同步不完整对用户可见。
function copyDir(src, dst) {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (p) => {
      const base = path.basename(p);
      // 排除运行时依赖、.git 与本地化生成的机器专属配置（local-config.json / mcp-local-config.json 由 deploy/apply_localize 运行时生成，勿随镜像传播）。
      return base !== 'node_modules' && base !== 'build' && base !== '.git'
        && base !== 'local-config.json' && base !== 'mcp-local-config.json';
    },
  });
}

// 递归清除目标目录内文件的只读位（Windows 上 fs.cpSync 会传播源只读位到目标，
// 导致后续 copyFileSync 覆盖目标 SKILL.md 时 EPERM；此处显式复位，兼容"主副本只读"纪律）。
function clearTargetReadOnly(dir) {
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      try {
        if (e.isDirectory()) walk(p);
        else fs.chmodSync(p, 0o644);
      } catch { /* 忽略个别文件权限错误 */ }
    }
  }
  walk(dir);
}

if (!fs.existsSync(path.join(SRC, 'package.json'))) {
  console.error('源目录异常，请先完成本地化注入:', SRC);
  process.exit(1);
}
copyDir(SRC, TARGET);
clearTargetReadOnly(TARGET); // 复位目标只读位（兼容源只读），避免后续覆盖 EPERM
verifySync(SRC, TARGET); // 完整性校验：捕获"源有而目标缺"的失同步（A1，默认告警，--strict 致命）
// 顶层 SKILL.md（WorkBuddy 加载入口，亦由 apply_localize 在主副本同步）
fs.copyFileSync(path.join(TARGET, 'skills', 'chrome-devtools', 'SKILL.md'), path.join(TARGET, 'SKILL.md'));
console.log('\n[完成] 已覆盖安装 WorkBuddy 本地使用副本（拷贝即走，最小）: ' + TARGET);
console.log('  - 顶层 SKILL.md 可被 WorkBuddy 加载');
console.log('  - 运行时依赖（node_modules/build）位于全局 $(npm root -g)，未随镜像包含');
console.log('下一步：运行 `node localization/deploy.cjs` 全局安装并生成 MCP 配置，将 mcpServers 内容写入 ~/.workbuddy/mcp.json，在连接器管理页"信任"。');

// 同步完整性校验（A1）：镜像后比对源与目标，捕获"源有而目标缺"的失同步
// （如主副本新增 skills/chrome-devtools-cli/ 但漏跑本脚本）。默认告警；--strict 致命退出。
function verifySync(src, dst) {
  const strict = process.argv.includes('--strict');
  const exclude = new Set(['node_modules', 'build', '.git', 'local-config.json', 'mcp-local-config.json']);
  const missing = [];
  function walk(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (exclude.has(e.name)) continue;
      const p = path.join(dir, e.name);
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (!fs.existsSync(path.join(dst, r))) missing.push(r);
    }
  }
  walk(src, '');
  console.log('\n=== 同步完整性校验 ===');
  if (missing.length === 0) {
    console.log('[OK] 部署副本与主副本一致（除派生物 node_modules/build/本地配置）。');
    return;
  }
  for (const m of missing) console.warn('[校验告警] 部署副本缺失（可能失同步，建议重跑本脚本）: ' + m);
  if (strict) {
    console.error('[校验失败] --strict 模式下发现 ' + missing.length + ' 处缺失，已非零退出。');
    process.exit(1);
  }
  console.log('[提示] 共 ' + missing.length + ' 处缺失；非 --strict 模式仅告警，不阻断。');
}
