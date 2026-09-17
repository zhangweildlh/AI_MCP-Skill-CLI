# AGENTS.md —— AI_MCP-Skill-CLI 仓库操作纪律（单一事实源）

## 0 元信息与使用说明
- 0.1 文件定位与权威性：本文件是本仓库所有 git 操作的纪律单一事实源；任何 Agent 在读写本仓库任何文件或执行任何 git 操作前，必须先完整读取本文件并遵循（读取本文件本身除外）。
- 0.2 适用对象与强制前置：适用于所有 Agent（WorkBuddy、本地 CLI 类 Agent 等）；网页版 LLM 无本地文件访问，须经本地 Agent 中转执行。
- 0.3 阅读顺序与快速索引：先读 1→3 章（认识仓库与红线），再按需读 4→5 章（干活与交付），第 6 章为本文件自身维护协议，第 7→8 章为特殊 Skill 副本与开发态最小化纪律（改动 chrome-devtools 或目录型 Skill 时必读）。外部被引用文件 SOUL.md、MEMORY.md 位于用户级 `~/.workbuddy/`，属更高层跨项目约束，仅被本文件引用、不被本文件重定义。

## 1 仓库结构总览
- 1.1 单 git 仓库、多独立 Skill：本仓库是一个 git 仓库，每个一级子目录是一个独立 Skill 包（或共享基础设施），根级 Skill-*.md 为单文件 Skill；业务上相互独立，但基础设施（scripts/ 统一调度、github-personal-manager/scripts/ 复用）可共享，不视为关联。
- 1.2 单元分类：目录型 Skill（13）/ 根级 Skill 文件（8）/ 共享基础设施（scripts、.github 等）/ 其他根级文件（@*.md、mimo_mcp.py，归 meta，见 §2.3）。
- 1.3 三类管理路径：目录型 Skill → 开 worktree（第 4 章）；根级 Skill 文件与其他根级文件 → 标准分支+PR（第 5 章）；meta 变更 → 触发全量 CI。

## 2 Scope 清单
- 2.1 目录型 Skill（14 个，scope 标识 `dir/<目录名>`）：
  - `dir/chrome-devtools`
  - `dir/code-review-combo`
  - `dir/codebase-memory`
  - `dir/deep-discuss`
  - `dir/file-structure-organizer`
  - `dir/github-personal-manager`
  - `dir/mimo-code-collab`
  - `dir/open-medical-skills`
  - `dir/playwright-360chrome`
  - `dir/ref-material-writing`
  - `dir/self-improvement`
  - `dir/tender-review-kit`
  - `dir/web-search`
  - `dir/Workbuddy专属`（无 SKILL.md，按目录 scope 处理；合集目录，内含子 Skill，统一按目录 scope 管理）
- 2.2 根级 Skill 文件（8 个，scope 标识 `file/<name 字段>`）：

  | 文件名 | name 字段 |
  |---|---|
  | Skill-元技能，Skill创建校验器.md | `skill-forge` |
  | Skill-外部工具引入评估.md | `external-tool-onboarding` |
  | Skill-多文件分析+知识图谱构建.md | `multi-file-analysis` |
  | Skill-多源代码审查整合收敛.md | `code-audit-consolidation` |
  | Skill-对当前对话会话做经验沉淀和方法论固化.md | `task-methodology-consolidation` |
  | Skill-扫描Skill技能生成xml技能标签.md | `find-skill-to-xml` |
  | Skill-推广文章撰写.md | `promotion-writer` |
  | Skill-滴答清单智能任务解析创建器.md | `ticktick` |
- 2.3 共享/元 scope（`meta`）：`scripts/`、`.github/`、`README.md`、`CHANGELOG.md`、`AGENTS.md`、`Memory-Data/`、`.githooks/`、`.gitignore`、`@*.md`、`mimo_mcp.py`。其中 `.githooks/`、`.gitignore` 为仓库纪律与门禁配置；`@*.md`、`mimo_mcp.py` 为其他根级文件，与本文件同走 meta 管理路径（标准分支+PR）。
- 2.4 排除与忽略：`.workbuddy/`、`worktrees/`、密钥文件（`ref-material-writing/.env` 等，详见 §3.3）。
- 2.5 清单维护规则：§2.1–§2.4 为机器可重写数据段，由 `scripts/sync-scope-manifest.py --update` 自动生成；人工修改须与脚本输出一致（数量、目录名、name 字段须与脚本扫描结果对齐）。除数据段外，本文件其余纪律章节为人工维护，遵循 §6.1「先更新本文件、再更新引用方」原则；新增/删除目录或根级 Skill 文件必须同步本节（docs-sync-checklist Tier 1 强制）。

## 3 红线与强制约束
- 3.1 git 操作前置：任何 git 操作前必须先读本文件（详见 §0.1）；禁止绕过 `AGENTS.md` 直接改动仓库。
- 3.2 目录型 Skill 改动纪律：只允许在对应 worktree 中改动，禁止在仓库主工作树直接改目录型 Skill 内容。此纪律由 `.githooks/pre-commit` hook 强制拦截——在主工作树（仓库根 checkout，无论检出何分支）提交时，若暂存文件属于目录型 Skill 路径则直接阻断，仅允许 meta scope 文件变更（`.githooks/*`, `scripts/*`, `.github/*`, `README.md`, `CHANGELOG.md`, `AGENTS.md`, `Memory-Data/*`, `.gitignore`, `@*.md`, `mimo_mcp.py`）。**密钥与敏感文件（`.env`、`*.secret`、`providers.json` 等）一律拒绝，不在放行之列**；本放行清单与 §2.3 meta 清单一致，不以"隐藏文件"泛化放行（防止 `.env` 等密钥被误放）。
- 3.3 密钥与敏感文件：禁止将 `ref-material-writing/.env`、`web-search/.env`、`code-review-combo/config/providers.json` 等密钥文件推入任何公开/远端分支。私有仓库豁免仅限显式授权（授权人、明确范围、留痕，见 MEMORY.md 决策 D-2026-0811-01），且豁免不扩展到公开/远端分支。
- 3.4 越权操作：禁止未经授权执行 git push、force push、reset --hard、删除分支等破坏性/共享状态操作；Agent 需在权限范围内工作。**授权指用户显式指令；脚本参数 `--confirm` 仅为脚本级安全闸门，不等同用户显式授权**，对外/破坏性动作仍需用户显式确认。
- 3.5 并发纪律：多 Agent 并发时各守各的 scope，修改不得超出分配范围；发现交叉立即暂停并上报用户（默认协调者）裁决后再继续。

## 4 目录型 Skill 的 worktree 纪律
- 4.1 worktree 挂载根：`<仓库根>/worktrees/<name>-<topic>-<YYYYMMDDHHMMSS>/`（已在 .gitignore 统一忽略，不入库）；分支 `feat/<name>-<topic>-<YYYYMMDDHHMMSS>`；**`feat/` 前缀 + 目录名 = 分支名**（时间戳一致）；对目录型 Skill，`<name>` 即其目录名（§2.1 以目录名作 scope，无独立 name 字段）；对根级文件型 Skill，`<name>` 为 §2.2 表格的 name 字段；`<topic>` 为简短任务核心目的（英文小写连字符，2–6 词 ≤30 字符，禁 B1/B2/b3 类序号）；时间戳由脚本一次 `date +%Y%m%d%H%M%S` 生成、目录与分支复用同一值。
- 4.2 标准流程（引用脚本而非手写 git worktree add）：
  1. 读取本文件（尤其第 2 章 scope）确认归属；
  2. 运行 `bash github-personal-manager/scripts/sop_worktree_add.sh <仓库> --scope <name> --branch feat/<topic> --confirm`（自动建 worktree 目录与分支，时间戳一致，四道守卫——分支命名合规、scope 解析、目录/分支时间戳一致、已登记 scope 校验；脚本位于 github-personal-manager 技能目录 `scripts/` 下，须在仓库根执行）；`--scope <name>` 传入 Skill 的 name 字段（目录型即其目录名，根级文件型即 §2.2 表格 name）；脚本自动生成 `feat/<name>-<topic>-<TS>` 分支与 `worktrees/<name>-<topic>-<TS>/` 目录（时间戳一次生成、`feat/` 前缀+目录名=分支名）；
  3. 在 worktree 内修改对应 Skill 内容并提交；
  4. 提交与 PR 遵循第 5 章约定（`github-personal-manager/scripts/sop_pr_create.sh`）；
  5. 合并后运行 `bash github-personal-manager/scripts/sop_worktree_cleanup.sh <仓库> --branch feat/<name>-<topic>-<YYYYMMDDHHMMSS> --confirm` 清理（本地目录与分支删除自动；远端分支删除须另行 `--confirm`，不默认执行）。
- 4.3 禁止事项：禁止在主工作树改动他单元内容；禁止跨 worktree 混改；禁止在 worktree 内改动不属于该 Skill 的文件（`.gitignore` 等仓库根 meta 文件改动见 §8.5，走 meta 分支）。

## 5 提交 / PR / CI 约定
- 5.1 提交信息：遵循仓库既有惯例（前缀 + 简述，如 `docs:`、`feat:`、`fix:`），并标注本次变更的 scope（`dir/<目录名>` / `file/<name>` / `meta`）。
- 5.2 PR 纪律：目录型 Skill 改动从对应 worktree 分支发 PR；根级 Skill 文件与其他根级文件走标准分支+PR；PR 描述须列明影响范围与验证方式。
- 5.3 CI 约定（矩阵）：

  | 变更类型 | `smoke`（required，恒运行） | `smoke-scoped`（按 scope） | `run_all`（全量） |
  |---|---|---|---|
  | meta scope | 运行（tier0-3+5 密钥/忽略/结构/目录存在性） | 跳过 | 运行（required） |
  | 目录型 Skill | 运行（tier0 密钥/忽略） | 运行（tier1/2/5，按 `--scope`） | 不运行 |
  | 根级 Skill 文件 | 运行（tier0 密钥/忽略） | 运行（tier1/2/5，按 `--scope`） | 不运行 |
  | 无法判定 scope | 运行（tier0 密钥/忽略） | 不运行/降级 | 运行（required） |

  `main` 分支保护（classic protected branch）required checks 含 `smoke` 与 meta 全量 `run_all`（二者失败均阻断合并）；`smoke-scoped` 对 meta 变更 skipping，不列入 required。
- 5.4 测试约定：本仓库自动化冒烟集中在 `scripts/smoke/`（tier0-5，`run_all.py` 支持 `--scope` 按 scope 过滤）；提交前可本地运行 `uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --tier 0,1 --staged`（本机禁裸 python，一律经 uv 调用，工程路径为本机环境事实，其他机器按各自环境调整）；CI 按变更 scope 触发对应检查，meta 变更触发全量；各 Skill 自带测试（如 `github-personal-manager/smoke`、`web-search/tests` 等）保留在各自 Skill 目录内自包含，调度统一收拢到 `scripts/smoke` 入口。

## 6 本文件的维护
- 6.1 唯一事实源：本文件为**本仓库 git 操作纪律**的唯一权威；任何本仓库纪律变更必须先更新本文件，再更新引用方。本文件引用 SOUL.md（用户级，跨项目智能体灵魂）、MEMORY.md（用户级永久记忆）等更高层约束，引用方向恒为 AGENTS.md → SOUL.md/MEMORY.md，且冲突时以本文件在本仓库 git 纪律范围内的规定为准（更高层约束仅被引用、不被本文件重定义）。
- 6.2 章节数据段（§2.1–§2.4）可由 `scripts/sync-scope-manifest.py --update` 自动重写，其余纪律章节人工维护并遵循 §6.1「先更新本文件」原则。
- 6.3 修订记录：本文件改动走 `meta` scope，须触发全量 CI；修订后更新 CHANGELOG.md。

## 7 特殊 Skill 的副本纪律（目前以 chrome-devtools 为唯一定义对象）
- 7.1 **chrome-devtools 主副本与部署副本关系**：
  - **主副本**：`D:/Documents/AI_MCP-Skill-CLI/chrome-devtools/`（本仓库内，本机示例，其他机器按各自环境调整），是唯一修改源头。所有需求、BUG 修复、功能增强必须先在此处归因分析、根源分析、追溯分析；**修改须走第 4 章 worktree 纪律**（在对应 worktree 内改动 chrome-devtools 目录型 Skill），合并回 main 即为主工作树同步，部署从合并后版本执行。
  - **部署副本**：各用户的 `C:/Users/<username>/.workbuddy/skills/chrome-devtools/`（本机示例），通过运行 `node localization/deploy.cjs` 从主副本生成。**严禁直接修改部署副本**，所有改动须经主副本 → 重新部署。
  - **修改纪律**：每次修改主副本（经 worktree 合并回 main）后，必须重新运行 `node localization/deploy.cjs` 以同步到部署副本；部署副本的 `local-config.json` 和 `mcp-local-config.json` 是用户机器的本地配置，不入库、不随主副本分发。
  - **最小化原则**：主副本保持最小化，遵循第 8 章 开发态目录型 Skill 最小化纪律（五类文件不纳入版本控制）；一切可通过脚本生成/下载的文件均不入库，仅保留源码和部署脚本；Agent 通过指令下载、生成、衍生的内容不属于主副本范畴。
  - **自动安装纪律**：`cli_run.cjs` 已内置安装逻辑（`npm install -g chrome-devtools-mcp`，`PUPPETEER_SKIP_DOWNLOAD=1`）；该安装由用户在本机主动触发部署副本激活时执行（若 MCP 服务不可用，据需跳过，非 Agent 未经授权擅自修改全局环境），Agent 无需手动干预。

## 8 开发态目录型 Skill 最小化纪律
- 8.1 **范围**：本仓库内全部目录型 Skill（按一级目录计数 13 个；`Workbuddy专属` 为合集目录、其内含子 Skill 不额外计数，统一按该目录 scope 管理）均视为"开发态"（源版本，相对部署副本而言）。本纪律仅约束目录型 Skill；单文件型 Skill 因其为单文件、天然可移植，不在范围内。
- 8.2 **最小状态定义**："最小状态"指版本库/远端中的**跟踪状态**；工作树可临时存在本纪律禁止的文件，但不得纳入版本控制。
- 8.3 **禁止纳入版本控制的五类文件**（即不跟踪、不提交、不推送）：
  - ① 经网络可下载得到的文件（任一 Agent 阅读 SKILL.md/README 后可自行下载，且来源、版本、获取命令可复现；需登录/付费/特定授权方可获取者不在此列）；
  - ② 可派生/创建的文件——文件内容可由 SKILL.md/README 指令或本 Skill 脚本**确定性再生/重建**者（不依赖外部随机种子、实时 API 非确定性响应；不含手写源文件），或本 Skill 执行中/其脚本自动生成、衍生的文件；
  - ③ 编译文件（`*.exe`/`*.dll`/`*.so`/`*.pyc`/`*.pyo` 等）；**特别地，目录型 Skill 中 >100MB 的二进制程序一律不跟踪/不提交/不推送**（如 `codebase-memory-mcp.exe`，`.gitignore` 已忽略）；
  - ④ 过程文件、临时文件、垃圾文件；
  - ⑤ 测试衍生文件、测试过程文件、测试结果文件（**不含冒烟脚本与可复用测试脚本**；各 Skill 自带 `tests/`、`smoke/` 等可复用测试脚本属可复用测试脚本，允许入库，见 §5.4）。
- 8.4 **本地允许、版本控制禁止**：允许**用户与 Agent 遵循本仓库纪律、SOUL.md 环境硬约束及用户级本地记忆维护门禁**，在仓库及各级子目录或工作树/分支中下载、编译、测试、衍生本纪律禁止的五类文件（编译限已有工具链 node/uv/Python 等，**不新装编译器、不用 Docker**）；但这些文件一律不跟踪，明确排除在提交与推送远端之外。对"必需但禁止跟踪"的二进制，其 SKILL.md/下载说明须提供获取步骤以保证克隆后可用。
- 8.5 **提交/推送前处置**：每次对目录型 Skill 提交(commit)/推送(push)前，先扫描其范围内是否存在未忽略的五类文件；若存在，**暂停并询问用户**：保留（须确保已 gitignore）或删除。删除须遵循 SOUL 与 `github-personal-manager` 工作流十 的安全删除纪律（优先回收站、小批量、中文路径用 `Remove-Item -LiteralPath`，禁 `rm -rf` 父目录；详见用户级技能目录 github-personal-manager 的 10 个标准工作流）。`.gitignore` 的改动须作为 meta 变更在 meta 分支（标准分支+PR）处理，不属目录型 Skill worktree 范围（见 §4.3 禁止事项）。
- 8.6 **配套基线**：各目录型 Skill 或仓库根 `.gitignore` 须列出五类相关模式（`__pycache__/`、`*.pyc`、`build/`、`dist/`、`node_modules/` 及 >100MB 二进制程序等），与 §2.4（排除与忽略）及 §3.2（hook 允许清单含 `.gitignore`）衔接；`.gitignore` 自身改动见 §8.5（meta 分支处理）。
- 8.7 **单一事实源**：依据 SOUL.md 单一事实源原则，第 7.1 条"最小化原则"改为引用本章，不在两处重复定义。**引用方向恒为 AGENTS.md → SOUL.md，禁止反向（SOUL.md 不得引用 AGENTS.md）**。
