#!/usr/bin/env node
/**
 * 仓库级唯一「开发态 → 部署态」同步器（零第三方依赖，仅用 Node 内置模块）。
 *
 * 定位（AGENTS.md §7.6）：本文件是本仓库所有 Skill 开发态副本覆盖部署到部署态副本的
 * **唯一入口**。各 Skill 不再自建同步实现，涉及同步需求一律调用本脚本。
 *
 * 单一事实源：技能映射不在本文件硬编码，运行时从 AGENTS.md §7.2 映射表解析。
 * 注册表若与部署态目录不一致，脚本报错而不猜测。
 *
 * 为什么从 git blob 而不是直接拷贝工作树：
 *   ① 内容权威性：部署态以指定提交的 git blob 为唯一权威内容源，避免把未提交差异、
 *      本地专有物或调试残留带进部署态；
 *   ② 行尾确定性：仓库根 `.gitattributes` 声明 `* text=auto eol=lf`，blob 恒为 LF，
 *      逐字节重建后部署态亦恒为 LF（§7.3 三项判据）。
 *
 * 参数化 / 跨机可移植：仓库根按脚本位置运行时上溯 `.git`；部署态根按
 *   --to > 环境变量 WORKBUDDY_SKILLS_DIR > os.homedir()/.workbuddy/skills 依次解析；
 * 不写死用户名、盘符、绝对路径。所有能力以参数组合调用，不靠改脚本适配新需求。
 *
 * 能力（可组合）：
 *   sync     默认，从 blob 逐字节重建部署态（只写、不删）
 *   verify   只校验三项判据，不写盘
 *   plan     只输出将写入 / 保留 / 跳过的清单（等价 --dry-run）
 *   expand   同步后执行项目级 deploy-manifest.json 声明的展开 / 衍生 / 下载钩子
 *   prune    修剪部署态中不属于开发态的文件（**仅在 manifest 显式启用时允许**）
 *
 * 项目级下沉：技能开发态目录内可放置可选的 `deploy-manifest.json`，字段
 *   preserve : string[]  部署态专有物相对路径，写入时跳过（默认空）
 *   exclude  : string[]  开发态中不部署的相对路径前缀（默认空）
 *   prune    : { enabled: boolean, keep: string[] }
 *   expand   : { command: string, args: string[] }[]  post-sync 顺序执行
 * 无 manifest 时的默认行为：全量 blob 重建、只写不删、不执行任何外部命令。
 *
 * 用法：
 *   node scripts/deploy-skill.cjs --skill <name> [选项]
 *   node scripts/deploy-skill.cjs --all [选项]
 *   node scripts/deploy-skill.cjs --list
 *
 * 选项：
 *   --repo <路径>        仓库根（默认运行时上溯 .git）
 *   --ref <引用>         内容来源（默认 main）
 *   --to <路径>          部署态 skills 根（默认见上文探查顺序）
 *   --skill <name>       指定单个技能；--all 为全部已部署技能
 *   --exclude <前缀>     追加排除开发态相对路径前缀（可重复，叠加 manifest.exclude）
 *   --dry-run / --plan   预演，不写盘
 *   --verify             三项判据校验，不写盘
 *   --expand             执行项目级展开钩子
 *   --prune              执行修剪（须 manifest.prune.enabled=true）
 *   --json               以格式化 JSON 输出结果
 *   --list               列出注册表全部条目后退出
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const REGISTRY_HEADING = '## 7 ';
const REGISTRY_TABLE_ANCHOR = '| name |';
const DEFAULT_REF = 'main';

function die(msg) {
  console.error('[错误] ' + msg);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    repo: '', ref: DEFAULT_REF, to: '', skill: '', all: false, excludes: [],
    mode: 'sync', expand: false, prune: false, json: false, list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') opts.repo = argv[++i] || '';
    else if (a === '--ref') opts.ref = argv[++i] || DEFAULT_REF;
    else if (a === '--to') opts.to = argv[++i] || '';
    else if (a === '--skill') opts.skill = argv[++i] || '';
    else if (a === '--exclude') opts.excludes.push(argv[++i] || '');
    else if (a === '--all') opts.all = true;
    else if (a === '--dry-run' || a === '--plan') opts.mode = 'plan';
    else if (a === '--verify') opts.mode = 'verify';
    else if (a === '--expand') opts.expand = true;
    else if (a === '--prune') opts.prune = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--list') opts.list = true;
    else if (a === '-h' || a === '--help') {
      const doc = fs.readFileSync(__filename, 'utf8').split('*/')[0]
        .replace(/^#![^\n]*\n/, '').replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, '');
      console.log(doc);
      process.exit(0);
    } else die('未知参数：' + a);
  }
  if (!opts.list && !opts.all && !opts.skill) die('须指定 --skill <name> 或 --all（或用 --list 查看注册表）');
  if (opts.skill && opts.all) die('--skill 与 --all 不可同时使用');
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

function skillsRoot(opts) {
  if (opts.to) return path.resolve(opts.to);
  if (process.env.WORKBUDDY_SKILLS_DIR) return path.resolve(process.env.WORKBUDDY_SKILLS_DIR);
  return path.join(os.homedir(), '.workbuddy', 'skills');
}

/**
 * 解析 AGENTS.md §7.2「开发态 ↔ 部署态映射表」。
 * 只取前三列（均为反引号包裹的单一值），避开实测/判定列中的复杂文本。
 * 开发态列含删除线（已移除）或部署态列以「无」开头者判为未部署，跳过。
 */
function parseRegistry(agentsPath) {
  const text = fs.readFileSync(agentsPath, 'utf8');
  const lines = text.split(/\r?\n/);
  let inSection7 = false;
  const rows = [];
  // 各列允许在反引号值后附补充说明（如「（合集目录内子 Skill）」），故以 [^|]* 吃掉余下文字。
  const rowRe = /^\s*\|\s*`([^`]+)`[^|]*\|\s*`([^`]+)`[^|]*\|\s*`([^`]+)`[^|]*\|/;
  for (const line of lines) {
    if (line.startsWith('## ')) inSection7 = line.startsWith(REGISTRY_HEADING);
    if (!inSection7) continue;
    if (line.startsWith(REGISTRY_TABLE_ANCHOR)) continue;
    const m = line.match(rowRe);
    if (!m) continue;
    const name = m[1].trim();
    const devPath = m[2].trim();
    const deployDir = m[3].trim();
    const removed = /~~/.test(line.split('|')[2] || '') || /^\*\*无|^无对应/.test(line.split('|')[3] || '');
    rows.push({
      name,
      devPath,
      deployDir,
      layout: devPath.endsWith('.md') ? 'single' : 'dir',
      deployed: !removed,
    });
  }
  return rows;
}

/** 从开发态 blob 读取 YAML frontmatter 的 name 字段（单文件型读该 .md，目录型读 SKILL.md）。 */
function readNameFromBlob(repo, ref, devPath, layout) {
  const target = layout === 'single' ? devPath : devPath.replace(/\/$/, '') + '/SKILL.md';
  let buf;
  try {
    buf = gitBuf(repo, ['cat-file', 'blob', ref + ':' + target]);
  } catch (e) {
    die('无法读取技能主定义文件 ' + target + '（' + e.message + '）');
  }
  const head = buf.toString('utf8').split(/\r?\n/).slice(0, 40);
  for (const line of head) {
    const m = line.match(/^name:\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

/**
 * 部署形态差异配置，两处按优先级加载（均非映射登记，映射唯一事实源恒为 AGENTS.md §7.2）：
 *   ① 技能开发态目录内 deploy-manifest.json（项目级下沉，优先）；
 *   ② 仓库 scripts/deploy-manifest.json 中按技能名索引的条目（集中兜底）。
 * 命令行 --exclude 叠加在二者之上。
 */
function loadManifest(repo, devPath, layout, skillName, cliExcludes) {
  const dir = layout === 'single'
    ? path.join(repo, path.dirname(devPath))
    : path.join(repo, devPath);
  const local = path.join(dir, 'deploy-manifest.json');
  const central = path.join(repo, 'scripts', 'deploy-manifest.json');
  let raw = null;
  let used = '';
  if (fs.existsSync(local)) {
    raw = JSON.parse(fs.readFileSync(local, 'utf8'));
    used = local;
  } else if (fs.existsSync(central)) {
    try {
      const all = JSON.parse(fs.readFileSync(central, 'utf8'));
      if (all && all[skillName]) { raw = all[skillName]; used = central + '#' + skillName; }
    } catch (e) {
      die('scripts/deploy-manifest.json 解析失败（' + e.message + '）');
    }
  }
  let manifest = { preserve: [], exclude: [], expand: [], prune: { enabled: false, keep: [] } };
  try {
    if (raw) {
      manifest = {
        preserve: Array.isArray(raw.preserve) ? raw.preserve : [],
        exclude: Array.isArray(raw.exclude) ? raw.exclude : [],
        expand: Array.isArray(raw.expand) ? raw.expand : [],
        prune: raw.prune && raw.prune.enabled ? raw.prune : { enabled: false, keep: [] },
      };
    }
  } catch (e) {
    die('部署形态差异配置解析失败：' + used + '（' + e.message + '）');
  }
  manifest.exclude = [...manifest.exclude, ...cliExcludes];
  return manifest;
}

function isExcluded(rel, patterns) {
  return patterns.some((p) => rel === p || rel.startsWith(p.replace(/\/$/, '') + '/'));
}

function listBlobFiles(repo, ref, devPath, layout) {
  if (layout === 'single') return [{ repo: devPath, rel: 'SKILL.md' }];
  const out = git(repo, ['ls-tree', '-r', '--name-only', ref, '--', devPath], 'utf8');
  const prefix = devPath.replace(/\/$/, '') + '/';
  return String(out).split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ repo: f, rel: f.slice(prefix.length) }));
}

function blobSha(repo, ref, file) {
  return String(git(repo, ['rev-parse', ref + ':' + file], 'utf8')).trim();
}

function hashObject(repo, file) {
  return String(git(repo, ['hash-object', '--no-filters', file], 'utf8')).trim();
}

function crCount(buf) {
  let n = 0;
  for (const b of buf) if (b === 0x0d) n++;
  return n;
}

function log(opts, msg) {
  if (!opts.json) console.log(msg);
}

function processSkill(repo, root, row, opts, results) {
  const item = { name: row.name, devPath: row.devPath, deployDir: row.deployDir, layout: row.layout };
  const yamlName = readNameFromBlob(repo, opts.ref, row.devPath, row.layout);
  if (yamlName !== row.name) {
    die('技能 name 校验失败：' + row.name + ' 的主定义文件 name=' + (yamlName || '<缺失>') +
      '，与注册表第一列不一致（AGENTS.md §7.6：部署态目录名 = 主定义文件 YAML name）');
  }
  const manifest = loadManifest(repo, row.devPath, row.layout, row.name, opts.excludes);
  // 单文件型：注册表部署态列形如 `<name>/SKILL.md`（目录 + 主定义文件名），目录型仅目录。
  if (row.layout === 'single' && path.basename(row.deployDir) !== 'SKILL.md') {
    die('单文件型技能 ' + row.name + ' 的部署态列应以 SKILL.md 结尾，实际为 ' + row.deployDir);
  }
  const target = row.layout === 'single'
    ? path.join(root, path.dirname(row.deployDir))
    : path.join(root, row.deployDir);
  const files = listBlobFiles(repo, opts.ref, row.devPath, row.layout)
    .filter((f) => !isExcluded(f.rel, manifest.exclude));
  if (files.length === 0) die('引用 ' + opts.ref + ' 下未找到 ' + row.devPath + ' 的任何文件');

  item.target = target;
  item.files = files.length;
  item.written = 0;
  item.unchanged = 0;
  item.preserved = 0;
  item.verify = { total: files.length, byteEqual: 0, shaEqual: 0, crZero: 0, bad: [] };

  for (const f of files) {
    const dest = path.join(target, ...f.rel.split('/'));
    const buf = gitBuf(repo, ['cat-file', 'blob', opts.ref + ':' + f.repo]);
    if (manifest.preserve.includes(f.rel)) {
      item.preserved++;
      log(opts, '  ○ ' + f.rel + '（部署态专有物，保留不覆盖）');
      continue;
    }
    const exists = fs.existsSync(dest);
    const same = exists && fs.readFileSync(dest).equals(buf);
    if (opts.mode === 'plan') {
      item.written++;
      log(opts, '  → ' + f.rel + '（' + buf.length + ' 字节，将' + (same ? '跳过（未变化）' : exists ? '覆盖' : '新建') + '）');
      continue;
    }
    if (opts.mode === 'sync' && !same) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      item.written++;
      log(opts, '  ✓ ' + f.rel + '（' + buf.length + ' 字节，' + (exists ? '已覆盖' : '新建') + '）');
    } else if (same) {
      item.unchanged++;
      log(opts, '  = ' + f.rel + '（未变化）');
    }

    // 三项判据（§7.3）：逐字节 == blob / hash-object --no-filters == blob sha / CR = 0
    const onDisk = fs.existsSync(dest) ? fs.readFileSync(dest) : Buffer.alloc(0);
    const okByte = onDisk.equals(buf);
    const okSha = onDisk.length === buf.length && hashObject(repo, dest) === blobSha(repo, opts.ref, f.repo);
    const okCr = crCount(onDisk) === 0;
    if (okByte) item.verify.byteEqual++;
    if (okSha) item.verify.shaEqual++;
    if (okCr) item.verify.crZero++;
    if (!(okByte && okSha && okCr)) item.verify.bad.push(f.rel);
  }

  if (opts.prune) {
    if (!manifest.prune.enabled) die('拒绝修剪：' + row.name + ' 的 deploy-manifest.json 未启用 prune.enabled');
    const keep = new Set([...files.map((f) => f.rel), ...manifest.preserve, ...(manifest.prune.keep || [])]);
    const walk = (dir, rel) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), r);
        else if (!keep.has(r)) {
          if (opts.mode === 'sync') fs.rmSync(path.join(dir, e.name), { force: true });
          log(opts, '  ✂ ' + r + '（修剪' + (opts.mode === 'sync' ? '' : '·预演') + '）');
        }
      }
    };
    if (fs.existsSync(target)) walk(target, '');
  }

  if (opts.expand && manifest.expand.length > 0) {
    for (const step of manifest.expand) {
      if (opts.mode !== 'sync') { log(opts, '  ⤷ 展开钩子（预演跳过）：' + step.command); continue; }
      const r = spawnSync(step.command, step.args || [], { cwd: path.join(repo, path.dirname(row.devPath)), stdio: 'inherit', shell: false });
      if (r.status !== 0) die('展开钩子失败：' + step.command + '（exit=' + r.status + '）');
    }
  }
  results.push(item);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repo = opts.repo ? path.resolve(opts.repo) : findRepoRoot(__dirname);
  if (!repo || !fs.existsSync(path.join(repo, '.git'))) die('未找到 Git 仓库根，请用 --repo 指定');
  const agentsPath = path.join(repo, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) die('未找到 AGENTS.md（§7.2 注册表缺失），拒绝猜测映射');
  const rows = parseRegistry(agentsPath).filter((r) => r.deployed);
  if (rows.length === 0) die('§7.2 注册表未解析出任何已部署条目，请检查表头格式');

  if (opts.list) {
    const out = rows.map((r) => ({ name: r.name, devPath: r.devPath, deployDir: r.deployDir, layout: r.layout }));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const root = skillsRoot(opts);
  const selected = opts.all ? rows : rows.filter((r) => r.name === opts.skill);
  if (selected.length === 0) die('注册表中未找到技能 ' + opts.skill + '（可用 --list 查看）');

  const results = [];
  for (const row of selected) {
    log(opts, '════ ' + row.name + ' ｜ ' + row.devPath + ' → ' + path.join(root, row.deployDir) + ' ｜ ' + opts.mode + ' ════');
    processSkill(repo, root, row, opts, results);
  }

  const summary = {
    ref: opts.ref,
    mode: opts.mode,
    skillsRoot: root,
    skills: results.length,
    written: results.reduce((n, r) => n + r.written, 0),
    unchanged: results.reduce((n, r) => n + r.unchanged, 0),
    preserved: results.reduce((n, r) => n + r.preserved, 0),
    verifyBad: results.reduce((n, r) => n + r.verify.bad.length, 0),
    items: results,
  };
  if (opts.json) console.log(JSON.stringify(summary, null, 2));
  else console.log('\n汇总：技能 ' + summary.skills + ' / 写入 ' + summary.written + ' / 未变化 ' +
    summary.unchanged + ' / 保留 ' + summary.preserved + ' / 校验不一致 ' + summary.verifyBad);
  if (summary.verifyBad > 0) die('§7.3 三项判据存在不一致，详见上述明细');
}

main();
