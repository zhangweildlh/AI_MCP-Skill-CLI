# OfficeCLI 工具指南

本地环境已安装 OfficeCLI 工具，用于创建、阅读、写入、编辑 Office 文件（*.docx、*.xlsx、*.pptx）。当需要读取、创建、写入、编辑 Office 文件时，**必须通过 `shell_exec` 调用 OfficeCLI 工具**。不得安装 Python 程序。

本指南为 OfficeCLI 基础操作指南。超长 Office 文件的分片读取与分片写入规范请参见 `references/05-long-file-handling.md`。

> **【OfficeCLI工具约束边界声明】**：
> 本技能中所有单段文本≤3000字符、单批次12条add指令、shell单次7000字符等分片约束，仅为调用OfficeCLI写入docx文件时的命令行参数硬性限制，仅用于规避Shell参数溢出、Office文件写入异常。**不对公文正文的段落长度、章节总字数、论证内容篇幅做业务层面限制**。

## ⚠️ Help-First Rule（强制）

**本指南只教"好的 docx 长什么样"，不穷举每个命令 flag。当属性名、枚举值或别名不确定时，调用 help 再操作，禁止主观猜测。**

```bash
officecli help docx                         # 列出所有 docx 元素
officecli help docx <element>               # 完整元素 schema（如 paragraph, field, numbering, toc）
officecli help docx <verb> <element>        # 动词作用域（如 add field, set section）
officecli help docx <element> --json        # 机器可读 schema
```

- **版本差异声明（强制）**：officecli 命令参数随版本变化。**任何命令执行失败后，必须运行 `officecli --help`（或 `officecli help docx <element>`）获取当前版本权威帮助，以此作为使用标准并重试，不得凭记忆硬编码 flag。** 本指南与 `assets/officecli-command-templates.md` 示例均以官方 `officecli-docx` 规范为准；若 installed 版本行为不同，以 `officecli --help` 为准。
- 调用 OfficeCLI 前，先执行 `officecli --version` 验证是否安装。
- 帮助命令等价关系：`officecli help` ≡ `officecli --help`，`officecli <cmd> --help` ≡ `officecli help <cmd>`。
- OfficeCLI 程序已在系统环境变量 PATH 注册，无需在本技能内自包含二进制文件。其参考文档采用**外部引用**：当 Agent 需要时，直接按 GitHub 仓库连接读取 `https://github.com/iOfficeAI/OfficeCLI/blob/main/SKILL.md`。若该链接不可读或调用失败，则改用 `officecli help` 命令获取所需文档，不得因此中断工作流。

## 对齐官方 `officecli-docx` 的关键约定

- **页脚活 PAGE 字段**：用单命令 `officecli add "$FILE" / --type footer --prop type=default --prop text="Page " --prop field=page` 注入 `fldChar`；或使用路径写法 `officecli add "$FILE" "/footer[1]/p[1]" --type field --prop fieldType=page`（路径须加引号 + `/p[1]`）。**禁止只写静态 "Page" 文本**。
- **表格单元格填充**：用行级 `c1..cN` 文本快捷 + `header=true`（如 `officecli set "$FILE" "/body/tbl[1]/tr[1]" --prop header=true --prop c1="列1" --prop c2="列2"`），**禁用 `--prop value=` 写入单元格**。
- **相似段落色**：优先 hex `0000FF`（无 `#`）；命名 `blue` 是否被接受以当前版本 `officecli --help` 为准。

## 核心命令速查

| 命令 | 用途 |
|------|------|
| `officecli help` | 所有命令 + 全局选项 + schema 入口 |
| `officecli help docx` | 列出所有 docx 元素 |
| `officecli help docx paragraph` | 完整 schema：属性、别名、示例、回读 |
| `officecli help docx set paragraph` | 仅显示可用于 set 的属性 |
| `officecli help docx paragraph --json` | 结构化 schema（机器可读） |
| `officecli create <file>` | 创建空白 .docx/.xlsx/.pptx（类型由扩展名决定） |
| `officecli view <file> <mode>` | 查看文档：outline \| stats \| issues \| text \| annotated \| html |
| `officecli get <file> <path> --depth N` | 获取节点及其子节点 [--json] |

## view 模式速查

| 模式 | 描述 | 常用标志 |
|------|------|----------|
| `outline` | 文档结构 | |
| `stats` | 统计信息（页数、字数、形状数） | |
| `issues` | 格式/内容/结构问题 | `--type format\|content\|structure`, `--limit N` |
| `text` | 纯文本提取 | docx: `--start N --end N`, `--max-lines N`; xlsx: 按行输出 |
| `annotated` | 带格式标注的文本 | |
| `html` | 静态 HTML 快照 | `--browser`, `--page N`（docx）, `--start N --end N`（pptx 按幻灯片） |
| `screenshot` / `svg` / `pdf` / `forms` | PNG / SVG（pptx）/ PDF / 表单字段 JSON | `-o`, `--screenshot-width/-height`, pptx `--grid N` |
