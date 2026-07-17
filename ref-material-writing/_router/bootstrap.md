# Gate-0 引导：工具能力探测与状态文件预建

> 本模块在**会话开始、步骤1 之前**执行一次。目标是消除"能力不确定性"——在开局即确认全部逻辑原语（9 个动态探测原语 + 固定调用原语 ANYSEARCH）的可用工具，并把绑定关系写入状态文件，后续所有步骤模块只引用映射表，不硬编码工具名。

---

## [门禁]
- 无（本模块为流程最前置步骤）。
- 前置条件：已获得用户输入（写作需求 + 参考资料），但尚未开始步骤1。

## [加载]
- `references/02-environment-setup.md`（全局环境约束、外部命令前置流程）
- `assets/_流水线状态.md`（状态文件模板）
- 逻辑原语：SHELL、READ_FILE、WRITE_FILE、FILE_STAT、WEB_SEARCH、WEB_FETCH、AGENT_SEARCH、EXTRACT、OFFICE、ANYSEARCH、NATIVE_WEB

## [执行]

### 0. 续跑探测（RESUME-PROBE，会话首动作）

在环境探测之前，先判定本会话是"续跑"还是"全新"：

1. `FILE_STAT([输出目录]/_流水线状态.md)`。
2. **若不存在** → 跳至「### 1. 环境探测」走 NEW-BUILD 全量新建（原 Gate-0 逻辑完全不变）。
3. **若存在** → 进入 RESUME 恢复路径（详见 `references/15-resume-protocol.md`）：
   - 全量读 `_流水线状态.md`，解析当前步骤、前序产出清单、已确认节点、决策日志、双引擎能力状态。
   - 执行 RESUME-CHECK：对当前步骤之前的每一步 `FILE_STAT` 校验产出物存在性 + 最小完整性，生成「已完成 / 半成品 / 缺失」三清单。
   - **刷新能力字段不覆盖**：重探工具能力映射表与双引擎能力（环境可能变），仅更新能力相关段，不动全局参数/前序产出清单/决策日志；Firecrawl 绑定形态（直连或中继经 Dynamic-mcp）按状态文件「工具能力映射表」决定，若为中继形态且 `call_dynamic_tool` 不在可用索引先 `ToolSearch` 重索引。
   - 输出 RESUME-BRIEF 引导语：已完成步骤、待续步骤、断裂点子阶段、需全量读回文件列表、双引擎能力重探结果、需用户补充项（若有）。
   - **禁止重跑已完成步骤、禁止覆盖既有产出物、禁止重建状态文件全局参数**；从断点步骤的子阶段继续。

### 1. 环境探测
1. 调用 `shell_status` 查询本地 Shell 环境；当为 Windows + PowerShell 时遵循 `references/02` 的全局约束。
2. 解析路径占位符：确认 `[当前工作目录]`、`[输出目录]`、`[Skill技能目录]/[name]` 的实际绝对路径（依 `references/02` 第 2–5 条）；其中 `[输出目录]` 解析结果**须钉入状态文件标题行**（`★ 绝对输出目录 = <实际路径>`，见 `assets/_流水线状态.md` 模板首行）与「全局路径配置·输出目录」，供所有步骤 [产出]/[验证] 直接替换 `[输出目录]` 占位符使用；禁止 LLM 凭记忆生成输出路径。

### 2. 工具能力映射表（★重点：FILE_STAT 优先确认）
对**全部逻辑原语**逐一探测，构建映射表（ANYSEARCH 为固定外部命令，不动态探测，直接登记硬编码调用命令）。探测方法：尝试调用 / 查询该原语的首选与次选工具，确认其可用。

| 原语 | 探测动作 | 绑定结果（选首个可用的） |
|------|----------|------------------------|
| FILE_STAT | 尝试 `local_file_stat` → 否则 SHELL `Test-Path` | **必须**确认存在；缺失则立即绑定 SHELL `Test-Path`/`test -f` 并记入映射表 |
| READ_FILE | 尝试 `local_file_read` → MCP `read_text_file` | 绑定实际可用工具 |
| WRITE_FILE | 尝试 `local_file_write` → MCP `write_file` | 绑定实际可用工具 |
| WEB_SEARCH | 尝试直连 `firecrawl_search`（或 `mcp__firecrawl__firecrawl_search`）→ 否则中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_search", args={query})` → 原生 `web_search` | 绑定实际可用工具 |
| WEB_FETCH | 尝试直连 `firecrawl_scrape`（或 `mcp__firecrawl__firecrawl_scrape`）→ 否则中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_scrape", args={url,formats})` → `fetchWebContent` → `web_fetch` | 绑定实际可用工具 |
| AGENT_SEARCH | 尝试直连 `firecrawl_agent`（或 `mcp__firecrawl__firecrawl_agent`）+ `firecrawl_agent_status(id)` → 否则中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_agent", args={prompt})` + `firecrawl_agent_status(id)` → 降级 `firecrawl_search`+`firecrawl_scrape` | 绑定实际可用工具 / 降级链 |
| EXTRACT | 尝试直连 `firecrawl_extract`（或 `mcp__firecrawl__firecrawl_extract`）→ 否则中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_extract", args={urls,schema})` → `firecrawl_scrape` | 绑定实际可用工具 |
| SHELL | 确认 `shell_exec` 可用 | 固定 |
| OFFICE | `where.exe officecli` → `officecli --version` → `officecli --help` | 固定 `officecli`；不可用则标记，步骤9 降级 `.md` |
| ANYSEARCH | 固定外部命令（**非探测**，直接登记）：`uv run --project D:/Tools/Assembly/python/myenv python D:/Documents/AI_MCP-Skill-CLI/anysearch-skill/scripts/anysearch_cli.py`（路径硬编码；禁止省略 `uv run --project D:/Tools/Assembly/python/myenv` 直接用 `python`）。依赖其目录内 `.env` 的 API key，无需在命令中传 key | 固定 |
| NATIVE_WEB | 原生 `web_search` + `web_fetch`（LLM 自带） | 双引擎（AnySearch / Firecrawl）任一不可用时的补偿通道，保双轨并行；二者皆不可用则单轨原生 |

> **FILE_STAT 前置原则**：FILE_STAT（或等价验证工具）是整套验证闸门的基石。若开局未发现任何可用验证手段，**立即暂停并报告**，不得进入步骤1——因为后续所有"产出→验证"闭环将形同虚设。

> **双引擎能力登记（步骤5 用）**：在映射表中额外记录 AnySearch 与 Firecrawl 的可用状态与访问形态（直连 / 中继经 Dynamic-mcp / 不可用）。步骤5 据此决定双轨组合：双可用→AnySearch+Firecrawl；任一不可用→可用引擎 + NATIVE_WEB 补偿（仍双轨）；双不可用→仅 NATIVE_WEB 单轨。判定方式：AnySearch 用 `uv run ... anysearch_cli.py doc` 能否返回接口说明；Firecrawl 先探测直连 `firecrawl_search`（或 `mcp__firecrawl__firecrawl_search`）可用否，否则探测中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_search", args={query})` 可用否（索引缺失先 `ToolSearch` 重索引）；任一可用即记 Firecrawl=可用并注明形态。

> **Firecrawl 访问形态（传输无关，重要）**：Firecrawl 的访问形态（直连 / 中继经 Dynamic-mcp）由本步实际探测决定并写入「工具能力映射表」，不写死单一形态。① 直连：工具集直接出现 `firecrawl_*`（或平台前缀 `mcp__firecrawl__*`），直接调用，无索引驱逐问题。② 中继：经 Dynamic-mcp 门面，`list_groups` 列组并定位 Firecrawl（组名默认 `firecrawl-mcp`，以实际返回为准）→ `get_dynamic_tools(group=该组)` 拉说明 → `call_dynamic_tool(group=该组, name="firecrawl_*", args={...})` 调用；connector 重连会丢 `call_dynamic_tool` 索引，须先 `ToolSearch` 重索引。每个 Firecrawl 原语（WEB_SEARCH/WEB_FETCH/AGENT_SEARCH/EXTRACT）独立探测，优先直连、中继兜底；映射表中登记为**实际探测到的形态**，不强制单一形态。

### 3. officecli 前置验证（Help-First）
- 执行 `where.exe officecli` 获取路径；`officecli --version` 获取版本；`officecli --help` 获取权威 schema。
- **版本差异声明**：officecli 命令参数随版本变化，任何命令失败必须 `officecli --help`（或 `officecli help docx <element>`）取当前版本权威帮助后重试，禁止凭记忆硬编码 flag。

### 4. 写入工具能力映射表
将探测结果整理为「工具能力映射表」，作为状态文件的一个独立字段（建议置于"全局参数"下或单独小节），供所有步骤模块引用。

## [产出]
- `[输出目录]/_流水线状态.md`（**提前创建**，含：当前步骤="Gate-0 / 引导"、全局参数含「工具能力映射表」、全局路径配置、全局约束摘要、验证状态、时间戳）。

## [分片]
- 本步产出为单一状态文件，无需分片。

## [验证]
- 使用 `FILE_STAT`（或映射表等价替代）确认 `[输出目录]/_流水线状态.md` 已存在。
- 确认"工具能力映射表"字段已写入且 FILE_STAT 已绑定。

## [状态]
- 本模块即状态文件的创建者；创建后输出「✅ Gate-0 完成，状态文件已创建，工具能力映射表已写入」。
- 待办下一步：「加载 `_router/step-01.md`，执行步骤1」。
- 时间戳：通过 `Get-Date -Format 'yyyy-MM-dd-HH-mm-ss'`（PowerShell）获取并写入。
