#!/usr/bin/env node
/**
 * open-medical-skills 开发态 → 部署态同步【薄包装】（AGENTS.md §7.7）。
 *
 * 本文件不含任何 blob 同步实现：全部能力由仓库级唯一入口 scripts/deploy-skill.cjs 提供
 * （运行时解析 AGENTS.md §7.2 注册表 → 从 main 的 git blob 逐字节重建 → 三项判据校验）。
 * 原 deploy.mjs 的 fs.cpSync 拷工作树 + fs.rmSync 删目标已废弃：违反 §7.3「blob 权威」
 * 且会误删部署态专有物；现为「默认只写不删、prune 恒关闭」。
 *
 * 同步范围是 §7.2 注册的 5 行：父包 open-medical-skills（其 blob 树已内嵌 4 个 vendored
 * 子技能，保持运行时 {SKILL_ROOT}/<子技能>/SKILL.md 形态）+ 4 个临床子技能（独立顶层目录）。
 * 技能名**不硬编码**：取自同包 config.json 的 parent_skill_name 与 native_skills。
 *
 * 跨机 / 零硬编码：仓库根与唯一入口按本文件位置运行时上溯 .git；部署目标取自 config.json
 * 的 targets（~ 按 os.homedir() 展开），或由 --to 显式指定；不写死盘符、用户名、绝对路径。
 *
 * 用法（须在仓库或其 worktree 内运行）：
 *   node scripts/deploy.js                       # 覆盖部署到 config.json 全部 targets
 *   node scripts/deploy.js --target workbuddy   # 仅某个 Agent
 *   node scripts/deploy.js --to <skills 根>     # 显式指定 skills 根（忽略 targets）
 *   node scripts/deploy.js --dry-run            # 预演，不写盘
 *   node scripts/deploy.js --verify             # 只做三项判据校验，不写盘
 *   node scripts/deploy.js --ref <引用>         # 内容来源（默认 main）
 *   node scripts/deploy.js --sync               # 先联网刷新 vendored 副本（项目级展开）
 *
 * --sync 显式触发 scripts/sync_openmedical.py（联网、会改动开发态 vendored 副本，须另行走
 * 开发态 PR 提交）；覆盖部署默认离线、不执行任何外部命令（§7.7 默认行为）。
 * Python 解释器可用 PYTHON_BIN 环境变量指定（默认 python）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PKG_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PKG_DIR, 'config.json');

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

function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p && (p.startsWith('~/') || p.startsWith('~\\'))) return path.join(os.homedir(), p.slice(2));
  return p;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) die('未找到 config.json：' + CONFIG_PATH);
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    die('config.json 解析失败：' + e.message);
  }
}

function parseArgs(argv) {
  const opts = { target: '', to: '', ref: 'main', dryRun: false, verify: false, sync: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') opts.target = argv[++i] || '';
    else if (a === '--to') opts.to = argv[++i] || '';
    else if (a === '--ref') opts.ref = argv[++i] || 'main';
    else if (a === '--dry-run' || a === '--plan') opts.dryRun = true;
    else if (a === '--verify') opts.verify = true;
    else if (a === '--sync') opts.sync = true;
    else if (a === '-h' || a === '--help') {
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]
        .replace(/^#![^\n]*\n/, '').replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
      process.exit(0);
    } else die('未知参数：' + a + '（可用 --help 查看用法）');
  }
  if (opts.dryRun && opts.verify) die('--dry-run 与 --verify 不可同时使用');
  return opts;
}

function runSync(opts) {
  const py = process.env.PYTHON_BIN || 'python';
  const script = path.join(PKG_DIR, 'scripts', 'sync_openmedical.py');
  if (opts.dryRun) { console.log('[dry-run] 将运行：' + py + ' ' + script); return; }
  const r = spawnSync(py, [script], { cwd: PKG_DIR, stdio: 'inherit' });
  if (r.error) die('上游同步脚本无法启动：' + r.error.message + '（可用 PYTHON_BIN 指定解释器）');
  if (r.status !== 0) die('上游同步脚本失败（exit=' + r.status + '）');
}

function resolveTargets(cfg, opts) {
  if (opts.to) return [{ agent: '--to', dir: opts.to }];
  let list = (cfg.targets || []).map((t) => ({ agent: t.agent, dir: t.skills_dir }));
  if (opts.target) {
    const filtered = list.filter((t) => t.agent === opts.target);
    if (filtered.length === 0) die('config.json 的 targets 中无 agent=' + opts.target);
    list = filtered;
  }
  if (list.length === 0) die('没有可用的部署目标（检查 config.json 的 targets，或传 --to）');
  return list;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repo = findRepoRoot(__dirname) || findRepoRoot(process.cwd());
  if (!repo) die('未找到 Git 仓库根（未发现 .git）。本脚本是开发态工具，只能在仓库或其 worktree 内运行。');
  const central = path.join(repo, 'scripts', 'deploy-skill.cjs');
  if (!fs.existsSync(central)) die('未找到仓库级唯一同步入口 ' + central + '（请确认 main 已包含 §7.7 的 meta 变更）');

  if (opts.sync) runSync(opts);

  const cfg = loadConfig();
  const skills = [cfg.parent_skill_name || 'open-medical-skills']
    .concat(Array.isArray(cfg.native_skills) ? cfg.native_skills : []);
  const targets = resolveTargets(cfg, opts);

  let failed = 0;
  for (const t of targets) {
    const skillsRoot = path.resolve(expandHome(t.dir));
    console.log('\n════ 目标 ' + t.agent + ' → ' + skillsRoot + ' ｜ ' + skills.length + ' 个注册技能 ｜ ' +
      (opts.dryRun ? 'plan' : opts.verify ? 'verify' : 'sync') + ' ════');
    for (const skill of skills) {
      const args = [central, '--skill', skill, '--ref', opts.ref, '--to', skillsRoot];
      if (opts.dryRun) args.push('--dry-run');
      if (opts.verify) args.push('--verify');
      const r = spawnSync(process.execPath, args, { cwd: repo, stdio: 'inherit' });
      if (r.error || r.status !== 0) {
        console.error('  ✗ ' + skill + ' 失败（' + (r.error ? r.error.message : 'exit=' + r.status) + '）');
        failed++;
      }
    }
  }
  if (failed > 0) die(failed + ' 个技能同步失败，详见上方输出');
  console.log('\n完成：' + targets.length + ' 个目标 × ' + skills.length + ' 个技能，默认只写不删，部署态专有物保留。');
}

main();
