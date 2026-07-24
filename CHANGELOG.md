# Changelog

本仓库（`AI_MCP-Skill-CLI`，私有技能集合）的变更记录。

格式参考 [Keep a Changelog](https://keepachangelog.com/)，条目按时间倒序排列。分类约定：
**Added**（新增能力）/ **Changed**（行为或实现变更）/ **Removed**（移除）/ **Fixed**（缺陷修复）/ **Docs**（文档）。

> 本文件由 git 历史汇编，每条对应实际提交主题；最新一条即最近一次推送的提交。

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
