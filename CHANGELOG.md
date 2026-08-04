# Changelog

本仓库（`AI_MCP-Skill-CLI`，私有技能集合）的变更记录。

格式参考 [Keep a Changelog](https://keepachangelog.com/)，条目按时间倒序排列。分类约定：
**Added**（新增能力）/ **Changed**（行为或实现变更）/ **Removed**（移除）/ **Fixed**（缺陷修复）/ **Docs**（文档）。

> 本文件由 git 历史汇编，每条对应实际提交主题；最新一条即最近一次推送的提交。

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
