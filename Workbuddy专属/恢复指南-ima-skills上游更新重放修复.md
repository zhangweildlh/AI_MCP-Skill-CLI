# 恢复指南：ima-skills 上游更新后重放全量修复

> **文件定位**：本指南是「WorkBuddy 技能市场更新覆盖本地修复」后的**唯一可靠恢复源**。任何 Agent 完整阅读本文件后，应能在新版技能上**自主闭环**重放全部修复项与凭证鉴权，无需原修复会话上下文。
> **创建日期**：2026-11-02 ｜ **修复基线版本**：v1.1.10 ｜ **前置审计**：71 条用例全套测试 + 三路交叉静态审计（详档：当时会话工作区 `ima-test/ima-skills测试报告.md`，临时目录可能已被清理，**不可依赖**；本指南自包含）。

---

## 0. 背景事实（Agent 必读）

1. **被测技能路径**：`C:\Users\<用户名>\.workbuddy\skills\ima-skills`（下文简写 `<SKILL>`）。
2. **上游真相**（2026-11-02 核实）：上游为 SkillHub 企业源 **`@tencent-adm/ima-skills`（腾讯 IMA 团队发布）**，经 WorkBuddy 市场分发（`_skillhub_meta.json` 中 `source: "marketplace"`）。**不存在可提 PR 的公开 GitHub 仓库**；GitHub 上的 `guohuiyuan/ima-skill`、`Ttungx/ima-skill-sync` 为第三方个人镜像，向其提 PR 无法回流官方，**不要向其提交**。
3. **覆盖后果**：市场更新会覆盖技能目录全部文件，包括本次 9 项代码修复、10 项文档修复与 `tests/` 回归集；但**凭证不受影响**（存于 `~/.config/ima/` 与系统环境变量，不在技能目录内）。
4. **如何检测"已被覆盖"**（任一命中即需重放）：
   ```bash
   # 修复版特征检查：三条任一不命中 = 修复被覆盖
   grep -q "Not a regular file" "<SKILL>/knowledge-base/scripts/preflight-check.cjs" && echo "P2-1 在位" || echo "P2-1 丢失"
   grep -q "ENV_FALLBACK" "<SKILL>/knowledge-base/scripts/cos-upload.cjs" && echo "P1-1 在位" || echo "P1-1 丢失"
   test -f "<SKILL>/tests/run_regression.cjs" && echo "回归集在位" || echo "回归集丢失"
   ```

---

## 1. 先决步骤：凭证鉴权恢复（每次重放先做本节）

### 1.1 检查凭证文件

```bash
node -e "
const fs=require('fs');
for (const f of ['client_id','api_key']) {
  try {
    const v=fs.readFileSync(process.env.HOME+'/.config/ima/'+f,'utf8').trim();
    console.log(f+': 长度='+v.length+(v==='dummy'?' [占位符-无效]':''));
  } catch { console.log(f+': 缺失'); }
}"
```

**有效特征**：`client_id` 去空白后长度 32、`api_key` 长度 76、且不等于 `dummy`。
**无效或缺失时**：**向用户索取**（引导用户到 https://ima.qq.com/agent-interface 获取 Client ID 与 API Key 后由用户提供）。**严禁**：猜测、使用示例值、或将凭证明文写入任何仓库文件/日志/本指南。

### 1.2 写入凭证文件与环境变量（固化为双通道）

凭证明文只出现在用户提供的输入中；Agent 用以下模板从凭证文件派生环境变量，全程不回显明文：

```powershell
$cid = (Get-Content "$env:USERPROFILE\.config\ima\client_id" -Raw).Trim()
$key = (Get-Content "$env:USERPROFILE\.config\ima\api_key" -Raw).Trim()
foreach ($n in 'IMA_CLIENT_ID','IMA_OPENAPI_CLIENTID') { [Environment]::SetEnvironmentVariable($n, $cid, 'User') }
foreach ($n in 'IMA_API_KEY','IMA_OPENAPI_APIKEY')   { [Environment]::SetEnvironmentVariable($n, $key, 'User') }
Write-Host "4 个用户级环境变量已固化"
```

> 若 §1.1 检查时凭证文件缺失而用户以**对话方式**提供了凭证：先写入两个文件（各一行），再执行上面的派生命令。写入动作可用任意本地工具，但凭证值**不得**出现在任何 MD/JSON/日志产物中。

### 1.3 鉴权验证（通过标准）

```bash
node "<SKILL>/ima_api.cjs" openapi/wiki/v1/search_knowledge_base "{\"query\":\"\",\"cursor\":\"\",\"limit\":1}"
```

**通过标准**：stdout 为 `{"code":0,"msg":"success",...}`。若返回 `{"code":200002,"msg":"skill auth failed"}`，说明凭证无效或未开通 OpenAPI 权限——回到 §1.1 向用户确认凭证。

---

## 2. 代码修复重放清单（9 项，逐项改完即验证）

> 通用验证前置：每项改完跑 `node --check <文件>` 确认语法。所有锚点字符串按"在新版文件中搜索"使用；若新版代码结构已变导致锚点找不到，**按改动意图等价适配**，不要硬套。

### P2-1 目录被当文件放行（preflight-check.cjs）

- **位置**：主流程 `// 1. Check file exists` 的 `stat = fs.statSync(filePath); try/catch` 块之后。
- **插入**：
  ```js
  // 1b. Must be a regular file — directories/symlinks-to-dirs must not pass
  if (!stat.isFile()) {
    console.error(`Not a regular file: ${filePath}`);
    process.exit(2);
  }
  ```
- **验证**：对任意目录跑脚本应 exit 2 且 stderr 含 `Not a regular file`。

### P3-1 闭包引用后置声明的 base（preflight-check.cjs）

- **位置**：`function validateImageSignature(filePath, extension, contentType, extensionMapping) {`。
- **改动**：签名追加第 5 参数 `baseInfo`，函数体首行加 `const base = baseInfo;`；调用处（`// 5. Validate image bytes` 内）改为 `validateImageSignature(filePath, ext, contentType, extMapping, base);`。

### P3-2 .htm 扩展名不认（preflight-check.cjs）

- **位置**：`EXT_MAP` 中 `html` 条目之后。
- **插入**：`htm: { media_type: 20, content_type: 'text/html' },`

### P3-16 误导注释（preflight-check.cjs）

- **位置**：`CONTENT_TYPE_MAP` 构建循环的注释 `// First entry wins — keeps the canonical content_type per media_type`。
- **替换为**：
  ```js
  // Guard 以 content_type 为键：每个 content_type 首次出现即收录（同 media_type 的
  // 多个 content_type 均会入表，如 image/png、image/jpeg、image/webp → 9）。
  ```

### P2-2 相对路径图片不支持（note-images.cjs，4 处联动）

1. `localPath(source)` 整体替换为：
   ```js
   function localPath(source, baseDir) {
     if (source.startsWith('file://')) return decodeURIComponent(source.slice(7));
     if (/^https?:\/\//i.test(source)) return '';
     if (source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(source)) return source;
     return path.resolve(baseDir || process.cwd(), source);
   }
   ```
2. `imageContent(alt, source)` 签名加 `baseDir`，内部 `localPath(source, baseDir)`。
3. `createBatches(markdown)` 签名加 `baseDir`，内部 `imageContent(match[1], match[2].trim(), baseDir)`。
4. `main()` 中调用改为：
   ```js
   const baseDir = args.file ? path.dirname(path.resolve(args.file)) : process.cwd();
   batches = await createBatches(markdown, baseDir);
   ```
- **验证**：构造 md（内容 `![x](相对同目录的png文件名)`）置于夹具同目录，`--dry-run` 应输出 image 批次（修复前报 `Unsupported image source`）。

### P3-11 扩展名/签名一致性缺失（note-images.cjs）

- **位置**：`readImage` 函数（`const data = fs.readFileSync(absolutePath);` 至 `return` 之间）。
- **模块顶部常量**（与 `IMAGE_TYPES` 声明处相邻）：
  ```js
  const EXT_IMAGE_CT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
  ```
- **readImage 内 return 前插入**：
  ```js
  const ext = path.extname(absolutePath).slice(1).toLowerCase();
  const expected = EXT_IMAGE_CT[ext];
  if (expected && expected !== contentType) {
    throw new Error(`Image extension .${ext} does not match its actual signature (${contentType}): ${absolutePath}`);
  }
  ```
- **验证**：JPEG 内容 + `.png` 扩展名的文件应被拒（与 preflight-check 行为一致）。

### P1-1 命令行传密（cos-upload.cjs，3 处）

1. `const REQUIRED = [...]` 行之后插入：
   ```js
   const ENV_FALLBACK = {
     'secret-id': ['COS_SECRET_ID', 'IMA_COS_SECRET_ID'],
     'secret-key': ['COS_SECRET_KEY', 'IMA_COS_SECRET_KEY'],
     token: ['COS_SECURITY_TOKEN', 'IMA_COS_TOKEN'],
   };
   ```
2. `main()` 内 `const args = parseArgs(process.argv);` 之后插入：
   ```js
   for (const [key, names] of Object.entries(ENV_FALLBACK)) {
     if (!args[key]) {
       for (const n of names) {
         if (process.env[n]) { args[key] = process.env[n]; break; }
       }
     }
   }
   ```
3. usage 文案末尾追加一行：`` `Credentials may also be provided via env: COS_SECRET_ID / COS_SECRET_KEY / COS_SECURITY_TOKEN (argv takes precedence).` ``
- **验证**：仅设 env（argv 只给 file/bucket/region/cos-key/content-type）+ 不存在的 file → 应报 `File not found`（而非 `Missing required arguments`）；env 全缺 → 仍报 Missing。

### P3-7 空 token 仍发空 header（cos-upload.cjs）

- **位置**：`upload()` 内 `options` 构造。
- **改动**：从 `headers` 字面量中移除 `'x-cos-security-token': token,`，在 options 定义后追加：
  ```js
  if (token) options.headers['x-cos-security-token'] = token;
  ```

### P3-10 版本号未清洗（ima_api.cjs）

- **位置**：`loadSkillVersion` 函数。
- **改动**：其上方插入
  ```js
  function sanitizeVersion(value) {
    return String(value || '').replace(/[\r\n\x00-\x1f\x7f]/g, '').trim();
  }
  ```
  三个返回路径分别包一层 `sanitizeVersion(...)`。

---

## 3. 文档修复重放清单（10 项）

| # | 文件 | 改动 |
|---|---|---|
| D1 | `notes/SKILL.md` 错误处理表 | 整表替换为 210xxx 系（210001 参数错误 / 210002 无效UID / 210003 服务器内部错误 / 210004 空间不够 / 210005 非作者 / 210006 已删除 / 210008 版本冲突 / 210009 超限 / 210035 笔记本不存在 / 200002 skill 鉴权失败（实测）/ 20002 / 20004），表前加注「以 references/api.md 为权威口径，实际以服务端返回为准」 |
| D2 | `notes/references/api.md` 错误码表 | 补行 `200002`（skill 鉴权失败，实测：凭证无效/未开通，需到 ima.qq.com/agent-interface 重新获取） |
| D3 | `knowledge-base/references/api.md` 错误码表 | 同上补 `200002` |
| D4 | `knowledge-base/references/api.md` §8 check_repeated_names | 适用类型列表改为 `1/3/4/5/7/9/13/14/15/20/21`（补 15，与 SKILL.md 对齐） |
| D5 | `knowledge-base/SKILL.md` Step 5 示例 | 移除 `--secret-id/--secret-key/--token` 三行，加注推荐 env 传密（`COS_SECRET_ID`/`COS_SECRET_KEY`/`COS_SECURITY_TOKEN`，argv 显式值优先） |
| D6 | `notes/SKILL.md` 图片章节 `--url` 说明段后 | 补 4 个引用块：① `--url` 不能与 `--note-id/--file/--content/--dry-run` 组合；② 内部端点说明（`openapi/mcp_cloud_agent/upload_temp_file`、`get_access_url`）；③ 安全与来源说明（远程图仅接受用户显式 URL；本地路径内容会上传至用户自己的笔记）；④ PS 5.1 管道捕获编码提示 |
| D7 | `meta.json` | `required_binaries.reason` 改为涵盖全部 4 个脚本，注明 note-images.cjs 额外使用 fetch 与 child_process |
| D8 | 根 `SKILL.md` Credential Check | 「环境变量 → 配置文件」改为「程序化 options 参数 → 环境变量 → 配置文件」 |
| D9 | `_skillhub_meta.json` | `version` 与 `meta.json` 保持一致（当前 1.1.10） |
| D10 | `_skillhub_meta.json` | `iconLocalPath` 本地化为当前机器实际路径（`C:\\Users\\<用户名>\\...`） |

**不修项裁决（防过度修复）**：
- `application/zip` → media_type 14 的映射**保留**：api.md 明确它是 Xmind 合法 content_type，契约保真优先（审计项 P3-13）。
- `detectImageType` 双实现**不合并**（P2-6 保持记录为已知债务）：合并会改变文件结构，上游新版结构未知，重放时以最小修复为准。
- P3-14（凭证文件权限校验）/ P3-15（流式上传）**不修**：前者 Windows 主环境不适用，后者属重构级改动。

---

## 4. 验证闭环（重放完成的判定标准）

### 4.1 回归集重建与运行

上游更新后技能内 `tests/` 可能被清空。将**附录 A** 的完整脚本写入 `<SKILL>/tests/run_regression.cjs` 后运行：

```bash
node "<SKILL>/tests/run_regression.cjs"
```

**通过标准：16/16 全部通过，脚本 exit 0。**

### 4.2 真实 API 成功路径（需 §1 凭证先决通过）

逐条运行，全部 `code=0` 即通过：

```bash
node "<SKILL>/ima_api.cjs" openapi/wiki/v1/search_knowledge_base "{\"query\":\"\",\"cursor\":\"\",\"limit\":5}"
node "<SKILL>/ima_api.cjs" openapi/note/v1/list_notebook "{\"cursor\":\"0\",\"limit\":5}"
node "<SKILL>/ima_api.cjs" openapi/note/v1/list_note "{\"folder_id\":\"\",\"sort_type\":0,\"cursor\":\"\",\"limit\":3}"
```

**禁止**在验证中调用任何写入类接口（`import_doc`/`append_doc`/`add_knowledge`/`create_media` 等），避免污染用户数据。

---

## 5. 溯源记录

- 修复实施：2026-11-02（本仓库同日另有 ima 相关凭证部署记录见 git 历史）。
- 测试报告与原始测试产物：位于当次会话临时工作区（`ima-test/`），不可长期依赖。
- 修复前备份：`<当次工作区>/ima-test/backup/ima-skills-20261102-185800/`，同样不可依赖——**本指南是唯一可靠恢复源**。

---

## 附录 A：回归测试集完整脚本

> 写入 `<SKILL>/tests/run_regression.cjs`（自生成夹具到系统临时目录、跑完自清理、离线可跑）：

```javascript
#!/usr/bin/env node
// ima-skills 自带回归测试集（2026-11-02 修复版语义）
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PREFLIGHT = path.join(ROOT, 'knowledge-base/scripts/preflight-check.cjs');
const COSUPLOAD = path.join(ROOT, 'knowledge-base/scripts/cos-upload.cjs');
const NOTEIMAGES = path.join(ROOT, 'notes/scripts/note-images.cjs');
const IMAAPI = path.join(ROOT, 'ima_api.cjs');

const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'ima-regression-'));
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const w = (n, b) => fs.writeFileSync(path.join(FIX, n), b);
w('valid.png', Buffer.concat([PNG_MAGIC, Buffer.alloc(8, 0)]));
w('valid.jpg', JPEG_MAGIC);
w('mismatch.png', JPEG_MAGIC);
w('report.pdf', Buffer.from('%PDF-1.4\n'));
w('file.txt', Buffer.from('hello'));
w('video.mp4', Buffer.alloc(8, 0));
w('page.htm', Buffer.from('<html></html>'));
fs.mkdirSync(path.join(FIX, 'dir_fake.txt'));
const mixedMd = path.join(FIX, 'mixed.md');
fs.writeFileSync(mixedMd, `文本一\n\n![图](valid.png)\n\n文本二\n\n![data](data:image/png;base64,${PNG_MAGIC.toString('base64').slice(0, -1)})\n`);

const results = [];
function run(id, desc, cmd, args, env, expect) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30000, windowsHide: true, env: env || process.env });
  let parsed = null;
  try { parsed = JSON.parse((r.stdout || '').trim() || (r.stderr || '').trim()); } catch {}
  let ok = true; const why = [];
  if (expect.exit !== undefined && r.status !== expect.exit) { ok = false; why.push(`exit 期望${expect.exit} 实际${r.status}`); }
  if (expect.pass !== undefined && (!parsed || parsed.pass !== expect.pass)) { ok = false; why.push(`pass 期望${expect.pass}`); }
  if (expect.media_type !== undefined && (!parsed || parsed.media_type !== expect.media_type)) { ok = false; why.push(`media_type 期望${expect.media_type}`); }
  if (expect.errContains && !(r.stderr || '').includes(expect.errContains)) { ok = false; why.push(`stderr 未含"${expect.errContains}"`); }
  if (expect.batches !== undefined) {
    const arr = (() => { try { return JSON.parse(r.stdout); } catch { return null; } })();
    if (!Array.isArray(arr) || arr.length !== expect.batches) { ok = false; why.push(`批次数期望${expect.batches}`); }
  }
  results.push({ id, ok, why });
  console.log(`${ok ? '✓' : '✗'} ${id} ${desc}${why.length ? ' ← ' + why.join('; ') : ''}`);
}

const P = (id, desc, file, extra, expect) => run(id, desc, 'node', [PREFLIGHT, '--file', path.join(FIX, file), ...(extra || [])], null, expect);
P('PF-01', 'PNG 通过', 'valid.png', null, { exit: 0, pass: true, media_type: 9 });
P('PF-02', 'PDF 通过', 'report.pdf', null, { exit: 0, pass: true, media_type: 1 });
P('PF-03', 'TXT 通过', 'file.txt', null, { exit: 0, pass: true, media_type: 13 });
P('PF-04', 'HTM 支持(P3-2)', 'page.htm', null, { exit: 0, pass: true, media_type: 20 });
P('PF-05', '视频拒绝', 'video.mp4', null, { exit: 1, pass: false });
P('PF-06', '目录被拒(P2-1)', 'dir_fake.txt', null, { exit: 2 });
P('PF-07', '不存在文件 exit2', 'no_such.txt', null, { exit: 2 });
P('PF-08', '签名/扩展名不匹配拒绝', 'mismatch.png', null, { exit: 1, pass: false });

run('NI-01', '相对路径+dataURL 分批(P2-2)', 'node', [NOTEIMAGES, '--note-id', 'fake', '--file', mixedMd, '--dry-run'], null, { exit: 0, batches: 4 });
run('NI-02', '不存在图片报准确路径(P2-2)', 'node', [NOTEIMAGES, '--note-id', 'fake', '--file', (() => { const p = path.join(FIX, 'missing.md'); fs.writeFileSync(p, `![x](not_exist.png)\n`); return p; })(), '--dry-run'], null, { exit: 1, errContains: 'Image file not found' });
run('NI-03', '签名/扩展名不匹配拒绝(P3-11)', 'node', [NOTEIMAGES, '--note-id', 'fake', '--file', (() => { const p = path.join(FIX, 'mismatch.md'); fs.writeFileSync(p, `![x](${path.join(FIX, 'mismatch.png')})\n`); return p; })(), '--dry-run'], null, { exit: 1, errContains: 'does not match its actual signature' });
run('NI-04', '参数互斥校验', 'node', [NOTEIMAGES, '--note-id', 'fake', '--file', mixedMd, '--content', 'x'], null, { exit: 1, errContains: 'Exactly one' });

run('IA-01', '缺 apiPath', 'node', [IMAAPI], null, { exit: 1, errContains: '缺少必需参数：apiPath' });
run('IA-02', '非法 body', 'node', [IMAAPI, 'openapi/note/v1/list_note', '{bad'], null, { exit: 1, errContains: '请求 body 不是合法的 JSON' });

run('CU-01', '敏感项 env 回退生效(P1-1)', 'node', [COSUPLOAD, '--file', path.join(FIX, 'no_such.png'), '--bucket', 'b', '--region', 'r', '--cos-key', 'k', '--content-type', 'image/png'],
  { ...process.env, COS_SECRET_ID: 'x', COS_SECRET_KEY: 'y', COS_SECURITY_TOKEN: 'z' }, { exit: 1, errContains: 'File not found' });
run('CU-02', 'env 与 argv 全缺报 Missing', 'node', [COSUPLOAD, '--file', path.join(FIX, 'valid.png'), '--bucket', 'b', '--region', 'r', '--cos-key', 'k', '--content-type', 'image/png'], null, { exit: 1, errContains: 'Missing required arguments' });

fs.rmSync(FIX, { recursive: true, force: true });
const fails = results.filter((r) => !r.ok);
console.log(`\n回归结果：${results.length} 条，通过 ${results.length - fails.length}，失败 ${fails.length}`);
if (fails.length) { for (const f of fails) console.log(`  ✗ ${f.id}: ${f.why.join('; ')}`); process.exit(1); }
console.log('全部通过 ✓');
```
