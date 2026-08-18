# 本地增强：人类可读报告（narrative）Prompt 模板

> 本文件属于 `code-review-combo` 的本地化增强，从上游镜像 `open-code-review-delegate/SKILL.md` 中抽离。
> 用途：宿主 LLM（即运行本技能的 Agent 自身）读取 `merge_reports` 产出的 `.json` 后，生成 `.md` 人类可读报告。
> 本模板**仅约束展示层**（中文标签 + 精简结构 + 编号），**绝不**改动底层裁决结果。

## 核心纪律：只叙事，不裁决

- **本步骤只做叙事与总结（narrative / summary）。**
- **绝不重新裁决 findings**：severity / 误报 / 去重已由确定性的 `merge_reports` 完成，宿主不得推翻或重判。
- 忠实反映 `merge_reports` 结论，不增删、不调整 severity、不重新判定误报。
- 若 JSON 中某 finding 被标记为误报/已合并去重，按 merge 结果呈现即可，不要"找回"被丢弃项。
- **展示层改造授权（本模板专属）**：允许（且仅允许）对**展示标签**与**呈现结构**做中文化与精简（见下文的术语约定与三段式结构），但**不得**改动底层 JSON 的 `severity` / `verified_by` / `cross_check` / 去重 等裁决结果，所有计数必须与原 JSON 完全一致。

## 术语中文映射约定（报告展示层必须采用「中文(英文)」双标签）

| 原英文词 | 中文大白话（保留英文） | 含义 |
| --- | --- | --- |
| dual-cross-validation | 双路交叉验证(dual-cross-validation) | 同时跑委托模式 + review-spd 两路，再合并去重 |
| scripts/merge_reports | 合并脚本(scripts/merge_reports) | 确定性去重定级脚本，全程不调 LLM |
| confirmed | 两路确认(confirmed) | 两路审查都抓到同一问题，可信度最高 |
| disputed | 两路争议(disputed) | 两路结论冲突，需人工裁决 |
| new | 新发现(new) | 仅一路发现、尚无另一路佐证 |
| ocr-only | 仅OCR路(ocr-only) | 仅委托 OCR 主审发现 |
| review-spd-only | 仅SPD路(review-spd-only) | 仅 review-spd 快速语义审查发现 |
| both | 两路都发现(both) | 双路交叉命中 |
| bug | 缺陷(bug) | 实际会出错的代码问题 |
| other | 其他(other) | 非缺陷/性能/安全的杂项（可读性、边界健壮性等） |
| performance | 性能(performance) | 性能相关 |
| security | 安全(security) | 安全/敏感信息相关 |
| critical | 严重(critical) | 严重度最高档，必须立即处理 |
| high | 高危(high) | 严重度高 |
| medium | 中危(medium) | 严重度中 |
| low | 低危(low) | 严重度低 |
| APPROVED / FIXED / ESCALATE | 通过 / 已修复 / 需上报 | 报告最终裁决 |
| findings | 问题项(findings) | 单条审计发现 |
| dropped_style | 丢弃的样式噪音(dropped_style) | 被当噪音剔除、不计入问题的项 |

### 编号规则（用于「③ 问题逐条清单」的「编号」列）

采用「**类别字母 + 两位数字序号**」，按类别分组连续编号，命名空间互不重叠：

- 缺陷(bug) → `B1`–`B99`
- 安全(security) → `S1`–`S99`
- 性能(performance) → `P1`–`P99`
- 其他(other) → `O1`–`O99`

编号在**全报告范围内、按类别分组、类别内按 findings 出现顺序从 1 递增**（与文件顺序无关）。

> **为什么用类别字母而非「高危 H」**：示例曾提及「高危(high)采用 H1-H99」「缺陷(bug)采用 B1-B99」两套前缀。但严重度(severity)与问题类别(category)是两个不同维度——一个既是高危又是缺陷的问题会同时撞上 H 与 B，造成定位歧义。本模板采用**类别优先**单字母前缀（每类独立编号、无重叠），severity 已在「严重度」列单独呈现，不影响精确定位。
> 若后续需要改成 severity 优先前缀（严重 C / 高危 H / 中危 M / 低危 L），只需替换此表的字母映射，逐条清单的列结构不变。

## 输入

- `merge_reports` 产出的 `.json`（已确定去重、定级、汇总）。
- 结构以 SKILL.md「输出：唯一审计报告格式」的 `findings[]`（字段 `path`/`start_line`/`end_line`/`category`/`severity`/`content`↔`comment`/`suggestion`/`verified_by`/`cross_check`）与 `summary`（`total_findings`/`files_reviewed`/`by_source`/`verified_by`/`confirmed`/`disputed`/`new`/`ocr_only`/`review_spd_only`/`severity_dist`/`category_dist`/`dropped_style` 等）为准；`content` 与 `comment` 双字段兼容，任选其一即可。

## 输出 .md 结构（精简三段式）

生成 `<review>.md`，**严格**按以下三段顺序覆盖要点，不得缺失：

### ① 一段大白话总述（必须显式写明「模式」与「具体路线」）

用 1–3 段大白话告诉用户：

- **本次审计采用的模式**与**具体路线**（用中文(英文)双标签）：
  - 若是 `dual-cross-validation` 模式，须写明：「本次审计采用**双路交叉验证(dual-cross-validation)**模式，具体路线为：同时启动**委托模式(delegate)**（上游 `open-code-review-delegate` 平等主审）与 **review-spd 快速语义审查(review-spd)** 两路并行，随后由**合并脚本(scripts/merge_reports)**做确定性去重、定级、汇总，全程不调用大模型做最终裁决。」
  - 若是上游默认模式，须写明：「本次审计采用**默认模式(review/scan)**」（即上游 `open-code-review` 原生单路审查，无委托/SPD 双路交叉）。
- **审计了哪些文件**：取自 `summary.files_reviewed`（或 `paths`），列出主要文件/目录（如 `scripts/sop_*.sh` 系列、`github-personal-manager` 工作流等）。
- **完成了哪些工作**：审查、去重、定级、汇总；跨源验证结果（confirmed / disputed / new 计数，及 ocr-only / review-spd-only / both 分布）。
- **核心数字一句话**：总 findings、severity 分布（严重/高危/中危/低危）、category 分布（缺陷/其他/安全/性能）。

### ② 汇总表（中文化表头，计数与 JSON 严格一致）

三张表，所有计数必须与 JSON `summary` **完全一致**（不得自行改数）：

- **严重度分布表**：| 严重度 | 数量 | 大白话 |
- **类别分布表**：| 问题类别 | 数量 | 大白话 |
- **跨源验证 / 单源覆盖表**：| 维度 | 取值 | 数量 |（confirmed / disputed / new；ocr-only / review-spd-only / both；以及 dropped_style）

### ③ 问题逐条清单（中文化表头 + 编号列）

表头（顺序固定，不可省略）：

| 编号 | 文件 | 行号 | 问题类别 | 严重度 | 校验来源 | 交叉结论 | 大白话问题 | 修复建议 |

- **编号**：按上文「编号规则」赋值（B/S/P/O + 两位序号）。
- **文件 / 行号**：`path` 与 `start_line`–`end_line`（文件级写「文件级」）。
- **问题类别 / 严重度**：采用「中文(英文)」双标签（见术语约定）。
- **校验来源**：`verified_by`（仅OCR路(ocr-only) / 仅SPD路(review-spd-only) / 两路都发现(both)）。
- **交叉结论**：`cross_check`（两路确认(confirmed) / 两路争议(disputed) / 新发现(new)）。
- **大白话问题**：用通俗中文转述 `content`/`comment`（可保留关键命令、变量等技术名词），**不改其事实与 severity 指向**。
- **修复建议**：`suggestion`；若无则写「需人工评估」，不得编造或留空。

> 逐条清单与底层 findings 一一对应、数量相等；若某 finding 被合并去重或标记为误报，按 merge 结果呈现，不在清单中"找回"。

## 纪律红线（重申）

- 不新增、不删除、不重判任何 finding。
- 不修改上游镜像 `open-code-review-delegate/SKILL.md`，不修改 `merge_reports` 的 `.json`。
- 所有计数、severity、verified_by、cross_check 必须与 JSON 完全一致。

## 产出交付

- 输出 `.md` 文件路径回传给用户，并在对话中以精简形式呈现「① 总述」与「② 汇总表」；高危/严重项可附编号便于后续精准定位。
