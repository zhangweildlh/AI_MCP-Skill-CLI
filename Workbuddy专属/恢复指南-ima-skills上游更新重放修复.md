# 恢复指南：ima-skills 上游更新后重放全量修复

> **文件定位**：本指南是「WorkBuddy 技能市场更新覆盖本地修复」后的**唯一可靠恢复源**。任何 Agent 完整阅读本文件后，应能在新版技能上**自主闭环**重放全部修复项、加固项与凭证鉴权，无需原修复会话上下文。
> **创建日期**：2026-11-02（同日追加加固批次 H1/H2/D11/D12）｜ **修复基线版本**：v1.1.10 ｜ **前置审计**：71 条用例全套测试 + 三路交叉静态审计（过程详档未随本指南分发，**本指南自包含**）。

---

## 0. 背景事实（Agent 必读）

1. **被测技能路径**：`C:\Users\<用户名>\.workbuddy\skills\ima-skills`（下文简写 `<SKILL>`）。
2. **上游真相**（2026-11-02 核实）：上游为 SkillHub 企业源 **`@tencent-adm/ima-skills`（腾讯 IMA 团队发布）**，经 WorkBuddy 市场分发（`_skillhub_meta.json` 中 `source: "marketplace"`）。**不存在可提 PR 的公开 GitHub 仓库**；GitHub 上的 `guohuiyuan/ima-skill`、`Ttungx/ima-skill-sync` 为第三方个人镜像，向其提 PR 无法回流官方，**不要向其提交**。
3. **覆盖后果**：市场更新会覆盖技能目录全部文件，包括本次 11 项代码修复、12 项文档修复与 `tests/` 回归集；但**凭证不受影响**（存于 `~/.config/ima/` 与系统环境变量，不在技能目录内）。
4. **如何检测"已被覆盖"**（任一命中即需重放）：
   ```bash
   # 修复版特征检查：四条任一不命中 = 修复被覆盖
   grep -q "Not a regular file" "<SKILL>/knowledge-base/scripts/preflight-check.cjs" && echo "P2-1 在位" || echo "P2-1 丢失"
   grep -q "ENV_FALLBACK" "<SKILL>/knowledge-base/scripts/cos-upload.cjs" && echo "P1-1 在位" || echo "P1-1 丢失"
   grep -q "stripWrappingQuotes" "<SKILL>/knowledge-base/scripts/cos-upload.cjs" && echo "H1 在位" || echo "H1 丢失"
   test -f "<SKILL>/tests/run_regression.cjs" && echo "回归集在位" || echo "回归集丢失"
   # 2026-11-04 新增修复项检测（ima_api.cjs）
   grep -q "openapi/<module>/v1/<action>" "<SKILL>/ima_api.cjs" && echo "P-ima-API 在位" || echo "P-ima-API 丢失"
   grep -q "err.httpStatus" "<SKILL>/ima_api.cjs" && echo "P-ima-HTTP-status 在位" || echo "P-ima-HTTP-status 丢失"
   # 2026-11-05 新增：笔记类入库契约（文档级修复 D13 / P-ima-NOTE-FOLDER）
   grep -q "import_doc. 不接受 .folder_id\|import_doc\` 不接受 \`folder_id\`" "<SKILL>/notes/SKILL.md" && echo "P-ima-NOTE-FOLDER(notes) 在位" || echo "P-ima-NOTE-FOLDER(notes) 丢失"
   grep -q "截断到 30 个字符" "<SKILL>/knowledge-base/SKILL.md" && echo "P-ima-NOTE-FOLDER(kb) 在位" || echo "P-ima-NOTE-FOLDER(kb) 丢失"
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

## 2. 代码修复重放清单（11 项，逐项改完即验证）

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

### H1 shell 传参引号防线（cos-upload.cjs，加固项；依赖 P1-1 先重放）

- **背景**（2026-11-02 实测踩坑）：调用方用变量中转参数（`ARGS="--bucket \"$b\" ..."; cmd $ARGS`）时，bash 分词**不剥离变量展开后的引号**，引号成字面字符，主机名被拼成 `"bucket".cos."region".myqcloud.com` → DNS `ENOTFOUND`。
- **位置 1**：`const ENV_FALLBACK = {...};` 定义块之后、`const DEFAULT_TIMEOUT_MS` 之前，插入：
  ```js
  // --- Shell-quoting hardening ---
  function stripWrappingQuotes(value) {
    let s = String(value).trim();
    if (
      s.length >= 2 &&
      ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    ) {
      s = s.slice(1, -1).trim();
    }
    return s;
  }

  const QUOTED_PARAMS = ['file', 'secret-id', 'secret-key', 'token', 'bucket', 'region', 'cos-key', 'content-type', 'start-time', 'expired-time', 'timeout'];

  function sanitizeArgs(args) {
    for (const key of QUOTED_PARAMS) {
      if (args[key] === undefined) continue;
      const cleaned = stripWrappingQuotes(args[key]);
      if (cleaned !== args[key]) {
        console.error(`[warn] --${key}: 包裹引号已剥离（常见根因：调用方用变量中转 shell 参数时引号变字面字符）。`);
        args[key] = cleaned;
      }
    }
    return args;
  }

  // bucket/region 是 hostname 构成项（<bucket>.cos.<region>.myqcloud.com），
  // 白名单校验把 DNS 层的模糊错误（ENOTFOUND）提前为参数层的明确报错。
  const HOSTNAME_TOKEN_RE = /^[a-z0-9][a-z0-9-]*$/;

  function validateHostnameTokens(args) {
    for (const key of ['bucket', 'region']) {
      if (!HOSTNAME_TOKEN_RE.test(args[key])) {
        console.error(
          `Invalid --${key}: 含主机名非法字符（合法字符集：小写字母/数字/连字符，且不以连字符开头）。` +
          `常见根因：调用方用变量中转 shell 参数时引号变字面字符——请单条内联传参，或用 eval "set -- $(...)" 后以 "$@" 传递。`
        );
        process.exit(1);
      }
    }
  }
  ```
- **位置 2**：`main()` 内 ENV_FALLBACK 回退循环之后、`const missing = REQUIRED.filter(...)` 之前，插入：
  ```js
  sanitizeArgs(args);           // 剥离包裹引号（shell 传参陷阱自愈）
  validateHostnameTokens(args); // bucket/region 主机名白名单兜底
  ```
- **验证**：§4.3 场景 A1/A2。

### H2 凭证缺失报错精确化（ima_api.cjs，加固项）

- **背景**：原 msg 让用户按 `~/.config/ima/` 找文件；Git Bash 的 `$HOME` 虚拟化时 `~` 与 Node `os.homedir()` 不同（实测 `~` → 虚拟化目录），误导排障。技能**读取**逻辑本就基于 `os.homedir()`，此项仅修错误提示。
- **位置**：`loadCredentials` 内 `if (!clientId || !apiKey) {` 块，整体替换为：
  ```js
  if (!clientId || !apiKey) {
    const probedDir = path.join(os.homedir(), '.config/ima');
    const err = new Error('missing credentials');
    err.code = ERR_PROGRAMMATIC;
    err.msg =
      '未找到 IMA 凭证（clientId / apiKey）。请设置 IMA_CLIENT_ID 和 IMA_API_KEY 环境变量，或将凭证放置在 ' +
      probedDir +
      ' 目录下（实际探测路径以本消息为准；注意：Git Bash 的 ~ 可能指向虚拟化目录，与 Node os.homedir() 不同，勿按 ~ 找文件）。';
    throw err;
  }
  ```
  - **验证**：§4.3 场景 D。

### P-ima-API arg contract（ima_api.cjs，F6 修复项；2026-11-04 新增）

- **背景**（2026-11-04 实测）：`ima_api.cjs` 纯位置参数（`const [, , apiPath, rawBody='{}', rawOptions='{}', ...rest] = process.argv`），无 `--help`、无命名旗标、无格式校验；误用 `--kb-id` 旗标 → 被当成 body（非法 JSON）→ `code=-100`。API 路径须为 `openapi/<module>/v1/<action>` 完整前缀，缺前缀时服务端返回 404，但旧版不校验、直接透传，排障困难。
- **位置 1**：`main()` 首行位置参数解构之后，把旧 `if (!apiPath) { ... exit 1 }` 分支替换为「`--help`/`-h`/空 → 打印用法（含「apiPath 须为带 `openapi/` 前缀的完整路径、body 为第二个位置参数 JSON、options 为第三个位置参数 JSON」）后 `process.exit(0)`」。
- **位置 2**：`try` 块首行插入 apiPath 格式校验：
  ```js
  if (!apiPath.startsWith('openapi/') || !apiPath.includes('/')) {
    const err = new Error('invalid apiPath');
    err.code = ERR_PROGRAMMATIC;
    err.msg = 'apiPath 格式错误，应形如 openapi/<module>/v1/<action>（须以 openapi/ 开头且含 /），当前收到：' + apiPath;
    throw err;
  }
  ```
- **验证**：`node ima_api.cjs --help` → exit 0 打印用法；`node ima_api.cjs badpath` → exit 1、stderr JSON `{"code":-100,"msg":"apiPath 格式错误..."}`（无需凭证，校验在凭证加载前）；`node ima_api.cjs --kb-id x` → 同 badpath 被拦（不再被当 body 透传）。

### P-ima-HTTP-status（ima_api.cjs，F10 修复项；2026-11-04 新增）

- **背景**（2026-11-04 实测）：`postJson` 直接 `return await res.text()`，**不检查 `res.status`/`res.ok`**；404/401 等异常也表现为「退出码 0 + 空输出」，调用方（如 `wechat-article-to-ima`）难判真实失败。
- **位置**：`postJson` 内 `const res = await fetch(...)` 之后、`return` 之前插入状态码校验：
  ```js
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${apiPath}`);
    err.code = ERR_PROGRAMMATIC;
    err.httpStatus = res.status;
    err.body = text.slice(0, 500);
    throw err;
  }
  return text;
  ```
- **连带改造**：`main()` 的 `catch` 块在输出 stderr JSON 时追加 `httpStatus` 与 `body` 字段（若存在），使调用方能直接拿到 `httpStatus` 定位（404 查路径前缀、401 查凭据）。
- **验证**：对返回非 2xx 的接口调用 → 退出码 1、stderr JSON 含 `httpStatus`（如 `404`）与截断 `body`；对 2xx 接口 → 仍正常返回文本。
- **联动**：`wechat-article-to-ima/SKILL.md` 的「空响应陷阱」段已据本修复改写为「非 2xx 以退出码 1 + stderr JSON（含 httpStatus）暴露」，调用方遇此直接用 curl 带 `ima-openapi-clientid/apikey` 头复放定位。

### P-ima-NOTE-FOLDER（ima_api.cjs 契约项，2026-11-05 新增；文档级修复）

- **背景**（2026-11-05 实测）：`openapi/note/v1/import_doc` **不接受 `folder_id` 参数**——传入即返回 `code=310001 msg=文件夹不存在`。正确链路为「先 `import_doc` 建笔记（笔记落默认位置）→ 再用 `openapi/wiki/v1/add_knowledge`（`media_type=11`、`note_info.content_id=<note_id>`）把笔记关联到知识库子目录」。
- **本项性质**：**不是 `ima_api.cjs` 的代码缺陷**，而是服务端契约事实。故处置为**文档级修复**（对应 §3 的 D13 条目），`ima_api.cjs` **无需改动**（不得为「迎合一个非法参数」而改脚本）。
- **连带事实（须一并写入文档）**：
  1. **笔记去重不可用整标题精确比对**——服务端会把条目 `title` 截断到 30 字符并追加 `...`（实测 28 条中 11 条被截断）。去重键须为「归一化标题前 30 字符」，且**必须先剥除末尾 `...` 再切片**（标题恰为 30 字时标记落在切片内会失配）。
  2. **开放接口无 delete / remove 端点**（`openapi/**` 全量枚举确认）→ 重复入库**不可逆**，故「入库前严格查重」是硬要求，不可「先入库再比对」。
  3. **服务端会把正文首个元数据行当作标题**——Markdown 若用 YAML front-matter，front-matter 会整块泄漏进条目标题（实测历史条目 5/11 出现 `title: "…` 污染）。调用方须显式传 `title` 参数，且 Markdown 元数据头用内联形态、禁用 front-matter。
- **验证**：`node ima_api.cjs openapi/note/v1/import_doc '{"content_format":1,"content":"# t\n\n正文","folder_id":"folder_x"}'` → 返回 `code=310001`；去掉 `folder_id` 后 `code=0` 且返回 `note_id`。

---

## 3. 文档修复重放清单（12 项）

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
| D11 | 根 `SKILL.md` Credential Check 与配置写入指引（加固项） | 检查桩由 shell `~` 口径改为 node `os.homedir()` 口径（内嵌 `node -e` 判断 `client_id`/`api_key` 存在性，成功/失败均输出实际探测目录）；「方式 A」写入指引改双版本（node 版推荐 + bash 版）并加 Git Bash `$HOME` 虚拟化警示框（实测 `~` → 虚拟化目录，而 Node 侧按 `os.homedir()` 探测，`~` 写入会写错位置） |
| D12 | `knowledge-base/SKILL.md` Step 5 的「⛔ 非零退出」行之后（加固项） | 新增「bash 传参陷阱（实测踩坑，2026-11-02）」引用块：禁止参数先存变量再 `$VAR` 展开（bash 分词不剥离变量展开后的引号 → 主机名带字面引号 → ENOTFOUND）；给单条内联传参与 `eval "set -- $(...)"` 后 `"$@"` 传递两种正确写法；注明脚本已内置剥离/白名单防线（对应 H1） |
| D13 | 根 `SKILL.md` 笔记入库章节 + `notes/references/api.md`（**文档陷阱项**，2026-11-05 新增） | 补「`import_doc` **不接受 `folder_id`**」实测陷阱：传入 `folder_id` 返 `code=310001 msg=文件夹不存在`。正确用法为「先 `import_doc` 建笔记（落默认位置、不传 `folder_id`）→ 再 `wiki/v1/add_knowledge` 关联目标子目录」。同章补「笔记类去重不可用整标题精确比对：服务端把 `title` 截断到 30 字符并追加 `...`，须用前缀去重键（先剥末尾 `...` 再取前 30 字符）」，以及「开放接口无 delete/remove 端点 → 重复入库不可逆，入库前必须严格查重」 |

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

### 4.3 加固防线验证（H1/H2；全程用假凭证，零数据写入）

**H1 三场景**（bucket 用格式合法的任意名如 `verify-bucket-123`；凭证一律假值，本验证不依赖真实桶名、不产生任何 COS 对象）：

```bash
FAKE='--file <任意本地小文件> --content-type text/markdown --secret-id AKIDfakesid0000 --secret-key fakeskey== --token faketoken --region ap-shanghai --cos-key test/hardening-verify.md'
# A1：--bucket 传带字面双引号的桶名 → 期望 stderr 先出 [warn] 剥离告警
node "<SKILL>/knowledge-base/scripts/cos-upload.cjs" $FAKE --bucket '"verify-bucket-123"'
#    判定：报 ENOTFOUND verify-bucket-123.cos.ap-shanghai.myqcloud.com（主机名**无引号**；桶名真实存在时进一步 HTTP 403）= H1 生效；
#          报 ENOTFOUND "verify-bucket-123"...（主机名带引号）= H1 未生效，回查位置 1/2 是否按锚点插入
# A2：--bucket 传含空格值 → 期望立即参数层报错 Invalid --bucket（无任何网络请求）= 白名单兜底生效
node "<SKILL>/knowledge-base/scripts/cos-upload.cjs" $FAKE --bucket "abc def"
```

**H2 验证**：将 `USERPROFILE` 重定向到空目录后调用任意接口，stderr JSON 的 `msg` 应包含重定向后的绝对探测路径与 Git Bash 虚拟化警示（而非 `~/.config/ima/` 字样）：

```bash
USERPROFILE="<任意空目录>" node "<SKILL>/ima_api.cjs" openapi/note/v1/list_notebook '{"cursor":"0","limit":1}'
```

---

## 5. 溯源记录

- 修复实施：2026-11-02（本仓库同日另有 ima 相关凭证部署记录见 git 历史）；同日追加加固批次 H1/H2/D11/D12（COS 传参引号防线、凭证报错精确化、检查桩 node 化、传参陷阱规则）。
- 修复过程产物（测试详档、原始测试数据、修复前备份）位于当次会话临时工作区，**未随本指南分发、不可依赖**——**本指南是唯一可靠恢复源**。

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

run('IA-01', '--help 打印用法并退出 0 (F6)', 'node', [IMAAPI, '--help'], null, { exit: 0, errContains: 'openapi/wiki/v1/get_knowledge_list' });
run('IA-01b', '非法 apiPath 格式→code -100 (F6)', 'node', [IMAAPI, 'badpath'], null, { exit: 1, errContains: 'apiPath 格式错误' });
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
