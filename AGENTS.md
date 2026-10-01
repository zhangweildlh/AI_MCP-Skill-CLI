# AGENTS.md —— AI_MCP-Skill-CLI 仓库操作纪律（单一事实源）

## 0 元信息与使用说明
- 0.1 文件定位与权威性：本文件是本仓库所有 git 操作的纪律单一事实源；任何 Agent 在读写本仓库任何文件或执行任何 git 操作前，必须先完整读取本文件并遵循（读取本文件本身除外）。
- 0.2 适用对象与强制前置：适用于所有 Agent（WorkBuddy、本地 CLI 类 Agent 等）；网页版 LLM 无本地文件访问，须经本地 Agent 中转执行。
- 0.3 阅读顺序与快速索引：先读 1→3 章（认识仓库与红线），再按需读 4→5 章（干活与交付），第 6 章为本文件自身维护协议，第 7→9 章为特殊 Skill 副本、开发态最小化纪律与测试资产纪律（改动 chrome-devtools 或目录型 Skill 时必读第 7→8 章；涉及测试资产时必读第 9 章）。外部被引用文件 SOUL.md、MEMORY.md 位于用户级 `~/.workbuddy/`，属更高层跨项目约束，仅被本文件引用、不被本文件重定义。

## 1 仓库结构总览
- 1.1 单 git 仓库、多独立 Skill：本仓库是一个 git 仓库，每个一级子目录是一个独立 Skill 包（或共享基础设施），根级 Skill-*.md 为单文件 Skill；业务上相互独立，但基础设施（scripts/ 统一调度、github-personal-manager/scripts/ 复用）可共享，不视为关联。
- 1.2 单元分类：目录型 Skill（13）/ 根级 Skill 文件（8）/ 共享基础设施（scripts、.github 等）/ 其他根级文件（@*.md、mimo_mcp.py，归 meta，见 §2.3）。
- 1.3 三类管理路径：目录型 Skill → 开 worktree（第 4 章）；根级 Skill 文件与其他根级文件 → 标准分支+PR（第 5 章）；meta 变更 → 触发全量 CI。

## 2 Scope 清单
- 2.1 目录型 Skill（13 个，scope 标识 `dir/<目录名>`）：
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
- 2.4 排除与忽略：`.workbuddy/`、`worktrees/`、`_gsdata_/`（GoodSync 本地同步状态目录，仅本机工具使用，忽略规则见仓库级 `.gitignore`）、`reports/`（本地巡检报告目录，不随仓库分发，忽略规则见仓库级 `.gitignore`）、密钥文件（`ref-material-writing/.env` 等，详见 §3.3）。
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
- 5.4 测试约定：本仓库自动化冒烟集中在 `scripts/smoke/`（tier0-6，`run_all.py` 支持 `--scope` 按 scope 过滤；其中 `tier6` 为版本锁一致性门禁，仅对含 `version-lock.md` 的技能生效，主干锁与 main HEAD 不一致且未标注历史快照时致命阻断）；提交前可本地运行 `uv run --with requests python scripts/smoke/run_all.py --tier 0,1 --staged`（本机禁裸 python，一律经 uv 调用，工程路径为本机环境事实，其他机器按各自环境调整）；CI 按变更 scope 触发对应检查，meta 变更触发全量；各 Skill 自带测试（如 `github-personal-manager/smoke`、`web-search/tests` 等）保留在各自 Skill 目录内自包含，调度统一收拢到 `scripts/smoke` 入口（唯一测试源与四类测试入口、扫描优先/复用优先、收尾打扫、资产管理详见第 9 章 测试资产纪律）。
- 5.5 **docs-sync gate 与目录型提交的交互（操作指引）**：
  - `sop_docs_sync_check.sh`（docs-sync gate）依据改动类型分层检查。当变更无法被归类为 command/config/feature/behavior/dependency/rename/copy/example/docs 中的任何一种时（如**文件删除**、图片/数据资源变更），脚本将其标为 `UNKNOWN`，**保守触发全部 Tier 1/2/3 检查**，包括 Tier 1 的 README/CHANGELOG/AGENTS.md 同步要求。
  - **目录型 commit 与 docs(meta) commit 的成对模式**：目录型 Skill 的 worktree 分支提交时，pre-commit hook 的 scope 校验仅允许 `<scope_dir>/*` 下的文件（见 §3.2），CHANGELOG.md 等 meta 文件无法随目录型提交一起暂存。因此，当目录型 Skill 内发生文件删除或内容修改时：
    1. 在 worktree 中仅提交 Skill 目录内的变更（不含 CHANGELOG/README）；
    2. docs-sync gate 可能会返回退出码 2（Tier 1 未同步）——这是**预期行为**，不是错误。CHANGELOG/README 的同步修改保留在 worktree 工作树中不提交；
    3. 目录型 PR 合并后，在主工作树（或 meta 分支）上提交独立的 `docs(meta)` commit，补齐 CHANGELOG/README 更新。
  - **提交被拦截时的诊断顺序**：
    1. 确认报错来源：是 `sop_docs_sync_check.sh`（docs-sync gate）还是 pre-commit hook 的 scope 校验；
    2. 若是 docs-sync gate：检查 Tier 1 条目（README/CHANGELOG/AGENTS.md）是否已同步。若本次变更是纯目录型 Skill 内变更，可忽略 gate（合并后走 meta commit 补齐）；
    3. 若是 scope 校验：确认暂存文件是否全部在 `<scope_dir>/` 下。有越界文件则 `git restore --staged <越界文件>` 撤销暂存。
  - **禁忌**：不得用 `--no-verify` 绕过 hook；不得将 CHANGELOG 条目写在 PR 描述中代替实际 meta commit（PR 合并后描述即丢失）。

## 6 本文件的维护
- 6.1 唯一事实源：本文件为**本仓库 git 操作纪律**的唯一权威；任何本仓库纪律变更必须先更新本文件，再更新引用方。本文件引用 SOUL.md（用户级，跨项目智能体灵魂）、MEMORY.md（用户级永久记忆）等更高层约束，引用方向恒为 AGENTS.md → SOUL.md/MEMORY.md，且冲突时以本文件在本仓库 git 纪律范围内的规定为准（更高层约束仅被引用、不被本文件重定义）。
- 6.2 章节数据段（§2.1–§2.4）可由 `scripts/sync-scope-manifest.py --update` 自动重写，其余纪律章节人工维护并遵循 §6.1「先更新本文件」原则。
- 6.3 修订记录：本文件改动走 `meta` scope，须触发全量 CI；修订后更新 CHANGELOG.md。

## 7 特殊 Skill 的副本纪律（chrome-devtools 为典型定义对象，副本映射见 §7.2）
- 7.1 **chrome-devtools 主副本与部署副本关系**：
  - **主副本**：`D:/Documents/AI_MCP-Skill-CLI/chrome-devtools/`（本仓库内，本机示例，其他机器按各自环境调整），是唯一修改源头。所有需求、BUG 修复、功能增强必须先在此处归因分析、根源分析、追溯分析；**修改须走第 4 章 worktree 纪律**（在对应 worktree 内改动 chrome-devtools 目录型 Skill），合并回 main 即为主工作树同步，部署从合并后版本执行。
  - **部署副本**：各用户的 `C:/Users/<username>/.workbuddy/skills/chrome-devtools/`（本机示例），通过运行 `node localization/deploy.cjs` 从主副本生成。**严禁直接修改部署副本**，所有改动须经主副本 → 重新部署。
  - **修改纪律**：每次修改主副本（经 worktree 合并回 main）后，必须重新运行 `node localization/deploy.cjs` 以同步到部署副本；部署副本的 `local-config.json` 和 `mcp-local-config.json` 是用户机器的本地配置，不入库、不随主副本分发。
  - **最小化原则**：主副本保持最小化，遵循第 8 章 开发态目录型 Skill 最小化纪律（五类文件不纳入版本控制）；一切可通过脚本生成/下载的文件均不入库，仅保留源码和部署脚本；Agent 通过指令下载、生成、衍生的内容不属于主副本范畴。
  - **自动安装纪律**：`cli_run.cjs` 已内置安装逻辑（`npm install -g chrome-devtools-mcp`，`PUPPETEER_SKIP_DOWNLOAD=1`）；该安装由用户在本机主动触发部署副本激活时执行（若 MCP 服务不可用，据需跳过，非 Agent 未经授权擅自修改全局环境），Agent 无需手动干预。
- 7.2 **开发态副本 ↔ 部署态副本映射表（唯一映射登记处）**：下表登记本仓库每个已部署 Skill 的「开发态（仓库内）→ 部署态（用户级 skills 目录，本机示例）」对应关系。§7.1 的 chrome-devtools 主副本/部署副本为本表第一条特例。任何 Skill 落地部署前，须先在本表补登记再执行，以免出现「开发态有、部署态缺失/错位/被同名外部体占用」三种漂移。
  - 实测数据（2026-10-01 采集，路径为本机示例，其他机器按各自环境调整）：

  | name | 开发态（仓库内相对路径） | 部署态（用户级 skills 目录） | 开发态形态 | 部署态形态 | 实测（字节 / 行数 / 去 CR 后 md5） | 判定 |
  |---|---|---|---|---|---|---|
  | `chrome-devtools` | `chrome-devtools/` | `chrome-devtools/` | 目录型 | 目录型 | 16924 B × 16914 B；diff 仅 2 hunk，均属空行与行尾 | 实质一致（详见 §7.1） |
  | `skill-forge` | `Skill-元技能，Skill创建校验器.md` | `skill-forge/SKILL.md` | 根级单文件 | 目录（仅 SKILL.md） | 44029 B × 43220 B，809 行；去 CR 后同 `59e67db6…`，diff 0 行 | **实质一致**（仅 CRLF/LF 差异） |
  | `memory-consolidate` | `Workbuddy专属/Skill-memory-consolidate.md` | `memory-consolidate/SKILL.md` | 合集目录内单文件 | 目录（仅 SKILL.md） | 30060 B × 29823 B，237 行；去 CR 后同 `29c0f524…`，diff 0 行 | **实质一致**（仅 CRLF/LF 差异） |
  | `workflow-distill` | `Workbuddy专属/Skill-workflow-distill.md` | `workflow-distill/SKILL.md` | 合集目录内单文件 | 目录（仅 SKILL.md） | 17990 B × 17805 B，185 行；去 CR 后同 `46b490b7…`，diff 0 行 | **实质一致**（仅 CRLF/LF 差异） |
  | `task-methodology-consolidation` | `Skill-对当前对话会话做经验沉淀和方法论固化.md` | `task-methodology-consolidation/SKILL.md` | 根级单文件 | 目录（仅 SKILL.md） | 双侧 26255 B，同 `c1fb5928…` | 实质一致（单文件→目录形态转换） |
  | `workbuddy-workspace-migration` | `Workbuddy专属/workbuddy-workspace-migration/` | `workbuddy-workspace-migration/` | 合集目录内子 Skill | 目录 | 双侧 25522 B，同 `296e1f3b…` | 实质一致（仅所在目录不同） |
  | `self-improvement` | ~~`self-improvement/`（scope `dir/self-improvement`）~~（已随 PR 移除） | **无对应部署目录**；同名的 `self-improvement-system__skillhub/` 系外部安装体，非本仓库部署副本 | 目录型 | 未部署 / 被同名外部体占用 | 仓库版 4312 B，外部版 5577 B，正文不同 | **未部署**，开发态已移除（裁决见 §7.4） |
- 7.3 **副本判等口径（硬规则）**：判定两副本是否「实质一致」，**只**以「去掉行尾回车后（`tr -d '\r'`）两侧 md5 相同 且 `diff` 输出 0 行」为准；**CRLF/LF 行尾差异一律不计为实质差异**。`Workbuddy专属` 下单文件与部署目录 `SKILL.md` 的字节差恰好等于文件行数（237 / 185 / 809 行），即每行仅多一个 CR 字节；若仅比对原始 md5，会把这类副本误判为「版本分叉」。本条为据上述实测补正（原纪律未定义判等口径）。
- 7.4 **`self-improvement` 同名占用（2026-10-01 已裁决并执行）**：部署态 `self-improvement-system__skillhub/` 是外部（SkillHub）安装的运行态副本（含 `references/`、`lessons.md`、`mistakes.md`、`playbook.md`、`soul.md`、`session-log.md`、`_meta.json`、`_icon.png`），其 frontmatter 采用 Markdown 标题式 `## name: self-improvement`（非 YAML 键），与仓库原 `self-improvement/SKILL.md` 的 YAML 式 frontmatter 写法不同，但 name / description / author / version 完全一致（均为 OpenClaw v1.2.0）。
  - **裁决结论（用户 2026-10-01）**：保留部署态增强版 `self-improvement-system__skillhub`，既不迁回也不新建同名部署目录；仓库开发态 `dir/self-improvement` 属**未部署冗余副本**，予以移除。删除后不影响任何已部署技能，运行时功能零退化。
  - **执行结果**：开发态 `self-improvement/`（5 个受跟踪文件：`SKILL.md` / `_icon.png` / `_meta.json` / `_skillhub_meta.json` / `references/protocol.md`）已随 PR 移除；`AGENTS.md` §2.1 同步摘除 `dir/self-improvement` 登记。
  - **门禁联动（死锁成因与破除，2026-10-01 实测）**：smoke Tier5 对 dir 是**双向**校验——既判「已登记但目录缺失」，也判「目录存在但未登记」，两者皆 FATAL；而 pre-commit scope 校验只允许目录型 commit 暂存 `<scope_dir>/*`（根本改不了 `AGENTS.md`）。因此「删目录」与「摘登记」若分属两条 PR，无论先后必有一条红：先摘登记 → Tier5 判「未登记」FATAL；先删目录 → Tier5 判「已登记缺失」FATAL。破除方式（已实测验证）：先修好 `.githooks/pre-commit` §2.3 的 meta 特例 glob（原写法把星号转义成字面量，该特例自引入起从未命中过正常路径），使 meta 分支可合法承载「已登记目录内容」的增删；随后把「删目录 + 摘登记」并入**同一条 meta PR、按序两提交**（先删目录、后摘登记——删时清单仍含该 dir 故校验放行，摘时清单已不含该 dir 但目录亦已消失），即可一次闭环，无需颠倒两条 PR 的合并顺序。
  - **后续注意**：本仓库不再承载该 name 的开发态；若将来需要把该 Skill 纳入部署，须在用户级 `skills/` 下另建独立目录（不得与 `self-improvement-system__skillhub` 同名冲突），并先在 §7.2 补登记。
- 7.5 **映射表维护规则**：本表为人工维护段（非 §2.1–§2.4 机器可重写数据段）。`Workbuddy专属/` 属 `scripts/sync-scope-manifest.py` 的 `MANUAL_KEEP_DIRS` 人工豁免合集目录，其内的 `Skill-*.md`（如 `Skill-memory-consolidate.md`、`Skill-workflow-distill.md`）不在 scope 清单扫描口径内，故其部署映射由本表承接，不写入 §2.2 表格（避免与脚本输出口径冲突）。落地部署前须先查本表，确认目标部署路径未被同名外部安装体占用。

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
  - **删除测试 fixture 的配套改造**：若被删除的文件属于五类文件之⑤「测试衍生文件」（如二进制测试 fixture：`.docx`/`.pdf`/`.png` 样本），且测试代码硬依赖该文件，须**同步改造测试链路**——在测试代码中加入「fixture 缺失 → 自动调生成脚本现场合成」的降级逻辑，确保从零克隆仓库后直接运行测试仍 100% 通过。生成脚本必须是**确定性的**（不依赖随机种子、实时 API、外部服务；内容为纯虚构/演示用），合成产物须被 `.gitignore` 排除、不得提交入库。若原 `.gitignore` 中存在针对已删除 fixture 的反向忽略规则（如 `!tests/fixtures/*.docx`），删除后应注释掉这些规则并保留历史注释。
- 8.6 **配套基线**：各目录型 Skill 或仓库根 `.gitignore` 须列出五类相关模式（`__pycache__/`、`*.pyc`、`build/`、`dist/`、`node_modules/` 及 >100MB 二进制程序等），与 §2.4（排除与忽略）及 §3.2（hook 允许清单含 `.gitignore`）衔接；`.gitignore` 自身改动见 §8.5（meta 分支处理）。
- 8.7 **单一事实源**：依据 SOUL.md 单一事实源原则，第 7.1 条"最小化原则"改为引用本章，不在两处重复定义。**引用方向恒为 AGENTS.md → SOUL.md，禁止反向（SOUL.md 不得引用 AGENTS.md）**。

## 9 测试资产纪律（唯一测试源）

本仓库测试体系采用「仓库级调度中枢 + 项目级执行单元」两层架构，由单一文件登记、单一入口调度，禁止散落 ad-hoc 测试调用。

- 9.1 层级关系（仓库级 vs 项目级）：
  - **仓库级（元 / meta）**：`scripts/smoke/` 是测试体系的中枢——
    - `run_all.py` = **唯一调度入口**（所有测试的最终调用面，Agent 与 CI 只认这一层）；
    - `test_manifest.py` = **唯一清单**（single source of truth，登记全部测试资产）。
    - 调度树（单向引用，项目级不反向依赖入口）：
      ```
      run_all.py  ← 唯一入口（Agent / CI 只认这一层）
      ├─ 仓库纪律门禁：tier0-6（密钥/忽略/结构/合规/运行/触发/scope一致性/版本锁）
      └─ 项目级测试调度：--project-tests [--allow-real]
          └─ test_manifest.py 按 scope 派发子进程 → 各 Skill 目录内测试脚本
      ```
  - **项目级（各 Skill 目录内自包含）**：`tests/`、`smoke/`、`references/` 等目录中的可复用测试脚本（§8.3⑤ 允许入库）；它们是"执行单元"，**仅通过登记于清单后**才被仓库级入口调度，彼此独立、互不跨 Skill 依赖。
  - **关系本质**：仓库级是"调度中枢 + 纪律门禁"，项目级是"执行单元"；二者通过 `test_manifest.py` 单向衔接（run_all → manifest → 各 Skill 测试），项目级测试**不得反向 import / 调用** run_all 或彼此硬耦合。
- 9.2 统一入口与调度纪律：
  - **统一入口 = `run_all.py`**。任何冒烟 / CI / 回归 / 真实态测试**必须经本入口或其登记的子命令调用**；禁止在仓库任意位置手写 `python xxx/test.py` / `bash yyy/run.sh` 之类的散落调用（违反单一事实源，且易绕过真实态门控与打扫纪律）。
  - 调度子命令（均为加性 flag，既有 `--tier/--scope/--json/--strict/--list/--staged` 契约不变）：
    - `run_all.py --list-tests`：列出唯一清单（测试在哪、入口、怎么调用）；
    - `run_all.py --scope dir/X --project-tests [--allow-real]`：按 scope 跑项目级测试（needs-api 默认门控，须 `--allow-real`）；
    - `run_all.py --cleanup`：清理测试临时 / 过程 / 垃圾文件；
    - `test_manifest` 惰性导入，CI 默认路径零影响。
- 9.3 四类测试类型与入口（冒烟 / CI / 回归 / 真实态）：
  1. **冒烟 (smoke)**：仓库级纪律门禁 = `run_all.py --tier 0,1[,2,3]`；项目冒烟 = `run_all.py --scope dir/X --project-tests`（离线 / 本地工具部分）。
  2. **CI（本地 + 远端）**：本地预提交 = `uv run --with requests python scripts/smoke/run_all.py --tier 0,1 --staged`；远端 = `smoke.yml` 自动调用 `run_all.py`（仅仓库级纪律门禁：meta 变更全量 tier0-3+5+6，scope 变更仅 tier0 基础门禁）。**项目级测试刻意不接入远端 required CI**（异构环境 / 需本地工具 / 真实态风险高，按"最小作用域、不破坏 CI"原则刻意不接；如需启用须在清单显式标注并单独 matrix）。
  3. **回归 (regression)**：`run_all.py --scope dir/X --project-tests`（含各 Skill 回归套件）。
  4. **真实态 (real-state)**：需真实 API / 二进制 / 网络的测试，`run_all.py --scope dir/X --project-tests --allow-real`（显式门控，绝不进 CI；与既有 `SMOKE_PROBE_API` 门控哲学一致）。
- 9.4 扫描优先 / 复用优先纪律：任何新建 / 修改测试任务前，先 `run_all.py --list-tests` 扫描唯一清单；满足需求且可复用者**必须复用**；不满足者**优先修改既有再复用**；最后才造新（呼应 §2-2 最小作用域 + SOUL 单一事实源）。新增测试须补登清单；遗弃测试须从清单移除。
- 9.5 收尾打扫纪律：每次测试后必须清理临时 / 过程 / 垃圾文件——`run_all.py --cleanup` 自动清理已知测试临时目录（`code-review-combo/.verify_tmp`、`github-personal-manager/smoke/tmp`、`tender-review-kit/tests/workspace`）与 `__pycache__`；各测试脚本须自清理 `mktemp` 产物（如 `tender-review-kit` 已自清）。与 §8.3⑤ 衔接（测试衍生文件禁入库）。
- 9.6 测试资产管理（新增 / 修改 / 删除，必须系统化执行）：
  - **9.6.1 新增测试**：① 在对应 Skill 目录编写测试脚本（遵循 §2-2）；② 登记进 `test_manifest.py` 的 `TEST_ENTRIES`（填 scope / path / cmd / kind / risk / note）；③ 确定提交路径——Skill 自带测试随该 Skill 的 `dir` scope 走 worktree + PR（第 4 章），仓库级测试基建（含 `test_manifest.py`、`run_all.py`）随 `meta` 走标准分支 + PR（第 5 章）；④ 本地 `run_all.py --list-tests` 核对登记无误、`--project-tests` 验证可跑。
  - **9.6.2 修改测试**：沿用 9.6.1 的提交路径；若测试行为变化（类型 / 风险 / 命令改变），须**同步更新**清单对应条目的 kind / risk / cmd；回归验证确保未破坏既有契约。
  - **9.6.3 删除 / 退役测试**：从 Skill 目录删除脚本的**同时**，必须从 `test_manifest.py` 移除对应条目（保持唯一事实源无悬空）；随对应 scope PR 提交；若该测试曾写入 `scan_unregistered()` 口径，同步更新。
  - **9.6.4 编写纪律**：测试脚本的编写 / 修改 / 新建严格遵循 `Memory-代码纪律与Git操作.md §2-2`（六红线 / 统一优先级裁决器 / 全局契约面 / 分阶段操作手册 / 回归纪律）。
- 9.7 清单与 CI 协同维护：`test_manifest.py` 的 `TEST_ENTRIES` 即唯一事实源；新增测试目录须与 `scan_unregistered()` 口径一致（运行 `run_all.py --list-tests` 核对无遗漏）；CI（`smoke.yml`）与本地预推送门禁通过同一套清单命令口径对齐，确保"改了测试资产必改清单、改了清单必能调度"。
