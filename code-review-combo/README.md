# code-review-combo 使用说明（README）

> 本文件是 `code-review-combo` 技能的补充文档，承载**非功能性**的背景说明、完整示例与**上游演进跟进指南**。
> 技能的执行逻辑、参数、三阶段工作流、输出 Schema 与异常处理一律以同目录的 `SKILL.md` 为准。
> 运行本技能时只需激活 `code-review-combo`，不要单独激活其子技能。

---

## 一、技能简介

`code-review-combo` 将两个互补的代码审查子技能组合，对代码改动做**交叉验证式**审查，最终产出**一份唯一的审计报告**（人类可读文本 + 结构化 JSON）。两个子技能已内嵌于本技能的子目录，**无需单独安装**，由本技能直接编排：

- `./open-code-review-delegate/SKILL.md` —— 基于 [alibaba/open-code-review](https://github.com/alibaba/open-code-review)（OCR）的委托模式。OCR 承担确定性工程（范围筛选、规则解析、整库扫描），宿主承担语义审查；其 SKILL.md 内置 `ocr` CLI 的**自动安装与自检查**，无需 LLM Key 即可走委托模式。
- `./review-spd/SKILL.md` —— findings-first 五焦点（正确性 / 回归兼容 / 测试 / 安全 / 性能并发）强制语义深度审查，自带 `scripts/review-context.py` 收集 git 上下文。

---

## 二、术语约定

> 注意：内嵌的 `review-spd` 子技能为上流英文副本（源仓库 `zhu1090093659/spec_driven_develop`，见第六节 6.1），由 combo 主技能以中文统一编排。如需严格中文一致，可将其 `SKILL.md` 本地化为中文，但须同步保持 JSON Schema（category/mode/summary）与 Phase 1–6 契约不变，避免破坏阶段三合并兼容性。

- 正文中的「open-code-review-delegate 子技能」与其底层工具「OCR / ocr」指代同一子技能。
- JSON 字段 `verified_by` 取值 `ocr-only` 即「仅 open-code-review-delegate 子技能发现」；`review-spd-only` 即「仅 review-spd 发现」；`both` 即「两者共同确认」。
- JSON 字段 `cross_check` 取值 `confirmed`（交叉验证确认）/ `new`（新发现）/ `disputed`（有争议）。

---

## 三、调用约定

本技能**不通过 Skill 工具单独激活任一子技能**，而是**直接读取子目录的 SKILL.md 并按其指令执行**（子技能未单独安装）。请勿在本技能运行时再单独触发 open-code-review-delegate 或 review-spd，避免重复劳动与结论冲突。

---

## 四、完整示例

### 示例 1：典型场景 —— 审查工作区未提交改动

**输入**：`target_repo = "/path/to/repo"`（Git 仓库，存在未提交改动）

**执行**：阶段一 OCR 委托审查工作区 → 报告 A；阶段二 review-spd 以报告 A 为输入交叉验证 → 报告 B；阶段三合并 → 唯一审计报告（含 findings 或 No findings）。

**输出（摘要）**：
```json
{ "tool": "code-review-combo", "mode": "dual-cross-validation", "summary": { "files_reviewed": 3, "high": 1, "medium": 2, "ocr_only": 1, "review_spd_only": 1 } }
```

### 示例 2：边界场景 —— 目标非 Git 仓库

**输入**：`target_repo = "/path/to/plain-folder"`（无 `.git`）

**执行**：前置检查失败，输出「❌ 目标不是 Git 仓库……」并终止，不进入三阶段。

---

## 五、注意事项

- 两个子技能的激活词会互相竞争；本技能已统一编排，**调用本技能时不要再单独激活任一子技能**。
- 非 Git 仓库无法工作；纯文件夹需先 `git init` 或手工提供 diff。
- `open-code-review-delegate` 委托模式无需 LLM Key；其原生 `review` / `scan` 需另行配置 LLM（非本技能默认路径）。
- 报告 A / B 的 JSON 必须与各自文本同源（review-spd 已强制此纪律）；阶段三合并时再次核对，确保唯一审计报告与两份源报告一致。
- 整库扫描（`ocr scan`）默认不启用；如需广度覆盖，按子技能说明配置 LLM 后启用，并将 scan 候选回灌阶段二供 review-spd 复核。

---

## 六、上游演进快速跟进指南（重点）

本技能内嵌的两份子技能是**上游仓库的副本**，上游演进后需及时跟进，否则会出现指令过时、JSON Schema 不兼容、资源文件缺失等问题。本指南确保 **WorkBuddy / Agent 能自行检查上游更新并对 `code-review-combo` 快速跟进修改**，无需用户逐步口述。

### 6.1 上游仓库与内嵌副本位置

| 子技能 | 上游仓库 | combo 内嵌副本位置 |
|--------|----------|-------------------|
| open-code-review-delegate | `https://github.com/alibaba/open-code-review` | `code-review-combo/open-code-review-delegate/`（**仅含 SKILL.md**；ocr CLI 由 SKILL.md 内置逻辑自安装，无需本地 `references/`/`scripts/`） |
| review-spd | `https://github.com/zhu1090093659/spec_driven_develop/tree/main/plugins/spec-driven-develop/skills/review-spd` | `code-review-combo/review-spd/`（含 SKILL.md + references/ + scripts/review-context.py） |

> 注意：review-spd 的上游路径在 `spec_driven_develop` 仓库的 `plugins/spec-driven-develop/skills/review-spd` 子目录下，不是独立仓库。

### 6.2 何时需要跟进

当上游发生以下任一变化时，应跟进更新 combo 副本：

1. 上游 SKILL.md 内容修改（指令、参数、流程、JSON 输出约定变化）。
2. 上游增删资源文件（如 review-spd 的 `references/*.md`、`scripts/*.py`；open-code-review-delegate 的 `references/`、`scripts/`）。
3. 上游 `ocr` CLI 版本升级（影响委托模式行为、JSON Schema、命令参数）。
4. 上游 JSON 输出 Schema 变化（影响 combo 阶段三合并的兼容性，如字段增减、`category`/`mode` 枚举变化）。

### 6.3 WorkBuddy 自行检查上游更新的方法（可直接执行）

**检查 open-code-review-delegate 上游：**
- GitHub API（推荐）：
  - `gh api repos/alibaba/open-code-review/commits?per_page=1` —— 取最新 commit 的 SHA 与日期，与本文件 6.6「同步记录」中记录的 SHA 对比。
  - 或 `gh api repos/alibaba/open-code-review/releases/latest --jq .tag_name` 看最新 release 版本。
- npm 分发检查（若 ocr 以 npm 包形式分发）：`npm view @alibaba/open-code-review version` 对比本地 `ocr --version`。
- 或直接 WebFetch `https://github.com/alibaba/open-code-review` 看近期提交/版本。

**检查 review-spd 上游：**
- `gh api repos/zhu1090093659/spec_driven_develop/commits?path=plugins/spec-driven-develop/skills/review-spd&per_page=1` —— 取该路径最近一次提交的 SHA 与日期，与 6.6 记录对比。
- 或 `gh api repos/zhu1090093659/spec_driven_develop/contents/plugins/spec-driven-develop/skills/review-spd/SKILL.md --jq .sha` 取当前文件 blob SHA 对比。
- 列出目录所有文件：`gh api repos/zhu1090093659/spec_driven_develop/contents/plugins/spec-driven-develop/skills/review-spd` 看是否有新增/删除的资源文件。

> 若 `gh` 未登录或无权限，退化为 WebFetch 上游原始文件 URL（如 `https://raw.githubusercontent.com/zhu1090093659/spec_driven_develop/main/plugins/spec-driven-develop/skills/review-spd/SKILL.md`）人工比对。

### 6.4 快速跟进修改步骤（WorkBuddy 机械执行清单）

一旦 6.3 检查发现上游 SHA / 版本高于 6.6 记录，按以下清单执行：

#### 情形 A：open-code-review-delegate 更新
1. **探测上游仓库结构，定位文件实际路径**（关键，避免直接套用占位路径）：
   - 列出根目录内容：`gh api repos/alibaba/open-code-review/contents/ --jq '.[].path'`，确认 `SKILL.md`、`references/`、`scripts/` 在根目录还是子目录（如 `skills/`、`src/`）。
   - 若 `SKILL.md` 位于子目录（例如 `skills/SKILL.md`），记下其**实际相对路径**，用于替换下文所有 `<上游SKILL.md实际路径>` 占位。
   - 分别列出 `references/`、`scripts/`（及下属子目录）的文件名：`gh api repos/alibaba/open-code-review/contents/<目录> --jq '.[].path'`，得到待逐个拉取的文件清单。
   - 若 `gh` 不可用，退化为 WebFetch 上游根目录页与子目录页，人工确认路径结构。
2. **拉取上游最新文件**到 combo 副本（路径来自步骤 1 探测结果）：
   - SKILL.md：`gh api repos/alibaba/open-code-review/contents/<上游SKILL.md实际路径> --jq .content | base64 -d > code-review-combo/open-code-review-delegate/SKILL.md`
   - `references/`、`scripts/` 内文件逐个拉取（**仅当步骤 1 探测到上游 SKILL.md 引用了这些资源时才需要**；本 combo 的 open-code-review-delegate 副本通常只需 SKILL.md，ocr CLI 自安装，无本地 `references/`/`scripts/`）：`gh api repos/alibaba/open-code-review/contents/<上游目录/文件> --jq .content | base64 -d > code-review-combo/open-code-review-delegate/<对应相对路径>`
   - 若 `gh` 不可用，用 WebFetch 读取上游原始文件后写入 combo 副本。
3. **比对变更**，重点看三处：
   - ocr CLI 自动安装 / 自检逻辑是否变化（影响阶段一前置检查）。
   - 委托模式主流程（`ocr delegate preview` / `rule` / 阶段二宿主审查）命令参数是否变化。
   - JSON Schema（`files` / `rules` / `findings` / `summary` 字段）是否增减。
4. **同步 combo 的 Schema 约束**：若 ocr 的 JSON 字段增减（如新增 `verified_by`、`cross_check`），同步更新 `SKILL.md` 的「输出：唯一审计报告格式」JSON Schema 与阶段三合并逻辑（去重 key、summary 计数、字段说明）。
5. **兼容性校验**：确认 combo 阶段一对 ocr 的调用方式（`ocr delegate preview [--from <from_ref> --to <to_ref>]` 等）与上游一致。

#### 情形 B：review-spd 更新
1. **拉取上游 review-spd 全量目录**到 combo 副本：
   - 先 `gh api repos/zhu1090093659/spec_driven_develop/contents/plugins/spec-driven-develop/skills/review-spd` 列出文件（含 `references/`、`scripts/` 子目录，需递归列出）。
   - 逐个 `gh api .../contents/<文件路径> --jq .content | base64 -d > code-review-combo/review-spd/<相对路径>` 写入。
   - 若 `gh` 不可用，用 WebFetch 读取上游原始文件后写入。
2. **比对变更**，重点看三处：
   - Phase 1–6 流程是否变化（尤其 Phase 6 双输出的 mode/category/rules/findings Schema）。
   - `scripts/review-context.py` 参数与输出格式是否变化（影响阶段一/二上下文收集）。
   - 五焦点定义与 severity 定义是否变化。
3. **同步 combo 的 Schema 约束**：若 review-spd JSON Schema 变化（如 `category` 集合、`mode` 枚举），同步更新 `SKILL.md` 阶段二 / 阶段三的相关约束，确保两子技能 Schema 兼容、阶段三去重合并不失效。
4. **兼容性校验**：确认 combo 阶段二调用 `review-context.py` 的参数（`--branch` / `--base` 等）与上游脚本一致。

#### 通用收尾步骤（两种情形都必须做）
5. **更新 6.6 同步记录**：填写本次上游 SHA / 版本、同步时间、改动摘要。
6. **资源文件增删处理**：每次同步后执行 `ls -R code-review-combo/open-code-review-delegate code-review-combo/review-spd`，确认结构与上游一致；上游新增的文件必须拉取，上游删除的文件必须从 combo 删除（避免悬空引用）。
7. **用 open-code-review-delegate 审计 combo 自身**：运行 `/open-code-review-delegate` 审查 `code-review-combo` 目录（注意：ocr 对 `.md` 会 `excluded: unsupported_ext`，需宿主直接审查 .md 文件并按其 JSON Schema 收敛），确认无 BUG。
8. **用 review-spd 交叉验证 combo**：读取 `code-review-combo/review-spd/SKILL.md` 按其 Phase 1–6 审查 `code-review-combo` 目录，确认无 BUG。
9. **循环修复**：若步骤 7–8 发现 BUG，修复后回到 7–8 重新审计，直到无 BUG。
10. **Skill 校验**：用 `Skill-元技能，Skill校验器.md` 对 combo 做 11 维校验（frontmatter 结构、name-目录对应、渐进式加载、参数体系、可执行无歧义等），确认结构无误。

### 6.5 快速跟进检查脚本（可复用）

WorkBuddy 可将下面这段检查逻辑固化为脚本，每次维护时直接运行：

```bash
# 检查 review-spd 上游最新提交 SHA
gh api repos/zhu1090093659/spec_driven_develop/commits?path=plugins/spec-driven-develop/skills/review-spd\&per_page=1 --jq '.[0].sha, .[0].commit.committer.date'
# 检查 open-code-review-delegate 上游最新提交 SHA
gh api repos/alibaba/open-code-review/commits?per_page=1 --jq '.[0].sha, .[0].commit.committer.date'
# 列出 review-spd 上游目录结构（检查资源文件增删）
gh api repos/zhu1090093659/spec_driven_develop/contents/plugins/spec-driven-develop/skills/review-spd --jq '.[].path'
```

将输出与 6.6 记录对比，若 SHA 不同则说明上游有更新，进入 6.4 跟进。

### 6.6 同步记录

| 同步时间 | 子技能 | 上游 SHA / 版本 | 改动摘要 |
|----------|--------|----------------|----------|
| 2026-08-08 | open-code-review-delegate 上游跟随 + review-spd 复核 | open-code-review-delegate 委托模式 SKILL.md = `b1c7c6a` (2026-08-07)；仓库最新 `62e2b99` 仅改 CLI Go 代码与 cli-reference 文档；review-spd 真上游 = `d5d3477` (2026-07-26) | 按 README 6.4-A 比对：① open-code-review-delegate 委托模式 SKILL.md 较上次记录 `4ee453f` 新增 `ocr delegate preview`/`rule` 支持 `--format json`、Step 4 强制覆盖清单（reviewable_files 逐项 reviewed/skipped + 理由、大改动分批）、Step 6 summary 新增 `total_files`/`reviewed_files`/`skipped_files`/`coverage_rate`、Gotchas 新增「覆盖率为强制项」。combo 中文增强副本（1.1.0）已并入上述变更，保留 8 类 `category` 枚举与 JSON Schema 对齐；ocr CLI 仍由 SKILL.md 自安装，CLI Go 代码改动不影响 combo 副本。② review-spd 真上游 `d5d3477` 自 2026-07-31 检查后无新提交，combo 副本功能领先（含 JSON 输出改造），无需跟随。 |
| 2026-07-30 | review-spd | 真上游基线 = `zhu1090093659/spec_driven_develop`；**实际同步源 = fork `zhangweildlh/spec_driven_develop` 的 `feat/review-spd-json-output` 分支 commit `35cc1e8`**（含本地 JSON 输出改造 + L1/L2/M1 修复） | 统一 severity 定义（L1）、固化 branch 模式 `from=base`/`to=head`（L2）、Structured JSON 节补充文本↔JSON 对照示例（M1）。combo 的 review-spd 副本**实际来自 fork `35cc1e8`，非直接来自真上游**（真上游彼时尚未合入 JSON 输出改造）。后续 6.3 上游检查时，应比对真上游 `review-spd` 目录与 combo 副本的**内容差异**；若真上游已合入 `feat/review-spd-json-output` 或自身演进，以真上游为准重新同步，并记录真上游 SHA。 |
| 2026-07-30 | 初始构建 | — | 从 `spec_driven_develop` 仓库副本（含 JSON 输出改造）复制 review-spd；从已安装副本复制 open-code-review-delegate（其含 ocr CLI 自安装）。 |
| 2026-07-31 | 上游检查（无功能性跟随） | review-spd 真上游 = `d5d3477` (2026-07-26)；ocr 委托模式 SKILL.md = `4ee453f` (2026-07-16，仓库最新 `d55f5e5` 仅改 CLI Go 代码) | 真实 `gh api` + 内容 diff 比对：① review-spd 真上游 `d5d3477` 做 "single-source and slim all prompts" 精简重构，但**未合入**本 fork 的 JSON 输出改造（SKILL.md 无 Dual output 段、output-format.md 无 Structured JSON 段）；combo 副本含 JSON 输出，功能领先，故**不覆盖式跟随**（避免丢失 JSON 输出能力）。② ocr 委托模式 SKILL.md 仍为 `4ee453f`，近期提交仅改 CLI 代码；combo 副本（`1.1.0` 中文增强）的 `category` 8 类枚举、`--commit` 参数、JSON Schema 已与上游对齐，无需跟随。结论：两子技能当前无需功能性同步；持续监控真上游是否合入 JSON 输出。 |
| 2026-07-31 | **combo 局部增强（非上游同步）** | review-spd 副本 `review-context.py`（combo 内嵌） | 给 `review-context.py` 增加 `--path` 参数（子目录相对仓库根路径），使阶段二能自动将 git 上下文收敛到子目录——**修复 combo C-1**：目标为 Git 仓库子目录时 `review-context.py` 切 git 根导致范围扩大到父仓库。SKILL.md 同步增加 `path_filter` 输入维度 + 阶段一/二范围收敛说明 + 异常处理子目录提示。此增强为 combo 本地前瞻改进，不与上游 review-spd 冲突；若上游未来加同名参数，以本增强为参考合并。 |
| 2026-07-30 | **combo 文档修正（闭环 C-1 文档）** | review-spd 副本 `review-context.py`（已含 `--path`）+ `SKILL.md` / `review-spd/SKILL.md` | 重新 `gh api` 上游检查：review-spd 真上游仍为 `d5d3477` (2026-07-26)、ocr 委托模式 SKILL.md 仍为 `4ee453f` (2026-07-16)，两上游自上次记录后**无新更新**，combo 副本功能领先、无需覆盖式跟随。全过程检测发现 combo 内部文档缺陷：顶层 `SKILL.md` 阶段二「子目录范围收敛」仍写 `review-context.py`「**无路径限制**」（与已落地的 C-1 `--path` 实现矛盾，会误导宿主放弃 `--path`），且 `review-spd/SKILL.md` Phase 1 示例未展示 `--path`。已修复：① 顶层 `SKILL.md` 阶段二改为「已支持 `--path`，直接 `review-context.py --path <path_filter>` 得子目录级上下文，无需手工 `git diff` 收敛」，并补 phase2 单提交段 `--path` 枚举；② `review-spd/SKILL.md` Phase 1 增加 `--path <subdir>` 示例与子目录范围说明句。C-1 实现与 combo 文档（顶层 + 子技能）完全对齐。 |

---

## 七、维护验证清单（每次跟进后必跑）

1. `ocr delegate preview` 能在目标 Git 仓库跑通（委托模式前置检查通过）。
2. `review-spd` 的 `scripts/review-context.py` 能收集 git 上下文（branch / commit-range / uncommitted 三种模式）。
3. combo 三阶段能产出唯一审计报告（人类可读文本 + 结构化 JSON，Schema 与两子技能兼容）。
4. 用 open-code-review-delegate 审计 `code-review-combo` 自身 → 无 BUG。
5. 用 review-spd 交叉验证 `code-review-combo` → 无 BUG。
6. 用 Skill 校验器 11 维校验 `code-review-combo` → 通过。

> 注：第 4–5 条审计 `code-review-combo` 自身时，因本技能目录不在 Git 仓库内、且主体为 `.md` 文件，走**宿主直接读取文件的静态审查**；这属于维护者主动选择的独立路径，与 SKILL.md 异常处理中「目标非 Git 仓库 → 停止」互不冲突——该拒绝规则仅针对**被审查目标**，而自审是维护动作，不触发拒绝。`review-context.py` 在该场景下不适用（其 `require_git_repo()` 会返回 `not inside a git repository`），故阶段二对 combo 自身不调用该脚本，改由宿主直读文件后按 review-spd 五焦点审查。
