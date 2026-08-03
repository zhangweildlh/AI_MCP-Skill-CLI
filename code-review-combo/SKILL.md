---
name: code-review-combo
description: "功能：将两种互补的代码审查子技能（委托模式确定性审查 + 五焦点语义深度审查）交叉验证，产出唯一合并审计报告（人类可读文本 + 结构化 JSON）；为同一代码改动提供高置信度的单一审查结论。激活关键词：代码审查、代码审计、代码检查、协同审查、协同审计、BUG审查、BUG审计、查找BUG。适用场景：GitHub 仓库，代码修改，代码提交。不适用场景：纯非 GitHub 仓库/纯非 Git 文件夹的代码审查；非代码审查类任务（如文档润色、需求分析）。"
version: 1.0.0
---

# 联合代码审查（code-review-combo）

本技能将两个子技能组合，对代码改动做**交叉验证式**审查，最终产出**一份唯一的审计报告**。两个子技能已内嵌于本技能的子目录，**无需单独安装**，由本技能直接编排：

- `./open-code-review-delegate/SKILL.md` —— 基于 open-code-review（OCR）的委托模式。OCR 承担确定性工程（范围筛选、规则解析、整库扫描），宿主承担语义审查；其 SKILL.md 内置 `ocr` CLI 的**自动安装与自检查**，无需 LLM Key 即可走委托模式。
- `./review-spd/SKILL.md` —— findings-first 五焦点（正确性 / 回归兼容 / 测试 / 安全 / 性能并发）强制语义深度审查，自带 `./review-spd/scripts/review-context.py` 收集 git 上下文。

> **术语约定**：正文中的「open-code-review-delegate 子技能」与其底层工具「OCR / ocr」指代同一子技能；JSON 字段 `verified_by` 取值 `ocr-only` 即「仅 open-code-review-delegate 子技能发现」。

> **调用约定**：本技能不通过 Skill 工具单独激活任一子技能，而是**直接读取子目录的 SKILL.md 并按其指令执行**（子技能未单独安装）。请勿在本技能运行时再单独触发 open-code-review-delegate 或 review-spd，避免重复与结论冲突。

## 前置条件

- 目标**必须是 Git 仓库**（两个子技能均基于 git diff 工作；非 git 仓库无法运行，纯文件夹需先 `git init` 或手工喂 diff）。
- `open-code-review-delegate` 子技能会在首次运行时自动安装并自检 `ocr` CLI（委托模式无需 LLM Key）；仅当要使用其原生 `review` / `scan` 时才需另行配置 LLM。
- 本技能自身不引入任何额外外部依赖。

## 输入参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| target_repo | 字符串 | 是 | 待审查的 Git 仓库本地路径（对应 JSON 中 `<target_repo>`） |
| from_ref | 字符串 | 否 | 范围审查的基准引用（对应 `<from_ref>`；默认审查工作区未提交改动） |
| to_ref | 字符串 | 否 | 范围审查的目标引用（对应 `<to_ref>`；分支对比时为特性分支） |
| commit_hash | 字符串 | 否 | 单提交审查的提交哈希（对应 `<commit_hash>`） |
| branch | 字符串 | 否 | 分支对比时的分支名（对应 `<branch>`；与 from_ref/to_ref 二选一） |
| path_filter | 字符串 | 否 | 当目标为某 Git **仓库的子目录**（而非仓库根）时，指定相对仓库根的子目录路径（如 `github-personal-manager`）。用于把审查范围精确收敛到该子目录，避免范围失控扩大到整个父仓库。省略则按 `target_repo` 整仓审查。 |

## 核心原则：方案 B 交叉验证（不叠加、不重复劳动）

两个子技能唯一重叠的「找 bug」动作，统一交给 `review-spd` 承担，并显式接收 `open-code-review-delegate` 的发现作为**待验证 / 待补充**输入：

1. `review-spd` 先**验证** OCR 报告 A 中每一项发现是否属实（读取实际代码核实，误报标注为假阳性）；
2. 再**独立挖掘** OCR 未覆盖的盲区（review-spd 五焦点深度）。

这样既保留「双引擎交叉验证」的价值，又避免两份完全独立审查的纯重复劳动与结论打架。

## 三阶段工作流

### 阶段一：open-code-review-delegate 委托模式完整审查 → 产出报告 A

读取 `./open-code-review-delegate/SKILL.md`，按其「委托模式主工作流（默认，无需 LLM Key）」执行：

1. 前置检查：`ocr` CLI 可用性（子技能会自动安装 / 自检）。
2. `ocr delegate preview [--from <from_ref> --to <to_ref>]` 确定范围（默认工作区改动；分支对比用 `--from main --to <branch>`；**单提交模式（提供 `commit_hash`）用 `ocr delegate preview --commit <commit_hash>`（或 `-c <commit_hash>`），让 ocr 产出 commit 模式元数据；实际 diff 仍按步骤 4 的 `git show <commit_hash>` 获取，与 ocr 原生 Commit 模式一致**）。
3. `ocr delegate rule <paths>` 解析规则并分组。
4. 取 diff：`git diff HEAD`（已跟踪）/ merge_base..to（range）/ `git show <commit_hash>`（commit）/ 未跟踪新文件用 `cat`。
5. 宿主按规则逐文件审查（Step 4）。
6. 收敛为结构化 JSON（Step 5/6，Schema 见子技能「七、输出 JSON Schema」）。

产出 **报告 A**：结构化 JSON（含 `files` / `rules` / `findings` / `summary`）。

> 边界：若目标文件为 `.md` 等 OCR 不支持的扩展名，`preview` 会标记 `excluded: unsupported_ext`。此时沿用委托模式本质——由宿主直接读取这些文件的 diff 并审查（同 Step 4 宿主审查），再按子技能 JSON Schema 收敛，不走 OCR 的文件筛选。

> **子目录目标的范围收敛（重要）**：当 `target_repo` 是一个 Git 仓库、而实际要审查的是其中的**子目录 SKILL**（如 `AI_MCP-Skill-CLI/github-personal-manager`）时，`ocr delegate preview` 仅支持 `--repo/--exclude`、**无 `--path` 子目录限制**，会默认列出整个父仓库的工作区改动，导致范围失控。正确做法：用 `git diff HEAD -- <path_filter>` 精确取子目录 diff 作为审查范围；或 `ocr delegate preview --repo <仓库根> --exclude '<其他顶级目录>'` 排除无关目录；也可改用 `ocr scan --path <子目录>`（整库扫描模式，基于当前文件而非 diff）。宿主按此收敛后的文件列表执行 Step 4 审查。

### 阶段二：review-spd 交叉验证模式 → 产出报告 B

读取 `./review-spd/SKILL.md`，按其 Phase 1–6 流程执行，但采用**方案 B 交叉验证变体**：

- **子目录目标的范围收敛（已支持 `--path`，C-1 修复）**：`review-context.py` 会切到 git 根（`require_git_repo()`），并支持 `--path <subdir>` 参数（相对仓库根的子目录）将收集范围精确收敛到该子目录——该参数把 `-- <subdir>` 注入所有 git 命令（status / diff / log），因此阶段二直接运行 `python ./review-spd/scripts/review-context.py --path <path_filter>` 即可得到子目录级上下文，无需宿主再手工 `git diff HEAD -- <path_filter>` 收敛。省略 `--path` 时脚本收集整个父仓库上下文，此时才需要宿主手工收敛或按「异常处理」告知范围已扩大到整个仓库。
- **Phase 2 上下文增强**：除运行 `./review-spd/scripts/review-context.py` 收集 git 上下文外，**额外把阶段一的 diff 与报告 A 的发现列表**作为补充输入提供给审查者。
  - **单提交模式（`commit_hash`）**：`review-context.py` 支持 `--branch` / `--base` / `--since` / `--until` / `--path`，但无 `--commit`。因此阶段二**不调用该脚本的 date-range / branch 参数**，而是直接以 `git show <commit_hash>` 的 diff（与阶段一同一来源）作为 git 上下文提供给 review-spd；同时照常把阶段一的报告 A 作为交叉验证输入。阶段三输出 JSON 的 `target.type` 取 `commit`、`target.commit` 填 `<commit_hash>`。
- **Phase 4 子代理指令注入（关键）**：在每一个 focused reviewer 的指令中加入——
  > 「你已收到 open-code-review-delegate 的报告 A（JSON 发现列表）。请先逐一核对其标出的每项发现是否属实（读取实际代码验证，误报请标注为假阳性并说明原因）；随后再独立审查本焦点盲区，挖掘报告 A 未覆盖的缺陷。最终只产出你独立确认或新发现的、证据充分的发现。」
- **Phase 6 输出**：除 review-spd 原生 findings-first 文本外，按 `./review-spd/references/output-format.md` 的「Structured JSON」同时产出报告 B JSON（与报告 A 同 Schema，下游兼容；`mode` 用 `workspace | range | commit`）。

产出 **报告 B**：findings-first 文本 + 结构化 JSON。

### 阶段三：Agent 验证、审核两份报告 → 唯一审计报告

由本技能（宿主）执行最终裁决，必须结合实际代码，不得凭空采信任一份报告：

1. **交叉比对**：读取报告 A 与报告 B，逐项归类——
   - 两份都报的（高置信，保留）；
   - 仅一份报的（重点验证：读取实际代码核实真伪，确认则保留，误报则丢弃）；
   - severity 冲突的（读取代码核实后取较高者或据实定级）；
   - 疑似误报（无代码证据支撑的，静默丢弃）。
2. **真实验证**：对「仅一份报」或「疑似」项，必须打开实际代码核实，禁止直接采信子技能结论。
3. **去重合并**：按 `path` + `start_line` + `category` 去重，合成一份 findings 列表，按 severity 排序（Critical / High / Medium / Low）。
4. **唯一审计报告**：同时给出
   - 人类可读文本（findings-first，按严重度分组，含 `Residual Risks` / `Testing Gaps` / `Verification`）；
   - 结构化 JSON（复用 open-code-review-delegate Schema，便于下游 / Agent 消费）。

## 输出：唯一审计报告格式（结构化 JSON）

```json
{
  "tool": "code-review-combo",
  "mode": "dual-cross-validation",
  "repository": "<target_repo>",
  "target": { "type": "workspace | range | commit", "from": "<from_ref>", "to": "<to_ref>", "commit": "<commit_hash>" },
  "sources": [ "open-code-review-delegate", "review-spd" ],
  "files": [
    { "path": "src/foo.go", "status": "modified", "insertions": 2, "deletions": 0 }
  ],
  "rules": [
    { "rule": "combined: ocr rule-engine + review-spd focus-driven" }
  ],
  "findings": [
    {
      "path": "src/foo.go",
      "start_line": 10,
      "end_line": 12,
      "category": "bug | security | performance | maintainability | test | style | documentation | other",
      "severity": "critical | high | medium | low",
      "comment": "问题描述",
      "suggestion": "修复建议（可选）",
      "verified_by": "both | ocr-only | review-spd-only",
      "cross_check": "confirmed | new | disputed"
    }
  ],
  "summary": { "files_reviewed": 1, "critical": 0, "high": 0, "medium": 0, "low": 0, "ocr_only": 0, "review_spd_only": 0 }
}
```

- `verified_by`：该项由两者共同确认（both）/ 仅 open-code-review-delegate 发现（ocr-only）/ 仅 review-spd 发现（review-spd-only）。
- `cross_check`：交叉验证结论（确认 confirmed / 新发现 new / 有争议 disputed）。下游可据此判断置信度。
- `summary.ocr_only` / `summary.review_spd_only`：仅由单一引擎发现、经阶段三核实后保留的项数，用于量化交叉覆盖效果。

## 异常处理

- **目标非 Git 仓库**（路径无 `.git` 或 git 不可用）：停止并输出「❌ 目标不是 Git 仓库，无法进行基于 diff 的审查；若为纯文件夹请先 `git init` 或手工提供 diff。」，不进入三阶段。
- **目标为 Git 仓库的子目录且未指定 `path_filter`**：combo 无法自动识别子目录边界，审查范围将扩大到整个父仓库。应在输入参数补充 `path_filter`，并按「阶段一/阶段二范围收敛」说明用 `git diff HEAD -- <path_filter>` 收敛；否则继续执行（不阻断）并明确告知：「⚠️ 检测到 `<path>` 不是 Git 仓库根（其 git 根在 `<toplevel>`）；若仅审查该子目录请指定 `path_filter`，否则将审查整个仓库。」
- **无可审查内容**（工作区干净且无分支 / 提交差异，或 preview 全 `excluded`）：输出「No findings（无可审查改动）」并附 `Residual Risks`。
- **OCR CLI 安装 / 自检失败**（open-code-review-delegate 子技能前置异常）：停止并展示失败原因，提示检查 npm / 网络；不编造 LLM Key。
- **阶段三后 findings 为空**：唯一审计报告输出「No findings」，附 `Testing Gaps` / `Residual Risks`。

## 示例与上游跟进

完整示例、注意事项、术语约定与**上游演进快速跟进指南**见同目录 `README.md`（含 open-code-review-delegate / review-spd 上游更新检查与 `code-review-combo` 快速跟进的可执行清单）。
