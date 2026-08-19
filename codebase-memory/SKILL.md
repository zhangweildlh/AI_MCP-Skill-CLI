---
name: codebase-memory
description: DeusData 纯本地、离线、只读代码知识图谱引擎。激活原则按任务语义而非术语关键词：当用户要做的研发活动是「分析代码/程序/项目（含 GitHub 仓库、多级目录嵌套的若干代码文件与技术文档）、阅读代码/程序/项目、修改代码/程序、定位 BUG、修复 BUG、查找 BUG、审计代码、审查代码、基于 PR 审查意见核查或定位问题、回应 PR 审查意见、接手代码/程序/项目、重构代码/程序/项目」等，且目标代码位于本地工作树（如 D:\Documents\AI_Work_Temp 等已索引目录）时，应默认激活本 Skill，把 DeusData 的图能力（理解代码结构、评估改动影响面、追踪调用链、定位死代码、本地未提交改动 impact 自检）作为认知与导航的第一手段——替代盲目全仓 grep 与逐文件 Read。注意：用户通常只会表达上述研发活动、不会显式说出「调用链/影响面」等术语，Agent 须由任务语义推断并主动默认激活，不要等关键词出现。不适用（不激活）：纯新增代码（从零写新文件、无既有图可查）；Write/Edit 写入动作本体；git 写动作（add/commit/push/branch/rebase/merge）；纯远程 GitHub（未克隆的远端仓库浏览、PR/CI/远端 diff，走 gh + github-personal-manager）；运行时调试（断点/日志/profiler）。细分：分析未克隆的远程 GitHub 仓库内容不激活，已克隆到本地的仓库内容分析激活。DeusData 是纯本地只读图引擎（无 LLM、无 API key、无网络），只建图与读图，不写代码、不执行 git、不连远程。本 Skill 给出 15 工具权威路由表、会话启动对账例程、openCypher 速查。
---

# codebase-memory-mcp 调用与运维指南（DeusData，经 dynamic-mcp）— Agent 操作参考

> 本文件给 WorkBuddy/Agent 看、用。只放任务执行期操作必需信息。

## 0. 定位与接入
- DeusData = **纯本地、只读**代码知识图谱/影响面分析引擎（纯 C 单二进制、零运行时、无 API key、158 语言、15 MCP 工具）。
- 接入：经 dynamic-mcp 的 `codebase-memory-mcp` backend 暴露为 dmcp 分组 `codebase-memory-mcp`（即 `call_dynamic_tool` 的 group 值）。
- 索引范围：env `CBM_ALLOWED_ROOT=D:/Documents` 限定只能索引 `D:\Documents` 子树（越界 `index_repository` 会被拒）。

## 1. 监控模型
- `D:\Documents\AI_Work_Temp` = 所有本地 GitHub 仓库根目录；每个**一级子目录 = 一个独立项目**（git 与非 git 混合），频繁增删。
- `D:\Documents\AI_MCP-Skill-CLI` = 独立 git 仓库，单独维护。
- 模式「不监控、运行后快扫」：MCP 未运行时不做任何事；会话启动/按需由 Agent 跑**第 3 节对账例程**同步。
- **AI_Work_Temp 必须逐一级子目录 `index_repository`**，整树单一项目会稳定崩溃（目录枚举阶段被顶层散落文件/嵌套 `.git` pack 硬崩）。

## 2. 常驻用法：凡涉及本地代码认知/评估的任务优先用图（强制）
> 措辞说明：此处的「每个任务」指**涉及本地代码理解/影响面/调用链/死代码/本地 git 变动 impact 的任务子集**，并非让本 Skill 在无关任务（纯新增代码、写文件、git 写动作、远程 GitHub、运行时调试）里强行激活——那些场景见 §6 不适用边界。命中 §6 适用侧时，本准则强制：优先用 DeusData 图工具，不要盲目用 Grep/Read 扫全仓。决策顺序：

1. **会话/任务启动**：先跑**第 3 节对账例程**确认索引与磁盘一致（新增子目录会被自动补索引）。
2. **找符号/定义/实现/关系** → `search_graph`（`query` BM25 / `name_pattern` 正则 / `semantic_query` 向量，三模式可组合；分页靠 `limit`+`offset`+`has_more`）。
3. **"改 X 影响哪些 / 谁调了 X"** → `trace_path`（`function_name` + `project`，`direction`/`depth`/`mode`）。
4. **本地 git 变动 impact** → `detect_changes`（`project`，可选 `since`/`base_branch`/`depth`）。
5. **整体理解** → `get_architecture`（`aspects`）；**看实现** → `get_code_snippet`（先 `search_graph` 取 `qualified_name`）。
6. **图覆盖不足或需字面文本** → 退化 `search_code`（图增强 grep）或文件系统 grep。
7. **信任图前必查覆盖**：`index_status`（覆盖报告）/ `check_index_coverage`（精确路径可信度）。被标记 `parse_partial`/`skipped` 的文件，**务必再 grep 该范围**。

- 经 dmcp 路由统一走 `call_dynamic_tool(group="codebase-memory-mcp", name=<后端工具>, args=<…>)`（参数键是 `args`，**不是** `arguments`）。
- 若 `call_dynamic_tool` 报 `group must be equal to allowed values`，是 dmcp 枚举冻结，**重启 dmcp 重连后重试**。

## 3. 会话启动对账例程（核心：增删子目录零手动同步）
DeusData **不会自动发现新子目录**（`auto_index` 仅补齐已知项目，不爬父目录）。Agent 在会话启动或用户说"同步/刷新索引"时执行：
1. `list_projects` → 已索引根集合 A（root_path）。
2. 列出 `D:/Documents/AI_Work_Temp` 一级子目录集合 B（PowerShell `Get-ChildItem -Directory`）。
3. **新增**（b∈B 且 b∉A，且非探针/临时目录）→ `index_repository(repo_path=b, mode="moderate")`。
4. **删除**（a∈A 且 root_path 以 `D:/Documents/AI_Work_Temp` 开头但磁盘已不存在）→ 已由后台 watcher **自动处理，无需手动**：watcher 连续 3 次轮询发现根缺失、再宽限约 10 分钟后，自动注销该目录的监视并删除其缓存 db（`data/<hash>.db` 及 `_config.db` 注册项），前提是 cbm/dmcp 在运行。仅在需要**立即**清掉陈旧图数据（不等约 10 分钟自动剪枝）时，才调 `delete_project(project=a)`。
5. **变更**：git 子目录靠 `auto_watch`(默认 true) 会话连上后自动增量；非 git 子目录需手动重索引（先 `detect_changes` 看 `impacted_total`，非 0 才重索引）。
6. 报告（新增 N / 删除 M / 非 git 重索引 K）。

> `CBM_ALLOWED_ROOT=D:/Documents` 兜底：越界 `index_repository` 会被拒。以 `_` 前缀的探针/临时目录（如 `_officecli_probe`）默认不索引，留给用户决定。

## 4. 15 工具路由表（经 dmcp 暴露，已从 DeusData 实时校正）

| 工具 | 用途 | 关键参数（必需项加粗） | 典型触发 |
|---|---|---|---|
| `index_repository` | 建/刷新仓库索引（加项目的唯一方式） | **`repo_path`**、`mode`(full/moderate/fast/cross-repo-intelligence)、`name`、`persistence`、`target_projects` | 新增子目录、手动刷新 |
| `list_projects` | 列出已索引项目及节点/边规模 | 无 | 对账例程、确认覆盖 |
| `delete_project` | 移除项目及其图数据 | **`project`** | 子目录被删后清陈旧 |
| `index_status` | 查索引状态 + 覆盖报告（parse_partial/skipped/not_indexed） | **`project`**、`verbose` | 排错、信任图前必查 |
| `check_index_coverage` | 权威覆盖元数据：精确路径/前缀范围的可信度（负向/穷举论断前必查） | **`project`**、`paths` 或 `scopes`(二选一)、`scope_limit`/`scope_offset` | 引用/操作文件前；"某文件未出现=不存在"论断前 |
| `search_graph` | 结构化图搜索（BM25 `query` / `name_pattern` / `semantic_query` 三模式可组合） | **`project`**、`query`/`name_pattern`/`semantic_query`(数组)、`label`、`file_pattern`、`limit`/`offset`/`has_more`、`fields`、`format`(tree/json) | 找符号/定义/实现/关系（替代 grep） |
| `trace_path` | BFS 调用链/数据流/跨服务追踪 | **`function_name`**、**`project`**、`mode`(calls/data_flow/cross_service)、`direction`、`depth`、`edge_types`、`cursor`、`limit`、`include_tests`、`include_evidence`、`risk_labels` | "改 X 影响哪些"、找调用者 |
| `detect_changes` | git diff → 爆炸半径（transitive impact，含 impacted_modules 汇总） | **`project`**、`base_branch`、`depth`、`direction`(inbound/outbound/both)、`scope`(files/impact)、`since` | 本地 git 变动 impact |
| `query_graph` | 只读 openCypher 查询（含 `graph="missed"` 查未全索引文件结构） | **`query`**、**`project`**、`graph`(code/missed)、`max_rows` | 复杂多跳/聚合/跨服务 |
| `get_graph_schema` | 节点标签/边类型 schema | **`project`** | 首次必跑，了解图结构 |
| `get_code_snippet` | 按限定名读源码（先 `search_graph` 取 `qualified_name`） | **`qualified_name`**、**`project`**、`include_neighbors` | 看实现 |
| `get_architecture` | 架构概览（languages/packages/routes/hotspots/clusters/cycles） | **`project`**、`aspects`(all/overview/.../cycles)、`path` | 整体理解 |
| `search_code` | 图增强 grep（去重 + 结构排序：定义优先、测试最后） | **`pattern`**、**`project`**、`mode`(compact/full/files)、`file_pattern`、`path_filter`、`limit`、`regex` | 文本定位 |
| `manage_adr` | 架构决策记录 CRUD | **`project`**、`mode`(get/update/sections)、`content` | 沉淀架构决策 |
| `ingest_traces` | 摄取运行时追踪验证 HTTP_CALLS/ASYNC_CALLS 边 | **`project`**、**`traces`**(数组) | 验证异步调用 |

### 4.1 semantic_query 不是独立工具（易错点）
`semantic_query` 是 `search_graph` 的一个**数组参数**（如 `["send","pubsub","publish"]`），结果落在 `semantic_results` 字段，**不是** `call_dynamic_tool` 的 `name`。切勿用 `name="semantic_query"` 调用。

## 5. openCypher 速查（只读子集）
- **子句**：`MATCH` `OPTIONAL MATCH` `WHERE` `WITH` `RETURN` `ORDER BY` `SKIP` `LIMIT` `DISTINCT` `UNWIND` `UNION` `CASE`。
- **节点标签**：`Project` `Package` `Folder` `File` `Module` `Class` `Function` `Method` `Interface` `Enum` `Type` `Route` `Resource`。
- **边类型**：`CONTAINS_*` `DEFINES` `IMPORTS` `CALLS` `CALL_REFERENCE` `USAGE` `IMPLEMENTS` `INHERITS` `MEMBER_OF` `TESTS` `USES_TYPE` `HTTP_CALLS` `ASYNC_CALLS` `SIMILAR_TO` `SEMANTICALLY_RELATED` `CROSS_*`(跨仓库)。
- **示例**：
  ```cypher
  MATCH (f:Function)-[:CALLS]->(g) WHERE f.name = 'main' RETURN g.name
  MATCH (f:Function) WHERE NOT EXISTS { (f)<-[:CALLS]-() } RETURN f.name LIMIT 50
  MATCH (f:Function) WHERE f.file CONTAINS 'parser' RETURN f.name, f.file
  MATCH (f:File) WHERE f.kind = 'parse_partial' RETURN f.file_path, f.detail   // missed graph
  ```
- **不支持**：写操作、`MERGE`、`CALL`、列表/映射字面量、参数（报 `unsupported …`）。`query_graph` 有 100k 行硬上限，`missed` 图用 `graph="missed"`。

## 6. 激活时机与边界（决定本 Skill 是否启用）
> 本 Skill 的激活**全依赖 frontmatter `description` 命中**。激活原则是**按"任务语义"而非"术语关键词"**——用户表述的是研发活动（分析仓库、改代码、定位/修复 BUG、审查/审计、接手项目…），**不会**显式说出"调用链/影响面/死代码"等底层术语；Agent 须由任务语义推断并**默认激活** DeusData 作为认知第一手段，不要等关键词出现。

### 6.1 激活（默认启用 DeusData）—— 用户这类研发活动即激活
凡用户要做的是下列研发活动、且目标代码位于**本地工作树（已索引目录）**，即应**默认激活**本 Skill，把图工具作为理解/导航/影响评估的第一手段（替代盲目全仓 grep 与逐文件 Read，以缩减 Token 消耗、提高定位精度）：
- **分析本地代码 / 程序 / 项目**：分析本地的 GitHub 仓库、分析多级目录嵌套的若干代码文件与技术文档、看懂一个程序项目/模块的结构与实现（`get_architecture` + `search_graph`）。
- **修改代码 / 加功能 / 重构**：动手前先看清"改 X 影响哪些、谁调用/依赖 X"（`trace_path` inbound + `search_graph`），动完再用 `detect_changes` 验证波及（`trace_path`/`detect_changes` 即"评估影响面"的底层能力）。
- **定位 BUG / 修复 BUG / 查找 BUG**：用 `trace_path`(data_flow) 追踪错误来源定位根因、`search_graph` 理解上下文、`get_code_snippet` 看实现、修复后 `detect_changes` 验证未引入回归（`trace_path`/`detect_changes` 即"追踪调用链/本地改动 impact 自检"的底层能力）。
- **审计代码 / 审查代码 / 代码评审**：结构概览、定位可疑实现、找无调用者死代码与循环依赖（`get_architecture` cycles/hotspots + `query_graph` `NOT EXISTS { (f)<-[:CALLS]-() }`）。
- **基于 PR 审查意见核查 / 定位问题**：依审查意见中的符号/文件，用 `search_graph`/`trace_path`/`get_code_snippet` 定位问题代码并评估影响（`search_graph`/`trace_path` 即"理解现有代码/调用链"的底层能力）。
- **接手代码 / 接手项目（onboarding）**：快速建立本地项目心智模型（`get_architecture` + `search_graph`）。

> 上述活动背后的"理解现有代码、评估影响面、追踪调用链、定位死代码、本地改动 impact 自检"是 DeusData 的**底层能力**，由 Agent 在激活后按需调用，**不是**用户要说的触发词。

### 6.2 不激活（例外，仍走对应工具）—— 三类边界
- **A. 纯新增代码**：从零写新文件、无既有图可查 → 直接 Write/Edit（图无数据可查）。
- **B. 写入动作本体**：实际 Write/Edit 写文件、git 写动作（add/commit/push/branch/rebase/merge）→ 走文件系统 / git / gh CLI。DeusData **只读**，不写文件、不执行 git。
- **C. 纯远程 / 运行时**：
  - 未克隆到本地的**远程 GitHub 仓库浏览**（PR/CI/Issue/fork sync/远端 diff/未克隆仓库内容分析）→ 走 `gh` + `github-personal-manager`（DeusData 纯本地、无"远程"概念、不连网）。**细分**：已克隆到本地的仓库内容分析 → 激活；未克隆的远端仓库内容 → 不激活。
  - 运行时调试（断点/日志/profiler）→ 实际运行 + 调试器（DeusData 是静态图，不运行代码、看不到动态行为）。

### 6.3 协同闭环（三段分工，避免越界误用）
```
DeusData（本地图：认知第一手段——理解结构 / 改前看清影响 / 改后验证半径）── 认知
   ↓ 产出"改什么、影响什么、问题在哪"
Write/Edit + git（本地写入 + 本地版本动作）── 产生本地改动
   ↓
gh + github-personal-manager（远程协作：未克隆仓库浏览 / PR / CI / sync）── 推到远程 / 查远端
```
DeusData 负责第一段（认知），命中 §6.1 的活动**默认激活**，命中 §6.2 的例外不激活。

### 6.4 图覆盖不足时的退化
`check_index_coverage` 报 gap、或文件被标记 `parse_partial`/`skipped` 时，**务必再 grep 该范围 / Read 源文件确认精确实现**——"absence from graph" 不是完整性保证。若目标目录尚未索引，先跑第 3 节对账例程补索引再用图。
