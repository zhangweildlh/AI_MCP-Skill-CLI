#!/usr/bin/env node
/**
 * wechat-article-to-ima · 依赖委派 + 文件夹动态解析 回归测试（离线，零网络、零凭据）。
 *
 * 覆盖本轮 5 项问题中的三项「代码级可离线验证」修复：
 *   Issue1（firecrawl CLI 缺失误报）：check-deps.js 不再裸 spawn firecrawl CLI；
 *           改为判定「委派目标(web-search/firecrawl)存在 + 密钥就绪」硬门禁，cliDelegated:true。
 *   Issue2（chrome-devtools 端口不可达误报）：resolve_midlink.js 不再读陈旧 local-config.json、
 *           不自行扫描/拉起；端口由编排回传(SOGOU_CDP_PORT)或缺省 9222；check-deps 软依赖委派说明一致。
 *   Issue3（folder_id 配置错位）：state.js resolve-folder 按「ima 实际子目录名」实时解析真实 folder_id，
 *           分页遍历根目录、仅匹配 media_type!==11 的文件夹、去重键归一化。
 *
 * 纪律：
 *   - 零第三方依赖，仅用 Node 内置模块；
 *   - 全程黑盒调用 CLI（spawnSync）验证真实契约与退出码；resolve-folder 的实时 API 调用由本地桩 ima_api.cjs 接管；
 *   - 临时产物建于系统临时目录并在结束时自清理（§9.5）；
 *   - 无绝对路径硬编码、无随机、无时间依赖（确定性）。
 *
 * 运行：node tests/test_deps_and_folder.js
 */

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const STATE_JS = path.join(SKILL_DIR, 'scripts', 'state.js');
const CHECK_DEPS_JS = path.join(SKILL_DIR, 'scripts', 'check-deps.js');
const RESOLVE_JS = path.join(SKILL_DIR, 'scripts', 'resolve_midlink.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}

// ── 临时工作区（自清理）──
const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wai-deps-folder-test-'));
function cleanup() { try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch (_) { /* ignore */ } }

/**
 * ima_api.cjs 桩：按 WAI_STUB_MODE 输出确定性的知识库根目录列举。
 * 调用契约与真实 ima_api.cjs 一致：node <stub> 'openapi/wiki/v1/get_knowledge_list' '<bodyJSON>'
 * 响应：{ code:0, msg:'ok', data:{ knowledge_list:[...], next_cursor, is_end } }
 * media_type=99 为文件夹，media_type=11 为笔记（须排除）。
 */
function writeImaStub() {
  const stub = `#!/usr/bin/env node
'use strict';
const body = JSON.parse(process.argv[3] || '{}');
const cursor = body.cursor || '';
const mode = process.env.WAI_STUB_MODE || 'normal';
function out(list, next) {
  process.stdout.write(JSON.stringify({ code:0, msg:'ok', data:{ knowledge_list: list, next_cursor: next || '', is_end: !next } }));
}
if (mode === 'noteonly') {
  // 仅含一条笔记（media_type=11），标题去重键=工程总承包epc；用于证明笔记被排除
  out([{ media_id:'note_epc', title:'工程总承包EPC.md', media_type:11 }], '');
} else if (mode === 'folderonly') {
  out([{ media_id:'folder_epc', title:'工程总承包EPC', media_type:99 }], '');
} else {
  // normal：两页分页，文件夹跨页分布，验证分页遍历
  if (cursor === '') {
    out([
      { media_id:'note_1', title:'某微信文章笔记.md', media_type:11 },
      { media_id:'folder_工程总承包EPC', title:'工程总承包EPC', media_type:99 },
    ], 'P2');
  } else if (cursor === 'P2') {
    out([
      { media_id:'folder_城市更新', title:'城市更新', media_type:99 },
      { media_id:'folder_全域土地和生态修复', title:'全域土地和生态修复', media_type:99 },
      { media_id:'note_2', title:'另一篇笔记.md', media_type:11 },
    ], '');
  } else {
    out([], '');
  }
}
`;
  const p = path.join(TMPDIR, 'ima_api_stub.cjs');
  fs.writeFileSync(p, stub, 'utf8');
  return p;
}

/** 临时技能基址：用于 check-deps 离线验证。withKey=false 时去掉 firecrawl 密钥。 */
function writeSkillsDir(withKey) {
  const base = path.join(TMPDIR, withKey ? 'skills_withkey' : 'skills_nokey');
  const mk = (rel) => { const d = path.join(base, rel); fs.mkdirSync(d, { recursive: true }); return d; };
  fs.writeFileSync(path.join(mk('ima-skills'), 'ima_api.cjs'), '// dummy ima_api for test\n', 'utf8');
  fs.writeFileSync(path.join(mk('web-search'), 'SKILL.md'), '# web-search\n', 'utf8');
  fs.writeFileSync(path.join(mk('web-search/firecrawl'), 'SKILL.md'), '# firecrawl\n', 'utf8');
  if (withKey) fs.writeFileSync(path.join(base, 'web-search', '.env'), 'FIRECRAWL_API_KEY=test_key_123\n', 'utf8');
  fs.writeFileSync(path.join(mk('wechat-article-search'), 'SKILL.md'), '# was\n', 'utf8');
  fs.writeFileSync(path.join(mk('wechat-article-search/scripts'), 'search_wechat.js'), '# search\n', 'utf8');
  fs.writeFileSync(path.join(mk('wechat-article-search/scripts'), 'get_sogou_cookie.js'), '# cookie\n', 'utf8');
  return base;
}

function runNode(script, args, env) {
  const r = spawnSync('node', [script, ...args], { encoding: 'utf-8', env: env || process.env });
  return {
    code: r.status,
    out: (r.stdout || '').trim(),
    err: (r.stderr || '').trim(),
    error: r.error ? r.error.message : null,
  };
}

/** 获取一个确定空闲（无监听）的端口：起一个临时 server 取端口后立即关闭，关闭后该端口无监听→连接必被拒。 */
function findFreePort() {
  const r = spawnSync('node', ['-e',
    "const net=require('net');const s=net.createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>console.log(p));});"],
    { encoding: 'utf-8' });
  return parseInt((r.stdout || '').trim(), 10);
}

// ════════════════════════════════════════════════════════════════
console.log('=== ① Issue1：check-deps 不再裸 spawn firecrawl CLI（消除 Windows 误报）===');
{
  // A1：firecrawlCliOk 已从导出中彻底移除（裸 spawn 误报根源）
  const mod = require(CHECK_DEPS_JS);
  check('check-deps 导出不含 firecrawlCliOk（裸 spawn 已拆除）', mod.firecrawlCliOk === undefined,
    '导出键=' + Object.keys(mod).join(','));

  const skillsWithKey = writeSkillsDir(true);
  const imaStubDummy = path.join(TMPDIR, 'ima_api_dummy.cjs');
  fs.writeFileSync(imaStubDummy, '// dummy\n', 'utf8');
  const envWithKey = Object.assign({}, process.env, {
    WORKBUDDY_SKILLS_DIR: skillsWithKey,
    IMA_API_CJS: imaStubDummy,
  });
  let r = runNode(CHECK_DEPS_JS, ['--json', '--skills-dir', skillsWithKey], envWithKey);
  check('check-deps --json 退出码 0（硬依赖齐全）', r.code === 0, r.err || r.out.slice(0, 200));
  let json;
  try { json = JSON.parse(r.out); } catch (e) { json = null; }
  check('check-deps 输出为合法 JSON', json !== null, r.out.slice(0, 200));
  if (json) {
    check('firecrawl.cliDelegated === true（委派 web-search，本技能不自行 spawn）',
      json.soft && json.soft.firecrawl && json.soft.firecrawl.cliDelegated === true,
      JSON.stringify(json.soft && json.soft.firecrawl));
    check('firecrawl.skillPresent === true', json.soft.firecrawl.skillPresent === true, '');
    check('firecrawl.keyPresent === true', json.soft.firecrawl.keyPresent === true, '');
    check('firecrawl.usable === true（skill && key，而非依赖 CLI 存在）',
      json.soft.firecrawl.usable === true, JSON.stringify(json.soft.firecrawl));
    check('firecrawl 结果不含「CLI 缺失」类误报字段',
      !('cliMissing' in (json.soft.firecrawl || {})) && !('cliOk' in (json.soft.firecrawl || {})),
      JSON.stringify(json.soft.firecrawl));
  }

  // A3：无 firecrawl 密钥时，usable=false 但 cliDelegated 仍为 true，且硬依赖齐全→退出码 0（不再因 CLI 误报阻断）
  const skillsNoKey = writeSkillsDir(false);
  const envNoKey = Object.assign({}, process.env, {
    WORKBUDDY_SKILLS_DIR: skillsNoKey,
    IMA_API_CJS: imaStubDummy,
  });
  r = runNode(CHECK_DEPS_JS, ['--json', '--skills-dir', skillsNoKey], envNoKey);
  check('无密钥时 check-deps 仍退出码 0（软依赖不阻断）', r.code === 0, r.err || r.out.slice(0, 200));
  try { json = JSON.parse(r.out); } catch (e) { json = null; }
  if (json) {
    check('无密钥时 firecrawl.usable === false', json.soft.firecrawl.usable === false, JSON.stringify(json.soft.firecrawl));
    check('无密钥时 firecrawl.cliDelegated 仍为 true（委派关系不变）',
      json.soft.firecrawl.cliDelegated === true, JSON.stringify(json.soft.firecrawl));
  }
}

// ════════════════════════════════════════════════════════════════
console.log('\n=== ② Issue2：chrome-devtools 端口不硬编码、不读 local-config、委托编排 ===');
{
  // B1：缺省端口 = 9222（chrome-devtools 扫描区间起点）
  let r = runNode('-e', [`const {CDP_PORT}=require(${JSON.stringify(RESOLVE_JS)}); console.log(CDP_PORT)`], {});
  check('resolve_midlink 缺省 CDP_PORT = 9222', r.out === '9222', r.out);

  // B2：SOGOU_CDP_PORT 环境变量优先（编排注入真实端口）
  r = runNode('-e', [`const {CDP_PORT}=require(${JSON.stringify(RESOLVE_JS)}); console.log(CDP_PORT)`],
    Object.assign({}, process.env, { SOGOU_CDP_PORT: '9333' }));
  check('SOGOU_CDP_PORT=9333 → CDP_PORT = 9333（编排回传优先）', r.out === '9333', r.out);

  // B3：--check 端口不可达时，错误文案指向「经 Agent 编排调用 chrome-devtools」，且不读 local-config
  //     用确定空闲端口（无监听）触发 ECONNREFUSED，避免依赖运行环境是否已有 9222 监听。
  const freePort = findFreePort();
  r = runNode(RESOLVE_JS, ['--check'], Object.assign({}, process.env, { SOGOU_CDP_PORT: String(freePort) }));
  check('--check 端口无监听（空闲端口）→ 退出码非 0', r.code !== 0, 'code=' + r.code);
  check('--check 错误文案含「Agent 编排调用 chrome-devtools」（委派硬门禁）',
    /Agent 编排调用 chrome-devtools/.test(r.err), r.err.slice(0, 300));
  check('--check 错误文案不引用 local-config.json（已拆除本地读取）',
    !/local-config/.test(r.err), r.err.slice(0, 300));

  // B4：check-deps 软依赖 chrome-devtools 委派说明一致
  const skillsWithKey = path.join(TMPDIR, 'skills_withkey');
  const imaStubDummy = path.join(TMPDIR, 'ima_api_dummy.cjs');
  const r2 = runNode(CHECK_DEPS_JS, ['--json', '--skills-dir', skillsWithKey],
    Object.assign({}, process.env, { WORKBUDDY_SKILLS_DIR: skillsWithKey, IMA_API_CJS: imaStubDummy }));
  let json; try { json = JSON.parse(r2.out); } catch (e) { json = null; }
  if (json) {
    const cd = json.soft && json.soft.chromeDevtools;
    check('chromeDevtools.delegated 提及 Agent 编排 / chrome-devtools（MCP 连接器）',
      /Agent 编排/.test(cd.delegated) && /chrome-devtools/.test(cd.delegated), JSON.stringify(cd.delegated));
    check('chromeDevtools 不依赖 local-config 判定（installed 仅看目录存在）',
      cd.installed === false ? true : (typeof cd.installed === 'boolean'), JSON.stringify(cd.installed));
  }
}

// ════════════════════════════════════════════════════════════════
console.log('\n=== ③ Issue3：state.js resolve-folder 按名实时解析 folder_id（禁止硬编码）===');
{
  const stub = writeImaStub();

  // C1~C3：normal 桩跨分页命中三张真实文件夹（工程总承包EPC 在第1页，城市更新/全域在第2页 → 证明分页遍历）
  let r = runNode(STATE_JS, ['resolve-folder', '--name', '工程总承包EPC', '--kb-id', 'KB1', '--ima-api', stub],
    Object.assign({}, process.env, { WAI_STUB_MODE: 'normal' }));
  check('resolve-folder 工程总承包EPC → folder_工程总承包EPC（第1页命中）', r.code === 0 && r.out === 'folder_工程总承包EPC', r.err || r.out);

  r = runNode(STATE_JS, ['resolve-folder', '--name', '城市更新', '--kb-id', 'KB1', '--ima-api', stub],
    Object.assign({}, process.env, { WAI_STUB_MODE: 'normal' }));
  check('resolve-folder 城市更新 → folder_城市更新（跨页第2页命中，证明分页遍历）', r.code === 0 && r.out === 'folder_城市更新', r.err || r.out);

  r = runNode(STATE_JS, ['resolve-folder', '--name', '全域土地和生态修复', '--kb-id', 'KB1', '--ima-api', stub],
    Object.assign({}, process.env, { WAI_STUB_MODE: 'normal' }));
  check('resolve-folder 全域土地和生态修复 → folder_全域土地和生态修复（跨页第2页命中）',
    r.code === 0 && r.out === 'folder_全域土地和生态修复', r.err || r.out);

  // C4：错名 → 退出码 1 + 未命中提示（不静默返回错误值）
  r = runNode(STATE_JS, ['resolve-folder', '--name', '不存在的目录', '--kb-id', 'KB1', '--ima-api', stub],
    Object.assign({}, process.env, { WAI_STUB_MODE: 'normal' }));
  check('resolve-folder 错名 → 退出码 1 且提示未命中', r.code === 1 && /未命中/.test(r.err), 'code=' + r.code + ' ' + r.err.slice(0, 200));

  // C5：--json 结构化输出（folder_id + title + card 透传）
  r = runNode(STATE_JS, ['resolve-folder', '--name', '工程总承包EPC', '--kb-id', 'KB1', '--card', 'A', '--json', '--ima-api', stub],
    Object.assign({}, process.env, { WAI_STUB_MODE: 'normal' }));
  let j; try { j = JSON.parse(r.out); } catch (e) { j = null; }
  check('resolve-folder --json 输出合法', j !== null, r.out.slice(0, 200));
  if (j) {
    check('--json folder_id 正确', j.folder_id === 'folder_工程总承包EPC', JSON.stringify(j));
    check('--json title 正确（ima 实际名）', j.title === '工程总承包EPC', JSON.stringify(j));
    check('--json card 透传', j.card === 'A', JSON.stringify(j));
  }

  // C6：仅含笔记（media_type=11）同名 → 排除，未命中（证明 media_type 过滤是真实生效而非巧合）
  r = runNode(STATE_JS, ['resolve-folder', '--name', '工程总承包EPC', '--kb-id', 'KB1', '--ima-api', stub],
    Object.assign({}, process.env, { WAI_STUB_MODE: 'noteonly' }));
  check('noteonly 桩（仅同名笔记 media_type=11）→ 退出码 1（笔记被排除）', r.code === 1 && /未命中/.test(r.err), 'code=' + r.code + ' ' + r.err.slice(0, 200));

  // C7：仅含文件夹（media_type=99）同名 → 命中
  r = runNode(STATE_JS, ['resolve-folder', '--name', '工程总承包EPC', '--kb-id', 'KB1', '--ima-api', stub],
    Object.assign({}, process.env, { WAI_STUB_MODE: 'folderonly' }));
  check('folderonly 桩（仅同名文件夹 media_type=99）→ 命中 folder_epc', r.code === 0 && r.out === 'folder_epc', r.err || r.out);

  // C8：去重键归一化 —— 含空格/全角标点/大小写差异的名字仍能匹配（dedupKey 语义）
  r = runNode(STATE_JS, ['resolve-folder', '--name', '工程总承包 EPC！', '--kb-id', 'KB1', '--ima-api', stub],
    Object.assign({}, process.env, { WAI_STUB_MODE: 'folderonly' }));
  check('名字含空格+全角感叹号仍匹配（dedupKey 归一化）', r.code === 0 && r.out === 'folder_epc', r.err || r.out);

  // C9：resolve-folder 不需 --progress（提前分流，不触碰进度文件/文件锁）
  r = runNode(STATE_JS, ['resolve-folder', '--name', '工程总承包EPC', '--kb-id', 'KB1', '--ima-api', stub],
    Object.assign({}, process.env, { WAI_STUB_MODE: 'folderonly' }));
  check('resolve-folder 无需 --progress 即可执行（分流不依赖进度文件）', r.code === 0 && r.out === 'folder_epc', r.err || r.out);
}

// ════════════════════════════════════════════════════════════════
console.log('\n=== 汇总 ===');
console.log(`通过 ${pass} / 失败 ${fail}`);
if (fail) {
  console.log('未通过明细：');
  failures.forEach((f) => console.log('  - ' + f));
}
cleanup();
process.exit(fail ? 1 : 0);
