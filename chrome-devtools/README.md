# chrome-devtools 本地化技能（使用与演进手册）

> **本文件定位**：给人阅读，也是「任一不了解本项目 / 本技能」的 Agent 在跟踪上游仓库、演进代码与版本时使用的手册。陌生 Agent 在读完本文件后，应能**自主、自动**地完成：日常调用、新机器复现部署、跟随上游升级、刷新本地化片段、运行回归测试。
>
> **与 SKILL.md 的分工**：`SKILL.md` 仅面向运行时——给 WorkBuddy / Agent 调用浏览器、启动服务、理解红线用的精简指令（不含解释性 / 维护性内容）。一切「为什么这样设计」「如何演进」「目录为何如此布局」「版本如何钉」等说明类信息，**都在本 README.md**。

---

## 1. 项目概述

本技能是上游开源项目 `ChromeDevTools/chrome-devtools-mcp`（Chrome DevTools MCP 服务器，用于驱动本地浏览器做网页调试、自动化、性能分析、网络检查）的**中文本地化封装**。

本地化的核心目标（围绕本机环境）：

- 复用本机已安装的 **360Chromex 浏览器**及其登录态（不下载任何浏览器内核，依赖 `puppeteer-core`）。
- 以 **全局安装**方式部署（`npm install -g`，位于 `$(npm root -g)`），不依赖 `npx -y`。
- 经 `--browserUrl` 直连已启动的浏览器实例，保留登录态。
- 关键本地化约束（如 `--executablePath` 而非 `--channel`、`PUPPETEER_SKIP_DOWNLOAD=1`）以**物理隔离**方式注入上游快照，便于跟随上游升级而无需 fork 上游。

当前快照版本：`1.7.0`（钉版本日期 `2026-08-12`，见 `localization/UPSTREAM_REF`）。

---

## 2. 设计理念与架构（方案 A）

### 2.1 父技能 + 子技能解耦

采用「方案 A」解耦架构，把「可自由改动的本地化层」与「vendored 上游快照」彻底分开：

- **父技能（本目录根，可改）**：承载本地化逻辑与运行时说明，包括 `SKILL.md`、`.gitignore`、`localization/`。
- **子技能（`upstream/`，vendored 快照 + 流水线就地注入，非手工编辑区）**：垂直存放 `ChromeDevTools/chrome-devtools-mcp` 的源码 / 构建 / 文档基线；本地化约束（zod 钉版本、allow-scripts 白名单、puppeteer 跳过下载，由 `compat.cjs` 注入）与本地化片段（`SKILL.md` / `README.md` 注入段、`description` 中文改写，由 `apply_localize.cjs` 注入）**均由流水线在克隆后就地注入到 `upstream/` 文件内**，而非手工预先编辑。
  - ⚠️ 虽然 `upstream/` 会被流水线就地修改（这与其「vendored 快照」身份不冲突，恰是方案 A 的注入机制），但**严禁人工直接改 `upstream/` 内文件**——任何本地化改动都应改 `localization/` 与 `fragments/` 后由流水线注入，否则会在下次 `upstream.cjs` 刷新时丢失或冲突。
- **加载规范（强制）**：部署后，宿主 Agent 必须且只能加载部署副本**根级 `SKILL.md`**（主 Skill 定义文件）；`upstream/skills/` 下所有子 Skill 已被注入 frontmatter 门禁（`disable-model-invocation: true` + `user-invocable: false`），只能由主 Skill 内部引用，**禁止 Agent 直接加载/调用/手动触发**（门禁由 `apply_localize.cjs` 在部署时幂等注入，见第 6.1 节）。

### 2.2 本地化注入机制（哨兵幂等）

本地化改造经 `localization/apply_localize.cjs`，以哨兵标记 `<!-- LOCALIZED:360Chromex -->` **幂等注入**到上游快照内的注入点 + 根 `SKILL.md`（见第 6.1 节）。注入是「追加本地化段到文件末尾 + 改写 YAML frontmatter 的 `description`」两种动作的组合，剥离时由哨兵行定位、截断还原，从而与上游源码**物理隔离**。

这种机制的好处：

- 跟随上游升级时，只需 `--strip` 清空旧注入段、刷新上游快照、再重新注入，即可一键保全本地化特性，无需维护上游 fork。
- 幂等：重复执行不会重复注入（已含哨兵则跳过）。

### 2.3 为什么不用 fork、不用 git submodule

- **不 fork 上游**：fork 后长期维护成本极高（每次上游变动都要手动 cherry-pick / rebase）。方案 A 用「快照 + 注入」替代 fork，升级路径轻量。
- **不用 git submodule 承载 `devtools-frontend`**：上游以 git submodule 引入 `devtools-frontend`（GB 级），直接入库会导致巨型 `.git` 与嵌套仓库污染。方案 A 改用 **vendored 源码树**（见第 5 节），按钉版本精确填充，且被 `.gitignore` 排除、不入库。

---

## 3. 目录结构

### 3.1 父技能目录（chrome-devtools/ 根，可改）

```
chrome-devtools/
├── SKILL.md                      # 父技能主文档（Agent 运行时指令，精简）
├── README.md                     # 本文件（人 / 陌生 Agent 演进手册）
├── .gitignore                    # 排除机器专属配置与 vendored 大体积资产
├── localization/                 # 【父技能·可改】本地化层（核心）
│   ├── UPSTREAM_REF              # 上游钉版本锚点（版本 + devtools-frontend commit）
│   ├── apply_localize.cjs        # 哨兵幂等注入 / 剥离本地化片段（核心）
│   ├── upstream.cjs              # 跟随上游升级：clone 新版本到 upstream/（重部署用）
│   ├── deploy.cjs                # 全局安装 + 构建 + vendoring + 配置编排
│   ├── vendor_frontend.cjs       # 按 UPSTREAM_REF 钉版本下载 tarball 整树 vendoring devtools-frontend
│   ├── fix_trace_engine_dts.cjs  # 剥离 @paulirish/trace_engine 冲突全局声明（TS2717 上游 workaround）
│   ├── compat.cjs                # 上游 package.json 依赖兼容守卫（固定 zod 版本等）
│   ├── verify_browser.cjs        # 自动检测本机浏览器路径，写入 local-config.json
│   ├── start.cjs                 # 以 --user-data-dir 启动浏览器（复用登录态）
│   ├── cli_run.cjs               # CLI 模式辅助（仅 CLI 模式，可被删除）
│   ├── fragments/                # 本地化注入片段源（_frag_*.md / *.txt / *.json）
│   └── test/localize.test.cjs    # 本地化层单元测试（预期 全部 PASS（当前 14 项；增减后请以 test 文件实际 T 编号为准））
├── local-config.json             # 机器专属（浏览器路径/端口），由脚本生成，不入库
├── mcp-local-config.json         # 生成的 MCP 配置样例，不入库
└── upstream/                     # 【子技能·vendored 快照 + 流水线就地注入·非手工编辑区】见 3.2
```

> 早期布局遗留脚本 `mirror_to_target.cjs` / `sync_and_deploy.cjs` 已在新布局（方案 A）下移除——其职责已由 `localization/` 下的 `apply_localize.cjs` / `upstream.cjs` / `deploy.cjs` / `vendor_frontend.cjs` 取代。演进统一走 `localization/`。

### 3.2 子技能目录（upstream/，vendored 快照 + 流水线就地注入）

`upstream/` 是 `ChromeDevTools/chrome-devtools-mcp @ 1.7.0` 的 vendored 拷贝（由流水线在克隆后就地注入本地化约束与片段，**非手工编辑区**）：

```
upstream/
├── skills/                   # 上游 5 个子技能（chrome-devtools / chrome-devtools-cli / a11y-debugging / ...）
│   └── chrome-devtools/SKILL.md   # 上游子技能文档（MCP server 内部子技能）；被注入本地化段，与根 SKILL.md 是不同文件、不同用途，但同源 _frag_skill_main.md（单一事实源）
├── src/ build/               # 上游源码与构建产物（build/ 不入库）
├── package.json              # 上游包定义（本地化层守卫校验此文件存在）
├── README.md                 # 上游主文档（被注入本地化段）
└── devtools-frontend/   # vendored 副本（按钉版本填充，不入库，见第 5 节；路径与上游 v1.7.0 submodule 路径一致，顶层）
```

`upstream/` **不入库**（属可衍生资产）：由 `localization/upstream.cjs` 按 `UPSTREAM_REF` 钉版本从上游仓库克隆生成（见第 7.2 节全新引导）。主副本仅保留 `localization/` 本地化层、根 `SKILL.md`/`README.md` 与 `UPSTREAM_REF` 等锚点，保持最小化、可移植化——陌生 Agent 读 README 后即可凭 `upstream.cjs` 重建 `upstream/`。

> 注意：`upstream/` 虽由流水线就地注入约束与片段（并非字面意义的「纯手工未改快照」），但**人工仍不得直接改其内文件**；本地化改动一律走 `localization/` + `fragments/` 经流水线注入，避免刷新时丢失或冲突。

### 3.3 被 .gitignore 排除的资产（严禁入库）

以下内容被 `chrome-devtools/.gitignore` 排除，**任何提交都不得纳入**：

- `chrome-devtools_v1.6.0.zip`：历史版本备份压缩包（本地备份，不随仓库分发）。
- `upstream/node_modules/`、`upstream/build/`：上游依赖与构建产物（按需本地生成）。
- `upstream/devtools-frontend/`：vendored 副本（GB 级，按钉版本填充；路径与上游 v1.7.0 `.gitmodules` 的 submodule 一致，顶层）。
- `local-config.json`、`mcp-local-config.json`：机器专属配置（模板见 `*.example.json`）。二者含本机浏览器路径与 npm 全局绝对路径，**机相关、不随仓库分发、严禁跨机直接拷贝**；跨机重新部署或迁移时必须重跑 `node localization/deploy.cjs` 由脚本依据本机环境重新生成，否则会因路径失效导致 MCP server 启动失败。

---

## 4. 钉版本机制（UPSTREAM_REF）

### 4.1 锚点字段说明

`localization/UPSTREAM_REF` 是本地化层与上游之间的**唯一版本契约**，内容形如：

```
UPSTREAM_VERSION=1.7.0
UPSTREAM_SOURCE=ChromeDevTools/chrome-devtools-mcp@chrome-devtools-mcp-v1.7.0
SNAPSHOT_DATE=2026-08-12
DEVTOOLS_FRONTEND_REPO=https://github.com/ChromeDevTools/devtools-frontend.git
DEVTOOLS_FRONTEND_BRANCH=main
DEVTOOLS_FRONTEND_COMMIT=b0a8253f0ac8aba5ec3451130f7f8b3319da1d67
DEVTOOLS_FRONTEND_SHA256=   # 可选：钉版本 tarball 的 SHA256；配置后 vendor_frontend.cjs 解包前强制校验（防御传输损坏/供应链篡改）
```

- `UPSTREAM_VERSION`：跟随的上游 npm 发布版本（当前 `1.7.0`）。
- `UPSTREAM_SOURCE`：上游仓库来源（`@chrome-devtools-mcp-v1.7.0` 表示钉版本取自该发布标签；`UPSTREAM_TAG` 决定克隆的具体标签，本方案固定 v1.7.0 而非 main 分支——main 存在 submodule 未同步的 transient 不一致，故不部署）。
- `DEVTOOLS_FRONTEND_COMMIT`：`devtools-frontend` 的钉版本 commit（由上游标签 `chrome-devtools-mcp-v1.7.0` 的树解析得到）。**构建依赖此精确 commit**，由 `vendor_frontend.cjs` 据此 sparse-clone。

### 4.2 何时及如何更新钉版本

**仅当 deliberate 决定跟随上游新版本时**才更新。严禁随手 bump 版本号却不刷新快照。更新规程：

> 注意：`DEVTOOLS_FRONTEND_SHA256` 为 **opt-in 供应链校验**——`vendor_frontend.cjs` 仅在配置该值后才在解包前强制校验 tarball SHA256，否则仅告警跳过。deliberate 跟版时建议填入钉版本 tarball 的 SHA256（防御传输损坏 / 供应链篡改）；若留空，须信任上游仓库与传输通道。

1. 修改 `UPSTREAM_REF` 的 `UPSTREAM_VERSION` 与 `DEVTOOLS_FRONTEND_COMMIT` 两个版本字段（必要时同步 `SNAPSHOT_DATE`）。
2. 直接运行 `node localization/upstream.cjs`（见 6.2），它会自动检测并 clone 新版本、刷新 `upstream/` 快照、重注入本地化、重新部署。
   - ⚠️ 若改动了 `DEVTOOLS_FRONTEND_COMMIT`：**须先删除 `upstream/devtools-frontend/`** 再运行——`vendor_frontend.cjs` 对"已存在且非空"的目录幂等跳过，不删则不会按新 commit 重新 vendoring，导致构建用陈旧 devtools-frontend 与新源码类型不匹配。
3. 跑回归测试（见第 8 节），确认无回归后再提交。

> 注意：`DEVTOOLS_FRONTEND_COMMIT` 必须从目标上游版本的标签树中解析得到（不能凭空写），否则 vendoring 失败、构建无法完成。

---

## 5. devtools-frontend vendoring

### 5.1 为什么要 vendoring

上游以 git submodule 引入 `devtools-frontend`（GB 级）。若直接以 submodule 入库：

- 会产生巨型 `.git` 与嵌套仓库，污染父仓（`git status` 异常、可能误判 gitlink）。
- 跨机克隆成本高。

方案 A 改用 **vendored 源码树**：将 devtools-frontend 的**整棵仓库**（含 `front_end/` 与 `mcp/` 等顶层目录）按钉版本精确填充到 `upstream/devtools-frontend/`（与上游 v1.7.0 `.gitmodules` 的 submodule 路径一致，顶层；上游 `tsconfig.json` 的 `include`/`files` 与 `scripts/post-build.ts` 均按该路径引用，且其源码 `src/third_party/index.ts` 相对导入 `devtools-frontend/mcp/mcp.js`，故必须整树 vendoring 而非仅 `front_end/`），且该目录被 `.gitignore` 排除、**不入库**。

### 5.2 填充步骤（构建前必需）

填充由 `localization/vendor_frontend.cjs` 完成（也由 `deploy.cjs` 步骤 2.5 自动触发）。行为：

- 读取 `UPSTREAM_REF` 的 `DEVTOOLS_FRONTEND_COMMIT`。
- 下载钉版本 commit 的 tarball（`https://github.com/ChromeDevTools/devtools-frontend/archive/<commit>.tar.gz`），解包后取**整棵仓库**（含 `front_end/`、`mcp/` 等顶层目录；GitHub partial clone 不支持路径级按需拉取 blob，故采用整树快照 tarball 方案）。
- 拷贝到 `upstream/devtools-frontend/`，排除 `.git` / `node_modules` / `build`。
- **幂等**：目标已存在且非空则跳过；支持 `--dry-run` 预检（不联网）。

新机器在 `npm run build`（位于 `upstream/`）之前，**必须先跑 vendoring 填充**，否则构建失败。

---

## 6. 本地化层脚本接口（localization/）

> 所有脚本均按脚本自身位置**相对解析路径**，跨机可用（不写死绝对路径）。调用时建议在 `chrome-devtools/` 根目录内执行，或使用脚本绝对路径；避免在错误的当前目录下用相对路径 `node localization/...` 导致找不到文件。

### 6.1 apply_localize.cjs（注入 / 剥离本地化）

核心本地化注入器。无参数时执行注入；支持以下模式：

- **（默认，无参数）注入**：向 `upstream/` 内的合法注入点 + 根 `SKILL.md` 追加本地化段并改写 `description`（根 `SKILL.md` 先 `--strip` 再注入，确保可从片段刷新）：
  - 根 `SKILL.md`（父技能运行时文档，片段 `_frag_skill_main.md` + 描述 `_frag_skill_main_desc.txt`）——**由本脚本统一重建**，不再手工维护；
  - `upstream/skills/chrome-devtools/SKILL.md`（片段 `_frag_skill_main.md` + 描述 `_frag_skill_main_desc.txt`）
  - `upstream/skills/chrome-devtools-cli/SKILL.md`（片段 `_frag_skill_cli.md` + 描述 `_frag_skill_cli_desc.txt`）
  - `upstream/README.md`（片段 `_frag_readme_local.md`）
  - 生成 `mcp-local-config.json`。根 `SKILL.md` 与上游 `skills/chrome-devtools/SKILL.md` 是不同文件、不同用途，但**同源**于同一 `_frag_skill_main.md`（单一事实源）。
  - **子 Skill frontmatter 门禁（方案③）**：对 `upstream/skills/` 下**全部**子 Skill 的 `SKILL.md` 幂等注入 `disable-model-invocation: true` + `user-invocable: false`。目的：使宿主 Agent（WorkBuddy / DeepSeek++ 等）**不得**将子 Skill 注册为可自动/手动调用的独立技能，仅允许主 Skill 内部引用；`--check` 会校验门禁存在性，缺失即 `[CHECK-FAIL]`。
- **`--check`（无副作用自检）**：仅校验守卫（`upstream/package.json` 存在）、全部注入目标存在性与子 Skill 门禁，不修改任何文件。通过输出 `[CHECK] 通过`。供 CI / 测试使用，防回归。
- **`--strip`（剥离）**：移除已注入的本地化段（哨兵行到文件末尾），用于上游更新后「刷新」重注入。剥离后需再无参重跑本脚本重新注入。**注意**：门禁字段位于 frontmatter（哨兵之前），`--strip` 不会移除；上游重新 clone 后由默认注入重新补齐。

注入目标清单在脚本内 `KNOWN_TARGETS` 写死；若某目标缺失，视为「主副本 → 部署副本失同步」，会**明确告警**（而非静默跳过）。

### 6.2 upstream.cjs（跟随上游升级）

方案 A 的上游跟进脚本。行为：

1. 检测上游最新版本（优先 `npm view chrome-devtools-mcp version`，其次 `gh release list`）。
2. clone 上游钉版本（v1.7.0 标签，由 `UPSTREAM_TAG` 决定）到临时目录（不带子模块）。
3. `--strip` 剥离旧本地化段（还原纯上游基线）。
4. 全树拷贝到 `upstream/`，受保护排除集 `devtools-frontend / node_modules / build / .gitmodules`（不覆盖本地产物、不引入 `.gitmodules`）。
5. 差量剪除 `src / scripts / skills` 中「上游已删除、本地仍残留」的陈旧文件。
6. 定向合并本地化约束（`.npmrc` / `puppeteer.config.js` / `package.json`，由 `compat.cjs` 完成）。
7. 重新注入本地化（`apply_localize.cjs`）。
8. 重新部署（`deploy.cjs`）。

支持 `--dry-run` 预检（不联网、不安装，仅打印将执行步骤）。

> 该脚本会自动检测「本地是否已是最新」：若 `upstream/package.json` 版本等于上游最新，仍会重注入并合并约束（幂等），确保不漂移。

### 6.3 deploy.cjs（全局安装 + 构建 + 配置编排）

自包含部署入口，按序执行：

1. 核查本地浏览器（`verify_browser.cjs`）。
2. 在 `upstream/` 内 `npm install`（强制 `PUPPETEER_SKIP_DOWNLOAD=1`，装齐 devDependencies 含 `puppeteer-core` 等运行时依赖）。
3. 剥离 `@paulirish/trace_engine` 的冲突全局声明（`fix_trace_engine_dts.cjs`，见第 12 节 TS2717——devtools-frontend 与该依赖都向全局接口 `HTMLElementEventMap` 注入 `[ModelUpdateEvent.eventName]: ModelUpdateEvent`，类型身份不同会冲突，须于 tsc 前剥离其一，否则构建报 TS2717）。
4. vendoring `devtools-frontend`（`vendor_frontend.cjs`）。
5. 在 `upstream/` 内 `npm run build`（tsc → `build/`）。
6. 全局符号链接 `$(npm root -g)/chrome-devtools-mcp` → 本文件夹（`npm install -g ./upstream`），并防御性确保全局 bin 命令可用（Windows 额外生成 `.cmd` 包装）。
7. 重新注入本地化（`apply_localize.cjs`）。
8. 生成 `mcp-local-config.json`，并**幂等合并进 `~/.workbuddy/mcp.json`**（含 `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1` 环境变量）。

跨机可用：拷贝本文件夹（无需 `node_modules` / `build`；但 `mcp-local-config.json` 为机相关产物、含本机路径，不随拷贝迁移）到任意位置。**重新部署（`upstream/` 已存在时）**运行 `node localization/deploy.cjs` 即自动装依赖、建符号链接、构建并重新生成本机 `mcp-local-config.json`（详见上文「机器专属配置」说明）；**全新引导（`upstream/` 不存在，例如最小化的主副本）须先运行 `node localization/upstream.cjs`** 克隆钉版本上游并自动完成后续引导（见 §6.2 / 第 7.2 节）——`deploy.cjs` 不是引导入口，它在 `upstream/` 缺失时会报错退出。

### 6.4 vendor_frontend.cjs（见第 5 节）

按 `UPSTREAM_REF` 钉版本下载 commit tarball **整树**填充到 `upstream/devtools-frontend/`（与上游 v1.7.0 submodule 路径一致，顶层；含 `front_end/` 与 `mcp/` 等顶层目录）。幂等，支持 `--dry-run`。

### 6.5 verify_browser.cjs / start.cjs / cli_run.cjs / compat.cjs

- **verify_browser.cjs**：自动搜索本机 `360Chromex.exe` / `Chrome.exe`（优先已注册安装，规避便携版），将浏览器路径写入 `local-config.json`。
- **start.cjs**：以 `--user-data-dir` 指向本机 User Data 启动浏览器（复用登录态），依赖 `local-config.json` 中的浏览器路径。脚本依赖 `verify_browser.cjs` 先写好路径。
- **cli_run.cjs**：CLI 模式辅助（`cli_run.cjs <tool> [参数]` 封装「先 `start` 连接、再调工具」的两段式）。**仅 CLI 模式使用，可被删除**，删除不影响 MCP 服务模式。
- **compat.cjs**：上游 `package.json` 依赖兼容守卫（固定 `zod` 等兼容版本，避免 npm install 浮动装 v4 导致编译失败）。被 `deploy.cjs` / `upstream.cjs` 调用。

### 6.6 fragments/ 与 test/

- **fragments/**：本地化注入片段源。
  - `_frag_skill_main.md` / `_frag_skill_cli.md`：注入到上游两个子技能 SKILL.md 的本地化段。
  - `_frag_skill_main_desc.txt` / `_frag_skill_cli_desc.txt`：中文化的 `description` 完整行。
  - `_frag_readme_local.md`：注入到上游 `README.md` 的本地化段。
  - `_frag_mcp_config.json`：MCP 配置模板（`__GLOBAL_BIN__` 占位符由 `apply_localize.cjs` 替换为实际全局 bin 路径）。
- **test/localize.test.cjs**：本地化层单元测试，预期 **全部 PASS（当前 14 项；增减后请以 test 文件实际 T 编号为准）**，含 `--check` 断言（T7 等）。是回归验证的主入口。

---

## 7. 陌生 Agent 自主跟进与演进步骤

### 7.1 日常使用（仅调用，无需重新部署）

若本机已完成部署（`upstream/` 已构建、全局 bin 可用、浏览器已启动）：

1. 按 `SKILL.md` 的「步骤 0 模式检测」判断 MCP / CLI 模式。
2. 按「步骤 1」检测端口 / 启动浏览器。
3. 直接调用浏览器工具（MCP 工具或 CLI 子命令）。

日常使用**不触碰 `upstream/` 源码、不重跑部署脚本**。

### 7.2 新机器首次复现（完整部署）

主副本不含 `upstream/`（可衍生、不入库）。在 `chrome-devtools/` 根目录内执行**一条命令**即可完成"引导上游快照 + 构建 + 安装 + 注入 + 生成配置"全流程：

```bash
node localization/upstream.cjs
```

`upstream.cjs` 在 `upstream/` 缺失时自动进入全新引导（bootstrap）模式：克隆钉版本上游 → 定向合并本地化约束（`compat.cjs`）→ 注入本地化（`apply_localize.cjs`）→ vendoring `devtools-frontend` → 全局安装与构建（`deploy.cjs`）→ 生成 MCP 配置。可先加 `--dry-run` 预检。该步骤需联网（git clone 上游、npm 安装、克隆 devtools-frontend）。

随后：

1. **自检浏览器路径**：`node localization/verify_browser.cjs`（deploy 已触发；如未生成 `local-config.json` 可补跑）。
2. **回归自检**：`node localization/test/localize.test.cjs`（预期 全部 PASS（当前 14 项；增减后请以 test 文件实际 T 编号为准））。
3. 在 WorkBuddy 连接器管理页「信任」chrome-devtools 服务器。

### 7.3 跟随上游升级到新版本

1. 修改 `localization/UPSTREAM_REF` 的版本字段（见 4.2）。
2. 运行 `node localization/upstream.cjs`（自动检测最新 → 刷新 `upstream/` → 重注入 → 重部署；可先加 `--dry-run` 预检）。
3. 跑回归测试（见第 8 节）。
4. 确认无回归后，按第 9.1 节约束**仅提交 `chrome-devtools/` 目录**（备份 zip 等严禁入库）。

### 7.4 仅刷新本地化片段（不升级上游）

当 `fragments/` 内容调整、或需重置本地化状态时：

1. `node localization/apply_localize.cjs --strip`（剥离旧段）。
2. `node localization/apply_localize.cjs`（重新注入最新片段 + 生成配置）。
3. `node localization/test/localize.test.cjs` 回归自检。

---

## 8. 测试与回归

### 8.1 本地化层单元测试

`node localization/test/localize.test.cjs` 是本地化层的主回归入口。预期 **全部 PASS（当前 14 项；增减后请以 test 文件实际 T 编号为准）**，覆盖注入 / 剥离 / 描述本地化 / `--check` 守卫断言（含 T7）等。

- 可在部署前后各跑一次，确认本地化注入未漂移、守卫齐全。
- `apply_localize.cjs --check` 可作为轻量 CI 门禁（无副作用），验证注入目标存在性。

### 8.2 上游自带测试（可选）

`upstream/` 内含上游 `tests/`（如 `tests/tools/input.test.ts`）。这些属于上游快照代码，**本地化层不改动、不运行**（方案 A 原则：不改上游源码）。如需验证上游功能，参照上游 `README.md` / `docs/` 单独进行。

> ⚠️ 注意：上游测试代码中可能含口令类、令牌类等敏感字面值（如 DOM 测试按元素 id 取密码输入框之类写法），会被本仓库 `scripts/smoke/tier0_secrets.py` 密钥扫描误报。方案 A 已在 `tier0_secrets.py` 中对 `chrome-devtools/upstream/` 整树加路径豁免（纯外部代码、不改源码、跳过密钥扫描）。**不要**为消除误报而修改 `upstream/` 内源码。

---

## 9. 关键约束与红线

### 9.1 不入库清单（严禁）

以下任何内容**不得**提交到仓库（已被 `.gitignore` 排除，提交前用 `git status` / `git check-ignore` 复核）：

- `chrome-devtools_v1.6.0.zip` 等历史备份压缩包。
- `upstream/node_modules/`、`upstream/build/`、`upstream/devtools-frontend/`。
- `local-config.json`、`mcp-local-config.json`（机器专属配置）。

提交范围**仅限 `chrome-devtools/` 目录**，且不应包含上述资产。

### 9.2 路径与依赖约束

- **严禁 `npx -y <pkg>`**：一律用 `node "$(npm root -g)/..."` 或 `npm install -g ./upstream` 全局安装。全局根即 `$(npm root -g)`（随 Node 安装位置而定，**切勿写死绝对路径**）。
- 依赖安装务必 `PUPPETEER_SKIP_DOWNLOAD=1`（部署脚本已内置），否则 `puppeteer` 会下载 Chromium 内核——本机已有 360Chromex，无需下载。
- 本机中文路径会导致 node / npm 失败；跨机移植以 **ASCII 路径的主副本**为准，脚本均按脚本所在目录相对解析。

### 9.3 浏览器与登录态约束

- 复用登录态必须 `--browserUrl` 直连已启动实例；**切勿用 `--isolated`**（会生成临时 profile 丢登录态）。
- 浏览器用 `--executablePath` 而非 `--channel`（360Chromex 不在受支持 channel 列表）。
- 动用户日常浏览器需谨慎（安全红线）：自动化前确认无未保存编辑；收尾用 `close_page` 关掉临时标签页。

---

## 10. 工具兼容性边界（resize_page 等）

### 10.1 resize_page（上游 1.7.0 新增）

`resize_page <宽> <高>`（对应 `upstream/src/tools/pages.ts`）用于调整**选中页面窗口**尺寸。已知边界：

- 依赖 CDP 窗口管理域；当目标窗口处于**最大化 / 全屏**状态时，需先还原窗口状态才能 resize（上游 PR #748 已处理该场景）。
- 360Chromex 一般可用；若遇 CDP 不支持（类比扩展工具 `Extensions` 域被裁剪的情况），**降级为手动调整窗口尺寸**，切勿反复重试浪费时间。
- 该工具调整的是**页面窗口**，不是视口 emulation；与 `emulate` 的视口模拟是两回事。

### 10.2 扩展工具（Extensions 域）

`install_extension` / `trigger_extension_action` / `reload_extension` 等仅在 MCP server 以 `--categoryExtensions` 启动、或 CLI `start` 模式（默认已启用扩展）下可用。若运行 `list_extensions` 返回 `Extensions.getExtensions wasn't found`，说明该浏览器（常见于 360Chromex 等**定制 Chromium 构建**）裁掉了该域——此时应降级：用 `new_page chrome://extensions/?id=<id>` 截图证明扩展已加载，并在目标站点截图证明内容脚本注入，把需交互的侧边栏操作交用户补图。**切勿反复重试 `trigger_extension_action` 浪费时间。**

### 10.3 底层真机点检（CDP 直连补充模式）

> 本小节为「补充能力」：前文（第 2 节「步骤 1」、第 7 节）均以 chrome-devtools-mcp 的 MCP 工具 / CLI 子命令驱动浏览器；当这些工具不足以完成**更底层的真机诊断**时（如 headless 加载扩展验证、诊断页面卡死、扩展页面 DOM 断言），可在浏览器已以 9222 调试端口运行的前提下，用 Node 内置 `WebSocket` **直连 CDP**（不依赖 puppeteer/playwright 封装）。该模式与技能「`--browserUrl` 直连已运行的 360Chromex」底层路径一致，属兼容补充。
>
> 适用前提：Chrome / Chromium 系内核（含 360Chromex 等定制内核）+ 用 Node 内置 WebSocket 直连 CDP。

**直连模式要点（避开 flatten 坑）**

- 从 `http://127.0.0.1:9222/json/list` 取目标（按 `type==="page"` + url 片段匹配），直接 `new WebSocket(t.webSocketDebuggerUrl)`；连上后**立即** `Page.enable` + `Runtime.enable`。
- **勿用 `Target.attachToTarget({flatten:true})`**：flatten 模式 `sessionId` 必须放在 CDP 消息**顶层**（`{id, sessionId, method, params}`）；若误塞进 `params`（写成 `{id, method, params:{sessionId}}`），命令会被路由到**浏览器级会话**（无 `Runtime.evaluate`）→ 报 `-32601 'Runtime.evaluate' wasn't found`，所有命令全失败。
- 命令响应为两层嵌套：`r.result.result.value`（Runtime.evaluate + returnByValue）。

**启动 360Chromex 的端口与路径陷阱**

- **PowerShell `Start-Process` + 单引号字面量**启动（避开 Git Bash 双引号吞反斜杠：`\T`→`T`、`\C`→`C`，路径反斜杠被吃光 → 命令行参数损坏 → 9222 无监听、扩展未加载）。
- 端口就绪判定：浏览器启动后 `curl http://127.0.0.1:9222/json/version` 返回含 `Browser` 字段的 JSON 即成功。
- **多个 CDP 客户端不要并行驱动同一浏览器**（并发争用 → `send timeout` 伪失败），须串行。

**360Chromex headless 特殊行为（完善第 10.2 节扩展降级）**

- 360Chromex 等**定制版浏览器**在无窗口 / 无交互会话中 GUI 进程可能自行退出（端口 `ECONNREFUSED`）；headless 真机点检须用 `--headless=new` + `Start-Process` 保证独立常驻。
- `--load-extension` **仅 headless 生效**（GUI 模式该参数被忽略；headless=new 下生效，扩展以临时方式加载，不落盘到 Extensions 目录）——在与第 10.2 节 `Extensions` 域被裁剪而降级时，提供 headless 下的替代验证路径。

**页面 / 扩展初始化死锁判别（完善「动用户浏览器需谨慎」红线）**

- 初始化期 `window.confirm` / `window.alert` 会**阻塞渲染进程主线程**，在 headless/CDP 下与对话框处理互相死锁，被误判为「renderer 崩溃」（CDP 永久无回包、标题黑屏、控制台无异常）。
- **判别崩溃类型**：浏览器级 `Inspector.enable` 后监听 `Inspector.targetCrashed`；若 `targetCrashed` 未触发且目标仍在 `/json/list` → **同步死循环 / 主线程锁死（非原生崩溃）**。据此可区分「页面自身死锁」与「环境 / 浏览器崩溃」，避免误判。
- 根则：初始化路径（模块求值即执行 / `init()` 同步段）**绝不调用阻塞式对话框**；须改用页内 DOM 弹窗 + `Promise` 的非阻塞确认（自动化测试台不会自动点击 DOM 弹窗，需在单测验证 Promise 解析逻辑）。

**红线衔接（与第 9.3 节一致）**

- 真机点检结束，关闭过程中开出的临时标签页；若动用户日常浏览器，先确认无未保存编辑（读 `.cm-content` 等字符数）。

---

## 11. SKILL.md 与 README.md 职责边界（本文件定位）

| 维度 | SKILL.md | README.md（本文件） |
| --- | --- | --- |
| 读者 | WorkBuddy / Agent（运行时） | 人 / 陌生 Agent（演进 / 维护） |
| 内容 | 工具调用、启动流程、本地化用法、红线 | 架构原理、目录布局、钉版本、vendoring、脚本接口、演进步骤、已知坑 |
| 性质 | 精简指令，不含解释性 / 维护性内容 | 解释性、维护性、结构化说明 |
| 演进时 | 根 SKILL.md 与上游子技能 SKILL.md 均由 `apply_localize.cjs` 从同一 `_frag_skill_main.md` 注入生成（同源单一事实源，根文档不再手工维护） | 由维护者人工更新以反映设计决策 |

简言之：**SKILL.md 管「怎么用」，README.md 管「为什么这样、怎么演进」**。任何 Agent 运行时不需要的内容，都从 SKILL.md 移入本文件。

---

## 12. 故障排查与已知坑

- **构建失败报缺模块**：上游运行时依赖在 devDependencies，`npm install -g chrome-devtools-mcp` 的发布包不含运行时依赖。必须用「本地文件夹安装」（`deploy.cjs` 的 `npm install` + `npm install -g ./upstream`）装齐依赖，不可只装全局包。
- **全局 bin 命令不可用**：npm 对「本地文件夹全局安装（符号链接）」模式可能静默跳过 bin 链接创建。`deploy.cjs` 的 `ensureGlobalBinLinks()` 已显式兜底（Windows 生成 `.cmd` 包装）；若仍不可用，检查 `$(npm root -g)/chrome-devtools-mcp/build/src/bin/` 是否存在构建产物。
- **构建报 zod 版本不兼容**：`compat.cjs` 已固定兼容版本；若手动改过 `upstream/package.json` 导致浮动，重跑 `deploy.cjs` 或 `upstream.cjs` 重新应用约束。
- **devtools-frontend 缺失导致构建失败**：新机器必须先跑 `vendor_frontend.cjs`（或 `deploy.cjs` 步骤 4 自动触发）填充 `upstream/devtools-frontend/`（注意是顶层 `devtools-frontend`，与上游 v1.7.0 submodule 路径一致；填错位置会导致 `tsconfig.json` 的 `files` 列表找不到 `acorn.mjs` 而构建失败），该目录被 `.gitignore` 排除、不入库。
- **构建报 TS2717（Subsequent property declarations must have the same type，涉及 `ModelUpdateEvent` / `HTMLElementEventMap`）**：devtools-frontend 的 `front_end/models/trace/ModelImpl.ts` 与依赖 `@paulirish/trace_engine` 的 `models/trace/ModelImpl.d.ts` 都向全局接口 `HTMLElementEventMap` 注入 `[ModelUpdateEvent.eventName]: ModelUpdateEvent`，但二者 `ModelUpdateEvent` 类型身份不同 → 冲突。这是上游已知问题，上游 `scripts/prepare.ts` 在 `tsc` 前剥离 `@paulirish/trace_engine` 那份声明。`deploy.cjs` 步骤 3（`fix_trace_engine_dts.cjs`）已自动执行该剥离；若手动构建，须先 `node localization/fix_trace_engine_dts.cjs` 再 `npm run build`。注意：`npm install` 会还原该 `.d.ts`，故须在每次构建前重跑（脚本幂等，已剥离则跳过）。
- **本地化注入静默跳过（F-01 / F-02 回归）**：注入目标缺失时不报错。用 `node localization/apply_localize.cjs --check` 自检；若报 `[CHECK-FAIL]` 说明主副本 → 部署副本失同步，先解决 `upstream/package.json` 存在性等前置，再重跑注入。
- **pre-commit 密钥扫描误报**：见第 8.2 节，`upstream/` 整树已加路径豁免，不要为消除误报修改上游源码。

### 12.1 官方深度参考（超出本手册范围时查阅）

本手册聚焦本地化与部署；若需上游原生能力、UI 用法或启动期排查，直接查阅官方资料：

- **Chrome DevTools 官方文档**：https://developer.chrome.com/docs/devtools
- **DevTools AI 辅助（AI Assistance）**：https://developer.chrome.com/docs/devtools/ai-assistance
- **chrome-devtools-mcp 启动 / 连接故障排查（上游 docs/troubleshooting.md）**：https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/troubleshooting.md

> 以上外部链接原置于根 `SKILL.md` 末尾的 `## Troubleshooting`，因其属「解释说明类、Agent 运行时非必需」信息，按 SKILL.md/README.md 职责边界（第 11 节）已迁入本手册，避免污染 Agent 运行时文档。
