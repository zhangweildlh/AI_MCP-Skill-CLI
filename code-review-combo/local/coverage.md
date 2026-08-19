# 本地增强：open-code-review 全面功能覆盖表

> 本文件属于 `code-review-combo` 的本地化增强，从上游镜像 `open-code-review-delegate/SKILL.md` 中抽离。
> 委托模式（delegate）是默认主路径且无需 LLM；下表其余子命令按场景启用，需 LLM 的已标注。

## 子命令总览

| 子命令 | 用途 | 是否需 LLM | 命令示例 |
|--------|------|-----------|----------|
| `ocr delegate preview` | 选文件 + 引用元数据（mode/from/to/commit/merge_base） | 否 | `ocr delegate preview --format json` |
| `ocr delegate rule <paths>` | 解析审查规则（按内容分组） | 否 | `ocr delegate rule --format json src/a.go src/b.go` |
| `ocr review --audience agent --format json [--target working\|--commit\|--from/--to] [-b "..."]` | OCR 原生 LLM 评审（结构化 JSON） | 是 | `ocr review --audience agent --format json -b "上下文"` |
| `ocr scan --format json --path <dir>` | OCR 原生整库扫描 | 是 | `ocr scan --format json --path ./src` |
| `ocr rules check <file>` | 预览某文件适用的规则 | 否 | `ocr rules check src/main/Foo.java` |
| `ocr config set <k> <v>` | 配置 LLM 与偏好 | 否 | 见 `setup.md` |
| `ocr config provider` | 查看/管理 LLM provider | 否 | `ocr config provider` |
| `ocr config model` | 查看/管理模型 | 否 | `ocr config model` |
| `ocr llm test` | 验证 LLM 连通性 | 否（仅测试） | `ocr llm test` |
| `ocr viewer <session>` | 查看历史审查报告 | 否 | `ocr viewer <id>` |
| `ocr session list` | 列出审查会话 | 否 | `ocr session list` |

## 各模块说明

### delegate（委托模式，默认主路径）
- `preview`：确定审查范围，输出 `reviewable_files` 与引用元数据，`--format json` 便于宿主程序化消费。
- `rule`：按规则内容分组返回适用规则，共享规则的文件归在一组，避免重复。

### review / scan（需 LLM）
- 仅在已配置 LLM 时可用；首次运行前务必 `ocr llm test`。
- 始终带 `--audience agent` 抑制进度 UI，只输出最终摘要。

### rules（规则）
- 规则优先级（OCR 解析）：`--rule <path>` > `<repo>/.opencodereview/rule.json` > `~/.opencodereview/rule.json` > 内置默认。
- 规则文件格式示例：
  ```json
  {
    "rules": [
      { "path": "**/*.go", "rule": "新增函数必须校验参数非空", "merge_system_rule": true },
      { "path": "**/*mapper*.xml", "rule": "检查 SQL 注入风险与未闭合标签" }
    ]
  }
  ```

### config / llm（配置与连通性）
- `ocr config set llm.*` 持久化 LLM 配置；`ocr config provider` / `ocr config model` 管理 provider 与模型。
- `ocr llm test` 仅做连通性检查，不消耗审查配额。

### viewer / session（报告与会话）
- `ocr viewer <session>` 查看某次审查的结构化报告。
- `ocr session list` 列出历史审查会话，便于回溯与对比。

## 适用 / 不适用场景补充

- 适用：Git 工作区 / 提交 / 分支区间审查；无 Key 时走委托模式；已配 LLM 时切原生 review/scan；项目级自定义规则；结构化 JSON 接入下游。
- 不适用：非 Git 仓库；期望后台常驻监控式扫描；期望纯 MCP 调用（本技能走命令行路径 B，MCP 见主技能 `open-code-review`）；未配 LLM 却要求原生 review/scan；超大单文件 diff 可能触发截断（默认 MAX_TOKENS 约 58888/请求），需拆分审查。
