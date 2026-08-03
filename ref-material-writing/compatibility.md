# 兼容性声明

**ref-material-writing Skill v5.0.0**

## 环境依赖

| 依赖项 | 最低版本 | 说明 |
|--------|---------|------|
| OfficeCLI | 最新稳定版 | Office 文件读写工具 |
| PowerShell | 5.0+ | Windows 默认 Shell 环境 |

## 操作系统

- Windows 10 / Windows 11（主要支持）
- 其他操作系统需适配 Shell 命令

## 工具调用

> 本 Skill 采用**动态工具适配**：具体工具名在会话开始由 `_router/bootstrap.md`（Gate-0）探测并写入状态文件「工具能力映射表」，步骤模块不硬编码平台特定名。下表为默认首选（实测可用时）。

| 逻辑原语 | 默认首选 | 调用方式 | 说明 |
|----------|---------|---------|------|
| SHELL | `shell_exec` | MCP 内置 | 执行 Shell 命令 |
| SHELL_STATUS | `shell_status` | MCP 内置 | 查询 Shell 环境 |
| READ_FILE | 原生 `local_file_read` | 原生 / MCP | 读文件 |
| WRITE_FILE | 原生 `local_file_write` | 原生 / MCP | 写文件 |
| FILE_STAT | 原生 `local_file_stat` | 原生 / SHELL `Test-Path` | 验证闸门 |
| WEB_SEARCH | 直连 `firecrawl_search`（或 `mcp__firecrawl__firecrawl_search`）；中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_search")` | Firecrawl（直连或中继，形态由 Gate-0 探测，见映射表）> 原生 `web_search` | 联网搜索 |
| WEB_FETCH | 直连 `firecrawl_scrape`（或 `mcp__firecrawl__firecrawl_scrape`）；中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_scrape")` | Firecrawl（直连或中继，形态由 Gate-0 探测，见映射表）> `web_fetch` | 网页抓取 |
| AGENT_SEARCH | 直连 `firecrawl_agent`+`firecrawl_agent_status`（或 `mcp__firecrawl__firecrawl_agent`）；中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_agent")`+`firecrawl_agent_status` | Firecrawl（直连或中继，形态由 Gate-0 探测，见映射表；Firecrawl 轨道首选）| 步骤5 Firecrawl 轨道自主多站研究（异步轮询）|
| EXTRACT | 直连 `firecrawl_extract`（或 `mcp__firecrawl__firecrawl_extract`）；中继 `mcp__Dynamic-mcp__call_dynamic_tool(group="firecrawl-mcp", name="firecrawl_extract")` | Firecrawl（直连或中继，形态由 Gate-0 探测，见映射表）| 结构化提取 |
| OFFICE | `officecli` | shell_exec 调用 | Office 文件读写 |
| ANYSEARCH | 固定命令（内嵌自包含）：`uv run --project D:/Tools/Assembly/python/myenv python scripts/anysearch_cli.py` | 基于技能目录的相对路径、非动态探测 | 步骤5 / 步骤2 双引擎之一（先执行）；支持通用/垂直搜索与网页 extract |
| NATIVE_WEB | 原生 `web_search` + `web_fetch` | LLM 自带 | 双引擎任一不可用时的补偿通道（保双轨），或二者皆不可用时的单轨降级 |

**版本差异声明**：`officecli` 命令参数随版本变化，任何命令失败必须 `officecli --help` 取权威 schema 重试（见 `references/02-environment-setup.md`、`references/04-officecli-guide.md`）。

## 已知限制

- 单次 shell_exec 命令不超过 7000 字符
- 每批次 OfficeCLI add 命令不超过 12 条
- 超长 Office 文件需分段读取
- PDF 文件通过系统原生能力处理，不由 OfficeCLI 分片
- 10步流水线全程需处理15-30个资源文件，依赖 `_流水线状态.md` 维持主调度逻辑活跃

## 状态文件说明

本Skill采用 `_流水线状态.md` 文件对抗上下文语义稀释。该文件在 Gate-0（`_router/bootstrap.md`）阶段创建，步骤1 填充全局参数，后续每个步骤执行前必须读取、执行完成后必须更新。

**状态文件字段**：
- 当前步骤：防止主调度逻辑失效
- 全局参数：12维度核心参数和全局路径配置
- 全局约束摘要：8条核心规则（防止约束遗忘）
- 前序产出清单：所有已完成步骤的产出文件路径（防止产出追溯不全）
- 待办下一步：明确下一步行动
- 分片进度：步骤9分片写入进度记录
- 验证状态：Gate-0 创建后的状态文件内容验证结果
- 时间戳：最后更新时间
- 双引擎搜索能力状态（§9）：AnySearch/Firecrawl 可用状态、组合判定、Firecrawl 访问形态（直连/中继/不可用）
- 已确认节点（§10）：步骤1/4 确认节点，续跑免重复打扰
- 决策日志（§11）：用户关键决策跨会话继承
- 阶段检查点（§12）：步骤内子阶段断点定位（关键词级/分片级）
- 工具能力映射表（§13）：Gate-0 探测的原语→工具绑定与 Firecrawl 访问形态，续跑权威真相源
- 逐步自检登记（§14）：每步自检通过与轻签名，下游信任依据（防跨会话/跨步骤重复全量复检）


---

# 工作空间地图（Workspace Map）

> 生成日期：2026-07-09 | 版本：v5.0.0 瘦路由架构

## 一、目录结构总览

```
ref-material-writing/               # Skill 根目录
├── SKILL.md                        # ★ 主入口（瘦路由，≤100行）
├── compatibility.md                # 兼容性声明 + 本工作空间地图
│
├── _router/                        # 内部路由模块（12文件）
│   ├── _contract.md                #   七段契约格式定义
│   ├── bootstrap.md                #   Gate-0 引导（工具探测+状态文件初始化）
│   └── step-01.md ~ step-10.md     #   步骤1~10 独立执行模块
│
├── references/                     # 参考规范（16文件）
│   ├── 01-writing-standards.md     #   文风标准
│   ├── 02-environment-setup.md     #   环境配置与 shell_exec 约束
│   ├── 04-officecli-guide.md       #   OfficeCLI 操作指南（含 Help-First）
│   ├── 05-long-file-handling.md    #   超长 Office 文件处理策略
│   ├── 06-knowledge-base.md        #   合规性规则库（步骤7用）
│   ├── 10-parameters-schema.md     #   12维参数模式定义
│   ├── 11-examples.md              #   使用示例
│   ├── 12-edge-cases.md            #   边界与异常处理
│   ├── docx-format-standard.md     #   DOCX 公文格式标准（步骤9/10用）
│   ├── 13-anysearch-integration.md #   AnySearch 双引擎集成契约（内嵌自包含：命令/子命令/垂直域规则）
│   ├── 14-firecrawl-guide.md       #   Firecrawl 高阶能力目录与决策矩阵
│   ├── 15-resume-protocol.md       #   跨会话断点续跑协议（RESUME-PROBE/CHECK/LOAD）
│   ├── 16-self-check-A.md          #   自检标准档 A：文本/Markdown 产出物（存在/非空/轻签名/结构）
│   ├── 16-self-check-B.md          #   自检标准档 B：JSON 分析卡片（json.loads 解析 + 必填字段对齐）
│   ├── 16-self-check-C.md          #   自检标准档 C：Office 产出物（docx 校验 + 段落数）
│   └── 16-self-check-D.md          #   自检标准档 D：检索来源（双引擎完备性 + 信源追溯）
│
└── assets/                         # 模板与配置（7文件）
    ├── _流水线状态.md               #   状态文件模板（14 字段）
    ├── analysis-card-template.json #   资料分析卡片 JSON 模板
    ├── context-summary-template.md #   上下文摘要模板（含风格自检字段）
    ├── officecli-command-templates.md # OfficeCLI 命令模板（对齐官方）
    ├── outline-templates.md        #   提纲参考框架
    ├── output-template.md          #   六部分结构化输出模板
    └── style-anchor.md             #   风格锚点（R4反稀释策略）
```

> **内嵌脚本目录 `scripts/`（自包含，不依赖外部 Skill）**：`anysearch_cli.py`（AnySearch CLI 内嵌副本，步骤2/5 双引擎之一，固定调用命令见 `references/02-environment-setup.md` 约束15 / `references/13-anysearch-integration.md`）+ `shared/`（CLI 文档模板与常量，`doc` 子命令引用）；技能根 `.env` 含 `ANYSEARCH_API_KEY`，由脚本自加载。

**文件总数**：40（含 `scripts/` 2 项与根 `.env`）

---

## 二、文件用途与调用关系

### 2.1 根目录

| 文件 | 用途 | 被谁加载 |
|------|------|---------|
| `SKILL.md` | 瘦路由主入口。定义角色、10步工作流概览、关键决策规则、资源索引。本身不包含详细执行逻辑，按步骤号加载对应 `_router/step-NN.md`。 | 系统（Skill 调用时自动加载） |
| `compatibility.md` | 环境依赖、工具映射表（默认首选）、已知限制、状态文件字段说明、工作空间地图。供人类阅读的 Skill 元信息汇总。 | 无功能加载（参考文档） |

### 2.2 `_router/` — 路由与步骤模块

| 文件 | 用途 | 加载时机 | 加载的文件 |
|------|------|---------|-----------|
| `_contract.md` | 定义七段契约格式：`[门禁]→[加载]→[执行]→[产出]→[分片]→[验证]→[状态]`。所有 step-NN.md 均遵循此契约。 | SKILL.md 加载（理解契约格式） | — |
| `bootstrap.md` | **Gate-0 引导模块**。会话开始前探测全部逻辑原语（含固定调用原语 ANYSEARCH），生成「工具能力映射表」，提前创建 `_流水线状态.md`。 | SKILL.md（步骤1之前） | `assets/_流水线状态.md` |
| `step-01.md` | 任务要素拆解与完整性校验（12维度提取）。 | 步骤1 执行前 | `references/10-parameters-schema.md`、`assets/_流水线状态.md` |
| `step-02.md` | 参考资料全量读取与内部逻辑解析（生成分析卡片JSON）。 | 步骤2 执行前 | `assets/analysis-card-template.json`、`assets/_流水线状态.md` |
| `step-03.md` | 跨资料逻辑关联分析（6类关系、≤3跳多跳推导、溯源表）。 | 步骤3 执行前 | `assets/_流水线状态.md` |
| `step-04.md` | 提纲适配优化（调整/自动草拟/字数分配）。 | 步骤4 执行前 | `assets/outline-templates.md`、`assets/_流水线状态.md` |
| `step-05.md` | 信息缺口识别与联网验证补全（5类缺口、AnySearch+Firecrawl 双引擎、2源交叉验证、双引擎互证）。 | 步骤5 执行前 | `assets/_流水线状态.md` |
| `step-06.md` | 正文逐章撰写（R4反稀释加载、禁止项双锚校验、上下文摘要生成）。 | 步骤6 执行前 | `references/01-writing-standards.md`、`assets/style-anchor.md`、`assets/context-summary-template.md` |
| `step-07.md` | 合规性自检（AI幻觉检测、事实核对、引用溯源）。 | 步骤7 执行前 | `references/06-knowledge-base.md`、`assets/_流水线状态.md` |
| `step-08.md` | 段落相似度检测与标记（>70%相似标记）。 | 步骤8 执行前 | `assets/_流水线状态.md` |
| `step-09.md` | 结构化输出最终文稿（分片写入docx或降级.md、六部分模板输出）。 | 步骤9 执行前 | `references/04-officecli-guide.md`、`references/05-long-file-handling.md`、`references/docx-format-standard.md`、`assets/output-template.md`、`assets/officecli-command-templates.md` |
| `step-10.md` | Office写入后合规性自检（Delivery Gate G1/G2/G3三道闸门）。 | 步骤10 执行前 | `references/04-officecli-guide.md`、`references/05-long-file-handling.md`、`references/docx-format-standard.md`、`assets/_流水线状态.md` |

**步骤间调用链**（待办下一步）：
```
bootstrap.md → step-01 → step-02 → step-03 → step-04 → step-05
                                                          ↓
                                                     step-06 → step-07 → step-08 → step-09 → step-10 → 完成
```

### 2.3 `references/` — 参考规范

| 文件 | 用途 | 被谁加载 |
|------|------|---------|
| `01-writing-standards.md` | 文风标准：论述密度≥5、平实严谨公文风格、禁止文学化表达。 | step-06（正文撰写前） |
| `02-environment-setup.md` | 环境配置：Shell约束（`&&`/`||`/`&`替换为`;`或`|`）、命令长度限制、状态文件机制。 | SKILL.md（首次 shell_exec 前） |
| `04-officecli-guide.md` | OfficeCLI 操作指南：Help-First Rule、版本差异声明、常用命令模式。 | step-09、step-10（Office文件读写时） |
| `05-long-file-handling.md` | 超长文件处理：分段读取策略（docx>80段/xlsx>200行/pptx>20张）、分片写入批次控制。 | step-09、step-10（超长文件时条件加载） |
| `06-knowledge-base.md` | 合规性规则库：AI幻觉检测规则、事实核对清单、引用溯源要求。 | step-07（合规性自检前） |
| `10-parameters-schema.md` | 12维参数模式定义：全局配置、用户输入、产物控制、自动派生参数。 | step-01（步骤1开始前） |
| `11-examples.md` | 使用示例集：典型场景的输入输出范例。 | 按需（需要参考示例时） |
| `12-edge-cases.md` | 边界与异常处理：超时降级、格式不支持、文件过大等场景处置路径。 | 按需（遇到异常时） |
| `docx-format-standard.md` | DOCX 公文格式标准：页面设置、标题层级、正文格式、页眉页脚规范。 | step-09、step-10（docx输出时） |

### 2.4 `assets/` — 模板与配置

| 文件 | 用途 | 被谁加载 |
|------|------|---------|
| `_流水线状态.md` | 状态文件模板（14 字段）。Gate-0创建，每步强制读写，防上下文语义稀释。 | bootstrap（创建）、step-01~10（每步门禁读取+状态更新） |
| `analysis-card-template.json` | 资料分析卡片JSON模板。定义资料ID、核心主题、关键事实数据、论点树等字段。 | step-02（生成分析卡片时） |
| `context-summary-template.md` | 上下文摘要模板（9字段，含风格一致性自检6项）。每章写完后生成，下章动笔前必读。 | step-06（每章正文撰写完成后） |
| `officecli-command-templates.md` | OfficeCLI 命令模板集（对齐官方规范）。包含 footer、header、color=0000FF 等标准模板。 | step-09（docx输出命令参考） |
| `outline-templates.md` | 提纲参考框架（按文体分类）。提纲缺失时自动草拟的依据。 | step-04（提纲缺失时自动草拟） |
| `output-template.md` | 六部分结构化输出模板：资料解析说明→提纲调整说明→补充信息说明→正文→信息溯源说明→相似段落标记说明。 | step-09（最终文稿组织） |
| `style-anchor.md` | 风格锚点：文风/语气/标题格式/论述密度的固定参照。R4反稀释策略核心组件，每章动笔前重载。 | step-06（R4加载，每章动笔前） |

---


