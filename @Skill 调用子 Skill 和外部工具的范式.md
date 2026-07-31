# Skill 调用子 Skill 和外部工具的范式

根据提供的 6 个技术文件，我从 Agent Skills 规范中提炼了以下核心机制。


## 一、Skill 调用子 Skill / 其他 Skill 文件的范式

### 1. 触发机制

**触发方式一：模型自主决策激活**

Agent 在启动时只加载所有 Skill 的 `name` 和 `description`（约 100 tokens），形成技能目录。当用户任务匹配某个 Skill 的描述时，Agent 自主决定加载该 Skill 的完整内容。

```yaml
# SKILL.md frontmatter
name: pdf-processing
description: Extract PDF text, fill forms, merge files. Use when handling PDFs.
```

> Agent 每次任务开始时自动扫描 catalog，无需显式触发指令。

**触发方式二：用户显式激活**

通过斜杠命令或提及语法直接激活：
- `/skill-name`
- `$skill-name`

**触发方式三：指令中引用**

在 `SKILL.md` 正文中通过相对路径引用其他 Skill 文件：

```markdown
## 相关技能

当需要处理表格数据时，先加载 `../data-analysis/SKILL.md` 了解数据清洗步骤。

详细参考见 [reference guide](references/REFERENCE.md)。
```

### 2. 调用机制

**调用范式：渐进式加载（Progressive Disclosure）**

| 层级 | 加载内容 | 触发时机 | Token 成本 |
|------|----------|----------|------------|
| 1 | `name` + `description` | 会话启动 | ~50-100/Skill |
| 2 | 完整 `SKILL.md` 正文 | Skill 激活时 | <5000（推荐） |
| 3 | `scripts/`、`references/`、`assets/` 文件 | 按需加载 | 视情况 |

**调用流程示例**：

```markdown
# SKILL.md 正文中引用子资源

## 工作流程

1. 首先阅读 [API 参考](references/api.md) 了解接口规范
2. 运行预处理脚本：`scripts/preprocess.py`
3. 如需处理特殊格式，加载 `references/edge-cases.md`

## 子任务委托

当需要生成图表时，调用 `charts` Skill：
> 使用 charts Skill 生成柱状图
```

**通过文件读取激活**（不需要专用工具）：
- Agent 调用标准文件读取工具，传入 `SKILL.md` 路径
- 路径来自 catalog 中记录的 `location` 字段

**通过专用工具激活**（需要工具支持的场景）：
```xml
<activate_skill>
  {"name": "pdf-processing"}
</activate_skill>
```

### 3. 卸载机制

**自动卸载（隐式）**：
- Skill 指令随对话上下文自然滑动
- 渐进式披露的第三层资源（scripts/references/assets）使用后不再占用上下文

**上下文管理保护**：
- 被激活的 Skill 内容应**豁免于上下文压缩/截断**，避免性能静默下降
- 使用结构化标签包裹 Skill 内容，便于识别和保护：

```xml
<skill_content name="pdf-processing">
[SKILL.md 正文]
<skill_resources>
  <file>scripts/extract.py</file>
  <file>references/pdf-spec.md</file>
</skill_resources>
</skill_content>
```

**重复激活去重**：
- 同一会话中已加载的 Skill 不再重复注入


## 二、Skill 调用外部工具的范式

### 1. 触发机制

**触发方式一：`allowed-tools` 预批准（Experimental）**

在 `SKILL.md` frontmatter 中声明允许使用的工具：

```yaml
---
name: code-review
description: Review code for style, bugs, and security issues.
allowed-tools: Bash(git:*) Bash(jq:*) Read
---
```

**触发方式二：指令中明确调用**

在 `SKILL.md` 正文中指示 Agent 执行特定工具命令：

````markdown
## 执行步骤

1. 运行验证脚本：
   ```bash
   bash scripts/validate.sh "$INPUT_FILE"
   ```

2. 使用 uvx 处理数据：
   ```bash
   uvx pandas@2.0.0 read_csv.py
   ```
````

### 2. 调用机制

**调用方式一：One-off 命令**

直接引用生态工具，无需打包脚本：

| 工具 | 命令示例 | 说明 |
|------|----------|------|
| uvx | `uvx ruff@0.8.0 check .` | Python 包，隔离环境 |
| pipx | `pipx run 'black==24.10.0' .` | 成熟替代方案 |
| npx | `npm install -g eslint@9; eslint --fix .` | npm 包，随 Node.js |
| bunx | `bunx eslint@9 --fix .` | Bun 环境 |
| deno run | `deno run npm:eslint@9 .` | Deno 环境 |
| go run | `go run golang.org/x/tools/cmd/goimports@v0.28.0 .` | Go 包 |

**Tips**：
- **固定版本**：使用 `package@version` 确保可重现
- **声明依赖**：在 `compatibility` 字段中注明环境要求

**调用方式二：自包含脚本**

脚本自带依赖声明，Agent 单命令执行：

**Python（PEP 723）**：
```python
# /// script
# dependencies = [
#   "beautifulsoup4",
# ]
# ///

from bs4 import BeautifulSoup
# 脚本逻辑...
```
运行：`uv run scripts/extract.py`

**Deno**：
```typescript
#!/usr/bin/env -S deno run
import * as cheerio from "npm:cheerio@1.0.0";
// 脚本逻辑...
```
运行：`deno run scripts/extract.ts`

**Bun**：
```typescript
#!/usr/bin/env bun
import * as cheerio from "cheerio@1.0.0";
// 脚本逻辑...
```
运行：`bun run scripts/extract.ts`

**Ruby（Bundler Inline）**：
```ruby
require 'bundler/inline'
gemfile do
  source 'https://rubygems.org'
  gem 'nokogiri'
end
# 脚本逻辑...
```
运行：`ruby scripts/extract.rb`

**调用方式三：Bash/Shell 命令**

```bash
# 直接执行
uv run --project D:/Tools/Assembly/python/myenv python scripts/process.py --input data.json

# 管道组合（仅限 ; 和 |）
cd scripts; uv run --project D:/Tools/Assembly/python/myenv python validate.py; uv run --project D:/Tools/Assembly/python/myenv python process.py
```

### 3. 卸载机制

**工具调用的上下文隔离**：
- 脚本执行结果（stdout/stderr）进入 Agent 上下文
- 脚本本身不常驻上下文（除非被加载到上下文窗口）
- 工具输出超过阈值（~10-30K 字符）会被自动截断

**Python 程序执行规范**（来自用户记忆 #20）：
- 通过 `shell_exec` 调用，每次启动独立 PowerShell 会话
- 无法跨调用传递变量/数据
- 单次命令字符串不超过 7000 字符

**分片执行（大型输出）**：
```powershell
# 分片读取，每片 ≤ 500 行且 ≤ 40KB
Get-Content -LiteralPath "大文件.md" -Encoding UTF8 | Select-Object -Skip 0 -First 500 | Out-String
```


## 三、完整调用示例

### 子 Skill 调用完整流程

```yaml
# SKILL.md frontmatter
---
name: data-pipeline
description: ETL data processing pipeline. Use when cleaning, transforming, or loading datasets.
---
```

```markdown
## 工作流程

### 步骤 1：数据分析
首先加载分析 Skill 了解数据结构：
> 使用 data-analysis Skill 分析输入文件

### 步骤 2：数据清洗
运行清洗脚本：
```bash
uv run scripts/clean.py --input raw.csv --output clean.csv
```

### 步骤 3：数据验证
详细验证规则见 [validation guide](references/validation.md)

如果验证失败，加载 debug-helper Skill 排查问题。
```

### 外部工具调用完整流程

```yaml
---
name: pdf-processing
description: Extract PDF text, fill forms, merge files.
allowed-tools: Bash(pdf*) Read Write
compatibility: Requires Python 3.14+ and uv
---
```

````markdown
## PDF 表单填写流程

### 1. 分析表单结构
```bash
uv run scripts/analyze_form.py input.pdf > form_fields.json
```

### 2. 创建字段映射
编辑 `field_values.json`，映射每个字段名到目标值

### 3. 验证并填充
```bash
uv run scripts/validate_fields.py form_fields.json field_values.json
uv run scripts/fill_form.py input.pdf field_values.json output.pdf
```

### 错误处理
- 如 `validate_fields.py` 返回非零退出码，检查错误信息
- 字段不存在时脚本会列出可用字段名
````


## 四、总结：两种调用的核心差异

| 维度 | 子 Skill 调用 | 外部工具调用 |
|------|--------------|-------------|
| **触发** | 模型语义匹配 + 用户显式 | 指令明确 + allowed-tools 声明 |
| **加载** | 渐进式（metadata → body → resources） | 脚本/命令执行（不常驻上下文） |
| **通信** | 通过 Agent 上下文传递信息 | 通过 stdout/stderr/exit code |
| **卸载** | 上下文保护 + 去重 | 会话隔离 + 输出截断 |
| **关键设计** | 描述优化（触发率） | 非交互式 + 清晰的 --help |