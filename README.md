# AI_MCP-Skill-CLI 仓库说明（README）

> 本仓库是 `zhangweildlh` 的个人 **私有** 技能(Skill)集合，存放所有 AI 技能的 Definition 文件与配套脚本。
> 本文件逐一对仓库内 **16 个活跃技能**（9 个目录型 + 7 个根级单文件型）进行说明：用途、外部依赖/外部工具/外部需求。
> 仓库首个发布版本标记为 **`v1.0.0`**（git 标签，作用于整个仓库快照；各技能自身的内部版本见各自 frontmatter 的 `version` 字段）。

---

## 一、技能总览

| # | 技能名称(name) | 内部版本 | 形态 | 位置 | 一句话用途 |
|---|---|---|---|---|---|
| 1 | `github-personal-manager` | 随仓库 v2.2.1 | 目录型 | 仓库根 | 个人 GitHub 全流程管理（改代码、PR、同步、CI、发版、清分支） |
| 2 | `ref-material-writing` | 5.0.0 | 目录型 | 仓库根 | 基于提纲+多份参考资料的文档撰写，输出 Office(docx) 文件 |
| 3 | `tender-review-kit` | — | 目录型 | 仓库根 | 招标文件审标，产出投标核对清单（废标项/评分项/▲参数/时间节点） |
| 4 | `web-search` | 1.0.0 | 目录型 | 仓库根 | 深度联网搜索与下载，多来源印证，落盘素材文件 |
| 5 | `code-review-combo` | 1.0.0 | 目录型 | 仓库根 | 双子技能（委托模式 + 五焦点语义）交叉验证，产出唯一合并审计报告 |
| 6 | `mimo-code-collab` | 6 | 目录型 | 仓库根 | 与小米 MiMo 代码智能体(mimo.code)协同开展工程任务 |
| 7 | `playwright-360chrome` | 2.0.0 | 目录型 | 仓库根 | Playwright + 360Chromex 内核的浏览器自动化（导航/截图/抓取） |
| 8 | `workbuddy-workspace-migration` | — | 目录型 | `Workbuddy专属/` | 工作区迁移/恢复丢失的 WorkBuddy 会话 |
| 9 | `chrome-devtools` | — | 目录型 | 仓库根 | 通过 Chrome DevTools MCP 服务器驱动本地浏览器（Chrome / 360Chromex）调试、自动化、性能分析与网络检查（全局安装 `chrome-devtools-mcp`） |
| 10 | `skill-forge` | 3.0.0 | 单文件 | 仓库根 `Skill-元技能，Skill创建校验器.md` | 元技能双模：创建新 Skill + 校验既有 Skill 定义（合并原 skill-creator 与 skill-checker） |
| 11 | `multi-file-analysis` | — | 单文件 | 仓库根 `Skill-多文件分析+知识图谱构建.md` | 多文件解析、实体关系抽取、冲突/缺失识别，构建知识图谱 JSON |
| 12 | `find-skill-to-xml` | 1.1.0 | 单文件 | 仓库根 `Skill-扫描Skill技能生成xml技能标签.md` | 扫描目录发现 Skill 文件，生成标准 XML 技能标签清单 |
| 13 | `promotion-writer` | — | 单文件 | 仓库根 `Skill-推广文章撰写.md` | 面向微信公众号/小红书的中文推广文案撰写 |
| 14 | `ticktick` | — | 单文件 | 仓库根 `Skill-滴答清单智能任务解析创建器.md` | 解析自然语言指令，批量创建/管理滴答清单(TickTick)任务 |
| 15 | `file-structure-organizer` | 1.0.0 | 单文件 | 仓库根 `Skill-文件内容整理重组.md` | 依据「文件结构化组织规范（12 条强制要求）」对 Markdown 文件读取、整理与重组 |
| 16 | `code-audit-consolidation` | 1.0.0 | 单文件 | 仓库根 `Skill-多代码审计报告归一收敛.md` | 整合多视角审计报告，去重归因、交叉分析、根因分析，产出唯一根治报告 |

> 注：
> - 已退役/移除，不再纳入说明：`anysearch-skill`（2026-07-23 清理其独立目录，CLI 现位于 `web-search/scripts/anysearch_cli.py`）、`github-repo-sync`（2026-07-24 退役，能力并入 `github-personal-manager`）。
> - 根目录原有 3 个单文件技能（`Skill-memory-consolidate.md`、`Skill-workflow-distill.md`、`Skill-代码审查.md`）：前二者已移入 `Workbuddy专属/` 子目录；`Skill-代码审查.md` 已删除，能力并入 `code-review-combo`。
> - 根目录另有 `在Deepseek和WorkBuddy等AI中安装小米智能体-2026-07-07.7z` 压缩包（属历史存档，**不入库、不纳入活跃技能说明**）。

---

## 二、各技能详细说明

### 1. github-personal-manager（GitHub 个人管理）

- **用途**：面向个人日常所有 GitHub 管理与操作的统一执行技能——仓库管理、代码修改/提交/推送/开 PR、向上游贡献、同步巡检、CI 排错、Release 发版、分支清理。所有动作先用"大白话"说明后果并暂停确认，严守"禁止强推/删除 main"等全局禁令。
- **外部依赖 / 外部工具 / 外部需求**：
  - **`git`**：`D:\Tools\Assembly\git\cmd\git.exe`（v2.54.0）。
  - **`gh` CLI**：`D:\Tools\Assembly\gh.exe`（v2.96.0，已登录 `zhangweildlh`，scopes 含 repo/workflow/admin:org）。
  - **GitHub 账号 + 网络**：用于远端读取/搜索/PR/CI/Release。
  - **本地仓库根目录**：默认 `D:\Documents\AI_Work_Temp`（一级子目录即各仓库）。
  - **参考文件**：`references/gh-capability.md`、`references/fork-ci-pitfalls.md`、`references/docs-sync-checklist.md`。
  - **多工作树并行开发 SOP（2026-08-03 新增）**：`scripts/sop_worktree_add.sh` / `sop_worktree_cleanup.sh` / `sop_worktree_merge.sh` 三件套（顶层方案文档 `multi-worktree-parallel-merge-sop.md` 已于 2026-08-06 移除，能力内聚于三件套脚本本身）。
  - **不依赖任何 MCP**；本机无 Docker、禁止本地编译（构建产物走远程 CI）。
- **备注**：含硬约束——禁止强推/删 main、标签重推用"删远端标签+重推"、本地 main 跟踪 origin/main。

### 2. ref-material-writing（参考资料驱动文档撰写）

- **用途**：严格依据用户提供的写作需求、提纲与多份参考资料完成高质量文档撰写（公文/报告/方案/建议书/综述），10 步流水线，最终输出 Office 文件（默认 `.docx`）。每处事实/数据可溯源、禁止编造；支持跨会话断点续跑。
- **外部依赖 / 外部工具 / 外部需求**：
  - **OfficeCLI（`officecli`）**：外部命令，用于读写 `*.docx/*.xlsx/*.pptx`；命令失败必须 `officecli --help` 取权威 schema 重试。
  - **AnySearch CLI**：联网补全双引擎之一。ref-material-writing 已**自包含内嵌** AnySearch CLI 副本（`scripts/anysearch_cli.py` + `scripts/shared/` + 技能根 `.env`，API Key 由技能根 `.env` 自动加载），内部所有引用统一为基于技能目录的相对路径 `scripts/anysearch_cli.py`，**不依赖任何外部 Skill**（原 `anysearch-skill` 已于 2026-07-23 退役；`web-search` 亦自带独立副本）。
  - **Firecrawl MCP**：双引擎之二（search/scrape/extract/agent/map/crawl/batch/interact），经 Dynamic-mcp 中继或直接直连。
  - **Dynamic-mcp MCP**：`mcp__Dynamic-mcp__list_groups / get_dynamic_tools / call_dynamic_tool`。
  - **UV / Python 环境**：`uv run --project D:/Tools/Assembly/python/myenv` 运行 AnySearch CLI。
  - **原生 `web_search` / `web_fetch`**：双引擎不可用时的补偿/降级通道。
  - **网络访问**。
  - **配套资源**：`_router/step-01.md ~ step-10.md`、`references/*`、`assets/*` 模板。
- **备注**：采用渐进式披露，主 SKILL.md 仅含路由与决策规则，按步骤加载细节。

### 3. tender-review-kit（招标文件审标）

- **用途**：审的是招标方发的招标文件（PDF/Word），服务要去投标的人。输入一份招标文件 → 产出"投标核对清单"（废标项+评分项+证明材料+▲标识参数+时间节点，每条带原文行号出处），帮投标人在动手写标书前吃透规则。**只产清单、不下"投/不投"结论**。
- **外部依赖 / 外部工具 / 外部需求**：
  - **Python 3**（标准库 + 以下 pip 包）：`python-docx`、`pypdf`、`openpyxl`。
  - **`pdftotext`**（系统依赖，可选）：PDF 文本提取；缺失则自动回退 `pypdf`。
  - **`gh` CLI（可选）**：仅当用户愿意把新发现的判词贡献回开源词库时，用于自动建 GitHub Issue；未装则导出文件让用户手动粘贴。
  - **无 MCP 依赖**。
  - **内置资产**：`scripts/*.py`（取数/撒网/补词/护栏/出 Excel）、`references/`（废标对照总清单、商务线、技术线）、`data/keywords.json`（120+ 判词库）。
- **备注**：首次必跑 `uv run --project D:/Tools/Assembly/python/myenv python scripts/check_env.py` 自检环境。

### 4. web-search（深度联网搜索与下载 · 父 Skill 双轨架构）

- **用途**：面向深度联网搜索与信息下载的**父 Skill**。采用「父协调 + 双子 Skill 双轨独立搜索 + 多来源印证 + 双工具相互补台 + Agent 原生 `web_search`/`web_fetch` 兜底」架构，产出结构化中文报告并落盘 Markdown 素材文件（统一 schema，含来源标签与印证标记）。父 Skill 持有全部本地化/私有化/定制化约束与裁决逻辑；两个子 Skill 各自独立演进，上游更新可低成本跟进。
- **架构与子 Skill**：
  - **轨道1 · AnySearch（`web-search/anysearch-skill/`）**：源自上游 `anysearch-ai/anysearch-skill`（v3.0.1）**扁平并入**的子 Skill（**非独立 clone、无嵌套 `.git`**，故**不能** `git pull` 升级；升级走「下载上游文件覆盖 + 保留本仓库 `_load_env` 父级 `.env` 探测补丁」，详见 `web-search/README.md`）。经 `uv run --with requests python {SKILL_ROOT}/anysearch-skill/scripts/anysearch_cli.py` 调用。
  - **轨道2 · Firecrawl（`web-search/firecrawl/SKILL.md` 适配层 + 全局 `firecrawl` CLI）**：适配层封装官方 Firecrawl CLI（npm 全局安装，落 `D:\Tools\Assembly\nodejs\node_global`，v1.19.27），覆盖 search/scrape/crawl/map/agent/interact，功能等价 MCP 但无需运行 MCP 服务。上游 API 演进由适配层经 `gh api` 追踪 `firecrawl/firecrawl` 的 `openapi.json` 跟进。
- **外部依赖 / 外部工具 / 外部需求**：
  - **AnySearch 轨道**：`uv`（`uv run --with requests python`，不依赖本机 myenv）+ 网络；API Key 由**父级** `web-search/.env` 的 `ANYSEARCH_API_KEY` 加载（脚本 `_load_env` 三级探测：脚本同目录 → `anysearch-skill/` → `web-search/`）。
  - **Firecrawl 轨道**：全局 `firecrawl` CLI（Node.js 工具，已安装）；API Key 由 `firecrawl login` 写入全局凭据，**不入库、不落盘**到 `web-search/.env`。
  - **原生 `web_search` / `web_fetch`**：双轨均不可用时的最终兜底补偿通道。
  - **配套参考（已删除）**：原 `references/anysearch.md`、`references/firecrawl.md`、`references/orchestration.md` 已移除，知识已并入父 SKILL.md 与子 Skill 文档。
  - **网络访问**。
- **备注**：父 Skill 完全自包含、不依赖/不加载其他技能定义；路径一律相对路径（基于 `{SKILL_ROOT}` 注入），可移植部署任一目录不失效；隐私门禁（手机号/身份证/密码脱敏）前置。

### 5. code-review-combo（组合式代码审查）

- **用途**：将两种互补的代码审查子技能——`open-code-review-delegate`（委托模式确定性审查）与 `review-spd`（五焦点语义深度审查）——交叉验证，产出**唯一合并审计报告**（人类可读文本 + 结构化 JSON）；为同一代码改动提供高置信度的单一审查结论。
- **外部依赖 / 外部工具 / 外部需求**：
  - **子技能**：`open-code-review-delegate`（中文增强委托审查，v1.1 衍生）、`review-spd`（五焦点语义深度审查，v1.1）。二者均纯提示词流程，无 shell/MCP 依赖。
  - **适用场景**：GitHub 仓库、代码修改、代码提交；代码审查/审计/BUG 查找。
  - **不适用**：纯非 GitHub/纯非 Git 文件夹的代码审查；非代码审查类任务（文档润色、需求分析）。
  - **审查与执行严格分离**：审查阶段显式 `do-not-modify`，矛盾时输出单一权威报告而非多版并存。
- **备注**：本技能承接了原根级单文件技能 `Skill-代码审查.md` 的能力（该文件已于 2026-08-03 删除）。

### 6. mimo-code-collab（小米 MiMo 代码协同）

- **用途**：当需要与 mimo.code（小米 MiMo 代码智能体）协同开展任何工程任务时加载本技能——代码编写、修改、BUG 修复、代码审核、项目分析与重构、技术方案/架构讨论与文档编写、非代码文件（配置/文档/规格）讨论与编写、GitHub 变更的内容生成与审阅。
- **外部依赖 / 外部工具 / 外部需求**：
  - **mimo.code（小米 MiMo 代码智能体）**：经 `Dynamic-mcp` 工具中转连接 或 MCP 服务方式直接连接（两种接入形态通用）。
  - **Dynamic-mcp MCP / mcp-bridge**：提供 `mimo.chat` / `mimo.code` / `mimo.health` / `mimo.metrics` 工具门面。
  - **强制连接韧性约束（★ 最高优先级）**：连接超时/失联须原样重试 2 次；连续 3 次失败才允许主 Agent 单独工作（降级而非甩锅）。
  - **无 shell 依赖**；能力边界明确"mimo 可在 `working_dir` 内生成/修改文件"。
- **备注**：配套 `mimo_mcp.py` 提供双形态（dmcp.exe 中继 / 宿主直连）实现、`mimo.metrics` 可观测性、默认超时 900s。

### 7. playwright-360chrome（浏览器自动化 · 本地自建）

- **用途**：通过 Playwright（含 MCP 浏览器工具）实现浏览器自动化——导航网页、点击元素、填写表单、截图、提取数据、调试真实浏览器工作流。适用于需要真实浏览器而非静态抓取、涉及 Playwright MCP/浏览器工具/JS 渲染页面的场景。
- **外部依赖 / 外部工具 / 外部需求**：
  - **Playwright（Node.js 运行时）**：`node` + `playwright` 包；示例 `pw_launch.mjs` / `test_pw_userdata.mjs` 演示启动与用户态(userDataDir)复用登录态。
  - **360Chromex 内核**：本机指定 `D:\Tools\360Chrome\360chromex.exe` 作为 executablePath（禁止下载自带 Chromium）；复用登录态按 userDataDir 隔离。
  - **Playwright MCP**（可选）：经 Dynamic-mcp 或直连暴露 `browser_*` 工具。
  - **参考文档**：`scraping.md` / `selectors.md` / `testing.md` / `debugging.md` / `ci-cd.md`。
- **备注**：2026-08-03 新增技能（v2.0.0）；与环境硬约束一致——本机无 Docker，浏览器自动化走本地已装内核。

### 8. workbuddy-workspace-migration（工作区迁移 · 位于 `Workbuddy专属/`）

- **用途**：WorkBuddy 的本地数据存储架构与工作区迁移工作流。当重命名/移动工作区目录后会话消失、需要恢复丢失的对话，或诊断某些会话为何不可见时使用。
- **外部依赖 / 外部工具 / 外部需求**：
  - **Python 3**（标准库）：`scripts/migrate.py`（迁移）、`scripts/organize.py`（归档整理）、`scripts/purge.py`（清理）。
  - **无 MCP 依赖**；纯本地文件操作。
  - **`_user_meta.json`**：用户/工作区元数据。
- **备注**：本技能原位于仓库根 `workbuddy-workspace-migration/`，2026-08-03 整体迁入 `Workbuddy专属/` 子目录（与 `Skill-memory-consolidate.md`、`Skill-workflow-distill.md` 一并归置）。

### 9. chrome-devtools（Chrome DevTools 浏览器调试 · 目录型）

- **用途**：通过 Chrome DevTools MCP 服务器驱动本地浏览器（Chrome / 360Chromex 等）进行网页调试、浏览器自动化、性能分析（Lighthouse / Performance Insight）与网络检查的中文本地化技能；可任选 MCP 服务模式或 CLI 模式使用。
- **外部依赖 / 外部工具 / 外部需求**：
  - **Chrome DevTools MCP 服务器**：以**全局方式**安装（`npm install -g`，位于 `$(npm root -g)/chrome-devtools-mcp`），**禁用 `npx -y`**；首次工具调用时基于持久化 Chrome 配置自动启动浏览器。
  - **本地浏览器**：本机 Chrome / 360Chromex 内核；可复用已登录浏览器会话（连接已登录浏览器复用登录态）。
  - **无 Python / 无额外 shell 依赖**；CLI 模式与 MCP 服务模式功能等价。
- **备注**：承接浏览器调试/自动化场景，与 `playwright-360chrome`（Playwright 路线）互为补充；激活关键词含 Chrome DevTools、页面快照、元素交互、LCP/内存/可访问性分析、网络请求检查、控制台日志、网页截图。

### 10. skill-forge（Skill 创建校验器 · 元技能双模）

- **用途**：单文件元技能，兼具「创建新 Skill」与「校验既有 Skill 定义」双模能力——将模糊业务需求经"需求访谈 → 需求解析 → Skill 编写 → 自动校验"转化为合规 Skill 定义（Markdown），或对既有 Skill 做 11 维度全量合规校验并输出修正版。由原 `skill-creator` 与 `skill-checker` 合并而来（v3.0.0）。
- **外部依赖 / 外部工具 / 外部需求**：
  - **无外部工具 / 无外部依赖**：纯提示词流程技能，不调用 shell/MCP/API。
  - 内置完整《Skill 定义标准规范》（frontmatter、11 维度校验、Markdown 语法强制规范、触发词五要素等）。
- **备注**：交付物为符合标准的完整 Skill 定义；`max_content_length` 默认 15000 字符（可配 1000–50000），`strict_mode` 可选。

### 11. multi-file-analysis（多文件分析 + 知识图谱构建）

- **用途**：处理上传的多文件（PDF/DOCX/MD/TXT），做内容解析清洗、实体关系抽取、缺失与冲突识别（逻辑矛盾优先），构建标准化 JSON 知识图谱（节点-边列表），专为网页版 AI 对话分析设计。支持五类文档：市场分析/公文/商业合作/技术方案/融资方案，置信度按文档类型分别采用五套公式。
- **外部依赖 / 外部工具 / 外部需求**：
  - **无外部工具 / 无外部依赖**：纯提示词技能；由 AI 在对话中完成解析与抽取。
  - 输入支持 PDF、DOCX、MD、TXT（无图片/扫描件/Excel；表格仅 DOCX）。
  - 输出为标准化 JSON（UTF-8、2 空格缩进），可直接导入知识图谱工具或网页 AI。
- **备注**：合规提示——该技能 frontmatter 使用 `description: >` 多行写法且以 `instructions:` 承载指令（非标准 `---` 围栏 + 正文结构），在仓库的 Tier1 结构校验中会被标记 WARN，建议后续补标准 `---` 围栏。

### 12. find-skill-to-xml（扫描 Skill 生成 XML 标签）

- **用途**：扫描指定工作目录及其一级子目录，发现所有合规 Skill 定义文件（`SKILL.md` 或以 `Skill-` 开头的 `.md`），校验其 YAML 前置元数据完整性，提取 `name`/`description`，生成标准 XML 技能片段（`<available_skills>`）展示在对话中，用于 Skill 目录索引、批量发现、向外部系统提供清单。
- **外部依赖 / 外部工具 / 外部需求**：
  - **工具（Windows PowerShell 环境）**：`shell_status`、`shell_exec`、`local_folder_pick`（图形选目录；取消则回退默认 `D:\Documents\AI_MCP-Skill-CLI`）。
  - 命令语法须为 Windows PowerShell（仅 `;` 与 `|` 连接）。
  - 可选：当文件较多时，提示用 `uv run python script.py` 批量处理。
- **备注**：仅扫描一级子目录、不递归；不读取/修改/删除任何文件；不校验字段值合法性（仅查 name/description 非空）；重复 name 按修改时间保留最新。

### 13. promotion-writer（推广文章撰写）

- **用途**：面向微信公众号、小红书等中文社交平台的推广文案创作。要求高亲和力、强共鸣，轻快有节奏的行文 + 适量 emoji + 合理留白，多角度拆解产品亮点、锚定用户痛点、层层递进实现情感共情，最终以 Markdown 输出。
- **外部依赖 / 外部工具 / 外部需求**：
  - **无外部工具 / 无外部依赖**：纯提示词技能。
  - 不适用公文、学术报告、创意小说等严肃/虚构写作。
- **备注**：输出强调"有观点有结论 + 证据锚点 + 多维拆解 + 场景呼应痛点"。

### 14. ticktick（滴答清单智能任务解析创建器）

- **用途**：基于滴答清单 MCP 工具，将用户自然语言指令（单条/多条复合）智能解析、拆分、归类、设时间/优先级/标签，并**直接调用 MCP 工具真实创建/查询/修改任务**。含多任务拆分规则、开始时间推算、项目分配、标签分配、四象限优先级计算等完整推理链。
- **外部依赖 / 外部工具 / 外部需求**：
  - **滴答清单（TickTick）MCP 服务/工具**：必须已配置并连接；本技能不直接执行 shell，仅调用 MCP 工具（如 `create_task`、`batch_add_tasks`、`list_projects`、`list_tags`、`search_task` 等）。
  - 首次调用某工具前需向 MCP 服务询问验证工具名/参数可用性。
  - **无 shell 依赖**。
- **备注（隐私）**：该技能含硬编码家庭成员真实姓名与项目名（何晓勤/唐淼/小芝麻/张梵净、成都北站总包项目、中铁九天总包项目等），属用户明示保留的隐私内容；如对外分享仓库需注意。

### 15. file-structure-organizer（文件内容整理重组）

- **用途**：依据「文件结构化组织规范（12 条强制要求）」对用户指定的 Markdown 文件进行读取、整理与重组，输出完全合规的结构化文档（单一事实源、引用纪律、强制结构等）。
- **外部依赖 / 外部工具 / 外部需求**：
  - **无外部工具 / 无外部依赖**：纯提示词技能。
- **备注**：与 `code-audit-consolidation` 同属"文档质量收敛"类元技能。

### 16. code-audit-consolidation（多代码审计报告归一收敛）

- **用途**：整合多视角、多切片的审计报告/代码分析报告/BUG 分析报告，通过提取、归一、去重、交叉分析、关联分析、冲突核查裁决（基于实际代码复查）、根因分析，产出唯一事源、直指底层根因、可落地执行的根治报告。
- **外部依赖 / 外部工具 / 外部需求**：
  - **无外部工具 / 无外部依赖**：纯提示词技能。
- **备注**：关键词：多源审查整合、缺陷去重归因、代码审计收敛、根因分析、BUG 根治。

---

## 三、外部依赖归类速查

| 依赖类别 | 涉及技能 |
|---|---|
| **联网搜索/抓取服务** | ref-material-writing、web-search（父 Skill + anysearch-skill 子目录 + Firecrawl CLI 双轨） |
| **Firecrawl MCP** | ref-material-writing |
| **Firecrawl CLI（全局）** | web-search（轨道2 适配层，无需 MCP/Dynamic-mcp） |
| **Dynamic-mcp MCP** | ref-material-writing、web-search、mimo-code-collab（mimo.code 中转） |
| **OfficeCLI（officecli）** | ref-material-writing |
| **滴答清单(TickTick) MCP** | ticktick |
| **git + gh CLI** | github-personal-manager、（tender-review-kit 可选用于贡献） |
| **Playwright + 360Chromex** | playwright-360chrome |
| **Chrome DevTools MCP（全局）** | chrome-devtools |
| **Python + pip 包（python-docx/pypdf/openpyxl/requests）** | tender-review-kit、web-search、ref-material-writing（经 uv 环境） |
| **系统命令（pdftotext / PowerShell / bash / node）** | tender-review-kit、find-skill-to-xml、playwright-360chrome |
| **无任何外部依赖（纯提示词）** | skill-forge、multi-file-analysis、promotion-writer、file-structure-organizer、code-audit-consolidation、code-review-combo（子技能） |

---

## 四、版本与发布说明

- 本仓库统一以 **git 标签 `v1.0.0`** 标记首个发布快照（作用于整个仓库，包含所有技能 Definition 与脚本）。
- 各技能自身的演进版本记录在其 frontmatter 的 `version` 字段（如 `ref-material-writing` 5.0.0、`web-search` 1.0.0、`code-review-combo` 1.0.0、`playwright-360chrome` 2.0.0、`mimo-code-collab` 6、`find-skill-to-xml` 1.1.0 等），与仓库 git 标签相互独立。
- 当前仓库最新标签为 **`v2.2.1`**（2026-08-02 发版）；`github-personal-manager` 随仓库版本演进，无独立 frontmatter 版本号。
- 日常修改遵循仓库节奏：编辑技能 → 建 `feat/xxx` 分支 → 提交（自动跑 Tier0+1 门禁）→ 推送 → 开 PR → 合并 main；推送/PR 由云端 CI（Tier5）兜底。

---

## 五、仓库内辅助体系（非技能）

- `scripts/smoke/`：五层冒烟测试框架（Tier0 密钥扫描 / Tier1 结构 / Tier2 合规 / Tier3 运行时 / Tier4 触发）+ `run_all.py` 编排器，用于对技能 Definition 做质量门禁；2026-08-03 新增 `test_worktree.sh`（多工作树并行开发 SOP 契约测试）。
- `.githooks/pre-commit`：提交时自动跑 Tier0+1。
- `.github/workflows/smoke.yml`：云端 CI（Tier5），push 到 main 与开 PR 时触发；2026-08-03 升级 actions 至 v7（消除 Node.js 20 弃用警告）。
- `multi-worktree-parallel-merge-sop.md`：原 2026-08-03 新增的总体方案文档已于 2026-08-06 移除，能力内聚至 `github-personal-manager` 的 `sop_worktree_add.sh` / `sop_worktree_cleanup.sh` / `sop_worktree_merge.sh` 三件套。
- `Memory-Data/`：用户记忆/知识库（仅 `.md` 入库；非 `.md` 文件经 `.gitignore` 排除，本地保留）。本批新增 `协作方式约定_四象限_定制版.md` / `协作方式约定_四象限_通用版.md`，并将 `用户画像分析报告_土木工程主业版.md` 重命名为 `用户画像分析报告.md`。
- `Workbuddy专属/`：归置与 WorkBuddy 紧密耦合的专属技能/文件（`workbuddy-workspace-migration`、`Skill-memory-consolidate.md`、`Skill-workflow-distill.md`）。
