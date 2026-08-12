// localization/apply_localize.cjs
// 幂等本地化注入：将 fragments/ 中的本地化段追加到仓库对应文件，并生成配置。
// 仓库根 = 本脚本上级目录（按脚本位置相对解析，跨机可用，不依赖绝对路径）。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const FRAG = path.join(__dirname, 'fragments');
const SENTINEL = '<!-- LOCALIZED:360Chromex -->';

// 已知注入目标清单（写死，A2）：这些目标是本地化设计的合法注入点；若缺失，
// 视为"主副本→部署副本失同步"（如主副本新增子技能后漏跑 mirror_to_target.cjs），
// 必须明确告警（而非与普通缺失一样静默跳过）。如需新增注入目标，在此扩展。
const KNOWN_TARGETS = new Set([
  'skills/chrome-devtools/SKILL.md',
  'skills/chrome-devtools-cli/SKILL.md',
  'README.md',
]);

function readConfig() {
  const p = path.join(REPO, 'local-config.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}
function writeConfig(cfg) {
  fs.writeFileSync(path.join(REPO, 'local-config.json'), JSON.stringify(cfg, null, 2), 'utf8');
}

function inject(targetRel, fragFile) {
  const target = path.join(REPO, targetRel);
  const frag = path.join(FRAG, fragFile);
  if (!fs.existsSync(target)) {
    if (KNOWN_TARGETS.has(targetRel)) console.warn('[警告] 已知注入目标缺失（可能主副本→部署副本失同步，请先运行 node mirror_to_target.cjs）: ' + targetRel);
    else console.log('[跳过] 目标不存在: ' + targetRel);
    return;
  }
  if (!fs.existsSync(frag)) { console.log('[跳过] 片段不存在: ' + fragFile); return; }
  const content = fs.readFileSync(target, 'utf8');
  if (content.includes(SENTINEL)) { console.log('[已注入] 跳过: ' + targetRel); return; }
  const fragContent = fs.readFileSync(frag, 'utf8').trimEnd();
  const out = content.replace(/\s*$/, '') + '\n\n---\n\n' + SENTINEL + '\n\n' + fragContent + '\n';
  fs.writeFileSync(target, out, 'utf8');
  console.log('[已注入] ' + targetRel);
}

// 剥离已注入的本地化段（哨兵行到文件末尾），用于上游更新后"刷新"重注入。
function strip(targetRel) {
  const target = path.join(REPO, targetRel);
  if (!fs.existsSync(target)) {
    if (KNOWN_TARGETS.has(targetRel)) console.warn('[警告] 已知注入目标缺失（可能主副本→部署副本失同步，请先运行 node mirror_to_target.cjs）: ' + targetRel);
    else console.log('[跳过] 目标不存在: ' + targetRel);
    return;
  }
  const content = fs.readFileSync(target, 'utf8');
  if (!content.includes(SENTINEL)) { console.log('[无哨兵] 跳过: ' + targetRel); return; }
  const idx = content.indexOf(SENTINEL);
  const before = content.slice(0, idx).replace(/\n*---\s*$/, '').replace(/\s*$/, '');
  fs.writeFileSync(target, before + '\n', 'utf8');
  console.log('[已剥离] ' + targetRel);
}

// 本地化 YAML frontmatter 的 description（幂等，兼容行内值与块标量 > / |-）。
// 片段文件内容为完整 description 行（含 "description:" 键与引号）。
function localizeDescription(targetRel, descFile) {
  const target = path.join(REPO, targetRel);
  const frag = path.join(FRAG, descFile);
  if (!fs.existsSync(target)) {
    if (KNOWN_TARGETS.has(targetRel)) console.warn('[警告] 已知注入目标缺失（可能主副本→部署副本失同步，请先运行 node mirror_to_target.cjs）: ' + targetRel);
    else console.log('[跳过] 目标不存在: ' + targetRel);
    return;
  }
  if (!fs.existsSync(frag)) { console.log('[跳过] 描述片段不存在: ' + descFile); return; }
  const newLine = fs.readFileSync(frag, 'utf8').trimEnd();
  const content = fs.readFileSync(target, 'utf8');

  // 仅作用于 frontmatter（首个 --- ... --- 块），避免误伤正文。
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);  // 兼容 CRLF：用 \r?\n 完整吃掉行尾（避免只吃 \r 残留尾随 \r 导致行末 $ 锚定失败）
  if (!fm) { console.log('[跳过] 无 frontmatter: ' + targetRel); return; }
  const fmStart = fm.index;
  const fmEnd = fmStart + fm[0].length;
  const fmLines = fm[1].split(/\r?\n/);  // 兼容 CRLF：子技能 SKILL.md 为 \r\n 行尾

  let replaced = false;
  const outLines = [];
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    const m = line.match(/^description:\s*(.*)$/);
    if (m && !replaced) {
      const inlineVal = m[1].trim();
      // 块标量两种写法：① `description:` 后行为缩进块；② `description: >` / `description: |-` 指示符同行
      const isBlockScalar = inlineVal === '' || /^[-+]*[>|][-+]*$/.test(inlineVal);
      if (isBlockScalar) {
        // 消费后续"缩进行或空行"：YAML 块标量内部的空白行属于内容一部分，必须一并消费；
        // 否则空行会提前终止消费，导致残留的缩进行成为孤立 frontmatter 键，下次 --strip+重注入会损坏 SKILL.md（F1）。
        let j = i + 1;
        while (j < fmLines.length && (fmLines[j].trim() === '' || /^\s/.test(fmLines[j]))) j++;
        outLines.push(newLine);
        i = j - 1;
      } else {
        outLines.push(newLine);
      }
      replaced = true;
      continue;
    }
    outLines.push(line);
  }
  if (!replaced) { console.log('[跳过] 无 description 行: ' + targetRel); return; }

  const newFm = outLines.join('\n');
  const newContent = content.slice(0, fmStart) + '---\n' + newFm + '\n---' + content.slice(fmEnd);
  if (newContent === content) { console.log('[已本地化] description: ' + targetRel); return; }
  fs.writeFileSync(target, newContent, 'utf8');
  console.log('[已本地化] description -> ' + targetRel);
}

function npmGlobalRoot() { return execSync('npm root -g', { encoding: 'utf8' }).trim(); }
function genMcpConfig() {
  const tpl = path.join(FRAG, '_frag_mcp_config.json');
  if (!fs.existsSync(tpl)) { console.log('[跳过] MCP 模板缺失'); return; }
  let json = fs.readFileSync(tpl, 'utf8');
  const bin = path.join(npmGlobalRoot(), 'chrome-devtools-mcp', 'build', 'src', 'bin', 'chrome-devtools-mcp.js');
  json = json.replace(/__GLOBAL_BIN__/g, bin.replace(/\\/g, '\\\\'));
  fs.writeFileSync(path.join(REPO, 'mcp-local-config.json'), json, 'utf8');
  console.log('[已写入] mcp-local-config.json (globalBin=' + bin + ')');
}

function main() {
  if (!fs.existsSync(path.join(REPO, 'package.json'))) {
    console.error('未在仓库内运行，预期仓库根: ' + REPO);
    process.exit(1);
  }

  // 上游更新后刷新：先剥离旧本地化段，后续再重跑本脚本重新注入。
  if (process.argv.includes('--strip')) {
    strip('skills/chrome-devtools/SKILL.md');
    strip('skills/chrome-devtools-cli/SKILL.md');
    strip('README.md');
    console.log('\n[完成] 已剥离本地化段。请运行 `node localization/apply_localize.cjs` 重新注入最新片段。');
    process.exit(0);
  }

  inject('skills/chrome-devtools/SKILL.md', '_frag_skill_main.md');
  inject('skills/chrome-devtools-cli/SKILL.md', '_frag_skill_cli.md');
  inject('README.md', '_frag_readme_local.md');
  localizeDescription('skills/chrome-devtools/SKILL.md', '_frag_skill_main_desc.txt');
  localizeDescription('skills/chrome-devtools-cli/SKILL.md', '_frag_skill_cli_desc.txt');
  genMcpConfig();

  // 同步顶层 SKILL.md：使本文件夹自描述、拷贝即走（无需先跑 mirror_to_target.cjs）
  const mainSkill = path.join(REPO, 'skills', 'chrome-devtools', 'SKILL.md');
  const topSkill = path.join(REPO, 'SKILL.md');
  if (fs.existsSync(mainSkill)) { fs.copyFileSync(mainSkill, topSkill); console.log('[已同步] 顶层 SKILL.md（自描述入口）'); }

  const cfg = readConfig();
  // 不在源码写死机器路径（RC-B）：
  // - browserPath 缺失时不预设绝对默认，交由 verify_browser.cjs 检测写入；
  // - browserUserDataDir 缺失时从 browserPath 同级推导；
  // - 仅 debugPort 给中性默认值。
  if (!cfg.browserPath) {
    console.warn('[警告] local-config.json 缺少 browserPath，请先运行 node localization/verify_browser.cjs 自动检测写入。');
  }
  if (!cfg.browserUserDataDir && cfg.browserPath) {
    cfg.browserUserDataDir = path.join(path.dirname(cfg.browserPath), 'User Data');
  }
  if (!cfg.debugPort) cfg.debugPort = 9222;
  writeConfig(cfg);

  console.log('\n[完成] 本地化注入与配置生成完毕。');
}

// 支持作为模块被测试 require（不触发副作用执行）
module.exports = { inject, strip, localizeDescription, genMcpConfig, SENTINEL };
if (require.main === module) main();
