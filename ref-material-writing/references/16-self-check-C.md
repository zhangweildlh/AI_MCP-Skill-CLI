# 自检标准档 C：Office 产出物

> 适用：step-09 `_最终文稿.docx`、降级 `_最终文稿.md`、其他 Office 中间产物。
> 调用位置：step-09 [验证] 段（验 integrity）；step-10 Delivery Gate（验 correctness，见其 G1–G3）。

## 必过项（integrity）

1. **存在性**：`FILE_STAT` 确认文件存在。
2. **非空阈值初筛**：docx < 2KB / md < 1KB 视为明显损坏。
3. **轻签名**：字节数 + 段落数（docx 用 `officecli query 'paragraph'` 计数；md 用行数）vs [产出] 预期。
4. **结构完整性**：
   - docx：`officecli validate` 通过（G1a 仅 uiPriority 误报为 advisory，非 REJECT；G1b 标题大纲 `paragraph[outlineLvl]` ≥ 1）；段落数 ≥ 提纲章节数。
   - md：标题层级（`#` 级数）≥ 提纲层级；末级后有正文。
5. **模型输出截断（B 类）**：docx 末段落缺闭合 / md 末尾缺句号且无续写 → 判 ❌。

## 与 step-10 衔接

- 本档验 **integrity**；step-10 的 G1–G3（schema / 泄漏 / 陈旧域 / 空段 / 活 PAGE 字段）验 **correctness + 格式合规**，二者职责分离（设计点 8B）。
- step-09 自检通过登记 §14；step-10 失败 REJECT 时按「回退上限」处置（见 step-10）。

## 回填 / 回退（设计点 6）

- 情形A 回填、情形B / C 回退（回退到 step-09 重做该分片 / 全文）。
