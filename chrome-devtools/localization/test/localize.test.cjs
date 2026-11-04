// localization/test/localize.test.cjs
// 本地化工具链单元测试（独立、无外部依赖，使用 Node 内置 assert）。
// 覆盖 apply_localize.cjs 的 SENTINEL、inject/strip 幂等、localizeDescription 行内值与块标量（> / |-）。
// 采用仓库内临时 scratch 文件，测试结束后清理，不污染主文件。
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');

// 动态分配空闲端口，避免硬编码端口偶发占用导致 T11 探针 flake（审计发现）
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const { inject, strip, localizeDescription, gateSubskills, applyGate, isGated, SENTINEL } = require('../apply_localize.cjs');
const { mergeNpmrc } = require('../compat.cjs');                       // F3：并集合并测试
const { mergeIntoMcpJson, syncBrowserUrlPort } = require('../merge_mcp_json.cjs'); // F3：深度合并 env 测试；问题1：端口同步测试
const { probePort, profileLocked, prepareTempProfile, findAnyCdpPort, findTargetCdpPort } = require('../start_helpers.cjs');  // F3：profileLocked/probePort；问题1/2：端口探测与临时 profile 拷贝
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
    const free = await freePort(); // 动态空闲端口，避免硬编码端口偶发占用导致 flake（审计发现）
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

  // --- T13: 根 SKILL.md 注入断言（审计发现：根 SKILL.md 现由 apply_localize 从 _frag_skill_main 重建，应被单测守护）---
  test('根 SKILL.md 注入：哨兵 + 主片段 + 中文 description（幂等）', () => {
    // 用与根 SKILL.md 同构的 scratch 文件验证注入路径（不污染真实根 SKILL.md）
    const scratchRel = 'localization/test/_scratch_root_skill.md';
    const scratchRoot = path.join(REPO, scratchRel);
    extraCleanup.push(scratchRoot);
    fs.writeFileSync(scratchRoot,
      '---\nname: chrome-devtools\nversion: 1\ndescription: "English root description"\n---\n根 SKILL.md 原始正文\n');
    inject(scratchRel, '_frag_skill_main.md');
    localizeDescription(scratchRel, '_frag_skill_main_desc.txt');
    let out = fs.readFileSync(scratchRoot, 'utf8');
    assert.ok(out.includes(SENTINEL), '根 SKILL.md 应含本地化哨兵');
    const fragMain = fs.readFileSync(path.join(FRAG, '_frag_skill_main.md'), 'utf8');
    const firstLine = fragMain.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
    assert.ok(out.includes(firstLine), '根 SKILL.md 应含主片段内容');
    const newDesc = fs.readFileSync(path.join(FRAG, '_frag_skill_main_desc.txt'), 'utf8').trim();
    assert.ok(out.includes(newDesc), '根 SKILL.md description 应被中文化');
    assert.ok(!out.includes('English root description'), '根 SKILL.md 英文原 description 应被替换');
    // 幂等：二次注入不重复哨兵
    inject(scratchRel, '_frag_skill_main.md');
    out = fs.readFileSync(scratchRoot, 'utf8');
    assert.strictEqual(out.split(SENTINEL).length - 1, 1, '根 SKILL.md 注入应幂等（哨兵仅一次）');
    // 剥离还原
    strip(scratchRel);
    out = fs.readFileSync(scratchRoot, 'utf8');
    assert.ok(!out.includes(SENTINEL), '根 SKILL.md 剥离后应无哨兵');
  });

  // --- T14: applyGate 门禁注入（方案③ 回归：全量注入/幂等/补缺/CRLF 行尾保留，审计发现）---
  test('applyGate：全量注入、幂等跳过、部分键补缺、CRLF 行尾保留', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-gate-'));
    extraCleanup.push(dir);
    const f = path.join(dir, 'SKILL.md');
    // 1) 全量注入（LF 源）
    fs.writeFileSync(f, '---\nname: sub\n---\n正文\n', 'utf8');
    assert.strictEqual(applyGate(f), true, '首次注入应返回 true');
    let out = fs.readFileSync(f, 'utf8');
    assert.ok(out.includes('disable-model-invocation: true'), '应注入 disable-model-invocation');
    assert.ok(out.includes('user-invocable: false'), '应注入 user-invocable');
    assert.ok(out.includes('name: sub'), '不应破坏既有 frontmatter 键');
    // 2) 幂等跳过（全量存在返回 false，且不重复）
    assert.strictEqual(applyGate(f), false, '全量存在应跳过返回 false');
    out = fs.readFileSync(f, 'utf8');
    assert.strictEqual(out.split('disable-model-invocation').length - 1, 1, '幂等：不重复注入');
    // 3) 部分键补缺（已存在 user-invocable 时仅补 disable-model-invocation，保留原值）
    fs.writeFileSync(f, '---\nname: sub\nuser-invocable: true\n---\n正文\n', 'utf8');
    applyGate(f);
    out = fs.readFileSync(f, 'utf8');
    assert.ok(out.includes('disable-model-invocation: true'), '应补缺 disable-model-invocation');
    assert.ok(out.includes('user-invocable: true'), '既有 user-invocable 值应保留');
    assert.strictEqual(out.split('user-invocable').length - 1, 1, '补缺不应重复 user-invocable');
    // 4) CRLF 源行尾保留（frontmatter 重建后仍为 CRLF，不产生混合行尾）
    fs.writeFileSync(f, '---\r\nname: sub\r\n---\r\n正文\r\n', 'utf8');
    applyGate(f);
    out = fs.readFileSync(f, 'utf8');
    const fmBlock = out.slice(0, out.indexOf('正文'));
    assert.ok(/\r\n/.test(fmBlock), 'frontmatter 应保留 CRLF 行尾');
    assert.ok(out.includes('disable-model-invocation: true'), 'CRLF 源也应注入门禁');
    assert.ok(!out.includes('---\n'), 'CRLF 源不应引入 LF 边界（避免混合行尾）');
  });

  // --- T14b: isGated 幂等判定（抽公共函数后与 --check 共用）---
  test('isGated：全量存在 true / 缺键 false', () => {
    assert.strictEqual(isGated(['name: sub', 'disable-model-invocation: true', 'user-invocable: false']), true);
    assert.strictEqual(isGated(['name: sub', 'disable-model-invocation: true']), false);
    assert.strictEqual(isGated(['name: sub']), false);
  });

  // --- T14c: gateSubskills 在 upstream/skills 缺失时安全返回 0（主副本最小化场景，无副作用）---
  test('gateSubskills：upstream/skills 缺失时安全返回 0', () => {
    const upstreamSkills = path.join(REPO, 'upstream', 'skills');
    if (fs.existsSync(upstreamSkills)) { console.log('  · 已部署副本（upstream/skills 存在），跳过 T14c 副作用测试'); return; }
    assert.strictEqual(gateSubskills(), 0, '主副本无 upstream/ 时应安全返回 0');
  });

  // --- T15: findAnyCdpPort / findTargetCdpPort（问题1 端口自动探测，mock CDP /json/version 服务）---
  // 起一个最小 HTTP 服务，对任意请求返回 { "User-Agent": <ua>, ... }（模拟 DevTools /json/version 端点）。
  function startMockCdpServer(ua) {
    return new Promise((resolve) => {
      const srv = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 'User-Agent': ua, Browser: 'mock', 'Protocol-Version': '1.3' }));
      });
      srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
  }

  test('findAnyCdpPort：命中任意已响应端口', async () => {
    const srv = await startMockCdpServer('Mozilla/5.0 (Chrome test)');
    const p = srv.address().port;
    try {
      assert.strictEqual(await findAnyCdpPort(p, p), p, '应命中 mock 端口');
    } finally { srv.close(); }
  });

  test('findAnyCdpPort：无响应端口返回 null', async () => {
    const free = await freePort(); // 动态空闲端口，关闭后无响应
    assert.strictEqual(await findAnyCdpPort(free, free), null, '未响应端口应返回 null');
  });

  test('findTargetCdpPort：真实浏览器 UA 命中，WorkBuddy/Electron UA 跳过', async () => {
    const realSrv = await startMockCdpServer('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36');
    const wbSrv = await startMockCdpServer('WorkBuddy/5.9.3 Chrome/138.0.7204.251 Electron/37.10.3');
    const pReal = realSrv.address().port;
    const pWb = wbSrv.address().port;
    try {
      assert.strictEqual(await findTargetCdpPort(pReal, pReal), pReal, '真实浏览器 UA 应命中');
      // WorkBuddy/Electron UA 必须被跳过（避免误连 9222 的 WorkBuddy 自身），返回 null
      assert.strictEqual(await findTargetCdpPort(pWb, pWb), null, 'WorkBuddy/Electron UA 应跳过（返回 null）');
    } finally { realSrv.close(); wbSrv.close(); }
  });

  test('findTargetCdpPort：无 UA 端点视为非目标浏览器（返回 null）', async () => {
    // 返回空 UA 的服务（异常端点）应被排除
    const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'mock' })); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const p = srv.address().port;
    try {
      assert.strictEqual(await findTargetCdpPort(p, p), null, '无 UA 端点应被排除');
    } finally { srv.close(); }
  });

  // --- T16: prepareTempProfile（问题2：全量拷贝真实 User Data 到临时目录，继承登录态不污染）---
  test('prepareTempProfile：全量拷贝、排除锁文件、reused 标志正确、源缺失抛错', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-src-'));
    extraCleanup.push(src);
    fs.writeFileSync(path.join(src, 'Cookies'), 'login-state');
    fs.mkdirSync(path.join(src, 'Default'));
    fs.writeFileSync(path.join(src, 'Default', 'History'), 'h');
    fs.writeFileSync(path.join(src, 'SingletonLock'), 'lock');    // 应被排除
    fs.writeFileSync(path.join(src, 'SingletonCookie'), 'c');     // 应被排除

    // dst 用不存在的子路径（避免预创建导致首次即判定 reused）
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-tmp-'));
    extraCleanup.push(parent);
    const dst = path.join(parent, 'chrome-devtools-profile');

    // 第一次：全新拷贝
    const r1 = prepareTempProfile(src, { dst });
    assert.strictEqual(r1.reused, false, '首次应为全新拷贝');
    assert.strictEqual(r1.path, dst);
    assert.ok(fs.existsSync(path.join(dst, 'Cookies')), '应拷贝 Cookies（登录态）');
    assert.ok(fs.existsSync(path.join(dst, 'Default', 'History')), '应递归拷贝子目录');
    assert.ok(!fs.existsSync(path.join(dst, 'SingletonLock')), 'SingletonLock 应被排除');
    assert.ok(!fs.existsSync(path.join(dst, 'SingletonCookie')), 'SingletonCookie 应被排除');

    // 第二次：复用既有拷贝（不重新拷贝）
    const r2 = prepareTempProfile(src, { dst });
    assert.strictEqual(r2.reused, true, '既有拷贝应被复用');

    // --refresh：强制重新拷贝
    const r3 = prepareTempProfile(src, { dst, refresh: true });
    assert.strictEqual(r3.reused, false, 'refresh 应重新拷贝');
    assert.ok(fs.existsSync(path.join(dst, 'Cookies')), 'refresh 后仍含 Cookies');

    // 源不存在 → 抛错
    let threw = false;
    try { prepareTempProfile(path.join(src, 'nope'), { dst: path.join(os.tmpdir(), 'cdt-none-' + Date.now()) }); }
    catch (e) { threw = true; }
    assert.strictEqual(threw, true, '源不存在应抛错');
  });

  // --- T17: prepareTempProfile 对「被占用/锁文件」跳过而非抛错（回归：实测 EBUSY 不阻断整体拷贝）---
  test('prepareTempProfile：被占用/锁文件跳过而非抛错（实测 EBUSY 不阻断整体拷贝）', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-src-lock-'));
    extraCleanup.push(src);
    fs.writeFileSync(path.join(src, 'ok.txt'), 'keep');
    fs.mkdirSync(path.join(src, 'Sub'));
    fs.writeFileSync(path.join(src, 'Sub', 'ok2.txt'), 'keep2');
    fs.writeFileSync(path.join(src, 'locked.file'), 'busy'); // 模拟被运行中浏览器独占的文件

    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-tmp-lock-'));
    extraCleanup.push(parent);
    const dst = path.join(parent, 'chrome-devtools-profile');

    // 注入：copyFileSync 对 locked.file 抛 EBUSY（模拟 fs.cpSync 在运行中浏览器锁文件处直接抛错的历史缺陷）
    const origCopy = fs.copyFileSync;
    fs.copyFileSync = function (s, d) {
      if (String(s).includes('locked.file')) { const e = new Error('EBUSY'); e.code = 'EBUSY'; throw e; }
      return origCopy(s, d);
    };
    try {
      const r = prepareTempProfile(src, { dst });
      assert.strictEqual(r.reused, false, '首次应为全新拷贝');
      assert.ok(r.skipped >= 1, '被锁文件应被跳过（skipped>=1）');
      assert.ok(fs.existsSync(path.join(dst, 'ok.txt')), '可读文件应被正常拷贝');
      assert.ok(fs.existsSync(path.join(dst, 'Sub', 'ok2.txt')), '子目录可读文件应被递归拷贝');
      assert.ok(!fs.existsSync(path.join(dst, 'locked.file')), '被锁文件应被跳过（不出现于目标）');
      assert.ok(!fs.existsSync(path.join(dst, 'SingletonLock')), '锁文件仍应被排除');
    } finally {
      fs.copyFileSync = origCopy; // 还原，避免影响其它用例
    }
  });

  // --- T18: syncBrowserUrlPort（问题1：把实测端口同步进 ~/.workbuddy/mcp.json，形态一不再连错端口）---
  test('syncBrowserUrlPort：只改写 --browserUrl 端口，保留其它 args / 条目 / env（幂等）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-home-'));
    extraCleanup.push(dir);
    fs.mkdirSync(path.join(dir, '.workbuddy'), { recursive: true });
    const mcpPath = path.join(dir, '.workbuddy', 'mcp.json');
    fs.writeFileSync(mcpPath, JSON.stringify({
      mcpServers: {
        'chrome-devtools': {
          command: 'node',
          args: ['/bin/chrome-devtools-mcp.js', '--browserUrl=http://127.0.0.1:9223', '--no-usage-statistics', '--custom-flag'],
          env: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' },
        },
        'other-server': { command: 'x', args: ['--keep=me'] },
      },
    }, null, 2), 'utf8');

    // 首次：9223 → 9228 应改写，且仅改端口
    const r1 = syncBrowserUrlPort(9228, { home: dir });
    assert.strictEqual(r1.changed, true, '端口不同应触发改写');
    assert.strictEqual(r1.previousPort, 9223, '应记录原端口 9223');
    assert.strictEqual(r1.port, 9228, '应记录新端口 9228');
    const doc = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    const e = doc.mcpServers['chrome-devtools'];
    assert.ok(e.args.includes('--browserUrl=http://127.0.0.1:9228'), 'browserUrl 端口应已更新为 9228');
    assert.ok(e.args.includes('--custom-flag'), '用户自传的其它 args 应保留');
    assert.ok(e.args.includes('--no-usage-statistics'), '既有 args 应保留');
    assert.strictEqual(e.env.CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS, '1', 'env 应保留');
    assert.deepStrictEqual(doc.mcpServers['other-server'], { command: 'x', args: ['--keep=me'] }, '其它 server 条目不应被改动');

    // 幂等：同端口再跑一次不应改写
    const r2 = syncBrowserUrlPort(9228, { home: dir });
    assert.strictEqual(r2.changed, false, '同端口应幂等（changed=false）');
    assert.strictEqual(r2.previousPort, 9228, '应识别当前端口已是 9228');
  });

  // --- T19: prepareTempProfile 登录态完整性判定（missingCritical：站点 Cookie 被独占锁 → 显式告警）---
  test('prepareTempProfile：关键登录态文件被锁时 missingCritical 报出（登录态未完整继承可被感知）', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-src-critical-'));
    extraCleanup.push(src);
    fs.writeFileSync(path.join(src, 'Local State'), '{}');                       // 可读 → 应存在
    fs.mkdirSync(path.join(src, 'Default', 'Network'), { recursive: true });
    fs.writeFileSync(path.join(src, 'Default', 'Login Data'), 'x');              // 可读 → 应存在
    fs.writeFileSync(path.join(src, 'Default', 'Network', 'Cookies'), 'locked'); // 模拟被运行中浏览器独占

    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-tmp-critical-'));
    extraCleanup.push(parent);
    const dst = path.join(parent, 'chrome-devtools-profile');

    const origCopy = fs.copyFileSync;
    fs.copyFileSync = function (s, d) {
      if (String(s).includes('Cookies')) { const e = new Error('EBUSY'); e.code = 'EBUSY'; throw e; }
      return origCopy(s, d);
    };
    try {
      const r = prepareTempProfile(src, { dst });
      assert.ok(r.missingCritical.includes('Default/Network/Cookies'),
        '站点 Cookie 被锁 → 应报为关键缺失（missingCritical）');
      assert.ok(!r.missingCritical.includes('Local State'), '可读的关键文件不应报缺失');
      assert.ok(r.skippedFiles.some(f => f.includes('Cookies')), 'skippedFiles 应记录相对路径');
    } finally {
      fs.copyFileSync = origCopy;
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
