# 本地增强：人类可读报告（narrative）Prompt 模板

> 本文件属于 `code-review-combo` 的本地化增强，从上游镜像 `open-code-review-delegate/SKILL.md` 中抽离。
> 用途：宿主 LLM（即运行本技能的 Agent 自身）读取 `merge_reports` 产出的 `.json` 后，生成 `.md` 人类可读报告。

## 核心纪律：只叙事，不裁决

- **本步骤只做叙事与总结（narrative / summary）。**
- **绝不重新裁决 findings**：哪些算 bug、严重度如何、是否误报——这些裁决已由确定性的 `merge_reports` 完成，宿主不得推翻或重判。
- 你的角色是把结构化 JSON 翻译成人类易读的文字，**忠实反映** `merge_reports` 的结论，不增删、不调整 severity、不重新判定误报。
- 若 JSON 中某 finding 被标记为误报/已合并去重，按 merge 结果呈现即可，不要"找回"被丢弃项。

## 输入

- `merge_reports` 产出的 `.json`（已确定去重、定级、汇总）。
- 结构参考 `local/delegate-json-schema.md` 的 `comments[]` 与 `summary`。

## 输出 .md 结构建议

生成 `<review>.md`，建议包含以下章节（顺序与标题可按需微调，但须覆盖要点）：

### 0. 裁决结论（Verdict）

- 依据 SKILL.md「Stage3 裁决契约」，在报告开头给出最终裁决：**`APPROVED`**（全部交叉验证通过、无保留项） / **`FIXED`**（单源或 disputed 项经宿主实读代码核实后已确认有效或已修复） / **`ESCALATE`**（存在需 redesign 或需用户决策的高风险项）。
- 此裁决由宿主（编排者）作出，是合并结果的结论性总结；叙事**不得推翻** `merge_reports` 的 severity / 去重 / 误报判定，仅如实呈现。
- 若为 `ESCALATE`，必须显式列出高风险项并说明下一步动作。

### 1. 总览（Overview）
- 仓库 / 分支 / 提交范围（来自 `target`）。
- 总体结论一句话：如「共审查 N 个文件，发现 X critical / Y high / Z medium / W low」。
- 覆盖率：`coverage_rate` 与 `reviewed_files / skipped_files / total_files`，若含 skipped 须列出理由。

### 2. 按文件（By File）
- 以 `path` 为小标题，逐文件列出其 findings（引用 `content`、`start_line`–`end_line`、`category`、`severity`）。
- 可选展示 `existing_code` / `suggestion_code` 代码块，增强可读性。
- 无 findings 的文件可归并为一句「无问题」。

### 3. 严重度统计（Severity Breakdown）
- 表格化呈现 `critical / high / medium / low` 各自数量与文件分布。
- 与 `summary` 中的计数保持一致（不得自行改数）。

### 4. Top 风险（Top Risks）
- 选取 `severity` 为 critical / high 的 findings，按影响排序，给出 3–10 条精炼摘要。
- 每条附文件+行号锚点与原始 `content` 摘要，便于跳转定位。

### 5. 修复建议引用（Fix Suggestions）
- 汇总含 `suggestion_code` 的条目，给出可复制的修复片段引用。
- 对需人工干预的 medium 项，仅说明上下文，不替用户决策。

## Prompt 模板（可直接套用）

```
你正在把一份确定性的代码审查合并结果（JSON）改写为人类可读的 Markdown 报告。
严格遵守：只做叙事与总结，绝不重新裁决 findings（severity / 误报 / 去重已由 merge_reports 决定）。

输入：<path-to-merged>.json

要求：
1. 生成 <review>.md，章节顺序：总览 → 按文件 → 严重度统计 → Top 风险 → 修复建议引用。
2. 总览含仓库/范围、一句话结论、coverage_rate 与 reviewed/skipped/total 计数（skipped 附理由）。
3. 按文件列出 findings，忠实引用 content、start_line–end_line、category、severity；可展示 existing_code / suggestion_code。
4. 严重度统计表与 JSON summary 计数严格一致。
5. Top 风险仅取 critical/high，附文件+行号锚点。
6. 修复建议引用含 suggestion_code 的条目，可复制片段。
7. 不新增、不删除、不重判任何 finding。
```

## 产出交付

- 输出 `.md` 文件路径回传给用户，并视需要在对话中以精简形式呈现总览与 Top 风险。
- 不修改上游镜像 `open-code-review-delegate/SKILL.md`，不修改 `merge_reports` 的 `.json`。
