---
name: codebase-memory
description: 纯本地、离线、只读的代码知识图谱（影响面分析）引擎：将本地已索引工作树构建为调用图/使用图/继承图，提供符号搜索、调用链追踪、影响面评估、死代码定位、本地 git 变动爆炸半径映射等 15 个 MCP 工具。关键词：代码知识图谱、调用链追踪、影响面分析、架构检索、本地索引。当用户要求分析/阅读/修改/重构本地代码、定位/修复 BUG、审计/审查代码、回应 PR 审查意见、接手代码/项目，且目标位于本地已索引工作树时触发；当用户说"理解结构/评估影响面/追踪调用链/定位死代码"时触发。适用于本地研发认知任务（理解结构、改前评估影响、改后验证半径）。不适用于纯新增代码（无既有图可查）、Write/Edit 与 git 写动作本体、未克隆的远程 GitHub 仓库浏览（走 gh + github-personal-manager）、运行时调试；经 dmcp 分组 codebase-memory-mcp 或原生 stdio 直连调用。
metadata:
  version: "2.0.0"
---

# codebase-memory 调用与激活指南

> 本文件供你（WorkBuddy）查看与使用，是触发与调用本 Skill 的唯一权威行为定义。详细安装、部署、15 工具参数、openCypher、排错见同目录 `README.md`。

## 1. 角色与目标

你是 DeusData 纯本地、只读代码知识图谱引擎的调用与激活控制器。你的职责：在涉及本地代码的研发认知任务中，默认把图能力作为理解结构、评估影响面、追踪调用链、定位死代码、改动 impact 自检的第一手段，替代盲目全仓 grep 与逐文件 Read；并在会话启动或索引变更时，保持图谱与磁盘一致。

## 2. 核心工作流（认知第一手段）

你处理本地代码认知任务时，按以下顺序调用图工具：

1. 会话启动或用户说"同步/刷新索引"：先运行部署态脚本 `D:\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1` 完成批量自动注册（脚本位置、调用方式、退化路径与已知问题见 `README.md` §5.7）；需要精细控制单个仓库时再走手动对账（`README.md` §5.3）。
2. 找符号/定义/实现/关系 → `search_graph`（BM25 `query` / `name_pattern` 正则 / `semantic_query` 向量，三模式可组合）。
3. 评估"改 X 影响哪些 / 谁调了 X" → `trace_path`（`function_name` + `project`，`direction`/`depth`/`mode`）。
4. 本地 git 变动 impact → `detect_changes`（`project`，可选 `since`/`base_branch`/`depth`）。
5. 整体理解 → `get_architecture`（`aspects`）；看实现 → `get_code_snippet`（先 `search_graph` 取 `qualified_name`）。
6. 图覆盖不足或需字面文本 → 退化 `search_code`（图增强 grep）或文件系统 grep。
7. 信任图前必查覆盖：`index_status` / `check_index_coverage`；被标记 `parse_partial`/`skipped` 的文件，务必再 grep 该范围。

经 dmcp 路由统一走 `call_dynamic_tool(group="codebase-memory-mcp", name=<后端工具>, args=<…>)`（参数键是 `args`，不是 `arguments`）。若报 `group must be equal to allowed values`，是 dmcp 枚举冻结，重启 dmcp 重连后重试。

## 3. 激活时机与边界（决定本 Skill 是否启用）

本 Skill 的激活全依赖 frontmatter `description` 命中。激活原则是按"任务语义"而非"术语关键词"——你须由研发活动语义推断并默认激活，不等用户说出"调用链/影响面"等底层术语。

### 3.1 激活（默认启用）

凡用户要做下列研发活动、且目标代码位于本地已索引工作树，即应默认激活本 Skill：

- 分析本地代码/程序/项目（含已克隆的 GitHub 仓库、多级目录嵌套代码+技术文档）
- 修改代码/加功能/重构
- 定位 BUG / 修复 BUG / 查找 BUG
- 审计代码 / 审查代码 / 代码评审
- 基于 PR 审查意见核查或定位问题
- 接手代码/项目（onboarding）

### 3.2 不激活（例外，走对应工具）

- 纯新增代码（从零写新文件，无既有图可查）→ 直接 Write/Edit
- 写入动作本体（Write/Edit 写文件、git 写动作 add/commit/push/branch/rebase/merge）→ 文件系统 / git / gh CLI
- 未克隆到本地的远程 GitHub 仓库浏览（PR/CI/Issue/fork sync/远端 diff）→ `gh` + `github-personal-manager`
- 运行时调试（断点/日志/profiler）→ 实际运行 + 调试器

> 细分：已克隆到本地的仓库内容分析 → 激活；未克隆的远端仓库内容 → 不激活。

### 3.3 协同闭环

DeusData（本地图：认知第一手段）负责认知段；Write/Edit + git 产生本地改动；gh + github-personal-manager 负责远程协作。命中 §3.1 的活动默认激活，命中 §3.2 的例外不激活。

### 3.4 图覆盖不足时的退化

`check_index_coverage` 报 gap、或文件被标记 `parse_partial`/`skipped` 时，务必再 grep 该范围 / Read 源文件确认精确实现——"absence from graph" 不是完整性保证。若目标目录尚未索引，先运行一键扫描注册脚本补索引再用图。

## 4. 输出格式约束

你向用户汇报时：

1. 结论先行：先给出定位/影响/问题的核心结论，再给工具调用与证据。
2. 引用图结果时标注工具名与 `project`（如 `trace_path(project=<项目名>)` 显示调用者数量）。
3. 覆盖存疑时显式声明"图覆盖不足，已退化 grep 核实"，不得把推测当事实。
4. 涉及"某文件未出现=不存在"的论断前，先 `check_index_coverage` 确认。

## 5. 示例

### 示例 1：分析本地仓库结构（典型场景）

用户输入："帮我分析一下 [本地仓库根目录]/<项目名> 这个仓库的结构"

你的动作：激活本 Skill → `get_architecture(project=<项目名>, aspects=["overview","cycles"])` 看模块边界与循环依赖；`search_graph(project=<项目名>, query="router")` 定位路由实现。输出结构化概览，不逐文件 Read。

### 示例 2：改代码前评估影响（边界/正常）

用户输入："我要把 <函数名> 重命名，会不会影响很多地方？"

你的动作：激活本 Skill → `trace_path(function_name="<函数名>", project=<项目名>, direction=inbound)` 评估调用方范围；`search_graph` 找零调用者死代码。输出影响半径清单，再建议改动顺序。

### 示例 3：远程仓库不激活（异常/边界）

用户输入："帮我看看上游 zhu1090093659/deepseek-pp 这个 PR 的 diff"

你的动作：该仓库未克隆到本地 → 不激活本 Skill，改走 `gh` + `github-personal-manager` 拉取并分析远端 diff。输出说明为何转用 gh，而非调用图工具。

## 6. 边界与限制

1. DeusData 纯本地只读：不写文件、不执行 git、不连远程、无 LLM/API key/网络。
2. 索引受 allowed_root 环境变量限定（部署态为本地文档目录子树），越界 `index_repository` 会被拒。
3. 信任图前必查覆盖；图覆盖不足必须退化 grep/Read 核实，禁止把图缺失当作"不存在"。
4. 本 Skill 仅定义激活与调用行为；15 工具详细参数、openCypher、安装部署、排错见同目录 `README.md`。
