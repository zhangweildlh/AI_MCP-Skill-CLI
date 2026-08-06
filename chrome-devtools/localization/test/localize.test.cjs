// localization/test/localize.test.cjs
// 本地化工具链单元测试（独立、无外部依赖，使用 Node 内置 assert）。
// 覆盖 apply_localize.cjs 的 SENTINEL、inject/strip 幂等、localizeDescription 行内值与块标量（> / |-）。
// 采用仓库内临时 scratch 文件，测试结束后清理，不污染主文件。
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { inject, strip, localizeDescription, SENTINEL } = require('../apply_localize.cjs');

const REPO = path.resolve(__dirname, '..', '..');
const FRAG = path.join(REPO, 'localization', 'fragments');

// 临时文件（相对 REPO），测试结束删除
const scratchTarget = 'localization/test/_scratch_target.md';
const scratchTarget2 = 'localization/test/_scratch_target2.md';
const scratchFrag = '_scratch_frag.md'; // 位于 FRAG 下
const scratchDesc = '_scratch_desc.txt'; // 位于 FRAG 下

const scratchPaths = [
  path.join(REPO, scratchTarget),
  path.join(REPO, scratchTarget2),
  path.join(FRAG, scratchFrag),
  path.join(FRAG, scratchDesc),
];

function cleanup() {
  for (const p of scratchPaths) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* noop */ }
  }
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.error('  ✗ ' + name);
    console.error('    ' + (e && e.message));
    throw e;
  }
}

try {
  // --- T1: SENTINEL 哨兵常量 ---
  test('SENTINEL 是非空字符串', () => {
    assert.strictEqual(typeof SENTINEL, 'string');
    assert.ok(SENTINEL.length > 0);
  });

  // --- T2: localizeDescription 处理行内值 ---
  test('localizeDescription 替换行内 description', () => {
    fs.writeFileSync(path.join(REPO, scratchTarget),
      '---\nname: t\nversion: 1\ndescription: "旧英文描述"\n---\n正文保持不变\n');
    fs.writeFileSync(path.join(FRAG, scratchDesc), 'description: "新中文描述"');
    localizeDescription(scratchTarget, scratchDesc);
    const out = fs.readFileSync(path.join(REPO, scratchTarget), 'utf8');
    assert.ok(out.includes('description: "新中文描述"'));
    assert.ok(!out.includes('旧英文描述'));
    assert.ok(out.includes('正文保持不变'));
    assert.ok(out.includes('name: t'));
  });

  // --- T3: localizeDescription 处理块标量（指示符同行 `description: >`）---
  test('localizeDescription 替换 `description: >` 块标量（消费缩进行）', () => {
    fs.writeFileSync(path.join(REPO, scratchTarget),
      '---\nname: t\ndescription: >\n  旧块行1\n  旧块行2\n  旧块行3\n---\n正文\n');
    fs.writeFileSync(path.join(FRAG, scratchDesc), 'description: "新块替换"');
    localizeDescription(scratchTarget, scratchDesc);
    const out = fs.readFileSync(path.join(REPO, scratchTarget), 'utf8');
    assert.ok(out.includes('description: "新块替换"'));
    assert.ok(!out.includes('旧块行1'));
    assert.ok(!out.includes('旧块行2'));
    assert.ok(!out.includes('旧块行3'));
    assert.ok(out.includes('正文'));
    assert.ok(!/^\s+旧块/.test(out));
  });

  // --- T3b: localizeDescription 处理块标量（空键 + 缩进块 `description:`）---
  test('localizeDescription 替换空键缩进块标量', () => {
    fs.writeFileSync(path.join(REPO, scratchTarget),
      '---\nname: t\ndescription:\n  旧块A\n  旧块B\n---\n正文B\n');
    fs.writeFileSync(path.join(FRAG, scratchDesc), 'description: "新块替换B"');
    localizeDescription(scratchTarget, scratchDesc);
    const out = fs.readFileSync(path.join(REPO, scratchTarget), 'utf8');
    assert.ok(out.includes('description: "新块替换B"'));
    assert.ok(!out.includes('旧块A'));
    assert.ok(!out.includes('旧块B'));
    assert.ok(out.includes('正文B'));
  });

  // --- T4: inject/strip 幂等 ---
  test('inject 注入、二次 inject 幂等跳过、strip 剥离', () => {
    fs.writeFileSync(path.join(REPO, scratchTarget2), 'ORIGINAL 内容\n');
    fs.writeFileSync(path.join(FRAG, scratchFrag), '片段内容 ABC');
    // 第一次注入
    inject(scratchTarget2, scratchFrag);
    let out = fs.readFileSync(path.join(REPO, scratchTarget2), 'utf8');
    assert.ok(out.includes(SENTINEL));
    assert.ok(out.includes('片段内容 ABC'));
    const count1 = out.split(SENTINEL).length - 1;
    assert.strictEqual(count1, 1);
    // 第二次注入应跳过（幂等）
    inject(scratchTarget2, scratchFrag);
    out = fs.readFileSync(path.join(REPO, scratchTarget2), 'utf8');
    const count2 = out.split(SENTINEL).length - 1;
    assert.strictEqual(count2, 1);
    // 剥离
    strip(scratchTarget2);
    out = fs.readFileSync(path.join(REPO, scratchTarget2), 'utf8');
    assert.ok(!out.includes(SENTINEL));
    assert.ok(!out.includes('片段内容 ABC'));
    assert.ok(out.includes('ORIGINAL 内容'));
  });

  // --- T5: localizeDescription 处理块标量内部含空行（F1 回归）---
  test('localizeDescription 块标量含内部空行时不残留孤立缩进行', () => {
    fs.writeFileSync(path.join(REPO, scratchTarget),
      '---\nname: t\ndescription: >\n  行1\n  行2\n\n  行3\nother_key: value\n---\n正文\n');
    fs.writeFileSync(path.join(FRAG, scratchDesc), 'description: "新中文描述"');
    localizeDescription(scratchTarget, scratchDesc);
    let out = fs.readFileSync(path.join(REPO, scratchTarget), 'utf8');
    assert.ok(out.includes('description: "新中文描述"'));
    // 块标量内部空行后的"行3"必须被整体消费，不得残留为孤立缩进行
    assert.ok(!out.includes('行1'));
    assert.ok(!out.includes('行2'));
    assert.ok(!out.includes('行3'));
    assert.ok(out.includes('other_key: value'));
    assert.ok(out.includes('正文'));
    assert.ok(!/^\s+行/.test(out));
    // 幂等：二次本地化不应重复或腐蚀
    localizeDescription(scratchTarget, scratchDesc);
    out = fs.readFileSync(path.join(REPO, scratchTarget), 'utf8');
    assert.ok(out.includes('description: "新中文描述"'));
    assert.strictEqual(out.split('description: "新中文描述"').length - 1, 1);
    assert.ok(!/^\s+行/.test(out));
  });

  // --- T6: genMcpConfig 模板含 --browserUrl 与 --no-update-checks env（F5 回归）---
  test('MCP 配置模板含 --browserUrl 与 CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS env', () => {
    const tpl = fs.readFileSync(path.join(FRAG, '_frag_mcp_config.json'), 'utf8');
    assert.ok(tpl.includes('--browserUrl'));
    assert.ok(tpl.includes('CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS'));
  });

  cleanup();
  console.log('\n[通过] 本地化工具链单元测试：' + passed + ' 项全部通过');
  process.exit(0);
} catch (e) {
  cleanup();
  console.error('\n[失败] 测试未通过，已清理 scratch 文件。');
  process.exit(1);
}
