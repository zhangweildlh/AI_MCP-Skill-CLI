---
title: "入口能力与图谱"
topic: "入口能力与图谱"
tags: [dynamic-mcp, mcp, skill, DeusData, knowledge-graph, mimo]
related:
  - "Memory-GitHub全流程操作.md"
  - "Memory-全局禁令与环境约束.md"
  - "Memory-代码纪律与Git操作.md"
scope: "永久记忆"
created: "2026-08-27T20:00:00+08:00"
updated: "2026-08-27T20:00:00+08:00"
parent: "MEMORY.md"
summary: "Dynamic-mcp统一能力入口、常用跨项目技能、mimo.code协同、DeusData本地代码知识图谱"
keywords: ["dynamic-mcp", "技能", "mimo", "DeusData", "图谱"]
priority: "high"
status: "active"
---
> **本文件速查索引**（按章节顺序排列）
> 精确定位到 ### 级别，避免全文加载。

| 适用场景 | 章节位置 | 备注 |
|---------|---------|------|
| 26 Dynamic-mcp统一能力入口 | `## 26 Dynamic-mcp统一能力入口` |  |
| 26.1 调用三步 | `### 26.1 调用三步` |  |
| 26.2 分组清单示例 | `### 26.2 分组清单示例` |  |
| 27 常用跨项目技能（常驻工具链，跨项目） | `## 27 常用跨项目技能（常驻工具链，跨项目）` |  |
| 28 DeusData本地代码知识图谱（经 dynamic-... | `## 28 DeusData本地代码知识图谱（经 dynamic-mcp 接入）` |  |
| 29 memory-mgr.py 维护工具（日常维护入口） | `## 29 memory-mgr.py 维护工具（日常维护入口）` |  |
| 29.1 工具位置 | `### 29.1 工具位置` |  |
| 29.2 核心用途 | `### 29.2 核心用途` |  |
| 29.3 常用命令 | `### 29.3 常用命令` |  |
<!-- INDEX_END -->
# 第七篇：技能与常驻提醒

> 本篇为跨项目复用的常驻技能与提醒事项，涉及对应场景时主动加载。

## 26 Dynamic-mcp统一能力入口

> 动态 MCP 聚合代理 `dynamic-mcp`，将多个上游 MCP server 组织为「分组 group」，按需向 LLM 暴露工具描述，避免上下文膨胀。作为本地文件、记忆、网络搜索等能力的统一入口。

### 26.1 调用三步

1. `list_groups()`（无参）：列出分组名称、描述与连接状态。
2. `get_dynamic_tools(group="分组名")`：取工具清单与 schema。按需指定分组，勿一次性全取（`firecrawl-mcp` 含 26 工具、约 92K 字符）。
3. `call_dynamic_tool(group="分组名", name="工具名", args={...})`：执行并转发至对应上游。

### 26.2 分组清单示例

- **用时先 `list_groups` 核实，以 `list_groups` 返回信息为准。**

| 分组 | 功能 | 用途 |
| ------ | ------ | ------ |
| filesystem | 本地文件读写、目录列表、文件树、移动/删除 | 本地文档与代码文件 CRUD |
| mempalace | 基于知识图谱的 AI 记忆：结构化存储/检索、图谱查询、时间线 | 跨会话记忆 / 知识管理 |
| firecrawl-mcp | 多引擎网页搜索与抓取（scrape/map/search/crawl/extract… 26 工具） | 实时网络信息、抓取、结构化提取；作为 gh 优先原则的网页回退通道 |

---

## 27 常用跨项目技能（常驻工具链，跨项目）

> 经多会话实证、跨项目复用的常驻技能；与 git/gh 流程互补（路径核验另见 [## 7 路径核验](file:///D:/Documents/AI_MCP-Skill-CLI/Memory-Data/Memory-代码纪律与Git操作.md#7-路径核验)），涉及对应场景时主动加载。
>
> 安装任何新 skill 前必须先做安全审计：P0 强警告并暂停、P1 需二次确认、P2 可直接装。

常用技能映射（技能 — 用途 — 触发场景，非导航索引）：
- **deep-discuss（结构化深度讨论）**：多轮问题分析、方案设计、决策推演 — 用户描述问题并期望结构化分析时优先加载
- **code-review-combo（联合代码审查）**：两种互补子技能（委托模式确定性审查 + 五焦点语义深度审查）交叉验证，产出唯一合并审计报告 — 代码审查 / 审计 / 查 BUG 场景。审查与执行两阶段严格分离：审查阶段显式声明"只读、不修改"，修复另起一步；审查脚本一律经 [### 3.3 UV 管理 Python（禁用裸 python / pip）— 原则与详细操作](file:///D:/Documents/AI_MCP-Skill-CLI/Memory-Data/Memory-全局禁令与环境约束.md#33-uv-管理-python禁用裸-python--pip-原则与详细操作) uv run 调用，不裸跑 python
- **github-personal-manager（GitHub 管理统一执行）**：提交 / 推送 / 开 PR / 同步 / 发版 / 分支清理等本地与远端 GitHub 操作的一站式技能 — 凡涉及 GitHub 仓库/项目/代码操作，必须先按名称激活此技能（详见 [## 13 工作流一 github-personal-manager 自动激活（GitHub 工作流总闸门，前置）](file:///D:/Documents/AI_MCP-Skill-CLI/Memory-Data/Memory-GitHub全流程操作.md#13-工作流一-github-personal-manager-自动激活github-工作流总闸门前置)）
- **web-search（深度联网检索）**：多引擎并行检索、网页抓取、多来源交叉印证 — 需联网查证 / 抓取网页 / 事实核查时
- **workbuddy-workspace-migration**：工作区迁移后会话丢失的诊断与恢复 — 重命名/移动工作区目录后会话不可见时
- **memory-consolidate / workflow-distill**：本机自建的通用记忆整合 / 工作流蒸馏技能（用户级，零硬编码） — 周期自动化驱动

---

## 28 DeusData本地代码知识图谱（经 dynamic-mcp 接入）

- **是什么**：本机已部署 DeusData/codebase-memory-mcp，本地代码知识图谱/影响面分析引擎。纯 C 单二进制、零运行时、无 API key、158 语言、15 个 MCP 工具，纯本地、不外连；内置可选 3D 图谱 UI（localhost:9749）。
- **三者关系**：codebase-memory 是我对 DeusData/codebase-memory-mcp 的统一简称；其完整仓库/可执行名为 `codebase-memory-mcp`（也是 dmcp 连接器分组名，上游作者为 GitHub 账号 `DeusData`），引擎自身在日志与进程里常缩写为 `cbm`。四者指向同一引擎——`DeusData` = `codebase-memory` = `codebase-memory-mcp` = `cbm`。
- **接入方式**：经 dynamic-mcp 代理（`D:\Tools\MCP_Bridge\dynamic-mcp.json` 的 `codebase-memory-mcp` backend）。全部文件集中在 `D:\codebase-memory-mcp`（本地 git 管理，非 GitHub）：exe `D:\codebase-memory-mcp\codebase-memory-mcp.exe`；cache 根 `D:\codebase-memory-mcp\data`（**私有锁三层校验**：目录自身 + 每个 `.db` 文件均须 owner-only；祖先链不得含 Authenticated Users 变更权——故目录须置于"仅以卷根为祖先"的路径如 `D:\codebase-memory-mcp`，**勿塞入 `D:\Tools\*` 等公共工具链目录**，否则 `cache-private`；详见 Skill `code-graph` 第 8.2 节）；索引护栏：`CBM_ALLOWED_ROOT=D:/Documents`。
- **监控范围（用户指定）**：仅 `D:\Documents\AI_MCP-Skill-CLI`（git 仓库，后台 watcher 做 git 轮询增量）与 `D:\Documents\AI_Work_Temp`（顶层非 git，仅一次性快照；需会话启动手动重索引或定时 cli 重索引才能追上变化）。
- **何时用（意图路由）**：影响面分析、调用链追踪、死代码定位、本地 git 变动 impact 映射、理解/导航本地代码、"X 函数改了影响哪些" → 优先调 DeusData 工具，而非逐文件 grep/read。
- **何时不用**：远程 GitHub 仓库变动查看（走 `gh`/github MCP）、修改/写代码（Write/Edit + git）、非本地代码。DeusData 是只读分析，不写文件、不 push。
- **自主触发边界**：watch 是 OS 文件事件驱动的索引更新，非 LLM 推理，不会自发调 Agent；Agent 可在"本地代码理解"类意图自主选其工具调用。daemon 随 daemon-backed 会话生死，无独立常驻 watch 服务；`auto_watch` 默认 true。
- **工具可见性（经 dmcp 路由）**：15 工具须经 `mcp__dynamic-mcp__call_dynamic_tool(group="codebase-memory-mcp", tool=...)` 路由调用。
- **踩坑（已实证，源码级核实）**：① 私有文件锁仅检查 `CBM_CACHE_DIR` 目录**自身** ACL（AceCount==1 + SE_DACL_PROTECTED + 单一用户非继承 FULL ACE），**不向上遍历盘根**，故 `data` 目录自身设 owner-only 即可，即便 `D:\` 根开放也不影响（纠正旧记"路径树每级"误判）；③ install.ps1 会自写 agent 配置且不认 WorkBuddy，须手动写 mcp.json；④ 数据库不可复制迁移：`.db` 绑定原 cache 根，复制会令 daemon 30s 超时卡死，迁移须新位置重索引；⑤ 项目混入 Windows 保留名文件（`nul`/`con`/`aux` 等）会 Pipeline failed，移出杂散文件再索引即可（本机 `Deepseek-pp` 曾中招）。
- **关联**：详细工具表与 Cypher 查询范式见 Skill `code-graph`。
- **监控模型优化**：`AI_Work_Temp` 是本地所有 GitHub 仓库根目录，每个一级子目录=一个独立项目（git/非git 混合，频繁增删）。采用「不监控、运行后快扫」+ 逐子目录索引。`auto_index` 已开启(true)；新增/删除子目录的**零手动同步**由 Skill 内「会话启动对账例程」实现（Agent 对账 `AI_Work_Temp` 一级子目录 ↔ `list_projects`：新子目录 `index_repository`、已删子目录 `delete_project`、非git 子目录重索引）。`AI_Work_Temp` 整树单一项目索引会崩溃，故不采用。
- **常驻用法（每个任务必用）**：凡涉及本地代码理解/影响面/调用链/死代码/本地 git 变动 impact 的任务，**优先用 DeusData 图工具**（`search_graph` 找符号、`trace_path` 追调用、`detect_changes` 看 git 变动影响、`get_architecture` 看整体、`get_code_snippet` 看实现），**不要盲目用 Grep/Read 扫全仓**；仅图覆盖不足或需字面文本时退化 `search_code`/文件系统 grep。每次新会话/新任务启动先跑 Skill 内「会话启动对账例程」确认索引与磁盘一致。

---

## 29 memory-mgr.py 维护工具（日常维护入口）

> 本章节是 `memory-mgr.py` 工具的快速入口，详细说明见独立文档 [README.md](file:///D:/Documents/AI_Work_Temp/2026-08-27-17-23-58/终版/README.md)。

### 29.1 工具位置

```
主工具：D:\Documents\AI_MCP-Skill-CLI\Memory-Data\memory-mgr.py
辅助文档：D:\Documents\AI_MCP-Skill-CLI\Memory-Data\WorkBuddy记忆文件说明.md
```

### 29.2 核心用途

- 维护 `C:\Users\15794\.workbuddy\MEMORY.md` 及其 5 个子文件（`D:\Documents\AI_MCP-Skill-CLI\Memory-Data\`）
- 自动生成和维护主索引表（`<!-- MAIN_INDEX_START -->` 区域）
- 确保章节编号连续、链接完整、YAML 字段有效

### 29.3 常用命令

```bash
# 进入工具目录
cd "D:\Documents\AI_MCP-Skill-CLI\Memory-Data"

# 完整性检查（日常首选）
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py --main-file "C:/Users/15794/.workbuddy/MEMORY.md" --sub-files-dir "D:/Documents/AI_MCP-Skill-CLI/Memory-Data" --no-interactive check

# 综合校验（12条纪律验证）
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py --main-file "C:/Users/15794/.workbuddy/MEMORY.md" --sub-files-dir "D:/Documents/AI_MCP-Skill-CLI/Memory-Data" --no-interactive validate

# 定位章节位置
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py get-offset --file "Memory-xxx.md" --section "## N 完整章节标题"

# 新增子文件（dry-run预览）
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py add --topic "主题" --content "内容" --dry-run

# 删除子文件
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py remove --file "Memory-xxx.md" --force
```

### 29.4 注意事项

- `get-offset` 命令的 `--section` 参数必须使用**完整章节标题**，而非简短编号
- 维护操作前建议先运行 `check` 确认当前状态
- 破坏性操作（remove/restore）需显式指定 `--force`

[→主文件](file:///C:/Users/15794/.workbuddy/MEMORY.md)
