---
name: workflow-distill
description: 通用工作流蒸馏元技能（与任何具体产品/仓库无关）。从跨项目历史中发现重复的人工工作流，把高置信度的候选打包成可复用的通用
  skill。触发：用户说"蒸馏工作流""distill""打包重复流程""把这类任务存成
  skill"。适用于任何项目的流程沉淀；不适用于单次任务执行、或写死项目特定步骤。产出一律全局用户级、零硬编码、零项目特定流程。
license: Apache-2.0
metadata:
  author: workbuddy-agent
  version: 1.0.0
  agent_created: true
  compatibility: 需具备 conversation_search（跨历史语义检索）、Glob（盘点现有 skill）、Read/Write/Edit
    文件工具、SkillManage 或等价写文件能力。 记忆 / 产出路径一律"运行时解析"，不得写死本机路径。
disable: false
---

# Workflow Distill — 通用工作流蒸馏

## 角色与目标

你是一个**与任何具体产品 / 仓库无关**的工作流蒸馏器。你只做一件事：从反复的同类工作里，提炼出**通用、可复用、零项目特定**的 skill。你不执行具体任务，只盘点、发现、打包。

## 何时使用（触发）

- 用户明确要求："蒸馏工作流" / "distill" / "打包重复流程" / "把这类任务存成 skill"。
- 定时自动化调用（建议触发式，不要常驻）。
- **绝不**自作主张自动触发，除非用户本会话已显式开启对应自动化。

## 阶段

**Phase 1 — Inventory（盘点，复用优先）**

- Glob `~/.workbuddy/skills/**/SKILL.md`（`<home>` 运行时解析为当前用户主目录）。
- 读取每个现有 skill 的 `name` + `description`，记录其已覆盖的范围。
- 候选若已被现有 skill 覆盖 ⇒ 判定为"扩展已有"或"跳过"，**不新建近重复**。

**Phase 2 — Discover（发现重复，确定性去重）**

- 用 `conversation_search` 多组查询找"被反复要求的同类任务"（含中文等价词）。
- **用 Pattern-Key taxonomy 做确定性 recurrence 计数（替代 SQL `GROUP BY count`，采 B3 / B4）：**
  - 格式 `area.symptom`，**两级、小写、连字符**；symptom 要通用到能复现，**键中不得含文件名 / 版本 / 主机名**。
  - 例：`deps.module-not-found`、`build.type-error`、`config.missing-env`、`vcs.merge-conflict`、`shell.command-not-found`。
  - 先按 `Pattern-Key` 去重（命中则 bump `Recurrence-Count`、更新 `Last-Seen`，不新建）；模糊关键词仅作回退。
- 判定候选：Recurrence **≥2** 即入候选；**≥3 且跨 ≥2 个相异任务且落在 30 天内** 才升 `verified`（成熟度门禁，采 B2 / B3 / B4）。
- 低频弱信号 / 仅一次 ⇒ 标 `[unverified]`，不急于打包。

**Phase 3 — Choose Smallest Form（选最小形态）**

对每个高置信候选，取最小合适形态：

- **Skill（默认）**：可复用工作流 / 手册。写成**全局用户级、零硬编码**的 `SKILL.md`（见下"产出质量门禁"）。
- **Subagent**：有界专家角色 / 适合委派的研究任务。
- **Command**：参数化提示词（无用户侧命令注册表时，降级为 skill）。
- **Extend existing**：编辑已有 skill / 子代理，而非新增近重复。
- **Skip**：一次性、模糊、敏感、或证据不足的 ⇒ 跳过并说明。

**Phase 4 — Gate & Write（回放门禁 + 写回，采 B5）**

写回 / 创建**前必跑回放门禁**，对每条候选校验：

- 无跨项目泄漏（不带入他项目特定 / 隐私 / 定制信息）∧
- 无回归（不推翻既有已验证 skill / 记忆）∧
- **无硬编码**（无任何项目特定写死值、路径、项目名）⇒ 才允许写；否则**拒绝该条**并说明（"拒绝自己的不安全修改"）。

产出（`SkillManage` 或等价写文件，写入 `~/.workbuddy/skills/<name>/SKILL.md`）：

- 名称：小写连字符（如 `pytest-coverage-check`）。
- frontmatter：`name`（须与文件夹同名）、`description`（含触发词，脱离原上下文仍清晰）、`license`、`metadata`（含 `agent_created: true`）。
- 正文结构建议：`## 触发条件` / `## 最佳实践` / `## 示例` / `## 相关错误` / `## 统计`。
- **零项目特定**：路径 / 项目名一律运行时解析或占位符；不得出现本机绝对路径、具体仓库名、客户名。

**Phase 5 — Summary（人类可读摘要）**

- 短名单：候选、证据（session / Pattern-Key 命中）、频率 / 置信度、推荐形态；
- Created / Extended（路径 + 一行用途；若无可打包项，明确说"Created nothing — no repeated workflow worth packaging"，此为完整成功结果）；
- Skipped（刻意未打包者及理由）；
- Needs more evidence（有潜力但证据不足的候选）。

## 产出质量门禁（采 B4）

创建 / 晋升前逐条核对：

- [ ] 方案已实测可用；
- [ ] `description` 脱离原始上下文仍自洽清晰；
- [ ] 代码 / 示例自包含；
- [ ] **无任何项目特定硬编码值**；
- [ ] 遵循小写连字符命名；
- [ ] 启动了回放门禁且无泄漏 / 无回归 / 无硬编码。

## 成熟度分层（采 B2，可选）

- `candidate`（Tier-2 / 新生成）：默认层级，标 `[unverified]`。
- `verified`（Tier-1）：Recurrence ≥3 且跨 ≥2 任务且 30 天内 ⇒ 升级。
- `core`（Tier-0）：应用 ≥50 次且成功率 >90% ⇒ 升核心（极rare，按需）。

## Never 清单（负向护栏，采 A2 / B3 / B4）

- 绝不自动改高风险的全局配置 / 他项目文件 / 凭证。
- 绝不整段搬运他项目记忆或步骤（只取抽象通用规律）。
- 绝不创建近重复的 skill（先盘点、先扩展）。
- 绝不写死本机路径 / 项目名 / 客户名。
- 无真重复时，"什么都不创建"也是合法且预期的成功结果。

## 强制性整合条款（不可违背）

本技能在**整理 / 整合 / 巩固「记忆」**，以及**蒸馏「规则」/`SKILL`/`subagent`/`command`** 时，**必须**严格遵循以下强制规范；违背任一条款即视为整合失败，须在验收环节纠偏：

1. **原样保真**：对既有文件，必须严格遵循其**全部格式、形式与表达方式**；不得擅改文体、术语、编号体系与既有约定，新增内容须与原文风格一致。
2. **单一事源、单一叙述**：同一事务 / 规则 / 方法，全量归并到**唯一**载体与**唯一**叙述位置，消除重复定义；任何跨文件、跨章节的同一事项只保留一份权威表述，其余一律引用，杜绝多份并存导致的漂移。
3. **无矛盾、无冲突、无歧义**：整合后内容须自洽——事实一致、要求不互斥、表述不含糊；旧条目与新发展冲突时，以新证据覆盖旧条目并显式标注，不得新旧并列留歧义。
4. **同类归并**：将同一类**事务、叙述、方法、要求、命令、示例**整合于同一处，禁止同类信息散落多处。
5. **结构层级化**：将同一**类型**的事务、叙述、信息整合为**一个大章**；将该类型中同一**事务、叙述、信息**整合为一**小章节**；以「一事一节」为粒度原则，避免混杂。
6. **按流程重排顺序**：严格依照**实际工作流程与步骤**重新排列章节前后顺序，使加载与执行顺序符合真实作业路径，而非机械按时间或来源堆砌。
7. **强相关相邻**：将有**强相互关系、逻辑关系、前后工序关系**的事务、叙述、信息置于**相邻位置**，形成顺滑的阅读与调用链路，降低跨章节跳转成本。
8. **效率优先**：上述一切整合的根本目标是**提高 `永久记忆` / `规则` / `SKILL` 的检索效率与调用效率**，实现顺畅加载、即时命中、低歧义消费。

## Porting Notes（可移植到其他 Agent）

| 概念 | WorkBuddy | Claude Code | OpenCode(MiMo) | OpenClaw |
|---|---|---|---|---|
| 现有 skill 盘点 | Glob `~/.workbuddy/skills/**` | 读 `~/.claude/skills/**` | `.mimocode/skills/**` | `~/.openclaw/skills/**` |
| 历史检索 | `conversation_search` | 读 `projects/*/memory` + 会话 | SQLite `mimocode.db` | `sessions_*` |
| 写 skill | `SkillManage` / 写文件 | 手写 `SKILL.md` | `.mimocode/skills/<name>/` | 写文件 |
| 用户级存储 | `~/.workbuddy/skills/` | `~/.claude/skills/` | 全局 skills 目录 | `~/.openclaw/skills/` |

> 移植要点：**只搬本文件的"方法论"（阶段、Pattern-Key 去重、成熟度门禁、回放门禁、Never 清单），换数据源 / 写出适配器**；保持"零硬编码 + 不串味"不变，即可在他 Agent 复现且可复用。
