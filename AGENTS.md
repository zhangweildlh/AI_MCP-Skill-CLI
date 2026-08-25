# AGENTS.md —— AI_MCP-Skill-CLI 仓库操作纪律（单一事实源）

## 0 元信息与使用说明
- 0.1 文件定位与权威性：本文件是本仓库所有 git 操作的纪律单一事实源；任何 Agent 在读写本仓库任何文件或执行任何 git 操作前，必须先完整读取本文件并遵循。
- 0.2 适用对象与强制前置：适用于所有 Agent（WorkBuddy、本地 CLI 类 Agent 等）；网页版 LLM 无本地文件访问，须经本地 Agent 中转执行。
- 0.3 阅读顺序与快速索引：先读 1→3 章（认识仓库与红线），再按需读 4→5 章（干活与交付），第 6 章为本文件自身维护协议。

## 1 仓库结构总览
- 1.1 单 git 仓库、多独立 Skill：本仓库是一个 git 仓库，每个一级子目录是一个独立 Skill 包（或共享基础设施），根级 Skill-*.md 为单文件 Skill；各单元互无关联。
- 1.2 单元分类：目录型 Skill（11）/ 根级 Skill 文件（8）/ 共享基础设施（scripts、.github 等）/ 一般根级文件（@*.md、mimo_mcp.py）。
- 1.3 三类管理路径：目录型 Skill → 开 worktree（第 4 章）；根级 Skill 文件与一般根级文件 → 标准分支+PR（第 5 章）；meta 变更 → 触发全量 CI。

## 2 Scope 清单
- 2.1 目录型 Skill（11 个，scope 标识 `dir/<目录名>`）：
  - `dir/chrome-devtools`
  - `dir/code-review-combo`
  - `dir/codebase-memory`
  - `dir/file-structure-organizer`
  - `dir/github-personal-manager`
  - `dir/mimo-code-collab`
  - `dir/playwright-360chrome`
  - `dir/ref-material-writing`
  - `dir/tender-review-kit`
  - `dir/web-search`
  - `dir/Workbuddy专属`（无 SKILL.md，按目录 scope 处理；合集目录，内含子 Skill，统一按目录 scope 管理）
- 2.2 根级 Skill 文件（8 个，scope 标识 `file/<name 字段>`）：

  | 文件名 | name 字段 |
  |---|---|
  | Skill-元技能，Skill创建校验器.md | `skill-forge` |
  | Skill-外部工具引入评估与落地.md | `external-tool-onboarding` |
  | Skill-多文件分析+知识图谱构建.md | `multi-file-analysis` |
  | Skill-多源代码审查整合收敛.md | `code-audit-consolidation` |
  | Skill-对当前对话会话做经验沉淀和方法论固化.md | `task-methodology-consolidation` |
  | Skill-扫描Skill技能生成xml技能标签.md | `find-skill-to-xml` |
  | Skill-推广文章撰写.md | `promotion-writer` |
  | Skill-滴答清单智能任务解析创建器.md | `ticktick` |

- 2.3 共享/元 scope（`meta`）：`scripts/`、`.github/`、`README.md`、`CHANGELOG.md`、`AGENTS.md`、`Memory-Data/`。
- 2.4 排除与忽略：`.workbuddy/`、`worktrees/`、密钥文件（`ref-material-writing/.env` 等）。
- 2.5 清单维护规则：本节为机器可重写数据段，由 `scripts/sync-scope-manifest.py --update` 自动生成；人工修改须与脚本输出一致；新增/删除目录或根级 Skill 文件必须同步本节（docs-sync-checklist Tier 1 强制）。

## 3 红线与强制约束
- 3.1 git 操作前置：任何 git 操作前必须先读本文件；禁止绕过 `AGENTS.md` 直接改动仓库。
- 3.2 目录型 Skill 改动纪律：只允许在对应 worktree 中改动，禁止在仓库主工作树直接改目录型 Skill 内容。
- 3.3 密钥与敏感文件：禁止将 `ref-material-writing/.env`、`web-search/.env`、`code-review-combo/config/providers.json` 等密钥文件推入任何公开/远端分支（仅限私有仓库授权例外，见 MEMORY.md 决策 D-2026-0811-01）。
- 3.4 越权操作：禁止未经授权执行 git push、force push、reset --hard、删除分支等破坏性/共享状态操作；Agent 需在权限范围内工作。
- 3.5 并发纪律：多 Agent 并发时各守各的 scope，修改不得超出分配范围；发现交叉立即上报协调。

## 4 目录型 Skill 的 worktree 纪律
- 4.1 worktree 挂载根：`<仓库根>/worktrees/<name>-<topic>-<YYYYMMDDHHMMSS>/`（已在 .gitignore 统一忽略，不入库）；分支 `feat/<name>-<topic>-<YYYYMMDDHHMMSS>`；**目录名 + `feat/` 前缀 = 分支名**（时间戳一致）；`<name>` 为该 Skill 的 name 字段；`<topic>` 为简短任务核心目的（英文小写连字符，2–6 词 ≤30 字符，禁 B1/B2/b3 类序号）；时间戳由脚本一次 `date +%Y%m%d%H%M%S` 生成、目录与分支复用同一值。
- 4.2 标准流程（引用脚本而非手写 git worktree add）：
  1. 读取本文件（尤其第 2 章 scope）确认归属；
  2. 运行 `bash github-personal-manager/scripts/sop_worktree_add.sh <仓库> --scope <name> --branch feat/<topic> --confirm`（自动建 worktree 目录与分支，时间戳一致，四道守卫；脚本位于 github-personal-manager 技能目录 `scripts/` 下，须在仓库根执行）；`--scope <name>` 传入 Skill 的 name 字段，脚本自动生成 `feat/<name>-<topic>-<TS>` 分支与 `worktrees/<name>-<topic>-<TS>/` 目录（时间戳一次生成、目录+`feat/` 前缀=分支名）；
  3. 在 worktree 内修改对应 Skill 内容并提交；
  4. 提交与 PR 遵循第 5 章约定（`github-personal-manager/scripts/sop_pr_create.sh`）；
  5. 合并后运行 `bash github-personal-manager/scripts/sop_worktree_cleanup.sh <仓库> --branch feat/<name>-<topic>-<YYYYMMDDHHMMSS> --confirm` 清理（本地自动，远端分支删除须 --confirm）。
- 4.3 禁止事项：禁止在主工作树改动他单元内容；禁止跨 worktree 混改；禁止在 worktree 内改动不属于该 Skill 的文件。

## 5 提交 / PR / CI 约定
- 5.1 提交信息：遵循仓库既有惯例（前缀 + 简述，如 `docs:`、`feat:`、`fix:`），并标注本次变更的 scope（`dir/<目录名>` / `file/<name>` / `meta`）。
- 5.2 PR 纪律：目录型 Skill 改动从对应 worktree 分支发 PR；根级 Skill 文件与一般根级文件走标准分支+PR；PR 描述须列明影响范围与验证方式。
- 5.3 CI 约定：所有 PR 触发 CI 检查；基础门禁 `smoke` 恒运行（meta/无可判定 scope 变更升级全量 run_all，其余跑 tier0 密钥/忽略门禁）；目录型/根级文件变更另按 scope 触发 `smoke-scoped`（`--scope`，tier1/2+5）；`meta` 变更触发全量 CI。main 分支保护（classic protected branch）required checks 仅含 `smoke`（smoke-scoped 对 meta 变更 skipping，不得列入 required）。
- 5.4 测试约定：本仓库自动化冒烟集中在 `scripts/smoke/`（tier0-5，`run_all.py` 支持 `--scope` 按 scope 过滤）；提交前可本地运行 `uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --tier 0,1 --staged`（本机禁裸 python，一律经 uv 调用，工程路径为本机环境事实，其他机器按各自环境调整）；CI 按变更 scope 触发对应检查，meta 变更触发全量；各 Skill 自带测试（如 `github-personal-manager/smoke`、`web-search/tests` 等）保留在各自 Skill 目录内自包含，调度统一收拢到 `scripts/smoke` 入口。

## 6 本文件的维护
- 6.1 唯一事实源：本文件为仓库纪律唯一权威；任何纪律变更必须先更新本文件，再更新引用方。
- 6.2 章节数据段（第 2 章）可由 `scripts/sync-scope-manifest.py --update` 自动重写，其他章节人工维护。
- 6.3 修订记录：本文件改动走 `meta` scope，须触发全量 CI；修订后更新 CHANGELOG.md。

## 7 特殊 Skill 的副本纪律
- 7.1 **chrome-devtools 主副本与部署副本关系**：
  - **主副本**：`D:/Documents/AI_MCP-Skill-CLI/chrome-devtools/`（本仓库内），是唯一修改源头。所有需求、BUG 修复、功能增强必须先在此处归因分析、根源分析、追溯分析，修改仅在此进行。
  - **部署副本**：各用户的 `C:/Users/<username>/.workbuddy/skills/chrome-devtools/`，通过运行 `node localization/deploy.cjs` 从主副本生成。**严禁直接修改部署副本**，所有改动须经主副本 → 重新部署。
  - **修改纪律**：每次修改主副本后，必须重新运行 `node localization/deploy.cjs` 以同步到部署副本；部署副本的 `local-config.json` 和 `mcp-local-config.json` 是用户机器的本地配置，不入库、不随主副本分发。
  - **最小化原则**：主副本保持最小化——一切可通过脚本生成的文件（`local-config.json`、`mcp-local-config.json`、`upstream/build/`、`node_modules/`）均不入库，仅保留源码和部署脚本；Agent 通过指令下载、生成、衍生的内容不属于主副本范畴。
  - **自动安装纪律**：`cli_run.cjs` 已内置自动安装逻辑（`npm install -g chrome-devtools-mcp`，`PUPPETEER_SKIP_DOWNLOAD=1`），Agent 无需手动干预；部署副本激活时若检测到 MCP 服务不可用，将自动执行安装流程。
