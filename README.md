# AI_MCP-Skill-CLI 仓库说明（README）

> 本仓库是 `zhangweildlh` 的个人 **私有** 技能(Skill)集合，存放所有 AI 技能的 Definition 文件与配套脚本。
> 本文件逐一对仓库内 **12 个活跃技能** 进行说明：用途、外部依赖/外部工具/外部需求。
> 仓库首个发布版本标记为 **`v1.0.0`**（git 标签，作用于整个仓库快照；各技能自身的内部版本见各自 frontmatter 的 `version` 字段）。

---

## 一、技能总览

| # | 技能名称(name) | 内部版本 | 形态 | 一句话用途 |
|---|---|---|---|---|
| 1 | `anysearch-skill` | 2.0.0 | 目录型 | 实时联网搜索 / 垂直域检索 / 批量搜索 / 网页全文抓取 |
| 2 | `github-personal-manager` | 1.0.0 | 目录型 | 个人 GitHub 全流程管理（改代码、PR、同步、CI、发版、清分支） |
| 3 | `ref-material-writing` | 5.0.0 | 目录型 | 基于提纲+多份参考资料的文档撰写，输出 Office(docx) 文件 |
| 4 | `tender-review-kit` | — | 目录型 | 招标文件审标，产出投标核对清单（废标项/评分项/▲参数/时间节点） |
| 5 | `web-search` | 1.0.0 | 目录型 | 深度联网搜索与下载，多来源印证，落盘素材文件 |
| 6 | `github-repo-sync` | 1.0.0 | 单文件 | 上游仓库(upstream) → 本地 → 个人远端 Fork 的自动化同步 |
| 7 | `skill-creator` | 2.1.1 | 单文件 | 通过访谈流程创建/编写合规的 AI Skill 定义文件 |
| 8 | `skill-checker` | 2.3 | 单文件 | 对 Skill 定义做 11 维度全量合规校验并给出修正版 |
| 9 | `multi-file-analysis` | — | 单文件 | 多文件解析、实体关系抽取、冲突/缺失识别，构建知识图谱 JSON |
| 10 | `find-skill-to-xml` | 1.1.0 | 单文件 | 扫描目录发现 Skill 文件，生成标准 XML 技能标签清单 |
| 11 | `promotion-writer` | — | 单文件 | 面向微信公众号/小红书的中文推广文案撰写 |
| 12 | `ticktick` | 2.0.0 | 单文件 | 解析自然语言指令，批量创建/管理滴答清单(TickTick)任务 |

> 注：根目录另有 3 个 `Skill-基于多份参考资料的文档撰写_废弃(...).7z` 压缩包，是 `ref-material-writing` 的历史废弃版本，**不属于活跃技能，不纳入说明、不入库**。

---

## 二、各技能详细说明

### 1. anysearch-skill（实时搜索）

- **用途**：统一的实时搜索服务，支持通用网页搜索、垂直域检索（金融/学术/旅行/健康/代码/法律…）、并行批量搜索、URL 全文内容抽取。通过单一 JSON-RPC 2.0 端点提供服务，**无需安装 MCP 服务器**，全部功能由内置跨平台 CLI 暴露。
- **外部依赖 / 外部工具 / 外部需求**：
  - **外部服务**：`https://api.anysearch.com`（需联网；声明零留存、零知识凭证、无追踪/遥测/日志）。
  - **API Key（可选）**：`ANYSEARCH_API_KEY`，存于技能目录 `.env` 或环境变量或 `--api_key` 参数；不配置可匿名访问（速率更低）。
  - **运行时（四选一，按优先级探测）**：
    - Python 3.6+（需 `requests` 库，通常预装）→ `scripts/anysearch_cli.py`
    - Node.js 12+（无外部依赖，用内置 `https`）→ `scripts/anysearch_cli.js`
    - PowerShell 5.1+（Windows）→ `scripts/anysearch_cli.ps1`
    - bash/sh 4+（Linux/macOS）→ `scripts/anysearch_cli.sh`
  - **`runtime.conf`**：可选，预置 `Runtime`/`Command` 走快速路径。
- **备注**：垂直域搜索前必须先 `get_sub_domains`  discovery 正确子域；必填参数缺失会导致后端校验错误。

### 2. github-personal-manager（GitHub 个人管理）

- **用途**：面向个人日常所有 GitHub 管理与操作的统一执行技能——仓库管理、代码修改/提交/推送/开 PR、向上游贡献、同步巡检、CI 排错、Release 发版、分支清理。所有动作先用"大白话"说明后果并暂停确认，严守"禁止强推/删除 main"等全局禁令。
- **外部依赖 / 外部工具 / 外部需求**：
  - **`git`**：`D:\Tools\Assembly\git\cmd\git.exe`（v2.54.0）。
  - **`gh` CLI**：`D:\Tools\Assembly\gh.exe`（v2.96.0，已登录 `zhangweildlh`，scopes 含 repo/workflow/admin:org）。
  - **GitHub 账号 + 网络**：用于远端读取/搜索/PR/CI/Release。
  - **本地仓库根目录**：默认 `D:\Documents\AI_Work_Temp`（一级子目录即各仓库）。
  - **参考文件**：`references/gh-capability.md`、`references/fork-ci-pitfalls.md`。
  - **不依赖任何 MCP**；本机无 Docker，默认走远程 CI，允许本机已装且在 PATH 的工具本地编译（不安装新工具链）。
- **备注**：含硬约束——禁止强推/删 main、标签重推用"删远端标签+重推"、本地 main 跟踪 origin/main。

### 3. ref-material-writing（参考资料驱动文档撰写）

- **用途**：严格依据用户提供的写作需求、提纲与多份参考资料完成高质量文档撰写（公文/报告/方案/建议书/综述），10 步流水线，最终输出 Office 文件（默认 `.docx`）。每处事实/数据可溯源、禁止编造；支持跨会话断点续跑。
- **外部依赖 / 外部工具 / 外部需求**：
  - **OfficeCLI（`officecli`）**：外部命令，用于读写 `*.docx/*.xlsx/*.pptx`；命令失败必须 `officecli --help` 取权威 schema 重试（版本差异声明见 `references/02`、`references/04`）。
  - **anysearch-skill**：步骤5 联网补全双引擎之一，`runtime.conf` 为命令单一事实源（固定 `uv run --project D:/Tools/Assembly/python/myenv python .../anysearch-skill/scripts/anysearch_cli.py`）。
  - **Firecrawl MCP**：双引擎之二（search/scrape/extract/agent/map/crawl/batch/interact），经 Dynamic-mcp 中继或直接直连。
  - **Dynamic-mcp MCP**：`mcp__Dynamic-mcp__list_groups / get_dynamic_tools / call_dynamic_tool`。
  - **UV / Python 环境**：`uv run --project D:/Tools/Assembly/python/myenv` 运行 AnySearch CLI。
  - **原生 `web_search` / `web_fetch`**：双引擎不可用时的补偿/降级通道。
  - **网络访问**。
  - **配套资源**：`_router/step-01.md ~ step-10.md`、`references/*`（写作规范/环境/officecli 指南/知识库/anysearch 集成/firecrawl 指南/续跑协议等）、`assets/*` 模板。
- **备注**：采用渐进式披露，主 SKILL.md 仅含路由与决策规则，按步骤加载细节。

### 4. tender-review-kit（招标文件审标）

- **用途**：审的是招标方发的招标文件（PDF/Word），服务要去投标的人。输入一份招标文件 → 产出"投标核对清单"（废标项+评分项+证明材料+▲标识参数+时间节点，每条带原文行号出处），帮投标人在动手写标书前吃透规则。**只产清单、不下"投/不投"结论**。
- **外部依赖 / 外部工具 / 外部需求**：
  - **Python 3**（标准库 + 以下 pip 包）：`python-docx`、`pypdf`、`openpyxl`。
  - **`pdftotext`**（系统依赖，可选）：PDF 文本提取；缺失则自动回退 `pypdf`。
  - **`gh` CLI（可选）**：仅当用户愿意把新发现的判词贡献回开源词库时，用于自动建 GitHub Issue；未装则导出文件让用户手动粘贴。
  - **无 MCP 依赖**。
  - **内置资产**：`scripts/*.py`（取数/撒网/补词/护栏/出 Excel）、`references/`（废标对照总清单、商务线、技术线）、`data/keywords.json`（120+ 判词库，命根子）。
- **备注**：首次必跑 `uv run --project D:/Tools/Assembly/python/myenv python scripts/check_env.py` 自检环境；护栏程序（防漏抄/防判断死角）是流程命根子。

### 5. web-search（深度联网搜索与下载）

- **用途**：基于用户输入的深度联网搜索与信息下载，系统拆解搜索要素、多引擎（AnySearch + Firecrawl）双轨并行、多来源交叉印证，交付结构化中文报告 + 落盘 Markdown 素材文件（统一 schema，含来源标签与印证标记）。
- **外部依赖 / 外部工具 / 外部需求**：
  - **AnySearch（内置）**：技能自带 `scripts/anysearch_cli.py` + `uv` + Python 3.6+（需 `requests`）+ 网络；可选 `runtime.conf`、`.env` 配置 API Key。
  - **Firecrawl MCP**：经 Dynamic-mcp 中继（`list_groups/get_dynamic_tools/call_dynamic_tool`）或直接直连（`firecrawl_*`），由 LLM 按环境判定。
  - **Dynamic-mcp MCP**：Firecrawl 的中继门面。
  - **原生 `web_search` / `web_fetch`**：降级补偿通道。
  - **配套参考**：`references/anysearch.md`、`references/firecrawl.md`、`references/orchestration.md`。
  - **网络访问**。
- **备注**：完全自包含，不依赖/不加载其他技能定义；路径用正斜杠；隐私门禁（手机号/身份证/密码脱敏）前置。

### 6. github-repo-sync（GitHub 仓库同步助手）

- **用途**：自动化 GitHub 仓库完整同步工作流——从上游仓库(upstream)获取更新合并到本地，再推送至个人远端 Fork(origin)，并生成"上游更新分析报告"。冲突时立即停等人工处理，绝不自动解决。
- **外部依赖 / 外部工具 / 外部需求**：
  - **Git 工具 + PR 管理工具**（抽象表述，适配多平台）：实际执行映射为 `git` 与 `gh`/平台 API。
  - **双远程别名约定**：`origin` = 个人远端 Fork，`upstream` = 上游原仓库（缺 `upstream` 时由用户提供 URL 添加）。
  - **默认仓库根目录**：`D:\Documents\AI_Work_Temp`（可被参数覆盖）。
  - **Windows 环境**假设；需目标路径确为 Git 仓库。
  - **路径核验防误报**：确认路径后、执行 git 前先 `ls "<目录>/.git"` 复核仓库有效性；git 命令用 `git -C "D:/绝对/Windows/路径"` 或先 `cd /d/绝对/路径` 再执行，**禁止** `git -C /d/...`（Unix 风格根路径，Git Bash 下会被 git 误报 `not a git repository`）。若 `git rev-parse` 报该错，先 `ls .git` 复核，`.git` 存在即视为命令格式问题、改用正确写法重测，不得判定"非 git 仓库"。
  - **备注**：纯流程编排技能，不引入第三方库；推送失败补救-重试循环最多 1 次。

### 7. skill-creator（Skill 创建助手 · 元技能）

- **用途**：基于用户需求，通过"需求访谈 → 需求解析 → Skill 编写 → 自动校验"四阶段，将模糊业务需求转化为合规、结构化、可被网页 AI 解析执行的 Skill 定义文件（Markdown）。
- **外部依赖 / 外部工具 / 外部需求**：
  - **无外部工具 / 无外部依赖**：纯提示词(Prompt)流程技能，依赖对话窗口传入需求，不调用 shell/MCP/API。
  - 内置完整《Skill 定义标准规范》（frontmatter、11 维度校验、Markdown 语法强制规范、触发词五要素等）。
- **备注**：交付物为符合标准的完整 Skill 定义；版本管理规则内置于技能（首次 1.0.0，patch/minor/major 递增）。

### 8. skill-checker（Skill 校验器 · 元技能）

- **用途**：对 Skill 定义内容做全量合规校验（11 维度：frontmatter 结构、name↔目录、渐进式加载、结构、自洽、参数、可执行性、无硬编码、示例、触发匹配、模块组织），输出结构化校验报告 + 修正后的完整 Skill 定义。
- **外部依赖 / 外部工具 / 外部需求**：
  - **无外部工具 / 无外部依赖**：纯提示词技能，用户将待校验 Skill 全文粘贴入对话即可。
  - 兼容网页版 AI Agent（如 DeepSeek 网页版）及所有支持 Agent Skills 标准的客户端。
- **备注**：`max_content_length` 默认 15000 字符（可配 1000–50000）；`strict_mode` 可选。

### 9. multi-file-analysis（多文件分析 + 知识图谱构建）

- **用途**：处理上传的多文件（PDF/DOCX/MD/TXT），做内容解析清洗、实体关系抽取、缺失与冲突识别（逻辑矛盾优先），构建标准化 JSON 知识图谱（节点-边列表），专为网页版 AI 对话分析设计。支持五类文档：市场分析/公文/商业合作/技术方案/融资方案，置信度按文档类型分别采用五套公式。
- **外部依赖 / 外部工具 / 外部需求**：
  - **无外部工具 / 无外部依赖**：纯提示词技能；由 AI 在对话中完成解析与抽取。
  - 输入支持 PDF、DOCX、MD、TXT（无图片/扫描件/Excel；表格仅 DOCX）。
  - 输出为标准化 JSON（UTF-8、2 空格缩进），可直接导入知识图谱工具或网页 AI。
- **备注**：合规提示——该技能 frontmatter 使用 `description: >` 多行写法且以 `instructions:` 承载指令（非标准 `---` 围栏 + 正文结构），在仓库的 Tier1 结构校验中会被标记 WARN，建议后续补标准 `---` 围栏。

### 10. find-skill-to-xml（扫描 Skill 生成 XML 标签）

- **用途**：扫描指定工作目录及其一级子目录，发现所有合规 Skill 定义文件（`SKILL.md` 或以 `Skill-` 开头的 `.md`），校验其 YAML 前置元数据完整性，提取 `name`/`description`，生成标准 XML 技能片段（`<available_skills>`）展示在对话中，用于 Skill 目录索引、批量发现、向外部系统提供清单。
- **外部依赖 / 外部工具 / 外部需求**：
  - **工具（Windows PowerShell 环境）**：`shell_status`、`shell_exec`、`local_folder_pick`（图形选目录；取消则回退默认 `D:\Documents\AI_MCP-Skill-CLI`）。
  - 命令语法须为 Windows PowerShell（仅 `;` 与 `|` 连接）。
  - 可选：当文件较多时，提示用 `uv run python script.py` 批量处理。
- **备注**：仅扫描一级子目录、不递归；不读取/修改/删除任何文件；不校验字段值合法性（仅查 name/description 非空）；重复 name 按修改时间保留最新。

### 11. promotion-writer（推广文章撰写）

- **用途**：面向微信公众号、小红书等中文社交平台的推广文案创作。要求高亲和力、强共鸣，轻快有节奏的行文 + 适量 emoji + 合理留白，多角度拆解产品亮点、锚定用户痛点、层层递进实现情感共情，最终以 Markdown 输出。
- **外部依赖 / 外部工具 / 外部需求**：
  - **无外部工具 / 无外部依赖**：纯提示词技能。
  - 不适用公文、学术报告、创意小说等严肃/虚构写作。
- **备注**：输出强调"有观点有结论 + 证据锚点 + 多维拆解 + 场景呼应痛点"。

### 12. ticktick（滴答清单智能任务解析创建器）

- **用途**：基于滴答清单 MCP 工具，将用户自然语言指令（单条/多条复合）智能解析、拆分、归类、设时间/优先级/标签，并**直接调用 MCP 工具真实创建/查询/修改任务**。含多任务拆分规则、开始时间推算、项目分配、标签分配、四象限优先级计算等完整推理链。
- **外部依赖 / 外部工具 / 外部需求**：
  - **滴答清单（TickTick）MCP 服务/工具**：必须已配置并连接；本技能不直接执行 shell，仅调用 MCP 工具（如 `create_task`、`batch_add_tasks`、`list_projects`、`list_tags`、`search_task` 等，frontmatter `allowed-tools` 列出全部工具名）。
  - 首次调用某工具前需向 MCP 服务询问验证工具名/参数可用性。
  - **无 shell 依赖**。
- **备注（隐私）**：该技能含硬编码家庭成员真实姓名与项目名（何晓勤/唐淼/小芝麻/张梵净、成都北站总包项目、中铁九天总包项目等），属用户明示保留的隐私内容；如对外分享仓库需注意。

---

## 三、外部依赖归类速查

| 依赖类别 | 涉及技能 |
|---|---|
| **联网搜索/抓取服务** | anysearch-skill、ref-material-writing、web-search |
| **Firecrawl MCP** | ref-material-writing、web-search |
| **Dynamic-mcp MCP** | ref-material-writing、web-search |
| **OfficeCLI（officecli）** | ref-material-writing |
| **滴答清单(TickTick) MCP** | ticktick |
| **git + gh CLI** | github-personal-manager、github-repo-sync、（tender-review-kit 可选用于贡献） |
| **Python + pip 包（python-docx/pypdf/openpyxl/requests）** | anysearch-skill、tender-review-kit、web-search、ref-material-writing（经 uv 环境） |
| **系统命令（pdftotext / PowerShell / bash）** | anysearch-skill、tender-review-kit、find-skill-to-xml |
| **无任何外部依赖（纯提示词）** | skill-creator、skill-checker、multi-file-analysis、promotion-writer |

---

## 四、版本与发布说明

- 本仓库统一以 **git 标签 `v1.0.0`** 标记首个发布快照（作用于整个仓库，包含所有技能 Definition 与脚本）。
- 各技能自身的演进版本记录在其 frontmatter 的 `version` 字段（如 `anysearch-skill` 2.0.0、`ref-material-writing` 5.0.0、`ticktick` 2.0.0 等），与仓库 git 标签相互独立。
- 日常修改遵循仓库节奏：编辑技能 → 建 `feat/xxx` 分支 → 提交（自动跑 Tier0+1 门禁）→ 推送 → 开 PR → 合并 main；推送/PR 由云端 CI（Tier5）兜底。

---

## 五、仓库内辅助体系（非技能）

- `scripts/smoke/`：五层冒烟测试框架（Tier0 密钥扫描 / Tier1 结构 / Tier2 合规 / Tier3 运行时 / Tier4 触发）+ `run_all.py` 编排器，用于对技能 Definition 做质量门禁。
- `.githooks/pre-commit`：提交时自动跑 Tier0+1。
- `.github/workflows/smoke.yml`：云端 CI（Tier5），push 到 main 与开 PR 时触发。
- `仓库规划与冒烟测试方案（草案v0.1）.md`：仓库规划与冒烟测试方案草案。
