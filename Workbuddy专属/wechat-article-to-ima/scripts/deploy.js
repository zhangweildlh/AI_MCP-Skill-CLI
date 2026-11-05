#!/usr/bin/env node
/**
 * 开发态 → 部署态 一键同步脚本（零第三方依赖，仅用 Node 内置模块）。
 *
 * 为什么要从 git blob 而不是直接拷贝工作树：
 *   本仓库 core.autocrlf=true，git checkout 后工作树文件会被转成 CRLF，
 *   而入库 blob 与部署态均为 LF。若直接 cp 工作树 → 部署态，部署态就会带上 CRLF，
 *   与 main 的 blob 产生字节分歧（内容相同、行尾不同）。本脚本统一走
 *   `git cat-file blob`，保证部署态字节 == main 的 blob 字节（§7.3 部署文件一律 LF）。
 *
 * 部署态专有文件不被本脚本删除或覆盖——它们不属于开发态源文件，但属于已交付目录的有效组成部分：
 *   - `ima_credentials.json`：ima 凭据明文（§3.3 密钥不入库、不随主副本分发）
 *   - `.gitignore`：随源文件同步（本身即开发态文件）
 *
 * 用法：
 *   node scripts/deploy.js                     # 用默认参数同步
 *   node scripts/deploy.js --dry-run           # 预演，不写盘
 *   node scripts/deploy.js --repo <仓库根> --skill-path <仓库内相对路径> --ref main --to <部署目标>
 */

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const SKILL_NAME = path.basename(SKILL_DIR);
// 部署态专有物：只保留、不覆盖、不删除
const PRESERVE = new Set(['ima_credentials.json']);

function parseArgs(argv) {
  const opts = { repo: '', skillPath: '', to: '', ref: 'HEAD', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') opts.repo = argv[++i] || '';
    else if (a === '--skill-path') opts.skillPath = argv[++i] || '';
    else if (a === '--to') opts.to = argv[++i] || '';
    else if (a === '--ref') opts.ref = argv[++i] || 'HEAD';
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '-h' || a === '--help') {
      console.log(fs.readFileSync(__filename, 'utf-8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
      process.exit(0);
    } else {
      console.error('[错误] 未知参数：' + a);
      process.exit(2);
    }
  }
  return opts;
}

function git(repo, args, encoding) {
  return execFileSync('git', ['-C', repo, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: encoding || 'utf-8',
  });
}

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repo = opts.repo || findRepoRoot(SKILL_DIR) || findRepoRoot(process.cwd());
  if (!repo) {
    console.error('[错误] 未找到 Git 仓库根目录（未发现 .git），请用 --repo 指定。');
    process.exit(1);
  }
  // 技能在仓库中的相对路径：默认取 SKILL_DIR 相对仓库根的路径
  let skillPath = opts.skillPath || path.relative(repo, SKILL_DIR).split(path.sep).join('/');
  if (!skillPath || skillPath.startsWith('..')) {
    console.error('[错误] 技能目录不在仓库内（skillPath=' + skillPath + '），请用 --skill-path 指定相对路径。');
    process.exit(1);
  }
  const target = opts.to || path.join(os.homedir(), '.workbuddy', 'skills', SKILL_NAME);

  console.log('════ 开发态 → 部署态 同步 ════');
  console.log('仓库根    : ' + repo);
  console.log('技能路径  : ' + skillPath);
  console.log('来源引用  : ' + opts.ref);
  console.log('部署目标  : ' + target);
  console.log('模式      : ' + (opts.dryRun ? '预演（不写盘）' : '实际写入'));

  let files;
  try {
    files = git(repo, ['ls-tree', '-r', '--name-only', opts.ref, '--', skillPath], 'utf-8')
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    console.error('[错误] 读取 ' + opts.ref + ' 的文件清单失败：' + e.message);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error('[错误] 引用 ' + opts.ref + ' 下未找到 ' + skillPath + ' 的任何文件。');
    process.exit(1);
  }
  console.log('待同步文件：' + files.length + ' 个');

  let written = 0, unchanged = 0, failed = 0;
  const failures = [];

  for (const f of files) {
    const rel = f.slice(skillPath.length + 1);
    const dest = path.join(target, ...rel.split('/'));
    if (PRESERVE.has(rel)) {
      console.log('  ○ ' + rel + '（部署态专有物，保留不覆盖）');
      continue;
    }
    let blob;
    try {
      blob = git(repo, ['cat-file', 'blob', opts.ref + ':' + f], null);
    } catch (e) {
      console.error('  ✗ ' + rel + '：读取 blob 失败 ' + e.message);
      failed++; failures.push(rel);
      continue;
    }
    const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob, 'utf-8');
    const exists = fs.existsSync(dest);
    const same = exists && fs.readFileSync(dest).equals(buf);
    if (same) {
      console.log('  = ' + rel + '（未变化）');
      unchanged++;
      continue;
    }
    if (opts.dryRun) {
      console.log('  → ' + rel + '（' + buf.length + ' 字节，将覆盖）');
      written++;
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      console.log('  ✓ ' + rel + '（' + buf.length + ' 字节，已覆盖）');
      written++;
    } catch (e) {
      console.error('  ✗ ' + rel + '：写入失败 ' + e.message);
      failed++; failures.push(rel);
    }
  }

  if (!opts.dryRun) {
    // 写后校验：逐文件与 main 的 blob 逐字节比对
    let ok = 0, bad = 0;
    for (const f of files) {
      const rel = f.slice(skillPath.length + 1);
      if (PRESERVE.has(rel)) continue;
      const dest = path.join(target, ...rel.split('/'));
      const blob = git(repo, ['cat-file', 'blob', opts.ref + ':' + f], null);
      const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob, 'utf-8');
      if (fs.existsSync(dest) && fs.readFileSync(dest).equals(buf)) ok++;
      else { bad++; console.error('  ✗ 写后校验不一致：' + rel); }
    }
    console.log('\n写后校验：' + ok + '/' + (ok + bad) + ' 文件与 ' + opts.ref + ' 的 blob 逐字节一致');
    if (bad > 0) { failed += bad; failures.push('写后校验不一致 ' + bad + ' 项'); }
  }

  console.log('\n汇总：写入 ' + written + ' / 未变化 ' + unchanged + ' / 失败 ' + failed);
  if (failed > 0) {
    console.error('存在失败项：\n  - ' + failures.join('\n  - '));
    process.exit(1);
  }
  console.log('部署态已与开发态（' + opts.ref + ' 的 blob）逐字节对齐。');
}

main();
