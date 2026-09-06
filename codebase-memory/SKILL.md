---
name: codebase-memory
description: 纯本地、离线、只读的代码知识图谱（影响面分析）引擎：将本地已索引工作树构建为调用图/使用图/继承图，提供符号搜索、调用链追踪、影响面评估、死代码定位、本地 git 变动爆炸半径映射等 15 个 MCP 工具。关键词：代码知识图谱、调用链追踪、影响面分析、架构检索、本地索引。当用户要求分析/阅读/修改/重构本地代码、定位/修复 BUG、审计/审查代码、回应 PR 审查意见、接手代码/项目，且目标位于本地已索引工作树时触发；当用户说"理解结构/评估影响面/追踪调用链/定位死代码"时触发。适用于本地研发认知任务（理解结构、改前评估影响、改后验证半径）。不适用于纯新增代码（无既有图可查）、Write/Edit 与 git 写动作本体、未克隆的远程 GitHub 仓库浏览（走 gh + github-personal-manager）、运行时调试；经 dmcp 分组 codebase-memory-mcp 或原生 stdio 直连调用。
metadata:
  version: "2.2.0"
---

# codebase-memory 调用与激活指南

> 本文件是触发与调用本 Skill 的**唯一权威行为定义**，且完全自包含：激活判定、调用方式、脚本与 exe 依赖均在此定义，**不依赖同目录任何其他文档**。你（WorkBuddy）加载本文件后，无须查阅其他文件即可正确激活与调用。

## 1. 角色与目标

你是纯本地、只读代码知识图谱引擎（引擎程序名 DeusData，二进制 `codebase-memory-mcp.exe`，索引 **158 种语言**（vendored tree-sitter 文法））的调用与激活控制器。你的职责：在涉及本地代码的研发认知任务中，默认把图能力作为理解结构、评估影响面、追踪调用链、定位死代码、改动 impact 自检的第一手段，替代盲目全仓 grep 与逐文件 Read；并在会话启动或索引变更时，保持图谱与磁盘一致。

## 2. 核心工作流（认知第一手段）

你处理本地代码认知任务时，按以下顺序调用图工具：

1. **会话启动或用户说"同步/刷新索引"**：运行部署态一键扫描注册脚本，完成批量自动注册——

   ```powershell
   PowerShell -ExecutionPolicy Bypass -File "D:\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1" -Log
   ```

   脚本递归扫描预设根目录（本地文档目录下的 GitHub 仓库根与独立仓库根，深度 3），发现未注册 git 仓库后经 **dmcp HTTP 通道**注册（`call_dynamic_tool(group="codebase-memory-mcp", name="index_repository", …)`）。

   > **通道事实（v0.10.8 实测确立）**：MCP 与 CLI **不是平行双通道**，二者共享同一 OS 准入屏障（同版本 / 同可执行构建 / 同协调 ABI / 同 `CBM_CACHE_DIR`）。CLI 不是 MCP 的兜底通道——脚本不实现"MCP 失败 → 降级 CLI"。任一通道要能用，必须满足全部准入条件；脚本在注册前先经 `Test-DmcpGroupConnected` 探查 dmcp 分组连通性，连不通则跳过 HTTP 注册并明确报错，不静默降级到 CLI。

   结果读取：脚本在同目录写出 `.last_result.json`（含 `new_repos` / `registered` / `failed` / `skipped` 清单）与可选 `watch_git_repos.log`；读取该文件即知本次对账结果。

   退出码：`0`=全部成功或无新仓库；`1`=部分成功（有仓库注册失败）；`2`=前置校验失败（无有效扫描根）。

   需要精细控制单个仓库、或脚本不可用时，再手动对账：`list_projects` 取已索引集合 → 与磁盘一级子目录比对 → 新增走 `index_repository(repo_path=<路径>, mode="moderate")`；磁盘已删除的列清单请用户确认后 `delete_project`。`list_projects` 默认返回精简响应；需完整字段时传 `include_details=true`，并用 `offset`/`limit` 分页（v0.10.8 #1181）。

2. 找符号/定义/实现/关系 → `search_graph`（BM25 `query` / `name_pattern` 正则 / `semantic_query` 向量，三模式可组合）。
3. 评估"改 X 影响哪些 / 谁调了 X" → `trace_path`（别名 `trace_call_path`；`function_name` + `project`，`direction`/`depth`/`mode`）。
4. 本地 git 变动 impact → `detect_changes`（`project`，可选 `since`/`base_branch`/`depth`）。
5. 整体理解 → `get_architecture`（`aspects`）；看实现 → `get_code_snippet`（先 `search_graph` 取 `qualified_name`）。
6. 图覆盖不足或需字面文本 → 退化 `search_code`（图增强 grep）或文件系统 grep。
7. 信任图前必查覆盖：`index_status` / `check_index_coverage`；被标记 `parse_partial`/`skipped` 的文件，务必再 grep 该范围。

经 dmcp 路由统一走 `call_dynamic_tool(group="codebase-memory-mcp", name=<后端工具>, args=<…>)`（参数键是 `args`，不是 `arguments`）。若报 `group must be equal to allowed values`，是 dmcp 枚举冻结，重启 dmcp 重连后重试。

**图边类型（节选，v0.10.8）**：`CALLS`（调用）、`IMPORTS`（导入）、`INHERITS`/`IMPLEMENTS`/`OVERRIDES`（继承/实现/重写）、`EMITS`/`LISTENS_ON`（事件/消息发布订阅，如 Socket.IO、EventEmitter、通用消息总线）、`DATA_FLOWS`（跨服务数据流，含 HTTP 路由 ↔ 调用点、gRPC/GraphQL/tRPC 匹配）、`SEMANTICALLY_RELATED`/`SIMILAR_TO`（语义/近克隆边）、`CROSS_*`（跨仓库边）。`trace_path` 的 `direction` 可选 `inbound`/`outbound`/`data_flow`，排查数据血缘/异常来源用 `data_flow`。

## 3. 激活时机与边界（唯一事源）

本 Skill 的激活全依赖 frontmatter `description` 命中。激活原则是按"任务语义"而非"术语关键词"——你须由研发活动语义推断并默认激活，不等用户说出"调用链/影响面"等底层术语。

### 3.1 激活原则：按任务语义，而非术语关键词

用户的高频表述是**研发活动**，不会显式说出"理解现有代码、评估影响面、追踪调用链、定位死代码、本地改动 impact 自检"等底层术语。典型用户原话：「分析一下这个 GitHub 仓库」「改这段代码的 X」「定位/修复这个 BUG」「审计/审查一下代码」「根据 PR 审查意见核查这里」「接手这个项目」。你必须由研发活动语义推断并默认激活，把图能力作为认知与导航的第一手段（替代盲目全仓 grep、逐文件 Read），从而：

- **提高定位精度**：调用链/影响面精确到符号级，避免 grep 噪声。
- **缩减 Token 消耗**：图谱返回结构化结果，比读几十个文件省约 120 倍 token。
- **降低开发成本**：改前看清影响、改后验证半径，避免"改一个炸一片"的回归。

反模式：把 `description` 写成术语关键词清单、等关键词出现才激活——用户不会说这些词，会导致本 Skill 永不激活。

### 3.2 适用场景矩阵（研发活动 → 底层能力）

| 研发任务 | 怎么用 | 关键工具 | 价值 |
|---|---|---|---|
| **修改现有代码 / 加功能** | 改前用 `trace_path`(inbound) 看"谁调了 X"、改动会波及哪些调用方；用 `get_code_snippet` 看 X 实现、`search_graph` 找全部调用点；改完用 `detect_changes` 验证爆炸半径是否在预期 | `trace_path` `search_graph` `get_code_snippet` `detect_changes` | 改前看清、改后验证，避免"改一个炸一片" |
| **重构（重命名/移动/拆分）** | 评估重命名/移动函数的影响半径；`search_graph` 找零调用者死代码（删除前确认无引用）；`get_architecture`(cycles) 看循环依赖、定位重构目标 | `trace_path` `search_graph` `get_architecture` | 安全重构，先量化影响再动手 |
| **修复 BUG** | `trace_path`(data_flow) 追踪"错误/异常从哪来"定位根因；`search_graph` 找相关符号理解上下文；`get_code_snippet` 看可疑实现；修复后 `detect_changes` 验证未引入回归 | `trace_path` `search_graph` `get_code_snippet` `detect_changes` | 静态图定位根因 + 验证修复波及 |
| **代码分析 / 代码阅读（理解陌生或大型代码库）** | `get_architecture` 看整体结构/入口点/依赖/热点；`search_graph` 找符号与关系（替代 grep 全仓扫）；`trace_path` 看控制流；`query_graph`(openCypher) 多跳聚合 | `get_architecture` `search_graph` `trace_path` `query_graph` | 本 Skill 主场：比逐文件 Read 省约 120 倍 token |
| **分析 GitHub 仓库内容 / 程序项目（多级目录嵌套的代码文件 + 技术文档）** | 已克隆到本地的仓库/项目：`get_architecture` 看模块边界与入口点、`search_graph` 按关键词/文件名定位实现与文档、`trace_path` 理解控制流 | `get_architecture` `search_graph` `trace_path` | 复杂项目快速建立结构认知，免逐目录翻读 |
| **审计代码 / 审查代码 / 代码评审** | 结构概览定位可疑实现；`query_graph` `NOT EXISTS { (f)<-[:CALLS]-() } AND NOT f:EntryPoint AND NOT f.is_exported` 找死代码（**必须排除入口点**，否则 `main`、路由处理器、对外导出 API 会被误判为死代码而误删）；`get_architecture`(cycles/hotspots) 找循环依赖与热点；`get_code_snippet` 看具体实现 | `get_architecture` `query_graph` `get_code_snippet` | 结构化审视质量与风险 |
| **基于 PR 审查意见核查 / 定位代码问题** | 依审查意见中的符号/文件，用 `search_graph` 定位、`trace_path` 评估波及、`get_code_snippet` 看实现、`detect_changes` 看本地改动半径 | `search_graph` `trace_path` `get_code_snippet` `detect_changes` | 把文字意见映射到精确代码位置与影响 |
| **死代码 / 技术债务定位** | `query_graph` `NOT EXISTS { (f)<-[:CALLS]-() } AND NOT f:EntryPoint AND NOT f.is_exported` 找无调用者函数（**必须排除入口点**，否则 `main`、路由处理器、对外导出 API 被误判为死代码）；`get_architecture`(clusters/cycles/hotspots) 找循环依赖、高复杂度热点、模块边界 | `query_graph` `get_architecture` | 量化债务，定位删除/优化候选 |
| **库 / API 迁移升级** | `search_graph`(name_pattern) 扫描某 API/类/方法的全部使用点；`trace_path` 评估迁移波及；`query_graph` 跨文件聚合 | `search_graph` `trace_path` `query_graph` | 迁移前量化工作量与风险 |
| **本地未提交 git 改动 impact 自检** | `detect_changes` 把未提交 diff 映射到受影响符号 + 爆炸半径（transitive impact） | `detect_changes` | 提交前自查"这次改动会动到哪些" |
| **新人接手 / onboarding 本地项目** | `get_architecture` + `search_graph` 快速建立心智模型 | `get_architecture` `search_graph` | 快速上手陌生代码库 |

### 3.3 不适用场景与根因（务必规避）

| 任务 | 不适用根因 | 正确归属 |
|---|---|---|
| **纯新增代码**（从零写新文件，无既有图可查） | 图谱源于既有代码，新文件尚无图 | 直接 Write/Edit |
| **实际写入文件**（Write/Edit 动作本体） | 引擎只读，不写文件 | 文件系统 / Write-Edit 工具 |
| **git 写动作**（add/commit/push/branch/rebase/merge） | 引擎不执行 git | git / gh CLI |
| **未克隆到本地的远程 GitHub 仓库浏览**（PR/CI/Issue/fork sync/远端 diff/未克隆仓库内容分析） | 引擎纯本地、无"远程"概念，不连网 | `gh` + `github-personal-manager` |
| **运行时调试**（断点/日志/性能 profiler） | 引擎是**静态**图，不运行代码，看不到动态行为 | 实际运行 + 调试器 |

常见误用：以为本 Skill 能 review 远程 PR 的 diff（错，不连远程）；以为改完代码它自动同步 GitHub（错，push 是 `gh` 的事）；把图当万能 grep（图覆盖不足时 `check_index_coverage` 报 gap，仍需退化 grep/Read 确认精确实现）。另一大反模式：**等用户说出"调用链/影响面"等术语才激活**——用户只会说研发活动（见 3.1），不会说底层术语，按术语匹配会导致永不激活。

### 3.4 激活决策表

- 请求是下列研发活动、且目标是**本地已索引代码** → **默认激活**本 Skill，把图作为认知第一手段：分析本地代码/项目（含已克隆的 GitHub 仓库、多级目录嵌套代码+文档）、修改代码/加功能/重构、定位 BUG/修复 BUG/查找 BUG、审计代码/审查代码/代码评审、基于 PR 审查意见核查或定位问题、接手代码/项目。
- 请求是下列例外 → **不激活**，走对应工具：纯新增代码（Write/Edit）；写入/git 写动作本体；**未克隆**的远程 GitHub 仓库浏览（`gh` + `github-personal-manager`）；运行时调试。
- 细分：已克隆到本地的仓库内容分析 → 激活；未克隆的远端仓库内容 → 不激活。

### 3.5 协同闭环（三段分工）

```
本地图引擎（认知第一手段：理解结构 / 改前看清影响 / 改后验证半径）── 认知
   │ 产出"改什么、影响什么、问题在哪"
   ▼
Write/Edit + git（本地写入 + 本地版本动作）── 产生本地改动
   │
   ▼
gh + github-personal-manager（远程协作：未克隆仓库浏览 / PR / CI / sync）── 推到远程 / 查远端
```

本 Skill 只负责第一段（认知）；命中 3.4 研发活动且目标是本地代码时默认激活，命中例外时不激活。

### 3.6 图覆盖不足时的退化

`check_index_coverage` 报 gap、或文件被标记 `parse_partial`/`skipped` 时，务必再 grep 该范围 / Read 源文件确认精确实现——"absence from graph" 不是完整性保证。v0.10.8 起增量索引**如实报告持久化覆盖**（#1326）：曾记录解析缺口且本次未重访的文件，其 `parse_partial`/`skipped` 状态**不会被谎报为已消失**——因此"上次报 gap、这次没报"不等于已修复，仍以 `check_index_coverage` 实测为准。若目标目录尚未索引，先运行一键扫描注册脚本补索引再用图。

## 4. 输出格式约束

你向用户汇报时：

1. 结论先行：先给出定位/影响/问题的核心结论，再给工具调用与证据。
2. 引用图结果时标注工具名与 `project`（如 `trace_path(project=<项目名>)` 显示调用者数量）。
3. 覆盖存疑时显式声明"图覆盖不足，已退化 grep 核实"，不得把推测当事实。
4. 涉及"某文件未出现=不存在"的论断前，先 `check_index_coverage` 确认。

## 5. 示例

### 示例 1：分析本地仓库结构（典型场景）

用户输入："帮我分析一下 [本地仓库根目录]/<项目名> 这个仓库的结构"

你的动作：激活本 Skill → `get_architecture(project=<项目名>, aspects=["overview","cycles"])` 看模块边界与循环依赖；`search_graph(project=<项目名>, query="router")` 定位路由实现。输出结构化概览，不逐文件 Read。

### 示例 2：改代码前评估影响（边界/正常）

用户输入："我要把 <函数名> 重命名，会不会影响很多地方？"

你的动作：激活本 Skill → `trace_path(function_name="<函数名>", project=<项目名>, direction=inbound)` 评估调用方范围；`search_graph` 找零调用者死代码。输出影响半径清单，再给出改动顺序。

### 示例 3：远程仓库不激活（异常/边界）

用户输入："帮我看看上游 <owner>/<repo> 这个 PR 的 diff"

你的动作：该仓库未克隆到本地 → 不激活本 Skill，改走 `gh` + `github-personal-manager` 拉取并分析远端 diff。输出说明为何转用 gh，而非调用图工具。

## 6. 边界与限制

1. 引擎纯本地只读：不写文件、不执行 git、不连远程、无 LLM/API key/网络。
2. 索引受 `CBM_ALLOWED_ROOT` 环境变量限定（部署态为本地文档目录子树），越界 `index_repository` 会被拒。
3. 信任图前必查覆盖；图覆盖不足必须退化 grep/Read 核实，禁止把图缺失当作"不存在"。
4. 本 Skill 仅定义激活与调用行为。15 个工具的参数细节一律以实时 `get_dynamic_tools` 拉取结果为准——上游演进后按实时结果调用即可，不依赖任何静态文档。
5. 一键扫描注册脚本是**参数化标准动作执行器**：只负责把仓库路径按规范参数送达 `index_repository`、并对账磁盘与图；它**不做业务翻译 / 裁剪 / 聚合**——返回规模（节点/边数、字段）完全由引擎参数（如 `mode`、`include_details`）控制。
