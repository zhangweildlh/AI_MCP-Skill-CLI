# MEMORY.md 多文件记忆系统维护工具

**memory-mgr.py** 是用于维护 `C:\Users\15794\.workbuddy\MEMORY.md` 拆分后多文件记忆系统的 Python 工具。

## 快速开始

### 1. 环境要求

- Python 3.12+（建议 3.14.5）
- uv（Python 包管理器）
- Windows 11 + Git Bash / PowerShell

### 2. 文件位置

```
主文件：C:\Users\15794\.workbuddy\MEMORY.md
子文件：D:\Documents\AI_MCP-Skill-CLI\Memory-Data\
工具：  D:\Documents\AI_MCP-Skill-CLI\Memory-Data\memory-mgr.py
```

### 3. 基础用法

```bash
# 进入工具目录
cd "D:\Documents\AI_MCP-Skill-CLI\Memory-Data"

# 完整性检查（日常首选）
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py --main-file "C:/Users/15794/.workbuddy/MEMORY.md" --sub-files-dir "D:/Documents/AI_MCP-Skill-CLI/Memory-Data" --no-interactive check

# 综合校验（12条纪律验证）
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py --main-file "C:/Users/15794/.workbuddy/MEMORY.md" --sub-files-dir "D:/Documents/AI_MCP-Skill-CLI/Memory-Data" --no-interactive validate

# 查看帮助
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py --help
```

## 命令速查

| 命令 | 用途 | 示例 |
|------|------|------|
| `check` | 完整性检查（链接/锚点/循环引用） | `python memory-mgr.py check` |
| `validate` | 综合校验（12条纪律） | `python memory-mgr.py validate` |
| `sync` | 同步状态文件 | `python memory-mgr.py sync` |
| `index` | 生成/更新索引表 | `python memory-mgr.py index` |
| `add` | 新增子文件 | `python memory-mgr.py add --topic "主题" --content "内容"` |
| `remove` | 删除子文件 | `python memory-mgr.py remove --file "Memory-xxx.md" --force` |
| `rewrite` | 重编号章节 | `python memory-mgr.py rewrite --dry-run` |
| `get-offset` | 定位章节位置 | `python memory-mgr.py get-offset --file "Memory-xxx.md" --section "## 1"` |
| `changelog` | 查看变更历史 | `python memory-mgr.py changelog --days 7` |
| `diff` | 比较版本差异 | `python memory-mgr.py diff --before abc123 --after def456` |
| `restore` | 回滚到历史版本 | `python memory-mgr.py restore --file "Memory-xxx.md" --commit abc123 --force` |
| `help` | 显示帮助 | `python memory-mgr.py help` |

## 日常维护流程

### 新增子文件

```bash
# 1. 准备内容（Markdown格式）
cat > /tmp/new_topic.md << 'CONTENT'
---
title: "新专题记忆"
topic: "新专题"
tags: [test, 专题]
related: ["MEMORY.md"]
scope: "永久记忆"
created: "2026-08-28T10:00:00+08:00"
updated: "2026-08-28T10:00:00+08:00"
parent: "MEMORY.md"
summary: "新专题记忆文件"
keywords: ["测试", "专题"]
priority: "medium"
status: "active"
---
# 新专题记忆

## 章节一

内容...
CONTENT

# 2. dry-run预览
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py add --topic "新专题" --title "新专题记忆" --summary "新专题记忆文件" --tags "test,专题" --content /tmp/new_topic.md --dry-run

# 3. 确认无误后执行
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py add --topic "新专题" --title "新专题记忆" --summary "新专题记忆文件" --tags "test,专题" --content /tmp/new_topic.md

# 4. 验证结果
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py check
```

### 删除子文件

```bash
# 1. dry-run预览（检查引用）
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py remove --file "Memory-xxx.md" --dry-run

# 2. 确认无误后强制删除
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py remove --file "Memory-xxx.md" --force

# 3. 验证结果
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py check
```

### 章节重编号

```bash
# 1. 预览效果（不实际执行）
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py rewrite --dry-run

# 2. 确认无误后执行
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py rewrite
```

## 新手使用指南

### Q: 如何找到需要的记忆内容？

**答**: 主文件 `MEMORY.md` 是入口，包含完整的主索引表：

```markdown
<!-- MAIN_INDEX_START -->
| 适用场景 | 目标文件 | 章节位置 |
|---------|---------|---------|
| GitHub全流程操作 | Memory-GitHub全流程操作.md | `## 8` ~ `## 22` |
| 代码纪律与Git操作 | Memory-代码纪律与Git操作.md | `## 6` ~ `## 7` |
| 全局禁令与环境约束 | Memory-全局禁令与环境约束.md | `## 1` ~ `## 5` |
| 避坑铁律 | Memory-避坑铁律.md | `## 23` ~ `## 25` |
| 入口能力与图谱 | Memory-入口能力与图谱.md | `## 26` ~ `## 29` |
<!-- MAIN_INDEX_END -->
```

### Q: 如何读取特定章节？

**答**: 使用 `get-offset` 命令定位章节行号，然后结合 Read 工具的 offset/limit 参数精准读取：

```bash
# 获取章节行号范围
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py get-offset --file "Memory-GitHub全流程操作.md" --section "## 13 工作流一 github-personal-manager 自动激活（GitHub 工作流总闸门，前置）"
```

输出示例：
```
文件: Memory-GitHub全流程操作.md
章节: ## 13 工作流一 github-personal-manager 自动激活（GitHub 工作流总闸门，前置）
起始行: 397
结束行: 462
内容行数: 66
```

> **⚠️ 重要注意事项**：
> - `--section` 参数必须使用**完整章节标题**（从主索引表复制），而非简短编号
> - 错误示例：`--section "## 29"` → 报错"未找到章节"
> - 正确示例：`--section "## 29 DeusData本地代码知识图谱（经 dynamic-mcp 接入）"`
> - 如不确定完整标题，可先运行不带 `--section` 参数的命令查看可用章节列表

### Q: 如何检查记忆系统健康状态？

**答**: 运行 `check` 和 `validate` 命令：

```bash
# 完整性检查（链接/锚点/循环引用）
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py check

# 综合校验（12条纪律）
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py validate
```

### Q: 如何恢复误删的文件？

**答**: 使用 `restore` 命令（需 git 可用）：

```bash
# 查看历史记录
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py changelog --file "Memory-GitHub全流程操作.md"

# 恢复到指定版本
uv run --project D:\Tools\Assembly\python\myenv python memory-mgr.py restore --file "Memory-GitHub全流程操作.md" --commit <commit_hash> --force
```

## 核心纪律（必读）

主文件 `MEMORY.md` 的 `## 高频纪律速览` 章节包含每条会话必须遵守的核心规则：

1. **规则一：大白话** — 技术概念先讲人话再给命令
2. **规则二：汉语+英语** — 禁止裸英文单词，用「汉语 + (英语)」表述
3. **规则三：全程中文** — 思考、推理、工具调用输出必须用中文
4. **规则四：结论唯一** — 矛盾时输出单一权威结论，不产多版并存

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| v3.1.0 | 2026-08-27 | 审计报告质证后修复（P0-P3级BUG） |
| v3.1.1 | 2026-08-27 | 重编号后锚点同步、同文件锚点双轨同步 |
| v3.1.2 | 2026-08-27 | 纪律1误报修复（代码块注释行）、良性环误报修复 |
| v3.1.3 | 2026-08-28 | add命令支持--title/--summary、rewrite支持--dry-run |
| v3.1.4 | 2026-08-28 | add命令自动填充related字段默认值 |

## 注意事项

- 本工具仅用于维护 `C:\Users\15794\.workbuddy\MEMORY.md` 及其子文件
- 子文件目录 `D:\Documents\AI_MCP-Skill-CLI\Memory-Data\` 已排除在 AGENTS.md worktree 纪律之外
- 每次修改文件前自动创建 `.bak` 备份
- 破坏性操作（remove/restore）需显式指定 `--force` 并二次确认
- 建议先使用 `--dry-run` 预览效果，确认无误后再执行实际变更

---

**维护者**: WorkBuddy
**最后更新**: 2026-08-28
