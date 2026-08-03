# 七段契约（_router 每步模块统一格式）

> 本文件定义 `_router/step-NN.md` 的统一结构。每个步骤模块**必须**严格按以下七个段落组织，顺序不可调换。其目的是把"散文式自愿遵从"转化为"可机器校验的强制动作"。

---

## 段落定义

### [门禁]（进入前必须校验）
- 列出进入本步骤前必须满足的前提条件。
- **必须**包含：读取 `_流水线状态.md` 指定字段（当前步骤 / 前序产出清单 / 工具能力映射表）。
- 若为**续跑会话**，进入本步骤前还须先完成 RESUME-CHECK（产出物完整性三清单）并按 RESUME-LOAD 契约全量读回前序产出物（详见文末「续跑维度」与 `references/15-resume-protocol.md`）。
- 条件不满足时，**立即暂停并报告**，禁止进入。

### [加载]（仅本步必需）
- 仅列出本步执行所需的 `references/`、`assets/` 文件。
- 列出本步将调用的**逻辑原语**（READ_FILE / WRITE_FILE / FILE_STAT / WEB_SEARCH / WEB_FETCH / AGENT_SEARCH / EXTRACT / SHELL / OFFICE / ANYSEARCH / NATIVE_WEB），并注明其实际工具名来自状态文件「工具能力映射表」；ANYSEARCH 为固定外部命令（硬编码路径，非动态探测），**禁止硬编码平台特定工具名**（ANYSEARCH 的固定命令路径依用户指定硬编码，除外）。

### [执行]（分析动作）
- 本步的核心分析 / 操作逻辑，逐条描述。
- 注明每个逻辑原语的**调用时机、场景、优先工具**。
- 异步操作（如 AGENT_SEARCH）须给出明确的轮询 / 等待示例与终止条件。
- 降级路径：能力缺失或超时时的回退方案。

### [产出] ★（必须写入的精确文件清单）
- **置顶**列出本步必须生成 / 更新的文件及**绝对路径**（运行初由 Gate-0 把 `[输出目录]` 替换为用户给定绝对路径后登记，禁止写 `[输出目录]` 字面占位符）。
- 未产出则本步视为未完成。

### [分片] ★（AI 自管分片）
- 所有文件写入前 AI **自测字符数**。
- `> SAFE_WRITE_LEN`（建议 3000 字符）的内容按**自然段 / 句边界**切分；**禁止**切分代码块 / 表格 / JSON 结构化单元。
- Office 文件写入另须遵循 `references/05-long-file-handling.md` 的批次约束（单段≤3000、每批≤12、单次 shell_exec≤7000）。

### [验证] ★（自检 + 写 §14 登记，三选其一）

本步 [执行] 完成后、[状态] 之前，必须完成"自检"并写入状态文件 §14 登记（设计点 2/3/4/5）。按下游信任模型三级选择：

- **① 下游步骤且前序步骤 N 在 §14 已有"✅通过"登记** → 信任前序，零复检（不读前序文件）。
- **② 本步本就要"功能性全量回读"前序产出**（如 RESUME-CHECK、step-07 重写判读）→ 把完整性判断折叠进这次必读：按 `references/16-self-check-<类型>.md` 标准档必过项校验；通过则**回填** §14 登记；失败按设计点 6 情形B 回退重做前序。
- **③ 本步不功能性回读前序、且前序无登记** → 仅轻检：FILE_STAT 存在性 + 非空（绝对阈值初筛，如 <2KB 视为明显损坏）+ 轻签名（字节/行数 vs 预期）+ 分层强度；不全量回读。发现残缺按设计点 6 情形C 回退。

**本步自身产出自检（设计点 2）**：足迹签名 = FILE_STAT 字节/行数 vs [产出] 声明预期值；结构完整性 = 按类型（A 文本章节数 / B JSON 可解析 / C Office schema / D 检索来源条数）校验。写盘截断（A 类）由签名抓、模型输出截断（B 类）由结构抓。标准档映射：文本/Markdown→`16-self-check-A`、JSON 卡片→`16-self-check-B`、Office→`16-self-check-C`、检索来源→`16-self-check-D`。

**自检通过 → 向 §14 写入"✅通过 + 轻签名 + 子阶段 + 自检时刻"；失败 → 回退重做本步 [执行]→[产出] 后重检，禁止带病进 [状态]。**

### [状态] ★（状态文件更新）
- 使用 `WRITE_FILE` 追加 / 覆盖更新 `_流水线状态.md`：
  - 更新"当前步骤"为"步骤N / 共10步"
  - 追加本步产出到"前序产出清单"（**绝对路径**，见 §4）
  - 更新"待办下一步"为"加载 _router/step-(N+1).md，执行步骤(N+1)"
  - 更新"时间戳"
- **[状态] 更新前，须确认本步 §14 自检登记已写入**（设计点 5 顺序铁律：自检是步骤最后流程，登记是自检最后动作；未写 §14 登记禁止推进）。
- 输出「✅ 步骤N完成，状态文件已更新」。

---

## 逻辑原语 → 默认工具绑定（运行时可被映射表覆盖）

| 原语 | 默认首选（实测✅） | 次选 |
|------|------------------|------|
| READ_FILE | 原生 `local_file_read` | MCP `read_text_file` / `read_multiple_files` |
| WRITE_FILE | 原生 `local_file_write` | MCP `write_file` |
| FILE_STAT | 原生 `local_file_stat` | SHELL `Test-Path` / `test -f` |
| WEB_SEARCH | 直连 `firecrawl_search`（或 `mcp__firecrawl__firecrawl_search`）；中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_search", args={query})` | 原生 `web_search` |
| WEB_FETCH | 直连 `firecrawl_scrape`（或 `mcp__firecrawl__firecrawl_scrape`）；中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_scrape", args={url,formats})` | `fetchWebContent` > 专域器 > `web_fetch` |
| EXTRACT | 直连 `firecrawl_extract`（或 `mcp__firecrawl__firecrawl_extract`）；中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_extract", args={urls,schema})` | `firecrawl_scrape` + 人工 |
| AGENT_SEARCH | 直连 `firecrawl_agent`（或 `mcp__firecrawl__firecrawl_agent`）+ `firecrawl_agent_status(id)`；中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_agent", args={prompt})` + `firecrawl_agent_status(id)` | `firecrawl_search` + `firecrawl_scrape` |
| SHELL | `shell_exec` | — |
| OFFICE | `officecli` | — |
| ANYSEARCH | 固定命令（内嵌自包含）：`uv run --project D:/Tools/Assembly/python/myenv python scripts/anysearch_cli.py`（**基于技能目录的相对路径、非动态探测**；禁止省略 `uv run --project D:/Tools/Assembly/python/myenv` 直接使用 `python`） | — |
| NATIVE_WEB | 原生 `web_search` + `web_fetch` | LLM 原生网页搜索/下载，作为双引擎任一不可用时的补偿通道，保双轨并行 |

> 双轨优先级：**非搜索功能原生 > MCP**；**联网搜索采用 AnySearch + Firecrawl 双引擎平权并行（步骤5）**，LLM 原生 `web_search`/`web_fetch`（NATIVE_WEB）为补偿/降级通道。具体以 `_router/bootstrap.md` 生成的「工具能力映射表」为准。
> **Firecrawl 访问形态（传输无关）**：上表 Firecrawl 相关原语（WEB_SEARCH/WEB_FETCH/EXTRACT/AGENT_SEARCH）的"默认首选"为**双形态**：优先直连 `firecrawl_*`（或平台前缀 `mcp__firecrawl__*`），不可用时经 Dynamic-mcp 中继（`mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_*", args={...})`）。实际绑定以 Gate-0「工具能力映射表」为准（每个原语独立探测，先直连、中继兜底）；中继形态调用前若 `call_dynamic_tool` 不在可用索引，先 `ToolSearch` 重索引。

---

## 续跑维度（Session-Resume Protocol，强制）

本契约在七段之外新增"续跑"维度，应对 LLM 会话限额导致的新开会话接力续跑场景：

- **会话首动作 = RESUME-PROBE，非无条件 Gate-0**：每个新会话的第一步（`_router/bootstrap.md` 最前）必须先 `FILE_STAT` 探测既有状态文件；存在即进入 RESUME 恢复路径，不存在才走 NEW-BUILD 全量新建。禁止无条件重建状态文件（会覆盖前序全部进度）。
- **[门禁] 续跑约束**：若为续跑会话，进入本步骤前**必须**先执行 RESUME-CHECK（产出物完整性三清单：已完成 / 半成品 / 缺失）并全量读回前序产出物（按 `references/15-resume-protocol.md` 的 RESUME-LOAD 契约），再校验本步骤门禁；禁止重跑已完成步骤、禁止覆盖既有产出物。
- **硬完成标志 + 阶段检查点**：步骤完成后除更新"当前步骤/前序产出清单"外，须在状态文件「阶段检查点」写入本步完成标记（易断步骤写子阶段 checkpoint，如步骤5 的 `Kx-AnySearch done`/`Kx-Firecrawl done`、步骤9 的 `N/M 片`），使断点可精确定位。
- **已确认节点 / 决策日志**：步骤1、步骤4 的确认结果须持久化到状态文件「已确认节点」；用户关键决策、微调、临时约束须即时写入「决策日志」，避免仅存于聊天上下文。
- 单会话首次运行流程完全不变（RESUME 为叠加分支）。

- **RESUME-CHECK 须产出可观测标记（防偷懒跳过）**：续跑会话中，本步 [门禁] 完成 RESUME-CHECK 三清单后，**必须**向状态文件「阶段检查点」追加 `RESUME-CHECK 步骤N done`（N=本步序号），并**在回复中显式输出三清单**（已完成 / 半成品 / 缺失）。本步 [验证] 须确认该标记存在；若不存在，视为未执行 RESUME，立即回退重做 RESUME-CHECK 后再进入。该标记使 RESUME 从「被动提醒」变为「主动可校验产物」，断点续跑不可被跳过。

---

## 防稀释维度（Anti-Dilution，强制，覆盖单会话长流程）

应对**单对话会话内上下文稀释 / 注意力转移**（长步骤跨多轮、上下文膨胀导致细则遗忘、后续章节被压缩成"头重脚轻、越写越少"）：

- **长步骤 `[执行]` 段首锚点**：易稀释步骤（步骤5、步骤6）的 `[执行]` 段首**必须**以「本步不可谈判约束」块重述全局硬约束（一行一条），开门即锚定，不依赖步骤边界之外的记忆：
  - 步骤5：双引擎平权并行、每关键词两轨都不得留空、每论点 ≥ 2 独立来源、禁编造、禁第一人称、数据待核实须标注、`[资料X]`/`[搜索X]` 溯源。
  - 步骤6：严格按提纲逐章、每章字数预算不递减、禁编造/模糊表述、矛盾双方同呈、参考资料优先于联网、引用须标原章节位置与来源编号。
- **易稀释步骤每轮次重锚**：步骤5/6 若跨多轮（如步骤5 多个关键词 × 多轮搜索、步骤6 多章撰写），**每个新轮次开头**先重读本步骤 `references` 全局约束 + 状态文件 12 维度参数/全局约束摘要（不依赖聊天上下文），再继续该轮动作。
- **长步骤内部子阶段 checkpoint**：易断长步骤须把"子阶段完成"写入状态文件「阶段检查点」（步骤5 = 每关键词 `Kx-AnySearch done`/`Kx-Firecrawl done`；步骤6 = 每章 `Cx done`），断点可精确定位、续跑仅补缺失子阶段。
- **反稀释加载（步骤6）**：每章仅加载**本章相关**资料卡片子集 + 本章在 `_网络搜索素材.md` 的对应章节段 + 完整 `_提纲.md` + 完整 `_上下文摘要.md`，避免全量加载致约束遗忘；但本章对应搜索素材段须**完整加载**（保证联网补证不漏用、参考资料与搜索成果均被充分采用）。

---

## 路径锚定维度（Path-Anchoring，强制，覆盖所有步骤的本地化输出）

应对**所有步骤在输出到本地目录/文件时，LLM 遗忘/稀释输出目录绝对路径、误用字面占位符或相对路径**的问题（本副本 A 所有产物输出到 `[输出目录]`）：

- **`[输出目录]` 占位符 = 状态文件「全局路径配置·输出目录」的绝对路径**：所有步骤 `[产出]`/`[验证]`/`[分片]`/`[状态]` 中出现的 `[输出目录]` 一律在**执行时**替换为状态文件「全局路径配置·输出目录」的**实际绝对路径**；**禁止保留字面占位符**（会写成名为 `[输出目录]` 的文件夹）、**禁止凭记忆写相对路径**、**禁止凭空生成新目录**。
- **绝对路径钉死在状态文件顶部**：Gate-0 解析后，状态文件标题行须含 `★ 绝对输出目录 = <实际绝对路径>`（见 `assets/_流水线状态.md` 模板首行），每步 [门禁] 首读即见、长步骤每轮次重锚必见。
- **易稀释步骤每轮次重锚须含路径**：步骤5/6 跨多轮时，每个新轮次开头重读本步骤 `references` + 状态文件**全局路径配置（输出目录绝对路径）** + 12 维度参数，不依赖聊天上下文。
- **[验证] 路径校验**：`FILE_STAT` 校验的文件路径须为解析后的**绝对路径**；若发现文件落在字面 `[输出目录]` 目录内（占位符未替换），视为路径错误，立即以状态文件实际输出目录重写该文件，禁止带病进入下一步。
