# 步骤2：参考资料全量读取与内部逻辑解析

> rmw 内部步骤2。遵循 `_router/_contract.md` 七段契约。

---

## [门禁]
- 已读取状态文件，确认"当前步骤=步骤1 / 共10步"，12 维度已填写完整。
- 已读取状态文件「工具能力映射表」，确认 READ_FILE / FILE_STAT / WEB_FETCH / ANYSEARCH 已绑定。
- 续跑会话须先 RESUME-CHECK（产出物三清单 + 全量回读，见 `_contract.md` 续跑维度 / `references/15-resume-protocol.md`）。

## [加载]
- `assets/analysis-card-template.json`（分析卡片权威模板；若与下文描述冲突以模板为准）
- `assets/_流水线状态.md`
- 条件加载：读写 Office 文件前加载 `references/04-officecli-guide.md`；超长文件额外加载 `references/05-long-file-handling.md`
- 逻辑原语：READ_FILE、WRITE_FILE、FILE_STAT、WEB_FETCH、ANYSEARCH、SHELL、OFFICE

## [执行]

### 2.1 预处理：资料清单分类与校验
- 逐项识别资料类型（扩展名 / URL），生成唯一资料 ID。

### 2.2 按类型读取
| 类型 | 读取策略（工具依映射表解析）|
|------|------------------------------|
| docx / xlsx / pptx | 遵循 `references/05-long-file-handling.md` 分段读取，利用 OFFICE（officecli）|
| pdf | AI 原生文件读取能力直接读取（不由 officecli 分片）；若 PDF 过大导致单次读取截断，按页码范围分段读取并记录已读范围 |
| Markdown / Text | AI 原生文件读取能力直接读取 |
| URL | **双轨抓取（并行 AnySearch）**：① 调用 WEB_FETCH（Firecrawl 形态见映射表：直连 `firecrawl_scrape` / 中继 `mcp__Dynamic-mcp__call_dynamic_tool(name="firecrawl_scrape")`）获取网页文本；② 同时调用 AnySearch `extract <url>` 补充抓取全文（命令：`uv run --project D:/Tools/Assembly/python/myenv python scripts/anysearch_cli.py extract "<url>"`）。两路结果合并入同一分析卡片，互不替代。 |
- 通用原则：不得修改原始文件；加密 / 损坏 / 不支持格式转入异常处理。

### 2.3 单份资料结构化分析（生成分析卡片）
对每份资料独立生成 JSON 分析卡片，字段以 `assets/analysis-card-template.json` 为准，至少含：资料ID、来源路径、资料类型、核心主题、核心结论、关键事实与数据、论点树、信息属性分类、关键段落位置、立场与局限、逻辑组织形式、内部自引用、读取状态。

**「关键段落位置」填充规则**（数据来源为 `references/05-long-file-handling.md` 第一步概览定向产出的映射表）：
- docx：段落序号或 @paraId；xlsx：行号或单元格地址；pptx：幻灯片编号；pdf：页码；md/txt：行号；url：章节标题 / 段落序号。
- 每条记录含"段落索引 / 段落内容摘要 / 所在章节"三子字段。

### 2.4 异常处理与记录
- 读取失败：记录错误，跳过该资料，标记"读取状态:失败"；部分成功：记录已读范围；汇总失败清单告知用户。

### 2.5 结构化分析结果输出
每份卡片保存为独立文件 `_card_[资料ID].json`；**每写完一份即向状态文件「阶段检查点」追加 `[资料ID] done`**（大资料集断点续跑仅补缺失卡片，不重做已完成者，见 `_contract.md` 防稀释维度）。

## [产出]
- `[输出目录]/_card_[资料ID].json`（每类资料一份，全部保存）

## [分片]
- 单张卡片若超 `SAFE_WRITE_LEN`（3000 字符），按自然段 / 句边界切分后分次 WRITE_FILE；JSON 结构化单元（论点树数组等）**禁止**切分。

## [验证]
- 使用 `FILE_STAT` 确认每份 `_card_[资料ID].json` 已存在。
- 缺失 → 用 WRITE_FILE 补写后重新校验。
- **引用 `references/16-self-check-B.md` 标准档**校验每份卡片：存在性 + 非空阈值 + 轻签名（字节/行数 vs [产出] 预期）+ 结构完整性（`json.loads` 可解析 + 必填字段对齐 `assets/analysis-card-template.json`）。
- **向 §14 写入登记（设计点 5）**：通过则写入"✅通过 + 轻签名 + 登记对象=各 `_card_[资料ID].json`（绝对路径）+ 子阶段=卡片级（如 2/5 卡）+ 自检时刻"；失败回退重做本步 [执行]→[产出]。

## [状态]
- 更新"当前步骤"="步骤2 / 共10步"。
- 更新"前序产出清单"：增加所有分析卡片路径 `_card_[资料ID].json`。
- 更新"待办下一步"="加载 _router/step-03.md，执行步骤3"。
- 更新"时间戳"。
- 输出「✅ 步骤2完成，状态文件已更新」。
