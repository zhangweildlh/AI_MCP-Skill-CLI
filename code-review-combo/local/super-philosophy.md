# 本地增强：S.U.P.E.R 架构质量镜（融合自上游范式）

> **来源与许可**：本文件内容融合自上游 `zhu1090093659/spec_driven_develop`（MIT License，Copyright (c) 2026 spec-driven-develop contributors）。
> 具体上游文件：`plugins/spec-driven-develop/skills/spec-driven-develop/references/super-philosophy.md`（blob `3eb0550f11598af388717deb29e2e07cbf359949`，随 `spec-driven-develop` 技能 v1.15.0）。
> 上游 LICENSE 全文（MIT）：
>
> ```
> MIT License
> Copyright (c) 2026 spec-driven-develop contributors
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction... (see upstream LICENSE for full text)
> ```
>
> code-review-combo 仅复用其**方法论文本**，未引入任何运行时依赖；上游文件本身未被内嵌为子技能镜像。

## 在 code-review-combo 中的角色

S.U.P.E.R 不是一条独立的审查「路」，而是叠加在既有三路（OCR 原生审查 / delegate 平等主审 / review-spd 五焦点）之上的**跨切面架构质量镜**：

- 各路审查者（以及 Stage3 宿主做真实验证时）应同时套用下方 10 项评审核查，把架构质量问题作为 `category: other` 的发现产出（不新增第 4 路、不改 `merge_reports` 的 Schema 与确定性合并逻辑）。
- 它补足 combo 此前「仅缺陷维度」的缺口，使合并报告同时覆盖「缺陷/回归」与「架构质量」两类信号，且**零外部依赖**，符合 combo「不依赖外部 LLM Key」的底线。
- 若某改动明显违反 S.U.P.E.R（如硬编码密钥、循环依赖、不可替换的紧耦合），即使不是运行期 bug，也应作为发现进入报告，由宿主在 Stage3 据实定级。

---

# S.U.P.E.R Architecture Philosophy（上游原文融合）

> Write code like building with LEGO — each brick has a single job, a standard interface, a clear direction, runs anywhere, and can be swapped at will.

这组架构原则指导 Spec-Driven Develop 工作流各阶段产出的所有代码。每个执行任务的 Agent 都应内化这些原则。

---

## S — Single Purpose（单一职责）

源自 Unix 哲学。

- 每个模块、文件、函数只解决一个问题。
- 偏好拆解；威力来自组合。
- 一个技能做一件事，一个 worker 做一件事，一个脚本做一件事。

**试金石**：如果你无法用一句话描述一个模块的职责，它需要被拆分。

**反模式**：一个脚本既拉取数据、又算指标、又渲染图表、又发通知。

**正确做法**：
```
fetch_data.py  -> 仅取数，输出 JSON
compute.py     -> 仅计算，读 JSON 写 JSON
render.py      -> 仅渲染，读 JSON 生成 HTML
notify.py      -> 仅通知，读 JSON 调 webhook
```

---

## U — Unidirectional Flow（单向流）

源自 Clean Architecture。

- 数据始终单向流动：输入 → 处理 → 输出。
- 依赖始终指向内层：外层依赖内层，内层对外层一无所知。
- 无反向依赖、无循环调用。

**分层模型**：
```
+-------------------------------+
|  Infrastructure (API, DB, UI) |  <- 最外层，可随时替换
+-------------------------------+
|  Adapters (transform, format) |
+-------------------------------+
|  Core business (pure logic)   |  <- 最内层，零外部依赖
+-------------------------------+
```

**试金石**：核心逻辑能否在零外部服务下跑单元测试？不能，则依赖方向错了。

---

## P — Ports over Implementation（端口优于实现）

源自 Hexagonal Architecture。

- 先定义接口契约（数据结构、JSON Schema），再写实现。
- 用中间格式（JSON 文件、标准数据结构）隔离上游与下游。
- 换数据源、换渲染层、换通知通道，都要求核心逻辑零改动。

**实践**：
1. 每个模块的输入输出必须是可序列化数据结构。
2. 模块边界通过 JSON 文件或标准数据结构通信；进程内强类型对象可以，但跨模块接口必须可序列化。
3. 定义显式 schema——而不是「读代码才知道格式」。

---

## E — Environment-Agnostic（环境无关）

源自 12-Factor App。

- 配置通过环境变量或配置文件注入，绝不硬编码。
- 所有依赖显式声明（requirements.txt / package.json），不隐式依赖全局系统包。
- 进程无状态；持久化委托外部存储。
- 日志走 stdout，而非写文件。
- 同一份代码能在本机、Cloudflare Workers、VPS、Docker 上运行。

**配置优先级（高→低）**：
```
环境变量 > .env 文件 > config.json > 代码内默认值
```

**核查清单**：
- 所有 API key / webhook URL 都从环境变量读取？
- 所有依赖都显式声明在依赖文件？
- 无硬编码文件路径假设？
- 换一台机器能否零改动运行？

---

## R — Replaceable Parts（可替换部件）

S + U + P + E 的自然结果，也是架构质量的终极目标。

- 任何层都能替换而不影响其它层。
- 替换成本是衡量架构质量的核心指标。
- 如果替换一个组件引发无关模块的连锁改动，架构就坏了。

**替换矩阵**：
| 替换 | 影响范围 | 正确做法 |
|:-----|:---------|:---------|
| 数据源 API | 仅 Adapter 层 | 写新 fetcher，输出相同 JSON |
| 前端渲染器 | 仅 Render 层 | 读相同 JSON，换渲染实现 |
| 通知通道 | 仅 Notification 层 | 换 webhook adapter |
| 部署平台 | 仅 Deploy 配置 | 改 wrangler.toml 或 Dockerfile |
| 编程语言 | 仅实现 | JSON 契约不变，任意语言重寫 |

---

## Quick Check Card（速查卡）

```
+------------------------------------------+
|         S.U.P.E.R Quick Check            |
|                                          |
|  S  Does this module do only one thing?  |
|  U  Is the data flow unidirectional?     |
|  P  Are inputs/outputs schema-defined?   |
|  E  Can it run in a different env?       |
|  R  Can you replace it without ripple?   |
|                                          |
|  All Yes -> Architecture healthy         |
|  1-2 No  -> Refactoring needed           |
|  3+ No   -> Technical debt alert         |
+------------------------------------------+
```

---

## S.U.P.E.R Code Review Checklist（10 项评审核查）

每次审查（或每个改动）完成后跑此清单。本文件是 agent 规范副本，与上游 README 中用户可见版本保持一致。

| # | 检查项 | 对应原则 |
|:--|:-------|:---------|
| 1 | 每个新模块/文件恰好一个职责 | S |
| 2 | 没有函数做多于一个概念性事情 | S |
| 3 | 数据流向 输入 → 处理 → 输出，无反向依赖 | U |
| 4 | 未引入循环 import | U |
| 5 | 跨模块接口是 schema 定义的 | P |
| 6 | 模块 I/O 可序列化 | P |
| 7 | 无硬编码路径、URL、key 或配置值 | E |
| 8 | 所有新依赖显式声明 | E |
| 9 | 新模块可不改其它模块就被替换 | R |
| 10 | 改动后所有测试通过 | — |

**评分规则**：全部通过 → 继续；1–2 项失败 → 修复后再标记完成；3 项及以上失败 → 停下重构。

---

## combo 融合约定（本文件特有，非上游原文）

- 上游在「每任务完成后」跑此清单；combo 将其提升为**跨切面审查镜**：三路审查的任一发现若属架构质量类（硬编码密钥、循环依赖、不可序列化 I/O、隐式全局依赖等），以 `category: other` 进入 `findings[]`，severity 由宿主在 Stage3 据实判定（通常 medium/low，除非是安全类密钥泄漏则升 security）。
- 不因此新增第 4 条审查「路」，也不改动 `merge_reports` 的确定性合并逻辑——S.U.P.E.R 只是各路与宿主共享的**检查清单**，其产出走既有 `findings[]` 通道。
- 「评分规则：3 项及以上失败 → 停下重构」是上游 spec-driven 开发闭环纪律；在 combo 中**不中断三路既有审查流**——S.U.P.E.R 仅作各路 / 宿主共享的检查清单，其发现走既有 `findings[]` 通道，绝不因某项未过而中止 OCR / delegate / review-spd 的并行审查或 `merge_reports` 合并。
- 上游范式若演进（blob SHA 变化），按 README §6.3 的检查命令重新取 `super-philosophy.md` 的 blob SHA 比对；本文件与上游偏差属「本地融合增强」，更新时保留本文件头部 MIT 署名与「combo 融合约定」段。
