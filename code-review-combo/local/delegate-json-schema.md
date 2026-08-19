# 本地增强：委托模式宿主 JSON Schema 包装

> 本文件属于 `code-review-combo` 的本地化增强，从上游镜像 `open-code-review-delegate/SKILL.md` 中抽离。
> 委托模式下 `ocr` 不产出 JSON，由宿主（即运行本技能的 Agent 自身）把文本/diff/判断收敛为结构化 JSON。
> 本文件定义宿主输出 JSON 的字段规范与强制纪律。

## 关键约定：字段名统一用 `content`

**对齐上游 v1.9.5 规范，宿主输出的每条评论字段统一使用 `content`，不要使用旧版 combo 的 `comment`。**

对应上游 Step 5 的字段定义（上游原文）：

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | yes | Relative file path |
| content | string | yes | Review comment describing the issue |
| start_line | integer | no | Start line in the new file |
| end_line | integer | no | End line in the new file |
| category | enum | no | bug, security, performance, maintainability, test, style, documentation, other |
| severity | enum | no | critical, high, medium, low |

## 宿主输出 JSON 结构（推荐 Schema）

委托模式由宿主生成最终 JSON，建议整体结构如下：

```json
{
  "tool": "open-code-review",
  "mode": "delegate | review | scan",
  "repository": "<仓库路径>",
  "target": {
    "type": "workspace | range | commit",
    "from": "<ref>",
    "to": "<ref>",
    "commit": "<hash>"
  },
  "files": [
    { "path": "src/foo.go", "status": "modified", "insertions": 2, "deletions": 0 }
  ],
  "rules": [
    { "path_pattern": "**/*.go", "rule": "新增函数必须校验参数非空" }
  ],
  "comments": [
    {
      "path": "src/foo.go",
      "content": "问题描述（使用 content 而非旧版 comment）",
      "start_line": 10,
      "end_line": 12,
      "category": "bug | security | performance | maintainability | test | style | documentation | other",
      "severity": "critical | high | medium | low",
      "existing_code": "触发问题的原始代码片段（可选）",
      "suggestion_code": "建议的修复代码片段（可选）"
    }
  ],
  "summary": {
    "files_reviewed": 1,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "total_files": 1,
    "reviewed_files": 1,
    "skipped_files": 0,
    "coverage_rate": "100%"
  }
}
```

> **⚠️ 此 `summary` 是宿主报告 A'（委托模式）的收敛规范**：含 delegate 特有的 `coverage_rate` / `reviewed_files` / `skipped_files`，用于证明「每个 preview 文件均已 reviewed/skipped」。**最终合并产物的 `summary` 以 `scripts/merge_reports` 的真实输出为准**（嵌套 `severity_dist{critical,high,medium,low}` + `total_findings` / `files_reviewed` / `by_source` / `verified_by` / `confirmed` / `disputed` / `new` / `ocr_only` / `review_spd_only` / `category_dist` / `dropped_style`，**不含** `coverage_rate`）。两者描述对象不同（A' 收敛 vs 合并产物），请勿混为一谈。

## comments[] 字段细则

宿主产出的 `comments[]` 每条评论包含以下字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 相对仓库的文件路径 |
| `content` | string | 是 | 审查评论，描述问题本身（**统一用 content**） |
| `start_line` | integer | 否 | 问题起始行（新文件行号） |
| `end_line` | integer | 否 | 问题结束行（新文件行号） |
| `category` | enum | 否 | bug / security / performance / maintainability / test / style / documentation / other |
| `severity` | enum | 否 | critical / high / medium / low |
| `existing_code` | string | 可选 | 触发问题的原始代码片段，便于用户定位 |
| `suggestion_code` | string | 可选 | 建议的修复代码片段 |

> 注：`existing_code` / `suggestion_code` 为 combo 本地增强的**可选**字段，用于增强可读性；上游 v1.9.5 基础字段为前六项（path/content/start_line/end_line/category/severity）。

## coverage_rate 强制纪律

`summary.coverage_rate` 为**强制字段**，用于证明「每个 preview 文件均已 `reviewed` 或显式 `skipped`」：

- 覆盖清单必须包含 Step 1（`ocr delegate preview`）返回的每一个 `reviewable_files` 条目。
- 每个条目最终必须标记为 `reviewed`，或带**明确理由**标记为 `skipped`（skipped 条目应在报告中附理由）。
- 不得静默遗漏任何 preview 文件。
- 计算公式：`coverage_rate = reviewed_files / (reviewed_files + skipped_files) * 100%`，覆盖全部条目即应为 `"100%"`。
- `total_files` / `reviewed_files` / `skipped_files` / `coverage_rate` 需同时出现在 `summary` 中。

## 严重度分组报告纪律

- **critical / high**：bug、安全、数据丢失风险——必报。
- **medium**：性能、错误处理、可维护性——附上下文报告。
- **low**：风格、次要建议——仅当明确有价值时报告。
- 疑似误报静默丢弃，不进入 `comments[]`。

## 与确定性 merge 的衔接

若本 JSON 后续交由 `code-review-combo` 的确定性 `merge_reports` 合并，请勿在叙事层重新裁决 findings；merge 负责去重与裁决，宿主只负责如实产出上述结构。人类可读报告模板见 `local/report-narrative.md`。
