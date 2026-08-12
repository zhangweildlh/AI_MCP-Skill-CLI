// sync_and_deploy.cjs
// 单入口部署（A3 方式二）：在主副本发起，先镜像(mirror) 再部署(deploy)，
// 强制"mirror 先于 deploy"的顺序，消除"主副本改动后忘了跑 mirror 导致部署副本失同步"的隐患。
// 1) mirror_to_target.cjs：把主副本（源码+本地化，不含 node_modules/build）覆盖到部署副本（含完整性校验）。
// 2) deploy.cjs：在部署副本目录运行，装依赖/构建/生成 MCP 配置（运行时产物落在部署副本，主副本保持最小）。
// 跨机可用：部署副本路径按 os.homedir() 动态解析，与 mirror_to_target.cjs 一致。
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = __dirname; // 主副本根
const TARGET = path.join(os.homedir(), '.workbuddy', 'skills', 'chrome-devtools');

function sh(c, cwd) {
  console.log('$ ' + c + (cwd ? '  (cwd=' + cwd + ')' : ''));
  try {
    execSync(c, { cwd: cwd || REPO, stdio: 'inherit' });
  } catch (e) {
    console.error('命令失败: ' + c);
    process.exit(1);
  }
}

if (!fs.existsSync(path.join(REPO, 'package.json'))) {
  console.error('源目录异常，请在主副本根目录运行: ' + REPO);
  process.exit(1);
}

console.log('=== 步骤 1：镜像主副本 → 部署副本（先同步源码/本地化，含完整性校验）===');
sh('node "' + path.join(REPO, 'mirror_to_target.cjs') + '"' + (process.argv.includes('--strict') ? ' --strict' : ''));

console.log('\n=== 步骤 2：在部署副本执行部署（装依赖/构建/生成 MCP 配置）===');
const deployScript = path.join(TARGET, 'localization', 'deploy.cjs');
if (!fs.existsSync(deployScript)) {
  console.error('[错误] 部署副本未找到 deploy.cjs，镜像可能未完成: ' + TARGET);
  process.exit(1);
}
sh('node "' + deployScript + '"', TARGET);

console.log('\n[完成] 已同步并部署。下一步：');
console.log('1) 在 WorkBuddy 连接器管理页"信任" chrome-devtools（如尚未信任）；');
console.log('2) 任一 Agent 调用本技能前，经 verify_browser.cjs + start.cjs 拉起 360Chromex（9222）。');
