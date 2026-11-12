#!/usr/bin/env node
/**
 * Workbuddy专属 合集：「开发态 → 部署态」同步薄包装的共享实现（AGENTS.md §7.7）。
 *
 * 本文件不实现任何同步逻辑——blob 读取、三项判据校验、单文件形态转换、专有物保留，
 * 全部由仓库级唯一入口 scripts/deploy-skill.cjs 承担。合集内各技能的
 * scripts/deploy.js 只调用 run('<注册表名>')，达成「统一文件名 + 最大复用 + 单一事实源」。
 *
 * 映射关系不在此硬编码：唯一入口运行时解析 AGENTS.md §7.2 主表，技能名只是选行键。
 * 仓库根与唯一入口均按本文件位置运行时上溯探查，不写死盘符 / 用户名 / 绝对路径。
 *
 * CLI 兼容（旧 scripts/deploy.js 契约 → 唯一入口参数）：
 *   --repo / --ref / --dry-run / --plan / --verify / --json / -h|--help / --exclude
 *   --skill-path <路径>  旧版允许覆盖开发态路径；现因映射由 §7.2 唯一登记而废弃，
 *                        为不破坏既有调用链，参数被吞掉并输出提示。
 *   --to 语义适配：旧版指「技能部署目录」，唯一入口的 --to 指「用户级 skills 根」。
 *                  若传入目录名 == 技能名，自动取其父目录；否则按 skills 根直传。
 * 默认来源引用由旧版 HEAD 改为 main（§7.3：部署态以 main 的 git blob 为唯一权威）。
 *
 * 用法（由各技能 scripts/deploy.js 转发，不直接执行）：
 *   require('../../deploy-skill-wrapper.cjs')('wechat-article-search');
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function die(msg) {
  console.error('[错误] ' + msg);
  process.exit(2);
}

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function mapArgs(argv, skillName) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') out.push('--help');
    else if (a === '--dry-run' || a === '--plan' || a === '--verify' || a === '--json') out.push(a);
    else if (a === '--repo' || a === '--ref' || a === '--exclude') out.push(a, argv[++i] || '');
    else if (a === '--to') {
      const v = argv[++i] || '';
      if (!v) die('--to 缺少取值');
      const abs = path.resolve(v);
      out.push('--to', path.basename(abs) === skillName ? path.dirname(abs) : abs);
    } else if (a === '--skill-path') {
      i++;
      console.warn('[提示] --skill-path 已废弃：映射由 AGENTS.md §7.2 唯一登记，参数被忽略。');
    } else die('未知参数：' + a + '（可用 -h 查看用法）');
  }
  return out;
}

module.exports = function run(skillName) {
  const repo = findRepoRoot(__dirname) || findRepoRoot(process.cwd());
  if (!repo) die('未找到 Git 仓库根（未发现 .git）。本脚本是开发态工具，只能在仓库或其 worktree 内运行。');
  const central = path.join(repo, 'scripts', 'deploy-skill.cjs');
  if (!fs.existsSync(central)) {
    die('未找到仓库级唯一同步入口 ' + central + '（请确认 main 已包含 §7.7 的 meta 变更）');
  }
  const args = ['--skill', skillName].concat(mapArgs(process.argv.slice(2), skillName));
  const r = spawnSync(process.execPath, [central].concat(args), { cwd: repo, stdio: 'inherit' });
  if (r.error) die('调用唯一入口失败：' + r.error.message);
  process.exit(r.status === null ? 1 : r.status);
};
