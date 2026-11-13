# AGENTS.md —— AI_MCP-Skill-CLI 仓库操作纪律（单一事实源）

## 0 元信息与使用说明
- 0.1 文件定位与权威性：本文件是本仓库所有 git 操作的纪律单一事实源；任何 Agent 在读写本仓库任何文件或执行任何 git 操作前，必须先完整读取本文件并遵循（读取本文件本身除外）。
- 0.2 适用对象与强制前置：适用于所有 Agent（WorkBuddy、本地 CLI 类 Agent 等）；网页版 LLM 无本地文件访问，须经本地 Agent 中转执行。
- 0.3 阅读顺序与快速索引：先读 1→3 章（认识仓库与红线），再按需读 4→5 章（干活与交付），第 6 章为本文件自身维护协议，第 7→9 章为开发态 / 部署态副本全量注册与全生命周期纪律、唯一同步入口、开发态最小化纪律与测试资产纪律（改动任一 Skill 或涉及覆盖部署时必读第 7 章；改动 chrome-devtools 或目录型 Skill 时必读第 7→8 章；涉及测试资产时必读第 9 章）。外部被引用文件 SOUL.md、MEMORY.md 位于用户级 `~/.workbuddy/`，属更高层跨项目约束，仅被本文件引用、不被本文件重定义。

## 1 仓库结构总览
- 1.1 单 git 仓库、多独立 Skill：本仓库是一个 git 仓库，每个一级子目录是一个独立 Skill 包（或共享基础设施），根级 Skill-*.md 为单文件 Skill；业务上相互独立，但基础设施（scripts/ 统一调度、github-personal-manager/scripts/ 复用）可共享，不视为关联。
- 1.2 单元分类：目录型 Skill（13）/ 根级 Skill 文件（8）/ 共享基础设施（scripts、.github 等）/ 其他根级文件（@*.md、mimo_mcp.py，归 meta，见 §2.3）。
- 1.3 三类管理路径：**目录型 Skill 与单文件型 Skill 文件（不论是否位于仓库根级）→ 一律开 worktree（第 4 章）**；其他根级文件（非 Skill）→ 标准分支+PR（第 5 章）；meta 变更 → 触发全量 CI。本条中「单文件型 Skill 文件」指以 Skill 定义文件形态存在的单元，含仓库根级 `Skill-*.md` 与任意子目录下的单文件 Skill；worktree 的核心目的是隔离多个相互独立的 Agent 对同一文件的并发修改，避免冲突。

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
- 2.3 共享/元 scope（`meta`）：`scripts/`、`.github/`、`README.md`、`CHANGELOG.md`、`AGENTS.md`、`Memory-Data/`、`.githooks/`、`.gitignore`、`.gitattributes`、`@*.md`、`mimo_mcp.py`。其中 `.githooks/`、`.gitignore`、`.gitattributes` 为仓库纪律与门禁配置（`.gitattributes` 承载 §7.3「入库即 LF」的跨平台行尾声明，`* text=auto eol=lf`）；`@*.md`、`mimo_mcp.py` 为其他根级文件，与本文件同走 meta 管理路径（标准分支+PR）。
- 2.4 排除与忽略：`.workbuddy/`、`worktrees/`、`_gsdata_/`（GoodSync 本地同步状态目录，仅本机工具使用，忽略规则见仓库级 `.gitignore`）、`reports/`（本地巡检报告目录，不随仓库分发，忽略规则见仓库级 `.gitignore`）、密钥文件（`ref-material-writing/.env` 等，详见 §3.3）。
- 2.5 清单维护规则：§2.1–§2.4 为机器可重写数据段，由 `scripts/sync-scope-manifest.py --update` 自动生成；人工修改须与脚本输出一致（数量、目录名、name 字段须与脚本扫描结果对齐）。除数据段外，本文件其余纪律章节为人工维护，遵循 §6.1「先更新本文件、再更新引用方」原则；新增/删除目录或根级 Skill 文件必须同步本节（docs-sync-checklist Tier 1 强制）。

## 3 红线与强制约束
- 3.1 git 操作前置：任何 git 操作前必须先读本文件（详见 §0.1）；禁止绕过 `AGENTS.md` 直接改动仓库。
- 3.2 目录型 Skill 改动纪律：只允许在对应 worktree 中改动，禁止在仓库主工作树直接改目录型 Skill 内容。此纪律由 `.githooks/pre-commit` hook 强制拦截——在主工作树（仓库根 checkout，无论检出何分支）提交时，若暂存文件属于目录型 Skill 路径则直接阻断，仅允许 meta scope 文件变更（`.githooks/*`, `scripts/*`, `.github/*`, `README.md`, `CHANGELOG.md`, `AGENTS.md`, `Memory-Data/*`, `.gitignore`, `.gitattributes`, `@*.md`, `mimo_mcp.py`）。**密钥与敏感文件原则上不放行**（`.env`、`*.secret`、`providers.json` 等一律不在放行之列，不以"隐藏文件"泛化放行，防止密钥被误放）；白名单中仅 `ref-material-writing/.env`、`web-search/.env`、`code-review-combo/config/providers.json` 三项为**受控例外**（供 §3.3 显式授权范围内的私有仓库提交所需，引入自 PR #45 的同一提交），其能否推入远端分支另受 §3.3 约束。
- 3.3 密钥与敏感文件：禁止将 `ref-material-writing/.env`、`web-search/.env`、`code-review-combo/config/providers.json` 等密钥文件推入任何公开/远端分支。私有仓库豁免仅限显式授权（授权人、明确范围、留痕，见 MEMORY.md 决策 D-2026-0811-01），且豁免不扩展到公开/远端分支。
- 3.4 越权操作：禁止未经授权执行 git push、force push、reset --hard、删除分支等破坏性/共享状态操作；Agent 需在权限范围内工作。**授权指用户显式指令；脚本参数 `--confirm` 仅为脚本级安全闸门，不等同用户显式授权**，对外/破坏性动作仍需用户显式确认。
- 3.5 并发纪律：多 Agent 并发时各守各的 scope，修改不得超出分配范围；发现交叉立即暂停并上报用户（默认协调者）裁决后再继续。**worktree 是本仓库隔离并发修改的主要手段**：任一目录型 Skill 或单文件型 Skill 文件的改动（含根级 `Skill-*.md` 与非根级单文件 Skill）都必须在其专属 worktree 内完成，禁止在主工作树直接改动；主工作树 pre-commit 对这类路径一律拦截，属预期行为而非故障。

## 4 目录型 Skill 的 worktree 纪律
- 4.1 worktree 挂载根：`<仓库根>/worktrees/<name>-<topic>-<YYYYMMDDHHMMSS>/`（已在 .gitignore 统一忽略，不入库）；分支 `feat/<name>-<topic>-<YYYYMMDDHHMMSS>`；**`feat/` 前缀 + 目录名 = 分支名**（时间戳一致）；对目录型 Skill，`<name>` 即其目录名（§2.1 以目录名作 scope，无独立 name 字段）；对根级文件型 Skill，`<name>` 为 §2.2 表格的 name 字段；`<topic>` 为简短任务核心目的（英文小写连字符，2–6 词 ≤30 字符，禁 B1/B2/b3 类序号）；时间戳由脚本一次 `date +%Y%m%d%H%M%S` 生成、目录与分支复用同一值。
- 4.2 标准流程（引用脚本而非手写 git worktree add）：
  1. 读取本文件（尤其第 2 章 scope）确认归属；
  2. 运行 `bash github-personal-manager/scripts/sop_worktree_add.sh <仓库> --scope <name> --branch feat/<topic> --confirm`（自动建 worktree 目录与分支，时间戳一致，四道守卫——分支命名合规、scope 解析、目录/分支时间戳一致、已登记 scope 校验；脚本位于 github-personal-manager 技能目录 `scripts/` 下，须在仓库根执行）；`--scope <name>` 传入 Skill 的 name 字段（目录型即其目录名，根级文件型即 §2.2 表格 name）；脚本自动生成 `feat/<name>-<topic>-<TS>` 分支与 `worktrees/<name>-<topic>-<TS>/` 目录（时间戳一次生成、`feat/` 前缀+目录名=分支名）；
  3. 在 worktree 内修改对应 Skill 内容并提交；
  4. 提交与 PR 遵循第 5 章约定（`github-personal-manager/scripts/sop_pr_create.sh`）；
  5. 合并后运行 `bash github-personal-manager/scripts/sop_worktree_cleanup.sh <仓库> --branch feat/<name>-<topic>-<YYYYMMDDHHMMSS> --confirm` 清理（本地目录与分支删除自动；远端分支删除须另行 `--confirm`，不默认执行）。
   - **授权模型例外（全链路授权）**：当单条指令**显式授予覆盖本地与远端清理的「全链路授权」**时，本地+远端清理可经**一次** `--confirm` 完成，无需分别授权——此例外仅放宽「分别确认」的形式要求，**不削弱任何安全闸门**：未合并内容校验（`merge-base --is-ancestor` 或 squash 合并探测，见 `github-personal-manager` 技能 `sop_worktree_cleanup.sh`）与开放 PR 告警仍强制保留；删除 `origin/main` 等受保护分支、强推、推 upstream 等绝对红线不受此例外影响。无显式全链路授权时，远端删除的分别 `--confirm` 仍须独立给出。
- 4.3 禁止事项：禁止在主工作树改动他单元内容；禁止跨 worktree 混改；禁止在 worktree 内改动不属于该 Skill 的文件（`.gitignore` 等仓库根 meta 文件改动见 §8.5，走 meta 分支）。**窄例外（形态 A）**：为支持 §5.5 形态 A「单 PR 闭环」，允许在 worktree 内追加一个**仅含 `CHANGELOG.md` / `README.md` / `AGENTS.md`（§7.2 所在）三个 meta 登记文件**的 `docs(meta)` commit（该分支已在本 worktree 检出，无需 checkout 到主工作树）；此例外不扩展至其它跨 scope 文件，`.githooks/pre-commit` 的 `dir` scope 校验已同步放行上述三文件。

## 5 提交 / PR / CI 约定
- 5.1 提交信息：遵循仓库既有惯例（前缀 + 简述，如 `docs:`、`feat:`、`fix:`），并标注本次变更的 scope（`dir/<目录名>` / `file/<name>` / `meta`）。
- 5.2 PR 纪律：目录型 Skill 改动从对应 worktree 分支发 PR；根级 Skill 文件与其他根级文件走标准分支+PR；PR 描述须列明影响范围与验证方式。
- 5.3 CI 约定（矩阵）：

  | 变更类型 | `smoke`（required，恒运行） | `smoke-scoped`（按 scope，非 required） |
  |---|---|---|
  | meta scope | 全量 tier0-3+5+6（`smoke` 在 meta 时自动升级） | 跳过 |
  | 目录型 Skill | tier0 密钥/忽略（快速门禁） | 运行（tier1/2/5，按 `--scope`） |
  | 根级 Skill 文件 | tier0 密钥/忽略 | 运行（tier1/2/5，按 `--scope`） |
  | 无法判定 scope | 全量 tier0-3+5+6（保守） | 不运行 |

  `main` 分支保护（classic protected branch）required check **仅 `smoke`**（失败即阻断合并）：meta 变更时该 job 自动升级为全量 tier0-3+5+6，scope 变更时仅跑 tier0 基础门禁；`smoke-scoped` 在 scope 变更时按 scope 运行对应 tier1/2/5（校验 `file/<name>` 或 `dir/<scope>` 的专项检查），对 meta 变更 skipping，故不列入 required（若列入则 meta PR 因 skipping 永远无法合并）。注：`run_all.py` 是本地/CI 共用的**唯一调度脚本**，非独立 GitHub check；「全量」由 `smoke` job 在 meta 模式下调用 `run_all.py --tier 0,1,2,3,5,6` 实现。
  - **`dir/Workbuddy专属` 的 CI 实际行为（文档与 CI 一致性加固，2026-11-12 核实）**：`Workbuddy专属/` 顶层**无 SKILL.md**（§2.1 第 27 行已注明）。CI 的 `.github/workflows/smoke.yml` scope-map 逻辑（顶层目录分支）仅当 `<顶层目录>/SKILL.md` 存在时才产出 `dir/<顶层目录>` scope；由于 `Workbuddy专属/SKILL.md` 不存在，落在 `Workbuddy专属/` 下的任何子技能 / 子文件改动在 CI 中一律判为 `meta`（触发全量 tier0-3+5+6），**永不触发** `dir/Workbuddy专属` 的 scoped smoke（tier1/2/5 按 `--scope`）。即 §2.1 登记的 `dir/Workbuddy专属` scope 在 CI 中是「文档登记项」而非「可触发的 scoped smoke 维度」——属文档与 CI 行为一致性说明，不改 CI 代码（实测见 2026-11-12 wechat-article-to-ima 卡片残留清理 PR #241 即因该判定走全量 CI）。
- 5.4 测试约定：本仓库自动化冒烟集中在 `scripts/smoke/`（tier0-6，`run_all.py` 支持 `--scope` 按 scope 过滤；其中 `tier6` 为版本锁一致性门禁，仅对含 `version-lock.md` 的技能生效，主干锁与 main HEAD 不一致且未标注历史快照时致命阻断，且对 `version-lock.md` 显式声明为「运行时探测依赖（非版本锁定）」的模块豁免首行版本标记要求（此类模块非 git 上游模块，无固定 commit 可锁）；`tier5` 另校验 §2.1/§2.2 标题声明的计数与该节实际登记条目数一致（计数漂移即致命阻断）；提交前可本地运行 `uv run --with requests python scripts/smoke/run_all.py --tier 0,1 --staged`（本机禁裸 python，一律经 uv 调用，工程路径为本机环境事实，其他机器按各自环境调整）；CI 按变更 scope 触发对应检查，meta 变更触发全量；各 Skill 自带测试（如 `github-personal-manager/smoke`、`web-search/tests` 等）保留在各自 Skill 目录内自包含，调度统一收拢到 `scripts/smoke` 入口（唯一测试源与四类测试入口、扫描优先/复用优先、收尾打扫、资产管理详见第 9 章 测试资产纪律）。
- 5.5 **docs-sync gate 与目录型提交的交互（操作指引）**：
  - `sop_docs_sync_check.sh`（docs-sync gate）依据改动类型分层检查。当变更无法被归类为 command/config/feature/behavior/dependency/rename/copy/example/docs 中的任何一种时（如**文件删除**、图片/数据资源变更），脚本将其标为 `UNKNOWN`，**保守触发全部 Tier 1/2/3 检查**，包括 Tier 1 的 README/CHANGELOG/AGENTS.md 同步要求。
  - **目录型 commit 与 docs(meta) commit 的「单 PR 闭环」与「成对模式」（两种合规形态）**：目录型 / 单文件型 Skill 改动时，pre-commit hook 的 scope 校验仅允许 `<scope_dir>/*`（或根级单文件本体）随技能 commit 暂存（见 §3.2/§4.3），CHANGELOG.md / README.md / §7.2 等 meta 文件无法与技能 commit 同暂存，故「技能变更」与「注册表 / 流水维护」**至少分两个 commit**。两 commit 是否分属两个 PR 由纪律措辞决定，现明确两种合规形态：
    1. 在 worktree 中先提交**技能 commit**（首个 commit）：仅含 Skill 目录（或根级单文件本体）内的变更（不含 CHANGELOG/README/§7.2）；docs-sync gate 可能会返回退出码 2（Tier 1 未同步）——这是**预期行为**，不是错误。形态 A 的后续 meta commit 在该 worktree 内追加（见 §4.3 窄例外与 hook §2.3）。
    2. **形态 A（推荐 · 单 PR 闭环，单技能改动首选形态）**：技能 commit 在 worktree 内完成后，**在该 worktree（功能分支已检出）内继续追加**一个独立的 `docs(meta)` commit（仅 CHANGELOG/README/§7.2 等 meta 文件），随后从**同一分支**开**一个 PR**，即完成「技能变更 + 注册表维护」闭环。meta commit 的 §7.2 实测值须以本 PR 合入后该技能文件的**最终内容**填写（PR 评审/合入后即等于 merged main blob 状态，符合 §7.2「记当前实测状态」）；docs-sync gate 对技能 commit 返回的退出码 2 由同 PR 内 meta commit 抹平。其机制可行性见下「可达性约束」。
       - **可达性约束（关键 · 2026-11-12 实测坐实并修正）**：旧版形态 A 措辞要求「切回主工作树对该分支追加 meta commit」，但本仓库 §1.3 / §4 强制**每个** Skill 改动都开**专用 worktree**（分支 `feat/<name>-<topic>-<TS>`），功能分支恒被该 worktree 占用；主工作树 `git checkout <该分支>` 必报 `fatal: '<分支>' is already used by worktree at '<worktree-path>'`，故「切回主工作树追加」确不可达（上一任务已实测复现，exit 128，主工作树保持 main 无副作用）。但**正确解不是放弃形态 A，而是修正其机制**：meta commit 直接在**该 worktree 内（分支已检出）**追加即可——worktree 已检出该分支，`git commit` 天然可用；同时 §4.3 为形态 A 开窄例外、`.githooks/pre-commit` 的 `dir` scope 校验已放行 `CHANGELOG.md` / `README.md` / `AGENTS.md`（§7.2 所在）三个 meta 登记文件（见 hook §2.3）。故形态 A 在 worktree 纪律下**完全可达**，为单技能改动的首选单 PR 闭环形态；PR #243 曾误将「旧措辞不可达」等同「形态 A 不可达」已纠正。
    3. **形态 B（meta 独立 PR · 多技能批量归集形态）**：开一个**独立 meta 分支 + PR**（标准分支 + PR，见 §5.2），仅含 `docs(meta)` 提交（CHANGELOG/README/§7.2 等 meta 文件）；该 PR 与承载技能变更的功能分支 PR 分离、合并互不阻塞。适用于将**多个**技能变更的注册表 / 流水刷新归集到一条 meta PR（参见 §7.4「同一条 meta PR 按序多提交」）。单技能变更优先走形态 A（单 PR 闭环）；仅当确需跨多条功能分支批量归集 meta 维护时方走形态 B。
    4. 两形态均满足 commit 级 scope 纯一（hook 强制，不可削弱）；形态 A 仅将旧规「合并后另开独立 meta PR」放宽为「同分支按序两 commit、单 PR 闭环」，不削弱任何安全 / 校验门禁。形态 A 为单技能改动的首选闭环形态（机制见「可达性约束」）；形态 B 用于多技能 meta 批量归集，二者均合规。
  - **提交被拦截时的诊断顺序**：
    1. 确认报错来源：是 `sop_docs_sync_check.sh`（docs-sync gate）还是 pre-commit hook 的 scope 校验；
    2. 若是 docs-sync gate：检查 Tier 1 条目（README/CHANGELOG/AGENTS.md）是否已同步。若本次变更是纯目录型 Skill 内变更，可忽略 gate（合并后走 meta commit 补齐）；
    3. 若是 scope 校验：确认暂存文件是否全部在 `<scope_dir>/` 下。有越界文件则 `git restore --staged <越界文件>` 撤销暂存。
  - **禁忌**：不得用 `--no-verify` 绕过 hook；不得将 CHANGELOG 条目写在 PR 描述中代替实际 meta commit（PR 合并后描述即丢失）。

## 6 本文件的维护
- 6.1 唯一事实源：本文件为**本仓库 git 操作纪律**的唯一权威；任何本仓库纪律变更必须先更新本文件，再更新引用方。本文件引用 SOUL.md（用户级，跨项目智能体灵魂）、MEMORY.md（用户级永久记忆）等更高层约束，引用方向恒为 AGENTS.md → SOUL.md/MEMORY.md，且冲突时以本文件在本仓库 git 纪律范围内的规定为准（更高层约束仅被引用、不被本文件重定义）。
- 6.2 章节数据段（§2.1–§2.4）可由 `scripts/sync-scope-manifest.py --update` 自动重写，其余纪律章节人工维护并遵循 §6.1「先更新本文件」原则。
- 6.3 修订记录：本文件改动走 `meta` scope，须触发全量 CI；修订后更新 CHANGELOG.md。

## 7 开发态 / 部署态副本纪律（全量注册见 §7.2，生命周期见 §7.6，唯一同步入口见 §7.7）
- 7.1 **主副本与部署副本关系**以 `chrome-devtools` 为例：
  - **主副本（开发态）**：`D:/Documents/AI_MCP-Skill-CLI/chrome-devtools/`（本仓库内，本机示例，其他机器按各自环境调整），是唯一修改源头。所有需求、BUG 修复、功能增强必须先在此处归因分析、根源分析、追溯分析；**修改须走第 4 章 worktree 纪律**（在对应 worktree 内改动 chrome-devtools 目录型 Skill），合并回 main 即为主工作树同步，部署从合并后版本执行。
  - **部署副本（部署态）**：各用户的 `C:/Users/<username>/.workbuddy/skills/chrome-devtools/`（本机示例）。**副本内容同步由 §7.7 唯一入口 `scripts/deploy-skill.cjs` 从 main 的 git blob 逐字节重建**（不经工作树，理由见 §7.3）。`localization/install.cjs`（原 `deploy.cjs`，2026-11-12 按实际功能改名）**不是副本同步器**：它在部署态目录内部运行，负责安装依赖、tsc 构建、npm 全局安装、注入本地化、生成/合并 `mcp.json`；实测其部署态副本内 README 第 64 行自述「全局安装 + 构建 + vendoring + 配置编排」，35 处引用（11 文件）均指向安装/激活，无一写用户级 skills 目录。因此旧版 §7.1「部署副本由 `node localization/deploy.cjs` 生成」「每次改主副本须重跑它同步到部署副本」两处表述**已作废**（属事实错误，与 §7.2「由 main blob 重建」矛盾）。
  - **修改纪律**：每次修改主副本（经 worktree 合并回 main）后，须按 §7.6.5 以 main blob 覆盖部署。部署副本的 `local-config.json`、`mcp-local-config.json` 是用户机器的本地配置，不入库、不随主副本分发，覆盖部署时保留不删、不覆盖。
  - **最小化原则**：主副本保持最小化，遵循第 8 章 开发态目录型 Skill 最小化纪律（五类文件不纳入版本控制）；一切可通过脚本生成/下载的文件均不入库，仅保留源码和部署脚本；Agent 通过指令下载、生成、衍生的内容不属于主副本范畴。
  - **自动安装纪律**：`cli_run.cjs` 已内置安装逻辑（`npm install -g chrome-devtools-mcp`，`PUPPETEER_SKIP_DOWNLOAD=1`）；该安装由用户在本机主动触发部署副本激活时执行（若 MCP 服务不可用，据需跳过，非 Agent 未经授权擅自修改全局环境），Agent 无需手动干预；安装入口名随改名同步为 `node localization/install.cjs`。
- 7.2 **全量注册表（唯一登记处）**：本节由「主表（已部署）」+「§7.2.1 补充表（未部署 / 外部安装体 / 已移除）」共同构成**本仓库全部 Skill 的开发态 ↔ 部署态登记**，二者合起来覆盖 §2.1 目录型 Skill、§2.2 根级单文件 Skill、`Workbuddy专属/` 合集内单文件与子 Skill、以及分发型子 Skill。主表登记每个**已部署** Skill 的「开发态（仓库内）→ 部署态（用户级 skills 目录，本机示例）」对应关系；§7.1 的 chrome-devtools 主副本/部署副本为主表第一条特例。任何 Skill 落地部署前，须先在本节补登记再执行，以免出现「开发态有、部署态缺失/错位/被同名外部体占用」三种漂移。
  - **判据（唯一，§7.6.1）**：某 Skill 是否「存在部署态副本」，**只以用户级 `C:/Users/<username>/.workbuddy/skills/` 下是否存在对应目录为据**，与「目录型 / 单文件型」形态无关；用户告知存在部署态副本后仍须事实查验坐实。主表同时是 §7.7 唯一同步器运行时解析的机器可读数据源，前三列须保持反引号包裹的单一值格式。
  - 实测数据（**2026-11-12 全量复采本轮 9 个变更技能**（含 PR #237 回流的 `deep-discuss`），其余行沿用 2026-11-04 全量复采值；路径为本机示例，其他机器按各自环境调整）：判等口径依 §7.3「**三项判据**」——逐字节 == main blob + `git hash-object --no-filters` == blob sha + CR = 0，三者全过方判一致；历史措辞「单纯 CRLF 差异一律豁免」已作废（根 `.gitattributes` 声明 `* text=auto eol=lf`，blob 与工作树恒 LF，不产生需豁免的行尾差异）。「聚合 md5」统一口径：**按部署态相对路径升序，对每个文件序贯喂入 `相对路径 + \0 + 文件字节` 后取 md5**（单文件型 Skill 的相对路径取 `SKILL.md`）。部署方式除注明者外，**一律由 main 的 git blob 逐字节重建**（不经工作树）。
  - **部署副本物理上为一份**（2026-11-04 实测）：`C:\Users\Administrator\.workbuddy` 系指向 `C:\Users\15794\.workbuddy` 的 **NTFS Junction**（实测同 inode，如 `github-personal-manager/scripts/sop_worktree_cleanup.sh` inode 3377699720789505），同一物理文件透传，**只需同步一份**，无需两处同更。

  | name | 开发态（仓库内相对路径） | 部署态（用户级 skills 目录） | 开发态形态 | 部署态形态 | 实测（文件 / 字节 / CR / 聚合 md5） | 判定 |
  |---|---|---|---|---|---|---|
| `chrome-devtools` | `chrome-devtools/` | `chrome-devtools/` | 目录型 | 目录型 | 26 文件 / 250519 B / 3826 行 / 0 CR；聚合 md5 `ee597195…`（`localization/install.cjs` `620c9be1…`、`README.md` `8554131a…`、`SKILL.md` `56d2ae09…`） | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。部署方式：经 §7.7 唯一入口由 main blob 逐字节重建（不经工作树）。`localization/install.cjs`（原 `deploy.cjs`，PR #236 按实际功能改名）是**部署态内部安装器**、不承担副本同步；部署态专有物 `local-config.json`/`mcp-local-config.json`（本机配置，不入库、不随主副本分发，§7.1） |
| `skill-forge` | `Skill-元技能，Skill创建校验器.md` | `skill-forge/SKILL.md` | 根级单文件 | 目录（仅 SKILL.md） | 1 文件 / 47275 B / 0 CR；聚合 md5 `5d3c0ab2…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。部署态 `skill-forge/SKILL.md` 由根级单文件复制而来 |
| `memory-consolidate` | `Workbuddy专属/Skill-memory-consolidate.md` | `memory-consolidate/SKILL.md` | 合集目录内单文件 | 目录（仅 SKILL.md） | 47533 B / 364 行 / 0 CR；md5 `3ef2e91e…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。部署副本物理上为一份（NTFS Junction） |
| `workflow-distill` | `Workbuddy专属/Skill-workflow-distill.md` | `workflow-distill/SKILL.md` | 合集目录内单文件 | 目录（仅 SKILL.md） | 1 文件 / 17805 B / 0 CR；md5 `63b09729…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过） |
| `task-methodology-consolidation` | `Skill-对当前对话会话做经验沉淀和方法论固化.md` | `task-methodology-consolidation/SKILL.md` | 根级单文件 | 目录（仅 SKILL.md） | 1 文件 / 25989 B / 0 CR；md5 `6154318e…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）（单文件→目录形态转换） |
| `workbuddy-workspace-migration` | `Workbuddy专属/workbuddy-workspace-migration/` | `workbuddy-workspace-migration/` | 合集目录内子 Skill | 目录 | 6 文件 / 112574 B / 0 CR；md5 `f52fb63f…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）（仅所在目录不同）。部署态专有物：`scripts/__pycache__/*.pyc`（运行期产物，§9.5 可清理） |
| `self-improvement` | ~~`self-improvement/`（scope `dir/self-improvement`）~~（已随 PR 移除） | **无对应部署目录**；同名的 `self-improvement-system__skillhub/` 系外部安装体，非本仓库部署副本 | 目录型 | 未部署 / 被同名外部体占用 | 仓库版 4312 B，外部版 5577 B，正文不同 | 未部署，开发态已移除（裁决见 §7.4） |
26 文件 / 448147 B / 6554 行 / 0 CR；聚合 md5 `c884bfb6…`；逐文件 blob sha：.gitignore `1933586d…`、SKILL.md `5f6491c0…`、deploy-manifest.json `fd746802…`、scripts/check-deps.js `e344b632…`、scripts/deploy.js `949736b0…`、scripts/pipeline.js `e4a324ce…`、scripts/resolve_midlink.js `82a439c6…`、scripts/state.js `bba76d1f…`、tests/fixtures/fetch_response_samples.json `99d28e1f…`、tests/fixtures/filter_false_positives.json `b057b95d…`、tests/fixtures/kb_snapshot_sample.json `d77a314a…`、tests/test_aux_markdown.js `4ff7bc1e…`、tests/test_concurrent_lock.js `04935a32…`、tests/test_deploy_parity.py `9ff23f68…`、tests/test_deps_and_folder.js `b340d2a7…`、tests/test_fetch_diagnosis.js `c871594a…`、tests/test_fetch_failure_taxonomy.js `3468c14f…`、tests/test_filter_rules.js `772cc123…`、tests/test_guide_reverse.py `f4aa08c9…`、tests/test_kb_consistency.js `b729e1d2…`、tests/test_pending_handback.js `bf4f6c0b…`、tests/test_pipeline_contract.js `ce544c59…`、tests/test_reset_card_cleanup.js `fe56b2c8…`、tests/test_sink_defects_cd.js `512ec741…`、tests/test_state.js `4191dd3f…`、引导词.md `05e7b6ef…`；经技能内 `scripts/deploy.js` 薄包装转发 §7.7 唯一入口从 main blob 同步，写后校验 26/26 | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。部署方式：由技能内 `scripts/deploy.js` 薄包装转发 §7.7 唯一入口，从 main blob 逐字节重建（不经工作树）。部署态专有物：`ima_credentials.json`（凭据明文不入库，§3.3，项目级 `deploy-manifest.json` 显式 `preserve`，只写不删）。项目级测试 14 套（`tests/` 下，见 §9.6.1 清单登记） |
13 文件 / 120560 B / 2413 行 / 0 CR；聚合 md5 `2521bca4…`；逐文件 blob sha：README.md `c561471f…`、SKILL.md `b2c1404f…`、deploy-manifest.json `0aa6e8be…`、scripts/deploy.js `3ed18c3d…`、scripts/get_sogou_cookie.js `af0ce88c…`、scripts/search_wechat.js `3fcb2e28…`、tests/cross_engine/ref_parser.py `af8b5d50…`、tests/cross_engine/run_cross.js `12a0ecb3…`、tests/fixtures/sogou_antispider.html `badeca1e…`、tests/fixtures/sogou_empty.html `aa0bea52…`、tests/fixtures/sogou_normal.html `604aa129…`、tests/run_tests.js `a83113c5…`、tests/test_cli_contract.js `4cde2337…`；经技能内 `scripts/deploy.js` 薄包装转发 §7.7 唯一入口从 main blob 同步，写后校验 13/13 | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。部署方式：由技能内 `scripts/deploy.js` 薄包装转发 §7.7 唯一入口，从 main blob 逐字节重建（不经工作树）。开发态排除部署态专有物 `tests/audit/`（含 45KB `ocrA.json`）与 `_skillhub_meta.json`（既不入库也不删除/覆盖）。项目级测试 2 套（`tests/` 下） |
| `code-review-combo` | `code-review-combo/` | `code-review-combo/` | 目录型 | 目录型（物理一份） | 24 文件 / 261090 B / 0 CR；md5 `5953f59d…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。部署方式：由 main blob 逐字节重建。部署态专有物：`config/providers.json`（凭证，§3.3）、`.ocr-provider-cache.json`（运行期产物） |
| `codebase-memory` | `codebase-memory/` | `codebase-memory/`（**仅** `README.md` + `SKILL.md`） | 目录型 | 目录型（物理一份） | 2 文件 / 76191 B / 0 CR；md5 `cfad4df2…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。部署方式：由 main blob 逐字节重建。仓库专有、不入部署态：`codebase-memory/codebase-memory-mcp/`（exe 占位 + 下载说明 + 注册脚本，共 5 文件） |
| `deep-discuss` | `deep-discuss/` | `deep-discuss/` | 目录型 | 目录型（物理一份） | 13 文件 / 117726 B / 2175 行 / 0 CR；md5 `15c8dfd2…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。PR #237 把部署态增强的「持久化感知探活协议」回流开发态，合并后以 fresh main blob 覆盖部署，双态漂移已消除 |
| `file-structure-organizer` | `file-structure-organizer/` | `file-structure-organizer/` | 目录型 | 目录型（物理一份） | 9 文件 / 83023 B / 0 CR；md5 `5e34531d…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过） |
| `open-medical-skills` | `open-medical-skills/` | `open-medical-skills/` | 目录型（兼**分发器**：`scripts/deploy.js` 薄包装） | 目录型（物理一份） | 16 文件 / 72432 B / 1180 行 / 0 CR；md5 `6416be40…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。分发关系：内 4 个临床子 Skill **既**内嵌于父包 blob 树（供父按 `{SKILL_ROOT}/<子技能>/SKILL.md` 读取），**也**经 §7.7 唯一入口分发为用户级 skills 下独立 Skill 目录（见下 4 行），须同轮重建；联网刷新上游由项目级 `deploy.js --sync` 显式触发，覆盖部署恒离线 |
| `clinical-differential-diagnosis` | `open-medical-skills/clinical-differential-diagnosis/` | `clinical-differential-diagnosis/` | 合集目录内子 Skill | 目录 | 2 文件 / 6250 B / 0 CR；md5 `62098a6f…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。由 `open-medical-skills/scripts/deploy.js` 薄包装转发 §7.7 唯一入口分发 |
| `clinical-treatment-plan-generator` | `open-medical-skills/clinical-treatment-plan-generator/` | `clinical-treatment-plan-generator/` | 合集目录内子 Skill | 目录 | 2 文件 / 6395 B / 0 CR；md5 `d461ac64…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。同上（薄包装 + 唯一入口）分发路径 |
| `drug-interaction-checker` | `open-medical-skills/drug-interaction-checker/` | `drug-interaction-checker/` | 合集目录内子 Skill | 目录 | 2 文件 / 4524 B / 0 CR；md5 `4c778986…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。同上（薄包装 + 唯一入口）分发路径 |
| `lab-result-interpreter` | `open-medical-skills/lab-result-interpreter/` | `lab-result-interpreter/` | 合集目录内子 Skill | 目录 | 2 文件 / 6295 B / 0 CR；md5 `3429c42c…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。同上（薄包装 + 唯一入口）分发路径 |
| `ref-material-writing` | `ref-material-writing/` | `ref-material-writing/` | 目录型 | 目录型（物理一份） | 54 文件 / 368864 B / 0 CR；md5 `553b3cee…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。部署态专有物：`.env`（D-2026-0811-01 例外，不入库、不覆盖、不擦除）。仓库专有、不入部署态：`LICENSE`（由 `scripts/deploy-manifest.json` 的 `exclude` 显式排除） |
| `web-search` | `web-search/` | `web-search/` | 目录型 | 目录型（物理一份） | 35 文件 / 381045 B / 0 CR；md5 `2e1e7976…` | 实质一致（逐字节 == main blob；§7.3 三项判据全过）。部署态专有物：`.env`（真实密钥）+ 4 个搜索素材输出样例（运行期产物） |
  | `github-personal-manager` | `github-personal-manager/` | `github-personal-manager/` | 目录型 | 目录型（物理一份） | 58 文件 / 561859 B / 0 CR；逐字节 == main blob（58/58）、`git hash-object --no-filters` 逐文件 == blob sha（58/58），§7.3 三项判据全过（双侧均 LF）；部署态聚合 md5 `51c6ca71…`（路径+字节序，排序为相对路径），关键文件 `scripts/sop_worktree_cleanup.sh` 17814 B / md5 `2f8c5ee4…` / `SQUASH_MERGED` 6 处 | **实质一致（逐字节 == main blob；§7.3 三项判据全过）**。**部署方式**：由 main blob 逐字节重建（不经工作树）。**部署态专有物**：`config/github-sop.config.sh` 为本机运行配置（不入库、不随主副本分发）。**§9.5 收尾打扫**：部署态 `smoke/tmp` 与 `regression/tmp` 两处测试运行期产物已清除；其清理由 `scripts/smoke/test_manifest.py` 的 `CLEANUP_DIRS` 收录（含 `github-personal-manager/regression/tmp`，见 §9.5），无需手动清理 |
- 7.2.1 **补充登记：未部署 / 外部安装体 / 已移除**（与主表合起来构成全量注册表；实测基准 2026-11-12，部署态 25 个含 SKILL.md 的目录逐目录查证）：

  | name | 类别 | 开发态（仓库内相对路径） | 部署态（用户级 skills 目录） | 判定依据 |
  |---|---|---|---|---|
  | `external-tool-onboarding` | 未部署 | `Skill-外部工具引入评估.md` | 无（未部署） | 部署态 skills 目录实测无同名目录 |
  | `multi-file-analysis` | 未部署 | `Skill-多文件分析+知识图谱构建.md` | 无（未部署） | 同上 |
  | `code-audit-consolidation` | 未部署 | `Skill-多源代码审查整合收敛.md` | 无（未部署） | 同上 |
  | `find-skill-to-xml` | 未部署 | `Skill-扫描Skill技能生成xml技能标签.md` | 无（未部署） | 同上 |
  | `promotion-writer` | 未部署 | `Skill-推广文章撰写.md` | 无（未部署） | 同上 |
  | `ticktick` | 未部署 | `Skill-滴答清单智能任务解析创建器.md` | 无（未部署） | 同上 |
  | `mimo-code-collab` | 未部署 | `mimo-code-collab/` | 无（未部署） | 同上 |
  | `playwright-360chrome` | 未部署 | `playwright-360chrome/` | 无（未部署） | 同上 |
  | `tender-review-kit` | 未部署 | `tender-review-kit/` | 无（未部署） | 同上 |
  | `browser-skill` | 外部安装体 | 无 | `browser-skill/` | 部署态存在、仓库无对应开发态 Skill 源；仅 `Workbuddy专属/wechat-article-search/README.md` 作第三方引用 |
  | `gate-reverse-test` | 外部安装体 | 无 | `gate-reverse-test/` | 部署态存在、仓库零引用 |
  | `ima-skills` | 外部安装体 | 无（`Workbuddy专属/恢复指南-ima-skills上游更新重放修复.md` 是恢复指南文档，非 Skill 定义） | `ima-skills/` | 部署态存在；README/CHANGELOG/check-deps.js 中均为第三方依赖引用 |
  | `skill-optimizer` | 外部安装体 | 无 | `skill-optimizer/` | 部署态存在、仓库零引用 |
  | `self-improvement-system__skillhub` | 外部安装体 | 无 | `self-improvement-system__skillhub/` | §7.4 已裁决为 SkillHub 外部安装体；其 SKILL.md 用 `## name:` 标题式而非 YAML 键 |
  | `self-improvement` | 已移除 | 已随 PR 移除 | 无（主表内为历史裁决行） | §7.4；主表保留该行作裁决留痕，不作为同步目标 |

  - **类别语义**：「未部署」= 本仓库允许只有开发态副本、没有部署态副本（技能尚未部署）；「外部安装体」= 部署态有目录但仓库无对应开发态副本，**非本仓库创建、非本仓库维护**，不纳入 §7.6 写操作与覆盖部署范围，Agent 不得擅自改动；「已移除」= 开发态已删除的裁决留痕。
  - **判据边界（§7.6.1）**：部署态目录名 = 主定义文件 YAML `name` 这一规则**仅约束本仓库创建的部署副本**；外部安装体不受其约束，实测反例即 `ima-skills`（`name: ima-skill`）与 `self-improvement-system__skillhub`（标题式 name）。
  - **维护规则**：新增 / 部署 / 移除任一 Skill，须同轮更新本补充表或主表；§7.7 唯一同步器只处理主表中「已部署」行，补充表不参与同步。
- 7.3 **副本判等口径与行尾纪律（硬规则）**：
  - **唯一判等口径（逐字节相等 + CR = 0）**：判定两副本是否一致，以「部署态文件字节序列 == main 的 git blob 字节序列」为准（`git show <ref>:<path>` 或 `git cat-file blob <ref>:<path>` 取字节），并须同时满足「`git hash-object --no-filters` == blob sha」与「CR = 0」两项——共三项判据，由 §7.7 唯一同步器的 `--verify` 落地。**历史措辞「单纯 CRLF 差异一律豁免」自 2026-11-12 起作废**：根 `.gitattributes`（`* text=auto eol=lf`）生效后 blob 与工作树恒为 LF，部署态由 blob 逐字节重建亦恒为 LF，已不存在需要豁免的行尾差异；主表各判定列曾残留的历史行尾措辞已于 2026-11-12 随本轮 §7.2 实测值刷新**全表清理**为「§7.3 三项判据全过」（表内记当前状态，CHANGELOG 记历史流水）。
  - **行尾纪律（强制 LF，两项）**：① **仓库内文件一律 LF**：AI_MCP-Skill-CLI 仓库全部文本文件以 LF 入库，根 `.gitattributes` 以 `* text=auto eol=lf` 显式声明，跨平台检出亦保持 LF；② **部署文件一律 LF**：以本仓库文件为基、更新/部署到仓库外目录或文件时，对部署的文件也一律采用 LF——部署态一律由 main 的 git blob 逐字节重建（**不经工作树**——内容权威性 + 避免未提交差异污染）；重建后须逐文件核验「逐字节 == blob」+「`hash-object --no-filters` == blob sha」+「CR = 0」三项全过。
  - **判据唯一可信形式**：`grep -c $'\r'` 在 Git Bash 下虚高/虚低失守，**唯一可信判据 = Python 逐字节 `count`**；任何行尾计数返回值恰为 0 或恰等于总行数，先怀疑判据本身。
- 7.4 **`self-improvement` 同名占用（2026-10-01 已裁决并执行）**：部署态 `self-improvement-system__skillhub/` 是外部（SkillHub）安装的运行态副本（含 `references/`、`lessons.md`、`mistakes.md`、`playbook.md`、`soul.md`、`session-log.md`、`_meta.json`、`_icon.png`），其 frontmatter 采用 Markdown 标题式 `## name: self-improvement`（非 YAML 键），与仓库原 `self-improvement/SKILL.md` 的 YAML 式 frontmatter 写法不同，但 name / description / author / version 完全一致（均为 OpenClaw v1.2.0）。
  - **裁决结论（用户 2026-10-01）**：保留部署态增强版 `self-improvement-system__skillhub`，既不迁回也不新建同名部署目录；仓库开发态 `dir/self-improvement` 属**未部署冗余副本**，予以移除（开发态 `self-improvement/` 5 个受跟踪文件已随 PR 移除；`AGENTS.md` §2.1 同步摘除登记）。删除后不影响任何已部署技能，运行时功能零退化。
  - **门禁联动（死锁成因与破除，2026-10-01 实测，程序性纪律）**：smoke Tier5 对 dir 是**双向**校验——既判「已登记但目录缺失」，也判「目录存在但未登记」，两者皆 FATAL；而 pre-commit scope 校验只允许目录型 commit 暂存 `<scope_dir>/*`（根本改不了 `AGENTS.md`）。因此「删目录」与「摘登记」若分属两条 PR，无论先后必有一条红。**破除方式（已实测验证）**：先修好 `.githooks/pre-commit` §2.3 的 meta 特例 glob（原写法把星号转义成字面量，该特例自引入起从未命中过正常路径），使 meta 分支可合法承载「已登记目录内容」的增删；随后把「删目录 + 摘登记」并入**同一条 meta PR、按序两提交**（先删目录、后摘登记），即可一次闭环。
  - **后续注意**：本仓库不再承载该 name 的开发态；若将来需要把该 Skill 纳入部署，须在用户级 `skills/` 下另建独立目录（不得与 `self-improvement-system__skillhub` 同名冲突），并先在 §7.2 补登记。
- 7.5 **注册表维护规则**：主表与 §7.2.1 补充表均为人工维护段（非 §2.1–§2.4 机器可重写数据段）。`Workbuddy专属/` 属 `scripts/sync-scope-manifest.py` 的 `MANUAL_KEEP_DIRS` 人工豁免合集目录，其内的 `Skill-*.md`（如 `Skill-memory-consolidate.md`、`Skill-workflow-distill.md`）不在 scope 清单扫描口径内，故其部署映射由本节承接，不写入 §2.2 表格（避免与脚本输出口径冲突）。落地部署前须先查本节，确认目标部署路径未被同名外部安装体占用。主表前三列须保持反引号包裹的单一值格式，否则 §7.7 同步器拒绝解析（宁可报错，不猜测映射）。新增 / 部署 / 移除任一 Skill 同轮维护本节，并按 §7.6.5 维护 README / CHANGELOG。
- 7.6 **副本全生命周期纪律（硬规则，覆盖 §2.1/§2.2 全部 Skill 及合集内子 Skill）**：
  - 7.6.1 **优先级与判据**：
    - 优先级链：**当前会话用户显式需求与纪律 > 上一轮会话的需求与纪律 > 本文件既有纪律**。本文件既有纪律若存在冲突或缺陷，须按本节修正，不得据旧条文抵触新裁决。
    - 某 Skill 是否存在部署态副本，**唯一判据 = 用户级 `C:/Users/<username>/.workbuddy/skills/` 下是否存在对应目录**；「目录型 / 单文件型」**不是**判据。用户告知存在部署态副本后，Agent 必须事实查验、坐实（列目录 + 读主定义文件 `name` 字段），不得凭描述推断。
    - 部署态目录内技能一律为目录形态，目录名 = 主定义文件 `SKILL.md` 中 YAML `name` 字段（仅约束本仓库创建的部署副本；外部安装体反例见 §7.2.1）。单文件型开发态副本的文件名可与部署态目录名、技能名不一致，**不作为是否存在部署态副本的判据**。
    - 允许技能只有开发态副本而无部署态副本（未部署，§7.2.1）；部署态有而开发态无者为外部安装体，**非本仓库创建、非本仓库维护**，不纳入写操作与覆盖部署范围。
  - 7.6.2 **写操作落点（默认）**：本仓库所有 Skill 技能的创建、修改、维护均属**代码修改 / BUG 修复范畴与 git 操作范畴**，写操作一律落在**开发态副本**（目录型走 §4 worktree、根级/合集内单文件型走对应 worktree、meta 走标准分支 + PR），遵循用户级 `Memory-代码纪律与Git操作.md`（六条铁律、统一优先级裁决器、全局契约面、改完即验证、§2-3 双态判定、§2-5 三类归因与重建部署复测）与 `Memory-GitHub全流程操作.md`（§3-4 提交前文档同步门禁、§3-9 标准代码修改、§3-14 PR 全生命周期、§3-15 清理工区）。
  - 7.6.3 **部署态写操作（例外，须授权）**：仅当存在不可避免的必须因素（如开发态不具备完整审计 / 测试条件、需在运行态复现）时，方可在部署态写。**动手前必须用大白话告知用户**：写哪个目录、写哪些文件、为什么开发态做不了、会不会碰专有物；取得用户显式授权后方可执行。禁止把「覆盖部署」当作日常改写手段；部署态专有物（`.env`、`ima_credentials.json`、`local-config.json`、`mcp-local-config.json`、`tests/audit/` 等）一律保留、不覆盖、不删除。
    - **闭环后回流（强制）**：部署态写相关任务闭环（含测试、改写、复测）后，Agent 必须逐项分析「哪些信息与代码有回流价值」，按实际情况修改后回流到开发态副本；纯部署流程引入、无法由源码修复者按 §2-5 的 B 类如实记录根因 / 证据 / 影响 / 缓解方案，**不得标记为源码修复完成**。
  - 7.6.4 **审计 / 测试位置与收尾打扫**：审计与测试**优先在开发态副本**进行（静态审计、契约核对、离线回归）。仅当开发态不具备完整条件时，才允许「以开发态为基覆盖部署到部署态 → 在部署态审计 / 测试」，并在闭环后按 7.6.3 回流有价值信息与代码。闭环（测试、改写、PR、合并 main）后，随清理分支 / 工作树 / 工区一并清理无用的测试 / 审计过程文件、临时文件、垃圾文件、无用或不可复用的产出文件，维护**开发态副本最小化原则**（§8.3 五类禁入库文件、§9.5 收尾打扫，以及用户级 `Memory-GitHub全流程操作.md §3-15` 清理工区强门禁：先搜列 → 等确认 → 再删除；删除优先回收站、小批量 ≤10、中文路径用 `Remove-Item -LiteralPath`）。
  - 7.6.5 **PR 闭环与覆盖部署（顺序不可颠倒）**：提交(commit) → 推送(push) → 开 PR → 跑 CI；全绿则合并 main，随后清理远端 / 本地分支、工作树与工区，实现仓库零冗余零脏。**合并后在 fresh main 上以开发态副本为基，经 §7.7 唯一入口覆盖部署到部署态副本**（顺序颠倒会把旧版盖到部署态）；同轮在 §7.2 全量注册表、CHANGELOG.md、README.md 等管理文件 / 日志文件中维护本 Skill 的登记（§7.2 表内记当前实测状态，CHANGELOG 记历史流水，不回改旧条目）。本 Skill 的 §7.2 / CHANGELOG / README 登记维护，按 §5.5 走**形态 A（同 worktree 内追加 meta commit，单 PR 闭环，首选）**或**形态 B（独立 meta PR，多技能批量归集）**；两形态均满足 commit 级 scope 纯一。形态 A 的 meta commit 在承载技能变更的 worktree 内追加（见 §4.3 窄例外与 hook §2.3），不削弱任何安全 / 校验门禁。
  - 7.6.6 **元技能合规**：本仓库 Skill 定义须满足用户级元技能 `skill-forge` 的 11 维度要求；不满足时调用该元技能校验、按其「校验模式」输出报告与修正建议后修正，且必须遵循本文件纪律（目录型走 worktree、meta 走标准分支 + PR）。**规范性冲突处理**：元技能要求「文件第一行为一级标题、第三行起 YAML」与本仓库及 WorkBuddy 运行时的「YAML frontmatter 置于首行」契约不可调和时，依元技能自身「边界与限制」第 7 条**交用户决策，不得擅自改动运行时契约**；本轮仅做合规核验与可安全项修正，并在报告中登记差异。
  - 7.6.7 **引用方向**：7.6.2 所引两份子记忆文件为跨项目约束，本节只作引用、不重述其内容；冲突时按 7.6.1 优先级链裁决。
- 7.7 **唯一同步入口与脚本命名规范**：
  - **唯一入口 = `scripts/deploy-skill.cjs`**（meta scope）。本仓库所有「开发态 → 部署态」覆盖部署一律经此脚本，各 Skill 不再自建同步实现；脚本运行时解析 §7.2 主表取映射，**不另建映射登记**（守住单一事实源）。
  - **能力可组合**：`sync` / `verify` / `plan(--dry-run)` / `expand` / `prune` 经参数组合调用；`--all` 或 `--skill <name>` 指定范围、`--ref` 指定内容来源、`--to` 或 `WORKBUDDY_SKILLS_DIR` 指定部署态根、`--exclude` 叠加排除、`--json` 输出格式化 JSON。
  - **零硬编码 / 跨机可移植**：仓库根按脚本位置运行时上溯 `.git`；部署态根按参数 > 环境变量 > `os.homedir()` 依次探查；不写死用户名、盘符、绝对路径；技能主定义文件 `name` 与注册表第一列运行时比对，不一致即报错拒绝同步。默认「只写不删」，部署态专有物天然安全。
  - **项目级下沉**：部署态需展开 / 扩展、衍生 / 创建文件、修剪 / 修改文件、联网下载文件等场景，由技能开发态目录内可选 `deploy-manifest.json` 的 `preserve` / `exclude` / `expand` / `prune` 声明，或由 `scripts/deploy-manifest.json` 按技能名兜底（后者仅存部署形态差异，不存映射）；无 manifest 时默认「全量 blob 重建、只写不删、不执行外部命令」，`--prune` 须 manifest 显式启用。联网刷新类需求亦可下沉到项目级 `deploy.js` 的显式参数（如 `open-medical-skills --sync`），使覆盖部署本身恒离线、不执行任何外部命令。
  - **文件名规范（2026-11-12 分层归一裁决）**：凡承担「开发态 → 部署态同步」功能的项目级脚本统一命名 `deploy.js`，且**只做薄包装调用本节唯一入口**；凡名为 `deploy*.*js` 但不承担同步功能的脚本，须按其代码实际功能改名并同步更新注册信息、调用 / 引用链：

    | 脚本 | 实际功能 | 处置 |
    |---|---|---|
    | `Workbuddy专属/wechat-article-search/scripts/deploy.js` | blob 同步 | ✅ 已改为薄包装（PR #234）+ 项目级 `deploy-manifest.json` |
    | `Workbuddy专属/wechat-article-to-ima/scripts/deploy.js` | blob 同步 + 专有物保留 | ✅ 已改为薄包装（PR #234）+ `preserve: ima_credentials.json` |
    | `open-medical-skills/scripts/deploy.js`（原 `deploy.mjs`） | 父包 vendored 子技能内嵌 + 分发（同步的特殊形态） | ✅ 已统一为薄包装（PR #235）；联网刷新下沉项目级 `--sync`，`deploy-manifest.json` 恒不执行外部命令 |
    | `chrome-devtools/localization/install.cjs`（原 `deploy.cjs`） | 全局安装 + 构建 + MCP 配置编排（**非同步**） | ✅ 已按实际功能改名（PR #236），**35 处引用 / 11 文件**全量同步 |

  - **门禁**：同步器、`scripts/deploy-manifest.json` 均属 meta scope；离线回归 `scripts/smoke/test_deploy_skill.py` 登记于 `scripts/smoke/test_manifest.py`，经 §9 唯一入口 `--scope meta --project-tests` 调度；新增 / 修改同步实现须同轮补测试与清单登记（§9.6）。

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
- 9.8 **新增文件的测试覆盖分析（强制）**：凡新增文件，提交前必须完成测试覆盖分析并留痕。
  1. 适用范围：不论是否位于仓库根级、不论是否为 Skill 文件，均适用。**排除项**：git 管理文件（`.gitignore`、`.githooks/*`、`.github/*`）、本仓库纪律文件（`AGENTS.md`、`README.md`、`CHANGELOG.md`）、`.workbuddy` 目录、`_gsdata_` 目录。
  2. 分析内容：判断该文件是否具备三类测试——①冒烟测试；②全场景覆盖矩阵回归测试；③全边界覆盖矩阵校验测试。
  3. 缺失处置：三类测试任一缺失时，须进一步分析是否需要补充、以及是否具有高补充价值。
  4. 补充要求：判定为「有必要且高价值」者，必须补充对应测试后再提交；判定为「无需补充」者，须给出明确理由。
  5. 留痕要求：上述分析与结论必须写入 PR 描述，禁止以「暂不需要」一笔带过。
