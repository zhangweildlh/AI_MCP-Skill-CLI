# 步骤5：信息缺口识别与联网验证补全（AnySearch + Firecrawl 双引擎）

> 对应原 `references/08-workflow-phase2.md` 步骤5。遵循 `_router/_contract.md` 六段契约。
> **本步骤强制联网补全，采用 AnySearch 与 Firecrawl 双引擎平权并行**：两者优先级相同、互不替代、结果合并。执行顺序为「先跑完 AnySearch，再跑 Firecrawl」，两引擎结果互不影响（顺序执行 + 结果合并）。

---

## [门禁]
- 已读取状态文件，确认"当前步骤=步骤4 / 共10步"，`_提纲.md` 已生成并确认。
- 已读取「工具能力映射表」，确认双引擎能力状态（AnySearch / Firecrawl 可用与否）与降级通道（NATIVE_WEB）已登记。
- 已读取 12 维度核心参数（写作主题 / 写作目的 / 写作思路 / 提纲），用于本步垂直领域判定。
- 续跑会话须先 RESUME-CHECK（产出物三清单 + 全量回读，见 `_contract.md` 续跑维度 / `references/15-resume-protocol.md`）。

## [加载]
- 状态文件"前序产出清单"：`_提纲.md`、所有 `_card_[资料ID].json`、`_交叉引用结果.json`
- `references/10-parameters-schema.md`（信息缺口量化阈值：每论点≥2 独立来源，每章≥3 引用）
- `assets/_流水线状态.md`
- 逻辑原语：READ_FILE、WRITE_FILE、FILE_STAT、WEB_SEARCH、WEB_FETCH、AGENT_SEARCH、EXTRACT、ANYSEARCH、NATIVE_WEB
- **AnySearch 固定调用命令（硬编码，禁止改动）**：
  `uv run --project D:/Tools/Assembly/python/myenv python D:/Documents/AI_MCP-Skill-CLI/anysearch-skill/scripts/anysearch_cli.py <子命令> [选项]`
  ⚠️ 严禁省略 `uv run --project D:/Tools/Assembly/python/myenv` 而直接使用 `python D:/Documents/AI_MCP-Skill-CLI/anysearch-skill/scripts/anysearch_cli.py`。API key 由该目录内 `.env` 自动加载，无需在命令传参。
  > **⚠️ 路径分隔符（U1 修复，强制）**：本命令路径**统一用正斜杠 `/`**（如 `D:/Tools/...`）。若 `shell_exec` 宿主为 Bash（Git Bash 等 POSIX shell），反斜杠 `\` 会被 Bash 当作转义字符导致路径被吃字符、命令失败；**正斜杠在 Bash 与 PowerShell 宿主下均可用**，故此命令及本步骤所有命令路径一律写正斜杠（PowerShell 宿主下反斜杠虽可用，但为跨宿主一致，统一正斜杠）。

## [执行]

> **本步不可谈判约束（每轮次开门即锚定，见 `_contract.md` 防稀释维度）**：
> 1. 双引擎（AnySearch + Firecrawl）平权并行、互不替代；**每关键词两轨都不得留空**。
> 2. 每关键论点 ≥ 2 个独立来源相互印证（满足 `min_independent_sources_per_claim: 2`）。
> 3. 严禁编造；禁第一人称；数据无法核实须标「[数据待核实]」。
> 4. 所有采用信息须标注来源引擎标签 `[搜索K{序号}-AnySearch]`/`[搜索K{序号}-Firecrawl]`/`[搜索K{序号}-Native]`（K=关键词序号，与状态文件「阶段检查点·关键词级」`Kx-*` 一致）与关联资料 `[资料X]`。
> 5. 每轮次（尤其跨多关键词 × 多轮）开始前先重读本段约束 + 状态文件 12 维度参数，不依赖聊天上下文。

### 5.1 读取前序输入
读取 `_提纲.md`、所有 `_card_[资料ID].json`、`_交叉引用结果.json`，并读取状态文件中的 12 维度核心参数（写作主题 / 写作目的 / 写作思路 / 提纲）。

### 5.2 信息缺口识别（5 类）
| 缺口类型 | 判定标准 |
|----------|----------|
| 政策缺少 | 相关章节未引用任何政策文件 |
| 事实缺失 | 关键事件 / 时间节点 / 案例无记载 |
| 数据不全 | 应量化指标无具体数值或仅一份来源 |
| 论据不足 | 佐证关系数 < 2 条 |
| 概念定义不明确 | 专业术语无明确定义 |

### 5.3 制定搜索计划
- 每个缺口生成 3–5 个精准关键词 / 组合（主题词 + 限定词），优先中文。
- **建立「关键词 × 双引擎」执行矩阵**：每个关键词均须分别经过 AnySearch 与 Firecrawl 两条引擎轨道，**两轨都不得留空**。

### 5.4 垂直领域判定（仅 AnySearch 轨道，由 AI 自主决策）
- **判定依据**：本步读取的 12 维度参数——写作主题、写作目的（诉求）、写作思路、以及 `_提纲.md` 章节标题与关键词。AI 据此**自行分析并判断本次任务涉及哪些 AnySearch 垂直领域**（finance / business / legal / academic / health / energy / environment / agriculture / travel / film / gaming / security / ip / code / social_media / resource 等）。
- **执行（一次性、会话内缓存）**：对判定出的每个领域调用一次
  `uv run --project D:/Tools/Assembly/python/myenv python D:/Documents/AI_MCP-Skill-CLI/anysearch-skill/scripts/anysearch_cli.py get_sub_domains --domains 领域1,领域2,...`
  解析返回的子领域（sub_domain）及其必填参数，会话内缓存，**不重复调用**。
- 后续 AnySearch 搜索优先选用匹配的垂直子领域；纯百科类可走通用搜索（omit --domain）。

#### 5.4.1 实证结论（中文任务特别规则，须固化）
AnySearch 垂直域多为**美国 / 国际向**（例：`legal`=US Congress、`environment`=aqi、`business`/`energy` 等），**无中国国策 / 标准类垂直域**。因此：
- 涉及**中文政策文件**（HJ / GB 编号、国发 / 环发 / 生态环境部令等文号）、**中国国家标准 / 行业标准**的检索，**不走垂直域**，直接 `uv run ... anysearch_cli.py search "关键词" --max_results 10`（omit `--domain`），避免误判空域导致检索失败。
- 仅在任务主题确属上述国际向领域（如跨国企业财报、美股代码、国际学术文献）时，才按 5.4 正常走 `get_sub_domains` → 垂直搜索。
- 该结论须在 `references/13-anysearch-integration.md` 固化，避免续跑会话中 AI 误判中文政策为垂直域。

### 5.5 执行联网搜索与内容获取（★双引擎顺序执行 + 结果合并）

对**每个关键词**，严格按以下顺序执行，两条轨道结果**独立、互不干扰、最后合并**：

#### 轨道 A — AnySearch（先跑完）
对每个关键词执行 2 轮（不足可再 1 轮，最多 3 轮）：
1. **通用 / 垂直搜索**：
   - 通用：`uv run --project D:/Tools/Assembly/python/myenv python D:/Documents/AI_MCP-Skill-CLI/anysearch-skill/scripts/anysearch_cli.py search "关键词"`
   - 垂直（命中 5.4 判定领域）：`uv run --project D:/Tools/Assembly/python/myenv python D:/Documents/AI_MCP-Skill-CLI/anysearch-skill/scripts/anysearch_cli.py search "关键词" --domain X --sub_domain Y [--sub_domain_params '{...}']`
   - 多关键词并行（单条命令内）：`uv run ... anysearch_cli.py batch_search --query "词1" --query "词2" ...`（或用 `--queries @file.json`，单调用 2–5 条）
2. **正文抓取**：对搜索结果中需深读的高价值 URL 调用
   `uv run ... anysearch_cli.py extract "https://..."`（HTML 全文转 Markdown，截断 50k 字符）
3. 将本轮结果以标签 **`[搜索K{序号}-AnySearch]`** 暂存（K=关键词序号）。

#### 轨道 B — Firecrawl（AnySearch 全部轮次完成后再跑，结果不相互影响）
> **调用形态（依映射表）**：Firecrawl 调用形态依状态文件「工具能力映射表」记录的形态（直连或中继经 Dynamic-mcp）。直连形态：直接调用 `firecrawl_*` 工具（或平台前缀 `mcp__firecrawl__*`），无需 Dynamic-mcp、无索引驱逐问题。中继形态：先用 `mcp__Dynamic-mcp__get_dynamic_tools(group="firecrawl-mcp")` 确认工具存在、定位组名（以 `list_groups` 实际返回为准）；若 `call_dynamic_tool` 不在可用索引先 `ToolSearch` 重索引；所有调用形如 `mcp__Dynamic-mcp__call_dynamic_tool(group="<实际组名>", name="<工具名>", args={<参数>})`。详见 `references/14-firecrawl-guide.md` 与 `references/02-environment-setup.md`。
> **⚠️ 索引重索引协议（仅中继形态强制）**：Dynamic-mcp 会在**每次** `call_dynamic_tool` 调用后回收其 deferred 索引，下次调用前必须重新 `ToolSearch` 重索引，否则报 "not found in deferred tools index"。因此**中继形态下每个 Firecrawl 调用前都先 `ToolSearch` 重索引**；直连形态无此限制。详见 `references/14-firecrawl-guide.md`。

对每个关键词执行 2 轮（不足可再 1 轮，最多 3 轮）：
1. **首选 AGENT_SEARCH（`firecrawl_agent`）自主多站研究（异步轮询）**：
   ```
   # Firecrawl 轨道首选 AGENT_SEARCH（异步多站研究）。调用前缀依映射表形态切换：
   # —— 中继形态（经 Dynamic-mcp）：须 ToolSearch 重索引后再调用，组名以 list_groups 实际返回为准 ——
   ToolSearch(tool_names=["mcp__Dynamic-mcp__call_dynamic_tool"])   # 每次调用前重索引
   TASK = call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_agent",
                            args={prompt="针对缺口[主题/年份/指标]做多站研究，给出可引用来源URL与关键数据",
                                  model="spark-1-pro", maxCredits=50})
   NEXT_TURN:
     ToolSearch(tool_names=["mcp__Dynamic-mcp__call_dynamic_tool"])
     status = call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_agent_status", args={id: TASK.id})
     IF status=="completed": result = read_agent_result(TASK.id); GOTO done
     IF status IN {"failed","expired"}: GOTO fb
     IF status=="processing": 再重索引 + 再查（最多补偿 2 次）；仍 processing → GOTO fb
   done:

   # —— 直连形态（平台直接连接 Firecrawl-MCP，工具为 firecrawl_* / mcp__firecrawl__*）：无需 Dynamic-mcp、无索引驱逐、无需重索引 ——
   TASK = firecrawl_agent(prompt="针对缺口[主题/年份/指标]做多站研究，给出可引用来源URL与关键数据",
                           model="spark-1-pro", maxCredits=50)
   status = firecrawl_agent_status(id=TASK.id)   # 异步轮询（最多 30 次），completed→取结果；failed/expired→GOTO fb
   ```
   - 参数说明：`prompt` 必填（≤10000 字符）；`model` 默认 `spark-1-pro`（复杂研究可 `spark-1-mini` 提速）；`maxCredits` 设预算上限控成本；**无 `max_steps` 参数**（原 step-05 写法已废弃）。返回 `task_id`。**回读协议（仅中继形态适用，抗索引驱逐）**：提交后，在**下一回合**先 `ToolSearch` 重索引，再单轮 `call_dynamic_tool(...agent_status...)` 回读；若 `processing` 则再重索引 + 再查（最多补偿 2 次），仍 `processing` 或 `failed/expired` → 降级 fb。**严禁在单回合内紧循环轮询**（此限制仅适用中继形态：每次调用后索引会被回收，循环必败）；**直连形态无索引驱逐，可在单回合内轮询** `firecrawl_agent_status(id)` 至 `completed`（见上方直连示例，最多 30 次）。
2. **降级 fb（agent 超时/失败）**：不得静默跳过，改用 `WEB_SEARCH`（`firecrawl_search`，取前 10→按权重取前 5）+ `WEB_FETCH`（`firecrawl_scrape` 抓正文）。来源权重：政府官网(.gov.cn) > 学术文献 > 权威媒体 > 行业协会 > 大型咨询公司 > 其他。
3. 将本轮结果以标签 **`[搜索K{序号}-Firecrawl]`** 暂存（K=关键词序号）。

> **顺序与独立性规则**：先完整跑完轨道 A（AnySearch 全部轮次），再启动轨道 B（Firecrawl）。两轨道的结果不互相影响、不互相依赖，最终统一合并入 `_网络搜索素材.md`。

> **关键词级 checkpoint（跨会话续跑）**：每关键词的轨道 A、轨道 B 各自完成后，立即向状态文件「阶段检查点」追加 `Kx-AnySearch done` / `Kx-Firecrawl done`（x=关键词序号）。中途会话耗尽时，新会话凭此 checkpoint 仅补跑缺失 / 半成品关键词，不重做已完成者。详见 `references/15-resume-protocol.md`。
> **禁止「异步省略」**：若 `firecrawl_agent` 异步因索引不稳无法回读，必须降级 `firecrawl_search`（fb 路径）补全该关键词的 Firecrawl 轨道，状态文件记 `Kx-Firecrawl done`（或 `Kx-Firecrawl fb-done`）；**不得让 Firecrawl 轨道留空**，否则双引擎代表性不达标。

#### 双引擎降级 / 补偿（保双轨）
依据状态文件「工具能力映射表」登记的双引擎能力：
- **双可用**：轨道 A=AnySearch，轨道 B=Firecrawl（上述标准流程）。
- **AnySearch 不可用**：轨道 A=Firecrawl，轨道 B=NATIVE_WEB（LLM 原生 `web_search` + `web_fetch`）——仍双轨并行，顺序为「先 Firecrawl 后 NATIVE_WEB」。
- **Firecrawl 不可用**：轨道 A=AnySearch，轨道 B=NATIVE_WEB——仍双轨并行，顺序为「先 AnySearch 后 NATIVE_WEB」。
- **双不可用**：仅 NATIVE_WEB 单轨（LLM 原生 `web_search` + `web_fetch`），并在素材中标注「[单轨原生搜索]」。

### 5.5.1 单工具不稳/失败的三级接力协议（工具级，保缺口不漏）

> **与 §5.5「双引擎降级/补偿」的关系**：§5.5 处理"**整个引擎不可用**"（能力映射表登记）；本小节处理"**引擎可用、但其某个具体工具在本次调用中不稳/失败**"的更细粒度情形。两者叠加，确保任一缺口的搜/抓/研究都能闭合。

**核心规则（每缺口、每功能逐项适用）**：
1. **一级接力（跨引擎同功能）**：若 `AnySearch` 的某功能工具（如 `extract` 抓取、或 `search` 不稳/失败）立即改调用 `Firecrawl` 的**同功能**工具接力（`extract`↔`firecrawl_scrape`/`firecrawl_agent`、`search`↔`firecrawl_search`）；反之若 `Firecrawl` 某工具不稳/失败，立即改调 `AnySearch` 同功能工具接力。两引擎都可用时，此接力是默认行为，不等待、不静默跳过。
2. **二级接力（LLM 原生同功能工具）**：若 `AnySearch` 与 `Firecrawl` 的**该功能工具都不稳/失败**，调用 LLM 自带同功能工具接力：`web_search`（对应搜索）、`web_fetch`（对应抓取/抽取）。LLM 原生工具视为与双引擎平级的第三轨。
3. **三级跳过（记录 + 末报）**：若 LLM **无此同功能工具**或该原生工具**也不稳/失败**，则**跳过该具体工作**（不得卡死、不得编造），并将该跳过事件记入 `_流水线状态.md`（如「⚠️ 缺口[X]的[抽取]因 AnySearch+Firecrawl+LLM 均失败，已跳过」），同时在该关键词素材条目标「[数据待核实]」并注明原因；**在整个任务（步骤1→10）全部完成后，以自然语言向用户详细报告所有被跳过的缺口及原因**。

**功能→工具映射表（接力对齐依据）**：

| 功能 | AnySearch | Firecrawl（直连或中继，形态见映射表） | LLM 原生（NATIVE_WEB） |
|------|-----------|------------------------------|--------------------------|
| 关键词/网页搜索 | `search` / `batch_search` | `firecrawl_search` | `WEB_SEARCH`（WebSearch） |
| 网页正文抓取/抽取 | `extract` | `firecrawl_scrape` / `firecrawl_agent` | `WEB_FETCH`（WebFetch） |
| 多站深度研究 | （无独立 agent；退化为多次 `search` + `extract`） | `firecrawl_agent` | 多次 `WebSearch`+`WebFetch` 迭代（无独立 agent 工具） |

- **判定"不稳/失败"**：调用超时、返回空壳/报错（如 `Error:`、agent `failed/expired`、extract 4xx/5xx、返回内容与请求无关）、或连续 2 次重试仍异常，即视为该工具本次失效，触发接力。
- **不得留空**：经三级接力后，该缺口的该功能的"结果"要么来自某一轨、要么明确"已跳过并记入状态文件 + 末报"，**绝不允许静默丢弃不记录**。
- **状态文件记录位置**：接力跳过事件写入「验证状态」或「待办下一步」均可，关键是**可回溯**；末报为用户交付前的强制动作（步骤10 收尾或全流程结束的自然语言汇报中单列"跳过的联网缺口"一节）。

### 5.6 交叉验证与采信规则（含双引擎互证）
- **双引擎互证（最高级）**：同一事实 / 数据**同时**被 AnySearch 与 Firecrawl（或任一引擎与 NATIVE_WEB 补偿轨道）命中且一致 → 标 ✅ **双引擎互证**，采信优先级最高。
- **刚性要求**：每条信息仍须 ≥ 2 个独立来源相互印证（满足 `min_independent_sources_per_claim: 2`）。
- 例外：唯一官方一级政府官网信息可单源采用，标 ⚠️ 单源权威。
- 标注：✅ 双引擎互证 / ✅ 多源验证通过 / ⚠️ 单源权威 / ❌ 未通过→标「[数据待核实]」。

### 5.6.1 与用户输入参考资料的关联分析（轻量复用步骤2/3 逻辑，强制）
- **目的**：联网补证不是与参考资料"平行"的独立集，而须**集成进证据链**——每条采用的搜索结果须回链到用户参考资料（哪些 `[资料X]` 的论点被其佐证 / 互补 / 冲突），使步骤6 能写出"搜索 X 佐证资料 Y 的 Z 论断"，避免联网结果仅当平行素材、证据链薄弱。
- **做法**：对每个缺口补齐的搜索结果，判定其与 `_card_[资料ID].json` / `_交叉引用结果.json` 的关系类型（佐证 / 互补 / 冲突 / 无关），在 `_网络搜索素材.md` 该条记录追加字段 `关联资料:[资料X]` + `关联类型:佐证|互补|冲突`。
- **冲突处理**：若搜索结果与某 `[资料X]` 矛盾，除标「冲突」外，须在 `_交叉引用结果.json` 追加一条冲突关系（来源=搜索X，目标=资料X，证据=双方表述），并在素材条目标「⚠️ 与[资料X]冲突，以资料为准/待核实」。
- **价值**：成本仅为每条追加 2 字段 + 偶发冲突记录，远低于全量重跑步骤2/3；但把"联网补全"真正并入步骤3 已建的关系图与溯源表，步骤6 采用时证据链完整。
- **落地一致性（强制）**：上述 `关联资料`/`关联类型` 字段即 §5.7 每条记录的**必含字段**，须随记录一并写入 `_网络搜索素材.md`（不得仅停留在分析）；冲突记录的 `_交叉引用结果.json` 追加关系亦须在 §5.7 同步标注「⚠️ 与[资料X]冲突」。
- **说明**：非全量重跑步骤2（不重建卡片）或步骤3（不重建全图），仅做"新增结果的轻量回链"，属步骤2/3 逻辑的复用子集。

### 5.7 网络搜索信息输出（单一文件 + 全量正文 + 双标签，★步骤6 免重抓/免编造）

将验证通过的信息按 `_提纲.md` 章节排列，**追加写入 `[输出目录]/_网络搜索素材.md`**，每条记录须为**全量可用**结构（步骤6 仅凭本文件即可撰写，**严禁再调用 WEB_FETCH 重抓原网页、严禁凭关键词/标题猜测或编造正文**）：

**每条记录必含字段（统一 schema）**：
```
[搜索K{序号}-AnySearch|Firecrawl|Native]            # 来源引擎标签（K=关键词序号）
- 标题：<检索结果标题>
- URL：<来源链接>
- 全文内容：<经 extract/scrape/WEB_FETCH 获取的完整正文或关键段落全文，≥ 300 字；非仅摘要/片段>
- 关联资料：[资料X]            # 回链用户参考资料（无关联写 无）
- 关联类型：佐证|互补|冲突|无关   # 与关联资料的关系（判定见 §5.6.1）
- 采信标记：✅双引擎互证 | ✅多源验证通过 | ⚠️单源权威 | ❌未通过→[数据待核实]
```
- **禁止仅输出 URL / 标题 / 关键词**：若某来源仅抓到标题与 URL 而未取到正文，须用 `extract`/`scrape`/`WEB_FETCH` 补全全文后再写入；确实无法获取正文者标 `⚠️单源权威` 或 `[数据待核实]` 并注明原因。
- 单一文件承载双引擎结果，步骤6 直接消费，无需改动步骤6。
（字段 `关联资料`/`关联类型` 的判定规则见 §5.6.1；冲突须同时在 `_交叉引用结果.json` 追加关系。）

### 5.8 搜索轮次与终止条件
- 每引擎每关键词 2 轮起步，可再扩 1 轮（最多 3 轮）；3 轮后某关键词仍有缺口标「[数据待核实]」；所有缺口补足可提前终止。

### 5.9 素材使用指引
- 优先级：原有参考资料 = ✅ 双引擎互证 > ✅ 多源验证通过 > ⚠️ 单源权威。
- 两者冲突以原有资料为准，无法判定标「[数据待核实]」。

### 5.10 Firecrawl 高阶能力选用（增强联网补全）
除轨道B 默认的 AGENT_SEARCH 外，下列 Firecrawl 能力可在对应缺口类型启用（形态依映射表：直连直接调 `firecrawl_*` / 中继经 `mcp__Dynamic-mcp__call_dynamic_tool`，详见 `references/14-firecrawl-guide.md`）：

| 缺口类型 | 首选 Firecrawl 能力 | 关键参数 |
|----------|-------------------|----------|
| 特定网页正文/结构化字段 | Scrape `formats:["json"]`+`schema` 或 Extract `schema` | `onlyMainContent`, `waitFor`(≤timeout/2), `proxy` |
| 政策/事实/数据（结构化检索） | Search `categories:["research","pdf"]` + `sources` 每源 `tbs` | `tbs:qdr:m`, `lang:"zh"`, `includeDomains:["gov.cn"]` |
| 整站/官网全貌 | Map → Crawl / Batch Scrape | `includePaths`, `limit`, `sitemap` |
| 动态/需登录/翻页内容 | Scrape + `actions` | `click`/`write`/`wait`/`executeJavascript` |
| 批量候选 URL 抓全文 | Batch Scrape | `urls[]`, `maxConcurrency` |

- 调用按映射表形态：直连 `firecrawl_<能力>(args={...})`（或 `mcp__firecrawl__firecrawl_<能力>`）；中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="<实际组名>", name="firecrawl_<能力>", args={...})`（组名以 `list_groups` 实际返回为准，调用前若索引缺失先 `ToolSearch` 重索引）。`agent` 异步须轮询 `firecrawl_agent_status`。
- 关键约束：请求体 `z.strictObject` 禁多余字段；`waitFor ≤ timeout/2`；`includeDomains` 与 `excludeDomains` 互斥；`extract.urls` 单次 ≤10；`map.limit` ≤100000；中文研究显式 `country:"cn"`。

## [产出]
- `[输出目录]/_网络搜索素材.md`（含 ≥ 1 条经 2 源交叉验证的记录，其中至少覆盖一个双引擎来源；未补足缺口标「[数据待核实]」）

## [分片]
- 素材按章节追加写入；单条信息超 `SAFE_WRITE_LEN` 按自然段切分，禁切结构化数据块。

## [验证]
- 使用 `FILE_STAT` 确认 `_网络搜索素材.md` 已存在（路径须为状态文件「全局路径配置·输出目录」解析后的绝对路径，见 `_contract.md` 路径锚定维度）。
- **终态门禁**：确认双引擎（或降级后的双轨/单轨）均已执行且文件含 ≥ 1 条 2 源交叉验证记录。未满足 → 不得进入步骤6，重新执行本步补全。
- **关联分析与全量输出门禁（防 Q6a/Q5 偷懒跳过）**：确认 `_网络搜索素材.md` 中**每条采用记录**均含 `关联类型：` 字段（缺失 → 退回补做 §5.6.1 回链）；确认含 `冲突` 标记的记录均已同时在 `_交叉引用结果.json` 追加关系；确认每条记录含 `全文内容：` 字段且非仅 URL/标题（违反 → 退回用 extract/scrape/WEB_FETCH 补全全文，禁止进入步骤6）。三项任一不满足 → 不得进入步骤6。

## [状态]
- 更新"当前步骤"="步骤5 / 共10步"。
- 更新"前序产出清单"：增加 `_网络搜索素材.md`。
- **写「阶段检查点·关键词级」**：每关键词双引擎完成后，向状态文件「阶段检查点」追加 `Kx-AnySearch done` / `Kx-Firecrawl done`（x=关键词序号，双引擎各自独立标记）。续跑会话仅补跑缺失 / 半成品关键词（如仅 `K3-AnySearch done` 而缺 `K3-Firecrawl done` → 只补 Firecrawl 轨道），不重做已完成关键词。
- 更新"待办下一步"="加载 _router/step-06.md，执行步骤6"。
- 更新"时间戳"。
- 输出「✅ 步骤5完成，状态文件已更新」。
