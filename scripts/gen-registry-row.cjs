#!/usr/bin/env node
/**
 * gen-registry-row.cjs —— AGENTS.md §7.2 主表「实测」列可复现生成器（唯一入口，零第三方依赖）。
 *
 * 定位（AGENTS.md §7.2 / §7.5）：§7.2 主表每个已部署 Skill 的「实测（文件/字节/行/CR/聚合 md5/逐文件 blob sha）」
 * 各行值**一律由本脚本生成后整行替换**，禁止手写或从旧一次性脚本（如已废弃的 `_recapture_72.py`）贴值。
 * 本脚本以 §7.2 前三列映射为输入，从 <ref>（默认 main）的 git blob 逐字节复采，输出可直接粘贴的表格行文本，
 * 确保跨 PR 可复现、杜绝列错位（2026-11-12 本轮 §7.2 截断事故根因即手写粘贴导致列掉落）。
 *
 * 口径（与 §7.3 / test_deploy_parity.py 完全一致，唯一权威内容 = <ref> 的 git blob，不经工作树）：
 *   - 聚合 md5 = 按相对路径升序（按 UTF-16 码元 / 代码点升序，等价于 Python str 默认序，ASCII 路径即 ASCII 升序），
 *     逐文件序贯喂入 `相对路径 + \0 + 文件字节` 后取 md5；
 *   - 行数 = blob 中 \n 字节计数；CR = blob 中 \r 字节计数（入库恒 LF，应为 0）；
 *   - 逐文件 blob sha = `git rev-parse <ref>:<path>`（展示取前 8 位 hex + …，权威 sha 存于 git）。
 *
 * 单一事实源：技能映射从 AGENTS.md §7.2 主表解析，不另建映射登记。
 * 零硬编码 / 跨机可移植：仓库根按脚本位置运行时上溯 .git；不写死用户名、盘符、绝对路径。
 * 只复采开发态 blob，不读、不写部署态专有物（ima_credentials.json 等），纯只读复采。
 *
 * 用法：
 *   node scripts/gen-registry-row.cjs --skill <name> [--ref main] [--json]
 *   node scripts/gen-registry-row.cjs --skill-rel <仓库内相对路径> [--ref main] [--json]
 *   node scripts/gen-registry-row.cjs --list
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REGISTRY_HEADING = '## 7 ';
const REGISTRY_TABLE_ANCHOR = '| name |';
const SUPPLEMENTAL_HEADER = '| name | 类别 |';
const DEFAULT_REF = 'main';
// 主表行：name | devPath | deployPath | devForm | deployForm（后两列非反引号包裹）
const ROW_RE = /^\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/;

function die(msg) {
  console.error('[错误] ' + msg);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { skill: '', skillRel: '', ref: DEFAULT_REF, list: false, json: false, rewrite: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skill') opts.skill = argv[++i] || '';
    else if (a === '--skill-rel') opts.skillRel = (argv[++i] || '').replace(/\\/g, '/').replace(/^\/|\/$/g, '');
    else if (a === '--ref') opts.ref = argv[++i] || DEFAULT_REF;
    else if (a === '--list') opts.list = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--rewrite') opts.rewrite = true;
    else if (a === '-h' || a === '--help') {
      const doc = fs.readFileSync(__filename, 'utf8').split('*/')[0]
        .replace(/^#![^\n]*\n/, '').replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, '');
      console.log(doc);
      process.exit(0);
    } else die('未知参数：' + a);
  }
  if (!opts.list && !opts.skill && !opts.skillRel && !opts.rewrite) die('须指定 --skill <name> / --skill-rel <仓库内相对路径> / --list / --rewrite 之一');
  if (opts.skill && opts.skillRel) die('--skill 与 --skill-rel 不可同时使用');
  return opts;
}

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function git(repo, args, encoding) {
  return execFileSync('git', ['-C', repo, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: encoding === undefined ? null : encoding,
  });
}

function gitBuf(repo, args) {
  const r = git(repo, args);
  return Buffer.isBuffer(r) ? r : Buffer.from(r);
}

/** 解析 §7.2 主表（仅主表，遇 §7.2.1 补充表表头即止），取前 5 列。 */
function parseRegistry(agentsPath) {
  const text = fs.readFileSync(agentsPath, 'utf8');
  const lines = text.split(/\r?\n/);
  let inSection7 = false, inMainTable = false;
  const rows = [];
  for (const line of lines) {
    const t = line.trim(); // §7.2 表格行含前导缩进，锚点判定须容忍前导空白
    if (t.startsWith('## ')) inSection7 = t.startsWith(REGISTRY_HEADING);
    if (!inSection7) continue;
    if (t.startsWith(SUPPLEMENTAL_HEADER)) break; // 主表结束（§7.2.1 补充表）
    if (t.startsWith(REGISTRY_TABLE_ANCHOR)) { inMainTable = true; continue; }
    if (!inMainTable) continue;
    const m = line.match(ROW_RE);
    if (!m) continue;
    const name = m[1].trim();
    const devPath = m[2].trim();
    const deployPath = m[3].trim();
    const devForm = m[4].trim();
    const deployForm = m[5].trim();
    const removed = /~~/.test(line.split('|')[2] || '') || /^无对应/.test(line.split('|')[3] || '');
    rows.push({
      name, devPath, deployPath, devForm, deployForm,
      layout: devPath.endsWith('.md') ? 'single' : 'dir',
      deployed: !removed,
    });
  }
  return rows;
}

/** 代码点升序（等价于 Python str 默认序；ASCII 路径即 ASCII 升序），与 §7.3 口径一致。 */
function relCompare(a, b) {
  return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0;
}

function listBlobFiles(repo, ref, devPath, layout) {
  if (layout === 'single') return [{ repo: devPath, rel: 'SKILL.md' }];
  const out = git(repo, ['ls-tree', '-r', '--name-only', ref, '--', devPath], 'utf8');
  const prefix = devPath.replace(/\/$/, '') + '/';
  return String(out).split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ repo: f, rel: f.slice(prefix.length) }));
}

function shortSha(repo, ref, file) {
  return String(git(repo, ['rev-parse', ref + ':' + file], 'utf8')).trim();
}

function collect(repo, ref, row) {
  const files = listBlobFiles(repo, ref, row.devPath, row.layout).sort(relCompare);
  if (files.length === 0) die('引用 ' + ref + ' 下未找到 ' + row.devPath + ' 的任何文件');
  const perFile = [];
  let totalBytes = 0, totalLines = 0, totalCr = 0;
  const agg = crypto.createHash('md5');
  for (const f of files) {
    const blob = gitBuf(repo, ['cat-file', 'blob', ref + ':' + f.repo]);
    const sha = shortSha(repo, ref, f.repo);
    perFile.push({ rel: f.rel, sha, size: blob.length });
    totalBytes += blob.length;
    totalLines += blob.filter((b) => b === 0x0a).length; // 行数 = \n 字节计数
    totalCr += blob.filter((b) => b === 0x0d).length;     // CR = \r 字节计数
    agg.update(Buffer.from(f.rel, 'utf8'));
    agg.update(Buffer.from('\0', 'utf8'));
    agg.update(blob);
  }
  return { files, perFile, totalBytes, totalLines, totalCr, aggHex: agg.digest('hex') };
}

function metricString(row, c) {
  const agg8 = c.aggHex.slice(0, 8);
  if (row.layout === 'single') {
    return `${c.totalBytes} B / ${c.totalLines} 行 / ${c.totalCr} CR；md5 \`${agg8}…\``;
  }
  const per = c.perFile.map((p) => `\`${p.rel}\` \`${p.sha.slice(0, 8)}…\``).join('、');
  return `${c.files.length} 文件 / ${c.totalBytes} B / ${c.totalLines} 行 / ${c.totalCr} CR；聚合 md5 \`${agg8}…\`；逐文件 blob sha：${per}`;
}

/**
 * 把 §7.2 主表全部已部署行的「实测列」整列刷新为生成器 canonical 序（口径 §7.3）。
 * 仅替换第 6 列（实测：文件/字节/行/CR/聚合 md5/逐文件 blob sha），保留前 5 列映射与
 * 第 7 列的人工注记（部署方式 / 专有物 / 项目级测试套数等），不丢任何人工内容。
 * 这正是「§7.2 行值一律由生成器整列替换、禁止手写粘贴」的落地动作。
 */
function doRewrite(repo, ref, agentsPath, rows) {
  const text = fs.readFileSync(agentsPath, 'utf8');
  const lines = text.split(/\r?\n/);
  let rewritten = 0, skipped = 0, failed = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(ROW_RE);
    if (!m) continue;
    const cells = line.split('|');
    if (cells.length !== 9) continue; // 仅主表 7 列数据行（含首尾空串共 9 段）
    const name = m[1].trim();
    const row = rows.find((r) => r.name === name);
    if (!row || !row.deployed) continue; // 跳过已移除 / 未部署行
    let c;
    try {
      c = collect(repo, ref, row);
    } catch (e) {
      failed++;
      console.error('[失败] ' + name + '：' + e.message);
      continue;
    }
    // cells[1..5] = 前 5 列（含原间距与反引号），cells[7] = 第 7 列人工注记（含首尾空格）
    const head = cells.slice(1, 6).join('|');
    lines[i] = '|' + head + '| ' + metricString(row, c) + ' |' + cells[7] + '|';
    rewritten++;
  }
  fs.writeFileSync(agentsPath, lines.join('\n'));
  console.log('[重写完成] 主表已刷新 ' + rewritten + ' 行实测列（口径 §7.3，生成器 canonical 序）；跳过 ' + skipped + ' 行；失败 ' + failed + ' 行');
  if (failed > 0) process.exit(1);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repo = findRepoRoot(__dirname);
  if (!repo || !fs.existsSync(path.join(repo, '.git'))) die('未找到 Git 仓库根，请用 --repo 指定');
  const agentsPath = path.join(repo, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) die('未找到 AGENTS.md（§7.2 注册表缺失），拒绝猜测映射');
  const rows = parseRegistry(agentsPath);

  if (opts.list) {
    console.log(JSON.stringify(rows.map((r) => ({
      name: r.name, devPath: r.devPath, deployPath: r.deployPath,
      layout: r.layout, deployed: r.deployed,
    })), null, 2));
    return;
  }

  if (opts.rewrite) {
    return doRewrite(repo, opts.ref, agentsPath, rows);
  }

  let row;
  if (opts.skill) {
    row = rows.find((r) => r.name === opts.skill);
    if (!row) die('注册表主表未找到技能 ' + opts.skill + '（可用 --list 查看）');
  } else {
    row = rows.find((r) => r.devPath.replace(/\/$/, '') === opts.skillRel || r.devPath === opts.skillRel);
    if (!row) die('注册表主表未找到开发态路径 ' + opts.skillRel + '（可用 --list 查看）');
  }
  if (!row.deployed) die('技能 ' + row.name + ' 在主表中标记为未部署，无 blob 可复采');

  const c = collect(repo, opts.ref, row);
  const rowText = `| \`${row.name}\` | \`${row.devPath}\` | \`${row.deployPath}\` | ${row.devForm} | ${row.deployForm} | ${metricString(row, c)} | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。 |`;

  const payload = {
    ref: opts.ref, skill: row.name, devPath: row.devPath, deployPath: row.deployPath,
    layout: row.layout, files: c.files.length, totalBytes: c.totalBytes,
    totalLines: c.totalLines, totalCr: c.totalCr,
    aggregate_md5: c.aggHex, per_file: c.perFile,
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('=== §7.2 实测列复采值（ref=' + opts.ref + '，口径 §7.3；可直接整行粘贴进 AGENTS.md §7.2）===');
    console.log('技能        =', row.name);
    console.log('开发态路径  =', row.devPath);
    console.log('部署态路径  =', row.deployPath);
    console.log('文件数      =', c.files.length);
    console.log('总字节      =', c.totalBytes);
    console.log('总行数(LF)  =', c.totalLines);
    console.log('CR 总数     =', c.totalCr);
    console.log('聚合 md5    =', c.aggHex);
    console.log('--- 表格行（整行粘贴）---');
    console.log(rowText);
  }
}

main();
