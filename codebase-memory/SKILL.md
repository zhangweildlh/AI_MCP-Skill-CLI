---
name: codebase-memory
description: 纯本地、离线、只读的代码知识图谱（影响面分析）引擎：将本地已索引工作树构建为调用图/使用图/继承图，提供符号搜索、调用链追踪、影响面评估、死代码定位、本地 git 变动爆炸半径映射等 15 个 MCP 工具。关键词：代码知识图谱、调用链追踪、影响面分析、架构检索、本地索引。当用户要求分析/阅读/修改/重构本地代码、定位/修复 BUG、审计/审查代码、回应 PR 审查意见、接手代码/项目，且目标位于本地已索引工作树时触发；当用户说"理解结构/评估影响面/追踪调用链/定位死代码"时触发。适用于本地研发认知任务（理解结构、改前评估影响、改后验证半径）。不适用于纯新增代码（无既有图可查）、Write/Edit 与 git 写动作本体、未克隆的远程 GitHub 仓库浏览（走 gh + github-personal-manager）、运行时调试；经 dmcp 分组 codebase-memory-mcp 或原生 stdio 直连调用。
metadata:
  version: "2.2.4"
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

   > 路径为**部署态**事实常量（脚本确实位于此路径，见同目录 README §7 开发态/部署态映射）。脚本递归扫描预设根目录（本地文档目录下的 GitHub 仓库根与独立仓库根，深度 3），发现未注册 git 仓库后经 **dmcp HTTP 通道**注册（`call_dynamic_tool(group="codebase-memory-mcp", name="index_repository", …)`）。

   > **通道事实（v0.10.8 实测确立）**：MCP 与 CLI **共享同一 OS 准入屏障**（同版本 / 同可执行构建 / 同协调 ABI / 同 `CBM_CACHE_DIR`），CLI 并非可靠的"兜底"通道——二者任一能用都必须满足全部准入条件。脚本注册前先经 `Test-DmcpGroupConnected` 探查 dmcp 分组连通性：**连不通则跳过 HTTP 注册、直接走本地 exe CLI**；若 dmcp HTTP 业务调用失败，脚本会 best-effort 以本地 exe CLI 作最后一手尝试。因共享屏障，CLI 成功与否不保证；失败时脚本如实回报失败（`status=error` / `partial_success`），**绝不静默成功**。

   结果读取：脚本在同目录写出 `.last_result.json`（含 `new_repos` / `registered` / `failed` / `skipped` 清单）与可选 `watch_git_repos.log`；读取该文件即知本次对账结果。

   退出码：`0`=全部成功或无新仓库；`1`=部分成功（有仓库注册失败）；`2`=前置校验失败（无有效扫描根）。

   需要精细控制单个仓库、或脚本不可用时，再手动对账：`list_projects` 取已索引集合 → 与磁盘一级子目录比对 → 新增走 `index_repository(repo_path=<路径>, mode="moderate")`；磁盘已删除的列清单请用户确认后 `delete_project`。`list_projects` 默认返回精简响应；需完整字段时传 `include_details=true`，并用 `offset`/`limit` 分页（v0.10.8 #1181）。

2. 找符号/定义/实现/关系 → `search_graph`（BM25 `query` / `name_pattern` 正则 / `semantic_query` 向量，三模式可组合）。
3. 评估"改 X 影响哪些 / 谁调了 X" → `trace_path`（别名 `trace_call_path`；`function_name` + `project`，`direction`/`depth`/`mode`）。
4. 本地 git 变动 impact → `detect_changes`（`project`，可选 `since`/`base_branch`/`depth`）。
5. 整体理解 → `get_architecture`（`aspects`）；看实现 → `get_code_snippet`（先 `search_graph` 取 `qualified_name`）。
6. 图覆盖不足或需字面文本 → 退化 `search_code`（图增强 grep）或文件系统 grep。
7. 信任图前必查覆盖：`index_status` / `check_index_coverage`；被标记 `parse_partial`/`skipped` 的文件，务必再 grep 该范围。

调用后端工具时，**直连可用则优先直连** codebase-memory-mcp（原生 stdio MCP：直接 `tools/call` + `name=<后端工具>` + `arguments=<…>`，参数键是 `arguments`）；**直连不可用时降级走 dmcp 中转**——`call_dynamic_tool(group="codebase-memory-mcp", name=<后端工具>, args=<…>)`（注意中转层参数键是 `args`，与直连层的 `arguments` 不同）。若报 `group must be equal to allowed values`，是 dmcp 枚举冻结，重启 dmcp 重连后重试。

**「直连可用」的判定（唯一判据，勿凭猜测）**：直连是否可用，**只能通过实测握手判定，没有静态判据**——引擎二进制 `codebase-memory-mcp.exe` 是否存在、`CBM_CACHE_DIR` 环境变量是否设置、甚至 dmcp 分组是否连通，**都不构成直连可用的证据**（v2.2.4 实测：二进制在、环境变量设了、dmcp 也连得上，直连 stdio 仍可能因 DACL 等 OS 准入屏障不可用）。标准探测流程（**每次会话首次调用前执行一次，结论后续复用，勿每次调用都探测**）：

1. 用原生 stdio 发起 `initialize` 请求：`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"codebase-memory-probe","version":"2.2.4"}}}`，读取响应；
2. 紧接着发 `notifications/initialized` 通知（`method` 必须带斜杠，写成 `"initialized"` 无斜杠会被状态机判为 422、当前 session 作废）；
3. 再发 `tools/list`：**若能取到 15 个后端工具的清单 → 直连可用**，后续一律走直连 `tools/call`；
4. 若以上任一步超时、报错、或返回的工具清单为空 / 不含后端工具（含 `get_graph_schema` 等）→ **直连不可用，立即降级走 dmcp 中转**，且**不要反复重试直连**——MCP 与 CLI 共享同一 OS 准入屏障，重试不会变通，只会白白增加延迟与失败面。

**图边类型（节选，v0.10.8）**：`CALLS`（调用）、`IMPORTS`（导入）、`INHERITS`/`IMPLEMENTS`/`OVERRIDES`（继承/实现/重写）、`EMITS`/`LISTENS_ON`（事件/消息发布订阅，如 Socket.IO、EventEmitter、通用消息总线）、`DATA_FLOWS`（跨服务数据流，含 HTTP 路由 ↔ 调用点、gRPC/GraphQL/tRPC 匹配）、`SEMANTICALLY_RELATED`/`SIMILAR_TO`（语义/近克隆边）、`CROSS_*`（跨仓库边）。`trace_path` 的 `direction` 可选 `inbound`/`outbound`/`data_flow`，排查数据血缘/异常来源用 `data_flow`。

### 2.1 调用事实速查（v0.10.8 实测确立，避免踩坑）

> 本节是**调用事实速查表**，不重复 §2 的流程编排。以下事实由实时协议探测与引擎 schema 拉取坐实，覆盖"调不通 / 解析失败 / 参数报错"三类高频误用。

**① 调用入口与渠道相关**：

- **dmcp 中转层**：绝大多数后端工具经 dmcp 统一走 `call_dynamic_tool(group="codebase-memory-mcp", name=<后端工具>, args=<…>)`；但 `list_groups` 与 `get_dynamic_tools` 是 **dmcp 的 facade-direct 工具**——须直接 `tools/call`、并传 `group="codebase-memory-mcp"` 参数（不能包进 `call_dynamic_tool`，否则报 `unknown tool`）。`get_dynamic_tools` 用于实时拉取 15 工具 schema（含参数定义与是否含 `format`），是调用前查证参数名 / 返回格式的权威来源。
- **原生 stdio 直连**：不经过 dmcp，**直接对 15 个后端工具做 `tools/call`**（`name=<后端工具>` + `arguments=<…>`），**没有** `list_groups` / `get_dynamic_tools` 这两个 facade 工具。需查 schema 时改用引擎自带的 `get_graph_schema` 工具（直连同样直接调用，参数键 `arguments`）。

**② MCP Streamable HTTP 握手事实（v2.2.1 实测确立）**：经 dmcp HTTP 通道（渠道 2）调用时，握手顺序与字段有硬性要求，错一步即连锁失败：

1. **`initialize` 请求**：`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{...}}}`。响应 200，返回 `Mcp-Session-Id` 响应头（UUID）——**后续所有请求必须带该头**，否则 401 `Session not found`。
2. **`initialized` 通知**：`{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}`，**method 必须带斜杠**（`notifications/initialized`，MCP 规范全称）。写成 `"method":"initialized"`（无斜杠）会被 rmcp 状态机判为 `422 Unexpected message, expect initialize request`，当前 session 立即作废，后续所有调用连锁 401。通知本身也要带 `Mcp-Session-Id` 头。
3. **每个 POST 必须带 `Content-Length: <body字节数>` 头**，否则 dmcp 返回 `415 Unsupported Media Type` / `fail to deserialize request body EOF`。
4. **`Accept` 头须同时含 `application/json` 与 `text/event-stream`**，否则 SSE 流可能不返回 `data:` 行。
5. 握手完成后即可正常调用 `tools/list`、`list_groups`、`get_dynamic_tools`、`call_dynamic_tool`。

> 以上同样适用于直连 stdio 渠道（渠道 1）：`initialize` → `initialized`（method 同样须为 `notifications/initialized`）→ `tools/list` → `tools/call`，仅传输层从 HTTP 换成 stdin/stdout pipe。

**③ 响应信封层数因渠道而异**：

- **dmcp 中转（`call_dynamic_tool`）= 双层信封**：外层是 facade 信封 `result.content[0].text`，其内还包一层引擎信封 `{"content":[{"text":"<真实 JSON 或文本>"}]}`。需二次解析才得真实数据：先取 `result.content[0].text`，尝试 `ConvertFrom-Json`；若内层 `content[0].text` 仍是 JSON 则再解一层，否则即为人类可读文本协议（compact tree）。
- **原生 stdio 直连 = 单层信封**：直接 `tools/call` 返回的 `result.content[0].text` **就是**引擎产出的真实数据（JSON 或文本协议），**无需二次解析**，不要套用中转层的解包逻辑（否则会把真实 JSON 当成字符串再包一层，导致解析失败）。

**④ 各工具返回格式**：

| 返回格式 | 工具 |
|---|---|
| 人类可读文本协议（compact tree，默认，token 经济） | query_graph / get_architecture / search_code / get_code_snippet / check_index_coverage |
| JSON-native（始终返回 JSON） | list_projects / index_status |
| 文本协议，但支持可选 `format:"json"`（enum=tree\|json，默认 tree） | search_graph / trace_path / detect_changes |
| **接受但不建边**（v0.10.8 实测） | `ingest_traces` 返回 `status:"accepted"`，但 `note:"Runtime edge creation from traces not yet implemented"`——**接受 traces 输入，当前不产出任何图边**。若调用方期望"提交 traces 后图中出现新边"，当前会落空；不得把 `status=accepted` 误读为"边已建好" |

> 文本协议可直接消费（为 LLM token 经济性优化）；仅在需程序化抽取 / 再加工某工具结果时，对 search_graph / trace_path / detect_changes 传 `format:"json"`。

**⑤ 关键参数名速查（避免 "X is required"）**：

| 工具 | 易错点 | 正确参数 | 类型 | 必填 |
|---|---|---|---|---|
| query_graph | 误用 `cypher` | `query`（openCypher 语句） | 字符串 | 是 |
| search_code | 误用 `query` | `pattern`（正则） | 字符串 | 是 |
| check_index_coverage | 缺 `paths`/`scopes` | 传 `paths`（字符串数组，≤128）或 `scopes`（字符串数组，≤32） | 字符串数组 | 二选一 |
| trace_path | — | `function_name`（非 name） | 字符串 | 是 |
| get_code_snippet | — | `qualified_name`（先用 search_graph 取） | 字符串 | 是 |
| list_projects | — | 完整字段传 `include_details=true`（布尔）+ `offset`（整数）/`limit`（整数）分页 | 布尔/整数 | 否 |

> 其余工具的完整参数定义（含默认值、取值范围、可选字段）以实时 `get_dynamic_tools` 拉取结果为准——上游演进后按实时结果调用即可，不依赖任何静态文档（与 §6 边界第 4 条一致）。

**⑥ 常见报错与处置**：

| 报错 | 成因 | 处置 |
|---|---|---|
| `group must be equal to allowed values` | dmcp 分组枚举冻结 | 重启 dmcp 重连后重试 |
| `unknown tool` | 把 facade-direct 工具（get_dynamic_tools / list_groups）包进了 call_dynamic_tool | 改为直接 `tools/call` + `group` 参数 |
| `query is required` / `pattern is required` / `paths or scopes is required` | 参数名错（见④） | 改用正确参数名 |
| `无效的 JSON 基元` / 解析失败 | 把文本协议当 JSON 解析 | 文本协议非 JSON；按②先取 text，失败则视为文本 |
| 空结果但应有数据 | 图覆盖不足或项目未索引 | 先 `check_index_coverage` / `index_status` 确认覆盖：若返回覆盖缺口（`parse_partial`/`skipped`/`not_indexed`），退化 grep 该范围；若覆盖正常但仍无结果，视为图中确实不存在 |
| `422 Unexpected message, expect initialize request` | **initialized 通知的 method 写错**：写成 `"method":"initialized"`（无斜杠）会被 rmcp 状态机拒收，后续所有调用连锁 401 `Session not found` | **必须用 `"method":"notifications/initialized"`**（MCP 规范全称，带斜杠）；通知也要带 `Mcp-Session-Id` 头。收到 422 后当前 session 已废，须重新 `initialize` 取新 session 再走完整握手 |
| `401 Unauthorized: Session not found` | 上游 422 的连锁反应，或 `initialize` 后未发 `notifications/initialized` 就直接调工具 | 按上一行修好 method 即可；若仍 401，检查是否漏发 initialized 通知、或是否漏带 `Mcp-Session-Id` 头 |
| `415 Unsupported Media Type` / `fail to deserialize request body EOF` | 请求缺 `Content-Length` 头，dmcp 无法解析 body | 每个 POST 都必须带 `Content-Length: <body字节数>` |

**⑦ 双渠道实测结论（v2.2.1，2026-09-06）**：两个调用渠道均已端到端实测通过，且共享同一套握手规则：

- **渠道 1（直连 stdio）**：`Popen([EXE], stdin/stdout PIPE)` → `initialize` → `notifications/initialized` → `tools/list` → `tools/call`。实测通过：`list_projects`（8 项目）、`index_status`（8/8 全部 `status=ready`）、`get_graph_schema`。Windows pipe 不支持 `select.select`，须用 `threading.Thread` + `queue.Queue` 异步读 `proc.stdout.readline()`。
- **渠道 2（dmcp HTTP 中转）**：`http.client` 持久连接 → `initialize`（取 `Mcp-Session-Id`）→ `notifications/initialized`（带 session 头）→ `list_groups`（facade-direct）→ `get_dynamic_tools`（facade-direct）→ `call_dynamic_tool(index_status / list_projects / search_graph / trace_path / get_architecture / check_index_coverage)`。实测通过：8 项目全部 `status=ready`，节点 4,908–23,475 / 边 4,339–124,995；`search_graph` 返回 15 条命中；`get_architecture` 返回 14 类节点标签 / 20 类边类型。
- **信封解包（按渠道区分）**：渠道 2（dmcp 中转）的 `call_dynamic_tool` 返回 `result.content[0].text`，其内可能再包一层 `{"content":[{"text":...}]}`，需二次解析——先整块 `json.loads`，失败再逐行回退（SSE `data:` 行 / 逐行 `{` 起始）；渠道 1（直连 stdio）的 `result.content[0].text` **就是**引擎真实数据，直接消费即可。`initialize` 响应无 `content` 字段，直接取 `result`。
- **`index_status` / `check_index_coverage` / `search_graph` / `trace_path` 均需 `project` 参数**（从 `list_projects` 取到的项目名，如 `D-Documents-AI_MCP-Skill-CLI`），漏传报 `missing required argument: project`。

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
