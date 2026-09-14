---
title: "入口能力与图谱"
topic: "入口能力与图谱"
tags: [dynamic-mcp, mcp, skill, DeusData, knowledge-graph]
related:
  - "Memory-GitHub全流程操作.md"
  - "Memory-全局禁令与环境约束.md"
  - "Memory-代码纪律与Git操作.md"
scope: "永久记忆"
created: "2026-08-27T20:00:00+08:00"
updated: "2026-09-10T17:52:48+08:00"
parent: "MEMORY.md"
positioning: "本机各单工具 / 单技能的使用与调用说明集（有什么、在哪、怎么调、何时用/不用）"
role: "能力台账层"
theme: "dynamic-mcp 统一入口 / codebase-memory-mcp 代码图谱 / memory-mgr.py 的单工具调用说明"
scope_in: "dynamic-mcp 调用三步与分组清单；codebase-memory-mcp 本地代码知识图谱的接入与单工具用法；memory-mgr.py 的位置 / 用途 / 常用命令 / 注意事项"
scope_out: "多个工具/多技能协同的作业流程（如搜索 SOP）→ 子文件6；能力使用中的踩坑 → 子文件4；环境禁令 → 子文件1；GitHub 流程 → 子文件3"
summary: "Dynamic-mcp统一能力入口、codebase-memory-mcp 本地代码知识图谱（mimo-mcp 当前已停用）"
keywords: ["dynamic-mcp", "技能", "DeusData", "图谱"]
priority: "high"
status: "active"
file_number: 5
---
> **本文件速查索引**（按章节顺序排列）
> 精确定位到 ### 级别，避免全文加载。

| 适用场景 | 章节位置 | 备注 |
|---------|---------|------|
| 5-1 Dynamic-mcp统一能力入口 | `## 5-1 Dynamic-mcp统一能力入口` |  |
| 5-1-1 调用三步 | `### 5-1-1 调用三步` |  |
| 5-1-2 分组清单示例 | `### 5-1-2 分组清单示例` |  |
| 5-2 codebase-memory-mcp 本地代码知识... | `## 5-2 codebase-memory-mcp 本地代码知识图谱（经 dynamic-mcp 接入）` |  |
| 5-3 memory-mgr.py 维护工具（日常维护入口） | `## 5-3 memory-mgr.py 维护工具（日常维护入口）` |  |
| 5-3-1 工具位置 | `### 5-3-1 工具位置` |  |
| 5-3-2 核心用途 | `### 5-3-2 核心用途` |  |
| 5-3-3 常用命令 | `### 5-3-3 常用命令` |  |
| 5-3-4 注意事项 | `### 5-3-4 注意事项` |  |
<!-- INDEX_END -->
## 5-1 Dynamic-mcp统一能力入口

> 动态 MCP 聚合代理 `dynamic-mcp`，将多个上游 MCP server 组织为「分组 group」，按需向 LLM 暴露工具描述，避免上下文膨胀。作为本地文件、记忆、网络搜索等能力的统一入口。

### 5-1-1 调用三步

1. `list_groups()`（无参）：列出分组名称、描述与连接状态。
2. `get_dynamic_tools(group="分组名")`：取工具清单与 schema。按需指定分组，勿一次性全取（`firecrawl-mcp` 含 26 工具、约 92K 字符）。
3. `call_dynamic_tool(group="分组名", name="工具名", args={...})`：执行并转发至对应上游。

### 5-1-2 分组清单示例

- **用时先 `list_groups` 核实，以 `list_groups` 返回信息为准。**

| 分组 | 功能 | 用途 |
| ------ | ------ | ------ |
| codebase-memory-mcp | 本地代码知识图谱/影响面分析（15 工具，纯本地） | 代码理解、调用链、影响面、死代码、本地 git 变动 impact |
| filesystem | 本地文件读写、目录列表、文件树、移动/删除 | 本地文档与代码文件 CRUD |
| firecrawl-mcp | 多引擎网页搜索与抓取（scrape/map/search/crawl/extract… 26 工具） | 实时网络信息、抓取、结构化提取；作为 gh 优先原则的网页回退通道 |
| sequential-thinking | 顺序思考链 | 多步推理拆解 |
| TickTick | 待办事项 | 任务管理 |
| Everything-search（安装路径见主文件规则二本地工具表） | 本地文件名/路径全文检索 | 快速定位本地文件 |

> 注：`mimo-mcp`（mimo.code 协同）与 `playwright-360chrome`（浏览器自动化）当前在 `dynamic-mcp.json` 中标为 `"enabled": false`，未出现在连接分组中；如需启用须先修改配置并重启代理。

---

## 5-2 codebase-memory-mcp 本地代码知识图谱（经 dynamic-mcp 接入）

**功能与用途**：`codebase-memory-mcp` 是纯本地、只读的代码知识图谱引擎（上游 DeusData 开发，引擎二进制 `codebase-memory-mcp.exe`），将本地已索引工作树构建为调用图/使用图/继承图，提供符号搜索、调用链追踪、影响面评估、死代码定位、本地 git 变动爆炸半径映射等 15 个 MCP 工具；纯本地、离线、无 API key、不连远程。

**使用场景（按任务语义激活，而非术语关键词）**：凡涉及本地代码的研发认知活动——分析/阅读/理解本地代码或项目、修改代码/加功能/重构、定位/修复/查找 BUG、审计/审查代码/代码评审、基于 PR 审查意见核查或定位问题、接手/上手本地项目、本地未提交 git 改动 impact 自检——且目标位于本地已索引工作树（如 `D:/Documents/AI_MCP-Skill-CLI`、`D:/Documents/AI_Work_Temp`）时，优先调图工具替代全仓 grep 与逐文件 Read。

**激活动作**：命中上述场景时，默认激活 Skill `codebase-memory`，把图能力（理解结构、评估影响面、追踪调用链、定位死代码、改动 impact 自检）作为认知第一手段；覆盖不足时先 `check_index_coverage` 确认 gap，再退化 Grep/Read 核实精确实现。

**不适用**：纯新增代码、Write/Edit 与 git 写动作本体、未克隆到本地的远程 GitHub 仓库浏览（走 `gh` + `github-personal-manager`）、运行时调试。

---

## 5-3 memory-mgr.py 维护工具（日常维护入口）

> 本章节是 `memory-mgr.py` 工具的快速入口，详细说明见本仓库维护手册 [WorkBuddy记忆文件说明.md](file:///D:/Documents/AI_MCP-Skill-CLI/Memory-Data/WorkBuddy记忆文件说明.md)（即本说明文件，原 README.md 快照路径已失效，统一指向此文件）。

### 5-3-1 工具位置

主工具 `memory-mgr.py` 的绝对路径以主文件 `规则二：本地工具链` 本地工具表为唯一权威台账（详见 [MEMORY.md 规则二：本地工具链](file:///C:/Users/15794/.workbuddy/MEMORY.md#规则二本地工具链)），本节不再重复定义。

辅助文档：`D:\Documents\AI_MCP-Skill-CLI\Memory-Data\WorkBuddy记忆文件说明.md`

### 5-3-2 核心用途

- 维护 `C:\Users\15794\.workbuddy\MEMORY.md` 及其子文件（`D:\Documents\AI_MCP-Skill-CLI\Memory-Data\`，子文件数量随主题增减，不假设固定个数）
- 自动生成和维护主索引表（`<!-- MAIN_INDEX_START -->` 区域）
- 确保章节编号连续、链接完整、YAML 字段有效

### 5-3-3 常用命令

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

### 5-3-4 注意事项

- `get-offset` 命令的 `--section` 参数必须使用**完整章节标题**，而非简短编号
- 维护操作前应先运行 `check` 确认当前状态
- 破坏性操作（remove/restore）需显式指定 `--force`

[→主文件](file:///C:/Users/15794/.workbuddy/MEMORY.md)
