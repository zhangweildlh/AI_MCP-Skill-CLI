---
title: "多工具协同SOP"
topic: "多工具协同SOP"
tags: [多工具协同SOP, 记忆]
related:
  - "MEMORY.md"
  - "Memory-入口能力与图谱.md"
scope: "永久记忆"
created: "2026-09-10T15:08:10.678676+00:00"
updated: "2026-09-10T15:08:10.678676+00:00"
parent: "MEMORY.md"
positioning: "多个工具/多技能协同工作的 SOP 集（按什么步骤协同、失败如何降级、分几个场景）"
role: 作业流程层
theme: "全盘检索 / 语义搜索 / 代码图谱定位 / 调用链与影响面分析 / 失败降级"
scope_in: "并行执行与验证链原则；Token 最小化；错误处理与降级链；7 类场景的多工具协同步骤（全盘文件名/内容/语义检索；符号定义、调用链追踪、影响面分析、架构概览）"
scope_out: "单个工具的能力台账与调用方式 → 子文件5；环境级工具禁令与工具优先规则 → 子文件1；搜索过程中的踩坑案例 → 子文件4；GitHub 平台信息检索 → 子文件3"
file_number: 6
---
> **本文件速查索引**（按章节顺序排列）
> 精确定位到 ### 级别，避免全文加载。

| 适用场景 | 章节位置 | 备注 |
|---------|---------|------|
| 6-1 执行原则 | `## 6-1 执行原则` |  |
| 6-2 场景1：所有硬盘所有目录查找文件 | `## 6-2 场景1：所有硬盘所有目录查找文件` |  |
| 6-3 场景2：所有硬盘所有目录查找关键词/内容/字符串 | `## 6-3 场景2：所有硬盘所有目录查找关键词/内容/字符串` |  |
| 6-4 场景3：所有硬盘所有目录进行语义搜索 | `## 6-4 场景3：所有硬盘所有目录进行语义搜索` |  |
| 6-5 场景4：代码编辑任务中符号/定义/关系/调用链/继承... | `## 6-5 场景4：代码编辑任务中符号/定义/关系/调用链/继承/数据流搜索` |  |
| 6-6 场景5：代码编辑任务中调用链追踪 | `## 6-6 场景5：代码编辑任务中调用链追踪` |  |
| 6-7 场景6：代码编辑任务中影响面分析 | `## 6-7 场景6：代码编辑任务中影响面分析` |  |
| 6-8 场景7：代码编辑任务中架构概览 | `## 6-8 场景7：代码编辑任务中架构概览` |  |
<!-- INDEX_END -->
## 6-1 执行原则

> 工具本身的接入方式、清单与适用边界见 [`## 5-3 DeusData本地代码知识图谱（经 dynamic-mcp 接入）`](file:///D:/Documents/AI_MCP-Skill-CLI/Memory-Data/Memory-入口能力与图谱.md#5-3-deusdata本地代码知识图谱经-dynamic-mcp-接入)（单向引用，不重述；本文件只描述多工具按步骤协同）。

1. **并行执行**：快速定位工具（Everything-search）+ 深度分析工具（zvec-grep/codebase-memory）
2. **验证链**：初步结果 → 二次确认 → 语义验证 → 上下文扩展
3. **Token最小化**：精确查询、结果限制、分阶段获取、缓存利用
4. **错误处理**：
   - Everything-search 失败 → 降级到 WorkBuddy Grep + 目录遍历
   - zvec-grep 未就绪 → 使用 WorkBuddy Grep 基于关键词搜索
   - codebase-memory 未索引 → 使用 WorkBuddy Grep + git grep 基础代码搜索

## 6-2 场景1：所有硬盘所有目录查找文件
1. 使用 `everything_search` 搜索文件名或类型
   - 语法：`ext:pdf` 查找PDF文件
   - 语法：`filename:config*` 查找以config开头的文件
   - 语法：`path:D:\Projects\*` 限制在特定路径
2. 需要更精确验证时使用 WorkBuddy Glob

## 6-3 场景2：所有硬盘所有目录查找关键词/内容/字符串
1. 使用 `everything_search` 进行全文内容搜索（`content:` 前缀）
   - 语法：`content:"函数名"` 查找包含特定函数名的文件
   - 语法：`content:TODO ext:md` 查找Markdown文件中的TODO
2. 对结果使用 WorkBuddy Grep 进行二次确认（尤其复杂正则）
3. 代码搜索需理解上下文时，使用 zvec-grep 进行语义搜索

## 6-4 场景3：所有硬盘所有目录进行语义搜索
1. 使用 Everything-search 预过滤文件类型（`.py, .js, .ts, .java, .cpp, .md` 等）
2. 使用 zvec-grep 进行语义核心搜索
   - 示例：查找"处理用户登录验证"相关的代码
3. 使用 WorkBuddy Grep 检查结果中的关键标记
4. 对关键结果使用 Everything-search 获取周边内容

## 6-5 场景4：代码编辑任务中符号/定义/关系/调用链/继承/数据流搜索
1. 使用 codebase-memory-mcp 的 `get_architecture` 获取架构概览
2. 使用 `search_graph` 查找符号定义（`search_graph "函数名"` 或 `search_graph "类名"`）
3. 使用 `trace_path` 追踪调用链
4. 使用 `detect_changes` 或结合 `trace_path` 分析影响面
5. 使用 zvec-grep 确认关键路径的语义一致性
6. 使用 WorkBuddy Grep 或 git grep 在特定文件中定位精确位置

## 6-6 场景5：代码编辑任务中调用链追踪
1. 使用 Everything-search 或 WorkBuddy Grep 确定目标函数位置
2. 使用 codebase-memory-mcp 的 `trace_path` 进行调用链分析
   - 正向追踪：从目标函数出发查看调用的函数
   - 反向追踪：查看调用目标函数的函数
3. 使用 zvec-grep 检查路径中函数的语义相似性
4. 使用 Everything-search 排除测试文件或生成代码
5. 通过 trace_depth 参数控制追踪深度

## 6-7 场景6：代码编辑任务中影响面分析
1. 使用 Everything-search 或 git grep 确定变更点精确位置
2. 使用 codebase-memory-mcp 的 `detect_changes` 扫描影响面
3. 使用 `trace_path` 确认关键调用路径
4. 使用 zvec-grep 查找可能受影响但未直接调用的相关代码
5. 使用 Everything-search 搜索可能包含相关注释或文档的文件
6. 生成影响等级分类报告（直接影响、间接影响、潜在影响）

## 6-8 场景7：代码编辑任务中架构概览
1. 使用 codebase-memory-mcp 的 `get_architecture` 获取全局架构
2. 结合热点输出识别修改频繁的区域
3. 使用 Everything-search 快速获取文件类型分布
4. 对重要架构节点使用 zvec-grep 检查其实现一致性
5. （可选）结合 git 工具分析架构变化趋势

[→主文件](file:///C:/Users/15794/.workbuddy/MEMORY.md)
