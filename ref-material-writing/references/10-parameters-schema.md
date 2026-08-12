# 参数 Schema 与约束定义

## 参数定义（JSON Schema）

```json
{
  "type": "object",
  "properties": {
    "写作需求": {
      "type": "string",
      "description": "文档类型、用途、受众、篇幅、风格、语气等全部约束。必填。",
    },
    "提纲": {
      "type": "string",
      "description": "期望的章节结构。选填。若未提供，AI 须根据写作需求和参考资料自动草拟。",
    },
    "参考资料": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "资料名称或编号。必填。",
          },
          "path": {
            "type": "string",
            "description": "本地文件绝对路径或 URL。选填。",
          },
          "type": {
            "type": "string",
            "enum": ["docx", "xlsx", "pptx", "pdf", "url", "text"],
            "description": "资料类型。必填。pdf 通过系统原生能力处理，不由 OfficeCLI 分片读取。",
          }
        }
      },
      "description": "写作的核心信息源列表。必填，至少 1 份。",
      "minItems": 1
    },
    "输出目录": {
      "type": "string",
      "description": "输出目录路径。选填。默认使用本地环境配置的输出目录。",
    },
    "输出文件格式": {
      "type": "string",
      "enum": ["docx", "xlsx", "pptx", "md"],
      "default": "docx",
      "description": "输出文件格式。选填。默认 docx。",
    },
    "本次撰写的主题": {
      "type": "string",
      "description": "用于生成文件名的主题关键词。选填。若未提供，由 AI 根据步骤1中的写作需求提炼关键词自动生成，中文字符，不含标点符号。",
    },
    "当前时间戳": {
      "type": "string",
      "description": "用于生成文件名的时间戳，格式为 yyyy-MM-dd-HH-mm-ss。由 AI 通过系统命令自动获取，用户无需填写。",
    },
    "默认当前工作目录": {
      "type": "string",
      "description": "存放待处理输入数据的父目录默认路径。选填。若未指定，使用用户本地环境配置的当前工作目录。",
    },
    "默认Skill技能根目录": {
      "type": "string",
      "description": "Skill 相关资产存放的父目录默认路径。选填。若未指定，使用用户本地环境配置的 Skill 技能目录。",
    },
    "流水线状态文件路径": {
      "type": "string",
      "description": "流水线状态文件的绝对路径。选填。默认位于[输出目录]下的 _流水线状态.md。由AI在步骤1后自动生成并更新。",
    }
  },
  "required": ["写作需求", "参考资料", "本次撰写的主题"],
  "additionalProperties": false
}
```

> **占位符 `[name]` 解析注记**：`[name]` 取自本 Skill 的 YAML frontmatter `name` 字段（即 `ref-material-writing`），运行时由 `[Skill技能根目录]/[name]` 拼接为绝对路径；`[name]` 为运行环境解析所得，**非用户输入参数**，用户无需也不应提供（详见 `references/02-environment-setup.md` 约束 4–5）。

## 约束定义（constraints）

```json
{
  "max_read_range_per_chunk": {
    "docx": { "paragraphs": 80, "lines": 400 },
    "xlsx": { "rows": 200, "note": "officecli view text 不支持 --start/--end 分页；此限制仅适用于 --max-lines 模式（方式一），获取第1行起的前200行。实际分片读取请参照 references/05-long-file-handling.md 的三种替代方式（--max-lines / get 按区域 / 导出CSV）。" },
    "pptx": { "slides": 20 },
    "pdf": { "max_size_mb": 50, "note": "通过系统原生能力处理，不由 OfficeCLI 分片读取" }
  },
  "max_batch_ops": 12,
  "max_single_paragraph_chars": 3000,
  "shell": {
    "operators": ["|", ";"],
    "forbidden_operators": ["&&", "||", "&"],
    "max_command_length_chars": 7000
  },
  "officecli": {
    "validate_requires_close": true,
    "supported_formats_for_chunked_read": ["docx", "xlsx", "pptx"]
  },
  "style": {
    "max_sentence_length_chars": 40,
    "max_sentence_length_long_form_chars": 70,
    "heading_level_1_chars": [6, 12],
    "heading_level_2_chars": [8, 15],
    "heading_level_3_chars_max": 12
  },
  "css_query_error_handling": {
    "retrieval_phase": "空结果→终止当前检索分支并告知用户目标内容未找到；非法选择器→告知用户选择器语法错误",
    "qa_phase": "空结果通常为预期结果（如无占位符泄露），不报错"
  },
  "info_gap_thresholds": {
    "min_independent_sources_per_claim": 2,
    "min_references_per_section": 3,
    "min_search_refs_per_section_long_form": 3,
    "description": "信息缺口量化阈值：每个关键论点至少需要2个独立来源支撑；每个章节至少需要引用3处参考资料或搜索来源；长篇（≥5000字）每章至少引用3处搜索来源；低于阈值则触发步骤5联网补全"
  }
}
```

## 参数验证规则与默认值说明

| 参数 | 验证规则 | 默认值 |
|------|---------|--------|
| 写作需求 | 非空字符串 | 无 |
| 参考资料 | 数组长度 ≥ 1 | 无 |
| 输出目录 | 有效路径字符串 | `[默认下载目录]` |
| 输出文件格式 | 枚举值之一 | `docx` |
| 本次撰写的主题 | 中文字符，不含标点 | 由AI自动生成 |
| 当前时间戳 | 格式 yyyy-MM-dd-HH-mm-ss | 由AI自动获取 |
| 默认当前工作目录 | 有效路径字符串 | `[默认下载目录]` |
| 默认Skill技能根目录 | 有效路径字符串 | `[Skill技能根目录]` |
| 流水线状态文件路径 | 有效路径字符串 | `[输出目录]/_流水线状态.md` |
