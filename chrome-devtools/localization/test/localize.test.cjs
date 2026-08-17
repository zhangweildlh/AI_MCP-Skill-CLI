// localization/test/localize.test.cjs
// 本地化工具链单元测试（独立、无外部依赖，使用 Node 内置 assert）。
// 覆盖 apply_localize.cjs 的 SENTINEL、inject/strip 幂等、localizeDescription 行内值与块标量（> / |-）。
// 采用仓库内临时 scratch 文件，测试结束后清理，不污染主文件。
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { inject, strip, localizeDescription, SENTINEL } = require('../apply_localize.cjs');
const { mergeNpmrc } = require('../compat.cjs');                       // F3：并集合并测试
const { mergeIntoMcpJson } = require('../merge_mcp_json.cjs');         // F3：深度合并 env 测试
const { probePort, profileLocked } = require('../start_helpers.cjs');  // F3：profileLocked/probePort 测试
const { userDataFor } = require('../verify_browser.cjs');              // F3：userDataFor 测试

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

// 新增测试使用的临时目录（需递归删除）
const extraCleanup = [];

function cleanup() {
  for (const p of scratchPaths) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* noop */ }
  }
  for (const d of extraCleanup) {
    try { if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

// 收集式运行器：支持 async 用例（如 probePort 真实端口探针），任一失败即中止并清理。
let passed = 0;
const tests = [];
function test(name, fn) {
  tests.push(async () => {
    try {
      await fn();
      passed++;
      console.log('  ✓ ' + name);
    } catch (e) {
      console.error('  ✗ ' + name);
      console.error('    ' + (e && e.message));
      throw e;
    }
  });
}

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

  // --- T7: --check 自检模式（防 F-01/F-02 回归：守卫 + 注入目标存在性，无副作用）---
  // 自适应：主副本刻意最小化（upstream/ 为衍生产物、不入库），此时 --check 应被正确守卫拦截
  // （非零退出 + 守卫提示）——这本身是对守卫行为的正向验证，不应误判为测试失败；
  // 已部署 / 已 bootstrap 副本（upstream/ 存在）则 --check 应通过（≥4 个 CHECK-OK）。
  test('apply_localize.cjs --check 行为符合预期（守卫 + 注入目标存在性）', () => {
    const { execFileSync } = require('node:child_process');
    const script = path.join(REPO, 'localization', 'apply_localize.cjs');
    const upstreamPkg = path.join(REPO, 'upstream', 'package.json'); // 方案 A：守卫查 upstream/package.json
    if (!fs.existsSync(upstreamPkg)) {
      // 最小化主副本：验证守卫正确拦截（非零退出 + 守卫提示），而非误报失败。
      try {
        execFileSync('node', [script, '--check'], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
        throw new Error('--check 在 upstream/ 缺失时应非零退出（守卫未生效）');
      } catch (e) {
        const stderr = (e.stderr || e.stdout || '');
        assert.ok(e.status !== 0, '--check 在 upstream/ 缺失时必须非零退出；实际退出码: ' + (e.status ?? '?'));
        assert.ok(/未在仓库内运行|预期 upstream/.test(stderr), '--check 应打印守卫提示；实际:\n' + stderr);
      }
      console.log('  · 最小化主副本：--check 守卫拦截已验证（upstream/ 缺失属预期）');
      return;
    }
    let stdout;
    try {
      stdout = execFileSync('node', [script, '--check'], { encoding: 'utf8' });
    } catch (e) {
      throw new Error('apply_localize.cjs --check 失败（退出码 ' + (e.status ?? '?') + '）：' + (e.stderr || e.stdout || e.message));
    }
    assert.ok(/\[CHECK\] 通过/.test(stdout), '--check 应输出通过标志；实际:\n' + stdout);
    // 3 个注入目标（KNOWN_TARGETS）+ 1 个顶层 SKILL.md 同步源 = 至少 4 个 CHECK-OK
    assert.ok((stdout.match(/\[CHECK-OK\]/g) || []).length >= 4, '--check 应校验至少 4 个目标；实际:\n' + stdout);
  });

  // --- T8: mergeNpmrc 并集合并（F1 回归 + F3 单测）---
  test('mergeNpmrc 并集合并：保留上游独有条目并补齐本地 5 包白名单，不重复', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-npmrc-'));
    extraCleanup.push(dir);
    const p = path.join(dir, '.npmrc');
    fs.writeFileSync(p, [
      'min-release-age=600',
      'allow-scripts[]=some-upstream-only-pkg',
      '',
    ].join('\n'), 'utf8');
    mergeNpmrc(p);
    let out = fs.readFileSync(p, 'utf8');
    // 上游独有条目应保留
    assert.ok(out.includes('allow-scripts[]=some-upstream-only-pkg'), '上游独有 allow-scripts 条目应保留');
    // 本地 5 包白名单应齐备
    const local = ['@google/genai', 'core-js', 'protobufjs', 'puppeteer', 'unrs-resolver'];
    for (const pkg of local) {
      assert.ok(out.includes('allow-scripts[]=' + pkg), '应补齐本地白名单: ' + pkg);
    }
    // 每个本地包恰好出现一次（不重复）
    for (const pkg of local) {
      const needle = 'allow-scripts[]=' + pkg;
      assert.strictEqual(out.split(needle).length - 1, 1, '本地白名单不应重复: ' + pkg);
    }
    // 幂等：二次运行不重复
    mergeNpmrc(p);
    out = fs.readFileSync(p, 'utf8');
    for (const pkg of local) {
      const needle = 'allow-scripts[]=' + pkg;
      assert.strictEqual(out.split(needle).length - 1, 1, '幂等：二次运行不应重复: ' + pkg);
    }
    assert.strictEqual(out.split('allow-scripts[]=some-upstream-only-pkg').length - 1, 1, '幂等：上游独有条目不应重复');
  });

  // --- T9: mergeIntoMcpJson 深度合并嵌套 env（F2 回归 + F3 单测）---
  test('mergeIntoMcpJson 深度合并 env：保留用户既有环境变量与字段', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-mcp-'));
    extraCleanup.push(dir);
    const wb = path.join(dir, '.workbuddy');
    fs.mkdirSync(wb, { recursive: true });
    const existing = {
      mcpServers: {
        'chrome-devtools': {
          disabled: true,
          command: 'node',
          args: ['OLD'],
          env: { HTTPS_PROXY: 'http://proxy:8080', PATH: '/old' },
        },
      },
    };
    fs.writeFileSync(path.join(wb, 'mcp.json'), JSON.stringify(existing), 'utf8');
    const mcp = {
      mcpServers: {
        'chrome-devtools': {
          command: 'node',
          args: ['NEW'],
          env: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' },
        },
      },
    };
    mergeIntoMcpJson(mcp, { home: dir });
    const out = JSON.parse(fs.readFileSync(path.join(wb, 'mcp.json'), 'utf8'));
    const entry = out.mcpServers['chrome-devtools'];
    // 保留用户既有字段（disabled 不应被 incoming 抹掉）
    assert.strictEqual(entry.disabled, true, '应保留用户既有 disabled 字段');
    // 深度合并 env：用户代理与本地化 env 并存（F2 修复验证）
    assert.strictEqual(entry.env.HTTPS_PROXY, 'http://proxy:8080', '应保留用户既有 env（代理）');
    assert.strictEqual(entry.env.PATH, '/old', '应保留用户既有 env（PATH）');
    assert.strictEqual(entry.env.CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS, '1', '应叠加本地化 env');
    // 顶层字段：inc→incoming 覆盖
    assert.deepStrictEqual(entry.args, ['NEW'], 'args 应取 incoming 值');
  });

  // --- T10: profileLocked（F3 单测）---
  test('profileLocked：SingletonLock/SingletonCookie 存在即判定占用', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-prof-'));
    extraCleanup.push(dir);
    assert.strictEqual(profileLocked(dir), false, '无锁文件时应返回 false');
    fs.writeFileSync(path.join(dir, 'SingletonLock'), '');
    assert.strictEqual(profileLocked(dir), true, 'SingletonLock 存在应返回 true');
    fs.rmSync(path.join(dir, 'SingletonLock'));
    assert.strictEqual(profileLocked(dir), false, '移除后应返回 false');
    fs.writeFileSync(path.join(dir, 'SingletonCookie'), '');
    assert.strictEqual(profileLocked(dir), true, 'SingletonCookie 存在应返回 true');
  });

  // --- T11: probePort（F3 单测，真实端口探针）---
  test('probePort：未占用端口返回 false', async () => {
    const free = 65432; // 期望未被占用；ECONNREFUSED → false（真实探针）
    const r = await probePort(free);
    assert.strictEqual(r, false, '未占用端口应返回 false');
  });

  // --- T12: userDataFor（F3 单测）---
  test('userDataFor：360/Chrome 标准位置优先，否则回退 exe 同级 User Data', () => {
    const saved360 = process.env['CHROME_DEVTOOLS_360_DIR'];
    const savedLa = process.env['LOCALAPPDATA'];
    try {
      // 360：CHROME_DEVTOOLS_360_DIR 下存在 User Data → 返回该标准位置
      const d360 = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-360-'));
      extraCleanup.push(d360);
      fs.mkdirSync(path.join(d360, 'User Data'), { recursive: true });
      process.env['CHROME_DEVTOOLS_360_DIR'] = d360;
      const exe360 = path.join(d360, '360chromex.exe');
      assert.strictEqual(userDataFor(exe360, '360Chromex'), path.join(d360, 'User Data'), '360 应返回标准 User Data');

      // 360 但标准位置不存在 → 回退 exe 同级 User Data
      const d360b = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-360b-'));
      extraCleanup.push(d360b);
      process.env['CHROME_DEVTOOLS_360_DIR'] = d360b; // 该目录下无 User Data
      const exe360b = path.join(d360b, '360chromex.exe');
      assert.strictEqual(userDataFor(exe360b, '360Chromex'), path.join(d360b, 'User Data'), '360 标准位置缺失应回退 exe 同级 User Data');

      // Chrome：LOCALAPPDATA 下存在 Google/Chrome/User Data → 返回该标准位置
      const dla = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-la-'));
      extraCleanup.push(dla);
      fs.mkdirSync(path.join(dla, 'Google', 'Chrome', 'User Data'), { recursive: true });
      process.env['LOCALAPPDATA'] = dla;
      const exeChrome = path.join(dla, 'chrome.exe');
      assert.strictEqual(userDataFor(exeChrome, 'Chrome'), path.join(dla, 'Google', 'Chrome', 'User Data'), 'Chrome 应返回 LOCALAPPDATA 标准 User Data');

      // Chrome 但 LOCALAPPDATA 标准位置缺失 → 回退 exe 同级 User Data
      const dlab = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-lab-'));
      extraCleanup.push(dlab);
      process.env['LOCALAPPDATA'] = dlab; // 无 Google/Chrome/User Data
      const exeChromeb = path.join(dlab, 'chrome.exe');
      assert.strictEqual(userDataFor(exeChromeb, 'Chrome'), path.join(dlab, 'User Data'), 'Chrome 标准位置缺失应回退 exe 同级 User Data');
    } finally {
      if (saved360 === undefined) delete process.env['CHROME_DEVTOOLS_360_DIR']; else process.env['CHROME_DEVTOOLS_360_DIR'] = saved360;
      if (savedLa === undefined) delete process.env['LOCALAPPDATA']; else process.env['LOCALAPPDATA'] = savedLa;
    }
  });

  // 顺序执行全部收集到的测试（支持 async，如 probePort 真实端口探针），任一失败即中止并清理。
  (async () => {
    for (const t of tests) {
      try { await t(); }
      catch (e) {
        cleanup();
        console.error('\n[失败] 测试未通过，已清理 scratch 文件。');
        process.exit(1);
      }
    }
    cleanup();
    console.log('\n[通过] 本地化工具链单元测试：' + passed + ' 项全部通过');
    process.exit(0);
  })();
