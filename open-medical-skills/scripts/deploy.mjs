#!/usr/bin/env node
/**
 * deploy.mjs — 一键部署（父编排 + 入库 vendored 副本）
 *
 * 作用：
 *   1. （可选）--sync：先运行 scripts/sync_openmedical.py 刷新顶层 vendored 副本（联网）。
 *   2. 把顶层 vendored 子技能目录 <name>/（连同 .upstream_version）复制（连同 .upstream_version）到各目标 Agent 的 skills 目录。
 *   3. 把「父技能」的定制文件（SKILL.md / README.md / VENDORING.md / config.json / scripts / .gitignore）
 *      复制到 <目标>/open-medical-skills/。注意：绝不复制 upstream/ 子目录（保持父子解耦）。
 *
 * 前置：node >= 16.7。默认离线部署（vendored 副本已入库，无需联网）；--sync 需要 git + 网络。
 * 用法：
 *   node scripts/deploy.mjs                 # 离线部署（用已入库的 vendored 副本）
 *   node scripts/deploy.mjs --target workbuddy   # 仅部署到某个目标
 *   node scripts/deploy.mjs --sync          # 先联网同步 vendored 副本，再部署
 *   node scripts/deploy.mjs --dry-run       # 只打印将要做什么，不改动任何文件
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(PKG_DIR, 'config.json');
const UPSTREAM_DIR = path.join(PKG_DIR, 'upstream');

function log(m) { console.log(`[open-medical-skills][deploy] ${m}`); }
function warn(m) { console.warn(`[open-medical-skills][deploy][警告] ${m}`); }
function die(m) { console.error(`[open-medical-skills][deploy][错误] ${m}`); process.exit(1); }

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) die(`未找到 config.json：${CONFIG_PATH}`);
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch (e) { die(`config.json 解析失败：${e.message}`); }
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function cpDir(src, dest, dryRun) {
  if (dryRun) { log(`[dry-run] 复制 ${src} -> ${dest}`); return; }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

function resolveTargets(cfg, opts) {
  let list = (cfg.targets || []).map(t => ({ agent: t.agent, dir: t.skills_dir }));
  if (opts.target) {
    const f = list.filter(t => t.agent === opts.target);
    if (f.length) list = f;
    else warn(`config.targets 中未找到 target=${opts.target}，将忽略该过滤。`);
  }
  if (list.length === 0) warn('没有可用的部署目标（请检查 config.json 的 targets）。');
  return list;
}

function runSync(dryRun) {
  const py = process.env.PYTHON_BIN || 'python';
  const script = path.join(PKG_DIR, 'scripts', 'sync_openmedical.py');
  log('运行同步脚本刷新 vendored 副本…');
  if (dryRun) { log(`[dry-run] 将运行：${py} ${script}`); return; }
  try {
    execFileSync(py, [script], { stdio: 'inherit' });
  } catch (e) {
    die(`同步脚本失败：${e.message}（请先手动运行 python scripts/sync_openmedical.py 或去掉 --sync）`);
  }
}

function deploy(cfg, opts) {
  if (opts.sync) runSync(opts.dryRun);

  const targets = resolveTargets(cfg, opts);
  const native = cfg.native_skills || [];
  const parentName = cfg.parent_skill_name || 'open-medical-skills';

  for (const t of targets) {
    const dir = expandHome(t.dir);
    log(`部署到 ${t.agent} -> ${dir}`);
    if (!opts.dryRun) fs.mkdirSync(dir, { recursive: true });

    // 1) 入库 vendored 子技能（来自顶层 <name>/，离线可用；连同 .upstream_version）
    for (const skill of native) {
      const src = path.join(PKG_DIR, skill);
      if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
        warn(`vendored 子技能缺失：${src}（请先运行 sync_openmedical.py 或加 --sync）`);
        continue;
      }
      cpDir(src, path.join(dir, skill), opts.dryRun);
    }

    // 2) 父技能（仅复制本包定制文件；刻意排除 upstream/，保持解耦）
    const parentDest = path.join(dir, parentName);
    if (!opts.dryRun) fs.mkdirSync(parentDest, { recursive: true });
    for (const f of ['SKILL.md', 'README.md', 'VENDORING.md', 'config.json', '.gitignore']) {
      const s = path.join(PKG_DIR, f);
      if (fs.existsSync(s)) cpDir(s, path.join(parentDest, f), opts.dryRun);
    }
    cpDir(path.join(PKG_DIR, 'scripts'), path.join(parentDest, 'scripts'), opts.dryRun, (s) => s.includes('__pycache__'));
  }

  log('部署完成。父技能已安装为「open-medical-skills」，vendored 子技能已并行安装（离线可用）。');
  if (!opts.sync) log('如需先跟进上游最新，可加 --sync 再部署；或单独运行：python scripts/sync_openmedical.py');
}

function main() {
  const opts = { target: null, dryRun: false, sync: false };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target') opts.target = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--sync') opts.sync = true;
    else if (args[i] === '-h' || args[i] === '--help') {
      console.log('用法: node deploy.mjs [--target <agent>] [--sync] [--dry-run]');
      process.exit(0);
    }
  }
  const cfg = loadConfig();
  deploy(cfg, opts);
}

main();
