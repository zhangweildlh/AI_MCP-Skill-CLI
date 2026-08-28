---

## [2026-08-28]
- feat(dir/self-improvement-system__skillhub): 新增 self-improvement 目录型 Skill
- feat(file/external-tool-onboarding): 新增外部工具引入评估根级 Skill
- refactor: 记忆体系重构，拆分 MEMORY.md 为多个子文件
- chore: 清理重复 Skill 文件


格式参考 [Keep a Changelog](https://keepachangelog.com/)，条目按时间倒序排列。分类约定：
**Added**（新增能力）/ **Changed**（行为或实现变更）/ **Removed**（移除）/ **Fixed**（缺陷修复）/ **Docs**（文档）。

> 本文件由 git 历史汇编，每条对应实际提交主题；最新一条即最近一次推送的提交。

---

## [2026-08-21]

### Fixed
- **CI/ruleset 矛盾修复**：main 规则集 required_status_checks 原要求 `smoke` + `smoke-scoped`，但 smoke.yml 对非 meta 变更设计为跳过 `smoke`、对 meta 变更跳过 `smoke-scoped`，导致任何 PR 都有一条 required check 为 skipping、永远无法正常合并（只能 `--admin` 绕过）。修复：`smoke` 改为**恒运行基础门禁**（meta/无可判定 scope 升级全量 tier0-3+5，其余跑 tier0 密钥/忽略门禁），`smoke-scoped` 保持按 scope 深化但**不列入规则集**；规则集 required checks 仅保留 `smoke`；顺带清理 smoke-scoped 的 `!= '[]'` 死条件。

### Changed
- **main 分支保护机制切换（ruleset → classic）**：实证发现 GitHub **ruleset 的 `required_status_checks` 评估存在平台缺陷**——required check `smoke` 已 success 且 context/integration 完全匹配，PR 仍 `mergeable_state=blocked`（#30-#34 多轮：改 strict、重建规则集、去 integration_id 均无效；禁用规则集后普通合并立即成功）。切换为 classic branch protection（`branches/main/protection`：required checks 仅 `smoke`、strict=false、enforce_admins=true），普通合并恢复正常、无需 `--admin`；ruleset 已删除，`smoke` 恒运行门禁不变。

### Added
- **github-personal-manager**：新增 `workflows/wf_branch_clean.sh`（一键回收已合入 main 的本地分支，SourceGit / Git Extensions 图形客户端封装）；补齐 `workflows/README.md` 已声明但缺失的脚本断链。
---

## [2026-08-20]

### Docs
- **Memory-Data/**：系统提示词文档整理，将 `Deepseek++系统提示词-2.md` 重命名为 `Deepseek++系统提示词.md`（内容合并为新文件名，便于统一引用）；清理 `codebase-memory/codebase-memory-mcp/data/logs/.gitkeep` 空占位文件。
- **AGENTS.md / README.md**：修复纪律文档断链——AGENTS.md 4.2 worktree 脚本引用路径补 `github-personal-manager/scripts/` 前缀（原 `scripts/` 在仓库根不存在，陌生 Agent 按字面执行必失败）、`--branch` 参数统一为 `feat/<topic>` 写法、5.4 本地冒烟命令改为 `uv run`（本机禁裸 python）；README 移除已不存在的 `md-crossref-audit`（`Skill-文档引用调用有效性检验.md`）条目，活跃技能数更正为 17（9 目录型 + 8 根级单文件型）。

---

## [2026-08-19]

### Added
- **codebase-memory/**：将此前被 .gitignore 整体忽略的目录骨架、文档与脚本纳入仓库跟踪（顶层 README/SKILL + codebase-memory-mcp 的 Readme/权限修复脚本/下载说明，以及 data/logs 空目录 .gitkeep 占位）；codebase-memory-mcp.exe 真实体积约 282MB，超过 GitHub 单文件 100MB 硬上限，未入库，改以占位文件（文件名提示自行下载）+ 下载说明.md 替代；.gitignore 同步忽略该 exe 与 code-review-combo/config/providers.json（含真实 API key，仅本地保留、绝不上库）。

---

## [2026-08-14]

### Fixed
- **github-personal-manager/scripts/**：收敛 P-GPM 系列缺陷——P-GPM-1/2（`gh` 调用缺 `--repo`，5 个脚本补显式 `--repo` 传递，消除 fork 内部 PR / 跨目录调用误判）、P-GPM-3（`_sop_resolve_remotes` 改用 `git config --get` 替代 `git remote -v`，避免 insteadOf 重写污染 owner/repo 解析）、P-GPM-4（`sop_worktree_add.sh` 补 worktree 路径 Windows 形态归一化 `cygpath -m`，与 cleanup 一致，修复 Git Bash 下错建到 `D:/d/...`）；**github-personal-manager/workflows/wf_branch_clean.sh**：`gh pr list` 越层直调缺 `--repo` 已补显式 `--repo`（与 scripts 统一约定一致，修复一致性缺口）。

### Added
- **github-personal-manager/regression/**：离线回归框架纳入技能仓库（三层夹具 upstream/origin/local + fake gh 对抗桩，67 用例覆盖 17 个脚本）；`run.sh` 自定位化（按「框架与 scripts/ 平级」解析技能根，不写死安装路径）+ `TEST_TMP` 可写性断言；`fakebin/gh` 未覆盖子命令改防御性告警并默认放行；`.gitignore` 加 `regression/tmp/`；`github-personal-manager/.github/workflows/regression.yml` 作为技能独立仓库的便携 CI 门禁参考（GitHub 仅扫描仓库根 `.github/workflows/`，子目录不触发，monorepo 内仅作参考）。
- **github-personal-manager/workflows/**：补全 GUI 工作流脚本通道（`wf_common.sh` 公共库 + `wf_ci.sh`/`wf_pr.sh`/`wf_release.sh`/`wf_sync.sh`/`wf_worktree.sh`/`wf_workspace_clean.sh` 7 个父脚本，均为 SourceGit / Git Extensions 图形客户端「点一下就办」的按钮，统一 `--confirm` 二次授权 + 只推 origin/绝不碰 upstream 安全边界）；`workflows/README.md` 同步给出目录地图、挂接配置与 Windows 环境约束（与 `scripts/` 平行双通道，落点同为 `scripts/` 底层 SOP）。

### Docs
- **github-personal-manager/SKILL.md**：补「⚠️ Windows 环境约束」注记（worktree 路径归一化依赖 Git Bash `cygpath`）。
- **github-personal-manager/workflows/README.md**：补「⚠️ 工作树 Windows 环境约束」段。

---

## [2026-08-12]

### Fixed
- **ref-material-writing**：迭代收敛修复——定义层消除 5.3 自相矛盾（禁止硬编码绝对目录却写死字面路径）、清除 8.2/8.3 机器/项目专属路径硬编码、7.1 模糊词（合理性/必要时/等场景）替换为客观判据、10.2 补 description 独立「适用于」陈述；代码层修复 F1（constants.json 缺失时 SAFE_DOMAINS 兜底 + stderr 告警，消除垂直搜索静默全失效）、F2（_call_api 对 200 非 JSON 响应容错）、F3（_load_env 仅注入白名单 ANYSEARCH_API_KEY，不再全盘覆盖 os.environ/PATH）、F4（脚本默认路径增加可读报错）、F6（max_results 校验 1–10）、F7（key=value 分支去引号）、F8（上游比对 SHA 归一化）、F9（_render_doc 容错）；复审计新增 N1（_render_doc 缺键兜底）、N2（batch_search per-item max_results 边界校验）；新增全场景+边界回归测试 `scripts/smoke/test_anysearch_cli.py`（unittest + mock，33 例全过）。双层复审计（skill-forge 11 维度 / code-review-combo 五焦点）均 0 致命/0 严重。

### Added
- **根级单文件技能（新增 3 个）**：`Skill-外部工具引入评估与落地.md`（external-tool-onboarding）、`Skill-对当前对话会话做经验沉淀和方法论固化.md`（task-methodology-consolidation）、`Skill-文档引用调用有效性检验.md`（md-crossref-audit）；新增调研报告 `github-personal-manager-同类项目调研_20260812.md`（github-personal-manager 全站同类项目调研，工作区文件、未改动技能源）。
- **chrome-devtools 双端部署**：新增 `sync_and_deploy.cjs`、`mirror_to_target.cjs` 与 `localization/{apply_localize,cli_run,deploy,start,upstream}.cjs` 本地化/同步部署脚本，支持 master → WorkBuddy 安装副本双端部署；`package.json` / `.npmrc` / `README.md` / `SKILL.md` 同步更新。

### Changed
- **chrome-devtools/SKILL.md**：补充双端部署（master → WorkBuddy）工作流与脚本用法。
- **Workbuddy专属/Skill-memory-consolidate.md**、**Workbuddy专属/Skill-workflow-distill.md**：技能文档内容更新。
- **mimo-code-collab/SKILL.md**：协同技能定义更新。
- **Skill-元技能，Skill创建校验器.md**（skill-forge）：元技能双模定义更新。

### Removed
- **Skill-文件内容整理重组.md**（file-structure-organizer）：技能文件删除。
- **Skill-多代码审计报告归一收敛.md**（code-audit-consolidation）：技能文件删除，由 `Skill-多源代码审查整合收敛.md` 承接同名能力（疑似重命名）。
- **tender-review-kit/.github/workflows/ci.yml**：移除该子项目 GitHub Actions CI 配置。

### Docs
- **README.md**：技能总览由 16 → 18 个活跃技能（9 目录型 + 9 根级单文件）；移除已删 file-structure-organizer，更新 code-audit-consolidation 指向新文件 `Skill-多源代码审查整合收敛.md`，新增 3 个根级单文件技能说明；`Memory-Data/` 辅助说明补充 `MEMORY.md` 索引文件。

## [2026-08-08]

### Changed
- **github-personal-manager/SKILL.md**：技能主文档重写，补充阶段 0 工具探测、脚本调用约定与结构化报告规范。
- **github-personal-manager/scripts/sop_worktree_*.sh**：worktree 三件套（add/cleanup/merge）增强，扩充冲突与合并守卫逻辑。
- **mimo_mcp.py**：工具逻辑更新（+392 行），完善双形态（dmcp.exe 中继 / 宿主直连）实现与可观测性。
- **Memory-Data/GitHub_Deepseek++.md**、**Skill-文件内容整理重组.md**、**Workbuddy专属/Skill-memory-consolidate.md**：技能文档内容同步更新。
- **.github/workflows/smoke.yml**：CI 配置微调。

### Docs
- **github-personal-manager/references/**：fork-ci-pitfalls.md、gh-capability.md 同步更新；smoke/README.md 与 smoke/tests/test_worktree.sh 对齐新脚本行为。

## [2026-08-06]

### Added
- **chrome-devtools/**：新增目录型技能（Chrome DevTools MCP 驱动本地浏览器调试/自动化/性能/Lighthouse/网络检查，全局安装 `chrome-devtools-mcp`，禁用 `npx -y`）。
- **skill-forge**（合并）：原根级单文件 `Skill-元技能，Skill创建助手.md`（skill-creator）与 `Skill-元技能，Skill校验器.md`（skill-checker）合并为 `Skill-元技能，Skill创建校验器.md`（v3.0.0，创建+校验双模）。
- **file-structure-organizer**：新增 `Skill-文件内容整理重组.md`（依据「文件结构化组织规范 12 条强制要求」整理重组 Markdown）。
- **code-audit-consolidation**：新增 `Skill-多代码审计报告归一收敛.md`（多源审计报告去重归因、交叉分析、根因分析，产出唯一根治报告）。
- **Memory-Data/**：新增 `协作方式约定_四象限_定制版.md`、`协作方式约定_四象限_通用版.md`；`用户画像分析报告_土木工程主业版.md` 重命名为 `用户画像分析报告.md`。

### Changed
- **web-search/SKILL.md**：新增「中文政策/国标检索特别规则」（HJ/GB/国发令等走通用 `search` 而非垂直域）；`web-search/firecrawl/SKILL.md`：新增「访问形态（Dynamic-mcp 中继 / 直连）」探测选用说明。
- **Workbuddy专属/Skill-memory-consolidate.md**：整合条款升级为「文件结构化组织规范」十二项强制要求。
- **Workbuddy专属/Skill-workflow-distill.md**：升 v1.1.0，新增「相异任务数优先」「跨轮次台账」「门禁达标≠应创建」等规则。
- **Memory-Data/长期记忆_Deepseek++.md**：补充 Node/npm/npx 全局安装铁律等第 13–18 条。

### Removed
- **Skill-元技能，Skill创建助手.md**、**Skill-元技能，Skill校验器.md**：并入 skill-forge。
- **multi-worktree-parallel-merge-sop.md**：顶层方案文档移除，能力内聚至 `github-personal-manager` 的 `sop_worktree_*.sh` 三件套。
- **Memory-Data/用户画像分析报告_土木工程主业版.md**：重命名为 `用户画像分析报告.md`。

### Docs
- **README.md**：同步更新技能总览（14 → 16 个：9 目录型 + 7 根级单文件），合并 skill-creator/skill-checker 为 skill-forge，新增 chrome-devtools/file-structure-organizer/code-audit-consolidation，更新外部依赖归类表与辅助体系说明。

---

## [2026-08-04]

### Fixed
- **github-personal-manager**：修复 5 个脚本 `--help` 输出仅显示 7 行且泄漏 `HELP-START` 标记的问题；`-h` 分支统一改为 `_sop_print_help` 标记块提取（新增 `scripts/lib/sop-common.sh` 公共函数）。

### Docs
- **github-personal-manager**：为全量 25 个脚本/配置/冒烟文件补充头部注释（功能 / 用途·使用场景 / 详细用法 / 注意事项），统一 `HELP-START` / `HELP-END` 标记块约定。

---

## [2026-08-03]

### Added
- **playwright-360chrome/**：新增浏览器自动化技能（Playwright + 360Chromex 内核，v2.0.0），含 SKILL.md 与 scraping/selectors/testing/debugging/ci-cd 参考文档，附 `pw_launch.mjs` / `test_pw_userdata.mjs` 启动与用户态(userDataDir)复用示例。
- **github-personal-manager 多工作树并行开发 SOP**：新增 `scripts/sop_worktree_add.sh` / `sop_worktree_cleanup.sh` / `sop_worktree_merge.sh` 三件套；新增顶层方案文档 `multi-worktree-parallel-merge-sop.md`；冒烟测试新增 `smoke/tests/test_worktree.sh`。
- **Memory-Data/**：新增 `GitHub_Deepseek++.md`、`长期记忆_Deepseek++.md`、`用户画像分析报告_土木工程主业版.md`；`Deepseek++系统提示词-2.md` 由根目录移入本目录。

### Changed
- **.gitignore**：调整 `Memory-Data` 忽略策略为「仅排除非 `.md` 文件」（`.md` 保留入库），撤销 2026-08-02 的"整体排除"。
- **github-personal-manager**：SKILL.md / `scripts/lib/sop-common.sh` / `sop_fetch_prune.sh` / `sop_resolve_repo.sh` / `references/fork-ci-pitfalls.md` / `references/gh-capability.md` / `config/github-sop.config.template.sh` 多处调整；`smoke/tests/test_contracts.sh` 修订、`test_contracts_extra.sh` 重建；文档同步门禁明确"禁止本地编译"硬约束。
- **.github/workflows/smoke.yml**：升级 actions 至 v7（消除 Node.js 20 弃用警告）。
- **Memory-Data/GitHub_Deepseek++.md**：内容扩充。
- **ref-material-writing**：自包含改造收口——将内部所有 AnySearch CLI 调用/引用/加载由 `[Skill技能根目录]/scripts/anysearch_cli.py` 占位符统一改为基于技能目录的相对路径 `scripts/anysearch_cli.py`（与脚本自生成 `doc` 输出一致；运行时按技能目录拼接绝对路径、不依赖 CWD）；同步修正自包含后已不准确的"固定外部命令/硬编码路径"措辞，并更新 `references/02`、`references/13`、`_router/*`、`compatibility.md`、`SKILL.md`、`assets/_流水线状态.md` 等镜像与路径解析说明；`README.md` 消除"内部引用路径待对齐"标注。Tier0+Tier1 门禁通过（ref-material-writing 结构合法、0 断链 WARN）。

- **web-search**：解耦重构为「父 Skill 双轨架构」——父 `web-search/SKILL.md` + `web-search/README.md` 持有全部本地化/私有化约束与五级裁决逻辑（双轨并行 → 多来源印证 → 双工具补台 → 原生 `web_search`/`web_fetch` 兜底 → 父复审裁决）；AnySearch 轨道改为并入上游 `anysearch-ai/anysearch-skill`（`web-search/anysearch-skill/`；**实际为扁平并入、无嵌套 `.git`，不能 `git pull` 升级**——本条原表述"克隆纯净版、`git pull` 即升级"有误，已于同日审计修复中更正）；Firecrawl 轨道由「MCP/Dynamic-mcp」改为全局官方 CLI（`firecrawl` v1.19.27，npm 全局落 `D:\Tools\Assembly\nodejs\node_global`），新增 `web-search/firecrawl/SKILL.md` 适配层封装，经 `gh api` 追踪 `firecrawl/firecrawl` 的 `openapi.json` 跟进上游 API 演进；删除冗余 `web-search/references/`（anysearch.md/firecrawl.md/orchestration.md，知识已并入父 SKILL.md 与子 Skill）；AnySearch 调用严格走 `uv run --with requests python`（原 `uv run --project D:/Tools/Assembly/python/myenv python` 已于同日审计修复中废弃）。

### Moved
- **workbuddy-workspace-migration/** → `Workbuddy专属/workbuddy-workspace-migration/`（整体迁移至专属子目录）。
- **Skill-memory-consolidate.md** → `Workbuddy专属/Skill-memory-consolidate.md`。
- **Skill-workflow-distill.md** → `Workbuddy专属/Skill-workflow-distill.md`。

### Removed
- **Skill-代码审查.md**（根级单文件技能）：能力已并入 `code-review-combo`，不再独立维护。

### Fixed
- **web-search 解耦回归修复（code-review-combo 多轮交叉审计）**：
  - **密钥加载回归（F2，high）**：`anysearch-skill/scripts/anysearch_cli.py` 的 `_load_env` 在脚本移入子目录后探测不到父级 `web-search/.env`，补第三级探测（脚本同目录 → `anysearch-skill/` → `web-search/`），修复轨道1 无密钥直接失效。
  - **密钥落盘风险（C8，high）**：`firecrawl/SKILL.md` 原「方式A `firecrawl env` 写入本地 .env」会把 `FIRECRAWL_API_KEY` 明文写进已入库的 `web-search/.env`，已删除该路径并加硬约束（仅进程内注入、禁落盘、禁回显）。
  - **调用契约与文档一致性（F3/F4/F5/F7/F9/F10/F11/B10/B11/C3/C13）**：统一为 `uv run --with requests python {SKILL_ROOT}/anysearch-skill/scripts/anysearch_cli.py`；清除 `D:\Tools\Assembly` 本机硬编码；`interact` 的 `--task` 更正为 `--prompt`；`extract` 标注为仅 REST `/v2/extract`（CLI 无该子命令）；父/子 SKILL.md、`web-search/README.md` 与仓库根 `README.md` 对「扁平并入非 clone」「密钥位于父级 `.env`」的描述全部对齐。
  - **回归测试与门禁（F8/B12/B13/B14/C6/C7/C9/C10/C11/C12/C14）**：新增 `web-search/tests/test_fixes.py`（6 用例，含真实执行 `firecrawl interact --help` 的 CLI 契约校验）；接入冒烟门禁 Tier 3；`scripts/smoke/tier3_runtime.py` 的 `uv run --project`（`web-search` 无 `pyproject.toml`，自检空转）改为 `uv run --with requests`。
  - **说明**：`web-search/.env` 明文持有 `ANYSEARCH_API_KEY` 并入库，为用户显式授权的既定豁免（F1），本轮不作变更；豁免仅覆盖该单一密钥。

### Docs
- **README.md**：技能总览由"12 个"重写为"14 个活跃技能"，移除已退役的 `github-repo-sync` 与已删除的 `anysearch-skill`，新增 `code-review-combo` / `mimo-code-collab` / `playwright-360chrome`（新增）及移入 `Workbuddy专属/` 的 `workbuddy-workspace-migration`；同步更新各技能详细说明、外部依赖归类与辅助体系章节。

---

## [2026-08-02] · 发版 v2.2.1

### Fixed
- **github-personal-manager**：修复 `_sop_resolve_remotes` 远端三元组解析中 `UPSTREAM_REPO` 漏填（M1）；`sop_branch_merged_status.sh` 在 `GH_USER` 未解析时干净跳过 open PR 查询段、强化 `_sop_pr_open_list` 守卫避免畸形 `gh pr list --repo /`（M2/M3）；`sop_fetch_prune.sh` dry-run 改用 `git fetch --prune --dry-run` 与 confirm 模式范围一致（L1）；`sop_resolve_repo.sh`/`sop_sync_upstream.sh` 解析失败时优雅降级并给出明确告警、消除"静默空 GH_USER"误导（L2）；`sop_resolve_repo.sh` 补 `-h/--help` 解决风格不一致（L5，附带）。

### Added
- **github-personal-manager 冒烟测试**：新增 `smoke/tests/test_contracts_extra.sh` 契约测试（M4），覆盖 open PR 反向识别、GH_USER 未解析干净跳过、sync_upstream M>0 PR 核查三处边界；冒烟用例总数 +3（PASS=59 SKIP=1）。

---

## [2026-07-31]

### Added
- **github-personal-manager**：新增「提交前文档同步门禁」——`scripts/sop_docs_sync_check.sh`（按 Tier 1/2/3 分层检查清单，dry-run 只读、阻断类未同步时退出码 2）+ `references/docs-sync-checklist.md`（分层定义与免触发边界）；新增 `scripts/sop_resolve_repo.sh`，从 `git remote -v` 确定性提取「仓库三元组」`GH_USER`/`REPO_NAME`/`UPSTREAM`，供全任务复用。
- **仓库新增技能**：`code-review-combo/`（review-spd + open-code-review-delegate 双子技能交叉验证，产出唯一合并审计报告）；`workbuddy-workspace-migration/`（工作区迁移技能）；根级新增 `Skill-memory-consolidate.md`、`Skill-workflow-distill.md`、`Skill-代码审查.md` 三个技能文件。
- **github-personal-manager 冒烟测试**：新增 `smoke/tests/test_contracts.sh` 契约测试。

### Changed
- **github-personal-manager**：SKILL.md 重写——阶段 0 改用 `where.exe` 探测 git/gh 真实路径（路径不硬编码）；新增「二次显式授权铁律」第 6 条；新增「仓库目录解析与三元组提取」节；环境硬约束放宽（默认远程 CI，允许本机已装且在 PATH 的工具本地编译）；`scripts/lib/sop-common.sh` 新增 `_sop_resolve_remotes` 中央解析、被 `sop_sync_upstream.sh` 复用；配置模板 `github-sop.config.template.sh` 同步更新。
- **tender-review-kit**：SKILL.md / SKILL-zw.md / FOR_AI / INSTALL / QUICKSTART / README 及多个 scripts（build_excel / check_* / cross_doc / export_contribution / extract_text / harvest_ai_words / promote_candidates / scan_* / run_pipeline）与 tests（generate_fixture / test_qa_full / test_smoke）全面更新。
- **Memory-Data/GitHub_Deepseek++.md**：知识库内容大幅扩充（约 225 行）。
- **mimo_mcp.py**：小幅调整（默认超时与形态说明等配套修订）。
- **README.md / @文件读写通用模块.md / @Skill 调用子 Skill 和外部工具的范式.md / web-search/scripts/anysearch_cli.py**：配套微调。

### Removed
- **github-personal-manager/docs**：删除 `gitextensions-integration.md`、`scripts-catalog.md`、`sop-plan.md` 三份旧文档（能力已并入 SKILL.md 或转为脚本自文档化）。
- **test_mimo_mcp_smoke.py**：离线冒烟测试文件退役（相关能力由新增冒烟测试体系承接）。

### Docs
- CHANGELOG 新增本条，记录本次仓库全量更新（含文档同步门禁能力落地）。

---

## [2026-07-24]

### Removed
- **github-repo-sync（Skill-GitHub仓库同步助手.md）**：删除该独立技能文件。其"六步同步流程"中步骤 1–5 与 `github-personal-manager` 的「日常同步巡检」工作流高度重复，且两技能均含"同步"触发词存在双触发歧义，故退役（原文件备份留存于 `_skill_backup/`）。

### Added
- **github-personal-manager**：新增 `scripts/sop_sync_report.sh`，以"合并前本地 tip"为基准生成结构化的上游更新分析报告（新增功能 / 改进与优化 / Bug 修复 / 破坏性变更 / 其他 + 详细提交记录表），吸收自 github-repo-sync 的独有能力。
- **mimo_mcp.py**：新增 `mimo.metrics` 可观测性工具（进程级调用计数 + 成功/失败/超时/错误分类 + 累计与最大耗时 + 上次错误），落实协同稳定性监控盲区；新增「形态A（dmcp.exe 中继）/ 形态B（宿主直连）」双形态说明块，底层同一脚本、跨平台可移植。
- **mimo-code-collab**：新增离线冒烟测试 `test_mimo_mcp_smoke.py`，校验 v2.2.0 关键契约（版本号、`get_code_timeout` 默认 900、`mimo.metrics` 注册与分类计数守恒）。

### Changed
- **github-personal-manager**：工作流一新增「第四步：生成上游更新分析报告」，合并 upstream 前先记录"合并前本地 tip"作为报告基准（严禁用合并后 HEAD，否则差异为空）；「输出格式约束」新增第 5 条"各工作流结构化报告硬规则"，要求所有工作流执行完毕输出结构化、大白话结果报告（操作对象 / 执行了什么 / 结果 / 风险与异常 / 下一步建议）。
- **mimo_mcp.py**：默认任务超时 300s → 900s（匹配真实任务普遍 100–200s+ 耗时）；mcp.json 模板 `command` 改用绝对 venv python 路径以规避中继/连接器冷启动握手超时强杀；版本 v2.1.0 → v2.2.0。
- **mimo-code-collab（v5 → v6）**：能力边界明确「mimo 可在 `working_dir` 内生成/修改文件（实测落盘）」纠正旧误区；形态A 具体化 `dmcp.exe` 中继并补充「中继侧超时/保活须随 `MIMO_CODE_TIMEOUT` 同步上调」「宿主改 mcp.json 后哈希信任需重载」两条跨平台部署要点；`invocation.md` 泛化 health 样本超时、`test-matrix.md` 新增 T-BND-09 可观测性用例、`cases-and-pitfalls.md` 补充 7 条测试实证陷阱（超时只阻断响应回传不丢产出→先读 `working_dir` 兜底 / 缺可观测性 / 中继超时未同步 / 宿主配置未重载信任 / 文件读写误区 / 上下文回灌自动化 / 显式收敛标准）。

---

## [2026-07-23]

### Added
- **mimo-code-collab**：新增「强制连接韧性约束」（★ 最高优先级元规则）。MiMo code / Dynamic-mcp 连接超时或失联时，必须原样重试 2 次；仅连续 3 次连接失败才允许主 Agent 单独工作（降级而非甩锅，连接恢复后重新协同）。同步更新 `SKILL.md` 关键边界、`invocation` / `cases-and-pitfalls` / `test-matrix` / `collab-workflow` 五处引用，并新增可验证用例 `T-BND-08`。
- **github-personal-manager**：补充冒烟测试用例（qa-fixes 验证）。

### Changed
- **mimo_mcp.py**：将 `openai` 包改为首次调用时懒加载并缓存，避免 MCP Server 冷启动期加载重型 `openai` 依赖链，缩短 `dmcp` 冷启动窗口；`mimo.chat` / `mimo.health` 延迟构造 OpenAI 客户端。
- **github-personal-manager**：修复 `ci_rerun` 调用错误，统一脚本与文案表述。

### Removed
- 清理 `anysearch-skill` 子技能目录（含 `.env` 与脚本）及仓库规划草案文档 `仓库规划与冒烟测试方案（草案v0.1）.md`。

---

## [2026-07-22]

### Fixed
- **ref-material-writing**：全量审核 12 项修复，新增 4 份自检标准档；`officecli` 空白 docx 实测坐实 G1b 通过路径。

---

## [2026-07-19]

### Fixed
- **ref-material-writing**：补齐状态文件「工具能力映射表 / 访问形态」并同步 compatibility 计数。

### Changed
- 将 `MCP-MemPalace-memory-data` 目录中的记忆宫殿产物（数据库文件）加入忽略，不再上传到远端仓库。
- 完善 Deepseek 记忆模块 MCP 工具执行硬约束。

---

## [2026-07-17]

### Docs
- 新增仓库 `README.md`，逐技能说明用途与外部依赖；准备 `v1.0.0` 发布。

### Added
- 仓库初始化与首批私有技能集合落地（`github-personal-manager`、`mimo-code-collab`、`ref-material-writing`、`web-search` 等）。
