# code-review-combo 使用说明（README）

> 本文件是 `code-review-combo` 技能的补充文档，承载**非功能性**的背景说明、完整示例与**上游演进跟进指南**。
> 技能的执行逻辑、参数、四阶段工作流（Stage0 选择器 → Stage1 OCR 审查 → Stage2 review-spd 交叉验证 → Stage3 合并去重）、输出 Schema 与异常处理一律以同目录的 `SKILL.md` 为准。
> 运行本技能时只需激活 `code-review-combo`，不要单独激活其子技能。
>
> **v1.0.1 能力变更（相对早期版本）**：① 新增 **Stage0 多 Key 轮询选择器**（`scripts/select-provider` + ocr `custom_providers`，方案 β 跨厂商多 Key，全 Key 失效降级委托）；② **非 Git 目标自 v1.0.1 起支持**（`ocr scan` 整库扫描，或全 Key 失效时走「通用非 Git 委托分支」兜底），不再拒绝非 Git 文件夹。详见 `SKILL.md` Stage0 / Stage1 / 异常处理。

## 一、技能简介

`code-review-combo` 将两个互补的代码审查子技能组合，对代码改动做**交叉验证式**审查，最终产出**一份唯一的审计报告**（人类可读文本 + 结构化 JSON）。两个子技能已内嵌于本技能的子目录，**无需单独安装**，由本技能直接编排：

- `./open-code-review-delegate/SKILL.md` —— 基于 [alibaba/open-code-review](https://github.com/alibaba/open-code-review)（OCR）的委托模式。OCR 承担确定性工程（范围筛选、规则解析、整库扫描），宿主承担语义审查；其 SKILL.md 内置 `ocr` CLI 的**自动安装与自检查**，无需 LLM Key 即可走委托模式。
- `./review-spd/SKILL.md` —— findings-first 五焦点（正确性 / 回归兼容 / 测试 / 安全 / 性能并发）强制语义深度审查，自带 `scripts/review-context.py` 收集 git 上下文。

### 1.1 LLM Key 配置（外置于技能目录，相对路径加载）

本技能将 LLM provider 的 `api_key` 等凭证**外置于本技能目录内的配置文件**，不写入任何技能逻辑文件（`SKILL.md` / `scripts`），满足「任一 Agent 使用本技能时，经相对路径读取配置即可获得 Key 与对应配置，进而调用 `ocr review` / `ocr scan`」的要求。

- **模板（入库）**：`code-review-combo/config/providers.example.json` —— 结构与 ocr `custom_providers` 一致，含占位符 `<NVIDIA_API_KEY>` / `<SENSENOVA_API_KEY>`。
- **真实配置（不入库，仅本机）**：`code-review-combo/config/providers.json` —— 由模板复制后填入真实 `api_key` / `url` / `protocol` / `model`。该文件已在 `.gitignore` 中忽略，**绝不进入 git 历史**。
- **加载机制**：Stage0 `scripts/select-provider` 启动时，经**相对路径** `config/providers.json`（相对 `scripts/../config`）读取本地 provider 清单；若存在，则将其 `custom_providers` **合并同步**到 ocr 运行时配置（`~/.opencodereview/config.json`，备份后仅合并、不覆盖 `provider` / `llm` 等其它键），使后续 `ocr review --provider <P>` / `ocr scan --provider <P>` 可直接鉴权调用 LLM。若本地配置缺失，则回退读取 ocr 全局配置（向后兼容）。
- **安全建议**：生产环境建议改用动态取 token——将 `api_key` 置空、改用 `ocr config set ... api_key_cmd "<动态取 token 命令>"`，或对 `config/providers.json` 进一步加密 / 权限收敛，避免明文 Key 长期落盘。

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

**执行**：Stage0 `select-provider` 选 Key → Stage1 OCR 审查工作区 → 报告 A；Stage2 review-spd 以报告 A 为输入交叉验证 → 报告 B；Stage3 合并去重 → 唯一审计报告（含 findings 或 No findings）。

**输出（摘要）**：
```json
{ "tool": "code-review-combo", "mode": "dual-cross-validation", "summary": { "files_reviewed": 3, "high": 1, "medium": 2, "ocr_only": 1, "review_spd_only": 1 } }
```

### 示例 2：边界场景 —— 目标非 Git 仓库

**输入**：`target_repo = "/path/to/plain-folder"`（无 `.git`）

**执行**：自 v1.0.1 起**不再拒绝非 Git 目标**。Stage0 选出可用 provider 后，Stage1 改走 `ocr scan` 整库/目录扫描（`requireGit=false`，已实测支持）；若 Stage0 返回空（全部 provider 死 Key）或 Stage1 实跑全失败，则降级为「通用非 Git 委托分支」（宿主直读文件审查，与 git 无关），均产出报告 A 后继续 Stage2/Stage3，不报错退出。

---

## 五、注意事项

- 两个子技能的激活词会互相竞争；本技能已统一编排，**调用本技能时不要再单独激活任一子技能**。
- **非 Git 仓库自 v1.0.1 起支持**：纯文件夹无需 `git init`，Stage1 走 `ocr scan`（或全 Key 失效时走通用非 Git 委托分支兜底），不拒绝、不报错退出。
- **多 Key 轮询**：在 ocr 配置的 `custom_providers` 注册多个跨厂商 provider（如 `nvidia` / `sensenova`），由 Stage0 `scripts/select-provider` 串行轮询、跑通即用；全失效降级委托模式（无需 Key）。配置细节见 `SKILL.md` Stage0。
- `open-code-review-delegate` 委托模式无需 LLM Key；其原生 `review` / `scan` 需自行在 ocr `custom_providers` 配置 LLM（方案 β，非本技能默认路径）。
- 报告 A / B 的 JSON 必须与各自文本同源（review-spd 已强制此纪律）；阶段三合并时再次核对，确保唯一审计报告与两份源报告一致。
- 整库扫描（`ocr scan`）默认不启用；如需广度覆盖，按子技能说明配置 LLM 后启用，并将 scan 候选回灌阶段二供 review-spd 复核。

---

## 六、上游演进快速跟进指南（重点）

本技能内嵌的两份子技能是**上游仓库的副本**，上游演进后需及时跟进，否则会出现指令过时、JSON Schema 不兼容、资源文件缺失等问题。本指南确保 **WorkBuddy / Agent 能自行检查上游更新并对 `code-review-combo` 快速跟进修改**，无需用户逐步口述。

### 6.1 上游仓库与内嵌副本位置

| 子技能 | 上游仓库 | combo 内嵌副本位置 |
|--------|----------|-------------------|
| open-code-review-delegate | `https://github.com/alibaba/open-code-review` | `code-review-combo/open-code-review-delegate/`（**仅含 SKILL.md**；ocr CLI 由 SKILL.md 内置逻辑自安装，无需本地 `references/`/`scripts/`） |
| review-spd | 真上游 `zhu1090093659/spec_driven_develop`（路径 `plugins/spec-driven-develop/skills/review-spd`），**冻结于 `d5d3477` (2026-07-26)，无更新**；combo 内嵌副本实际来自 fork `zhangweildlh/spec_driven_develop` 的 `feat/review-spd-json-output` 分支 commit `35cc1e8`（含 JSON 输出改造），属**有益分叉（领先上游）** | `code-review-combo/review-spd/`（含 SKILL.md + references/ + scripts/review-context.py） |

> 注意：
> - **open-code-review-delegate 上游** = `alibaba/open-code-review`（combo 内仅含 `open-code-review-delegate/SKILL.md` 文档副本，ocr CLI 由 SKILL.md 内置逻辑自安装，不内嵌 CLI 本体）。
> - review-spd 的真上游路径在 `spec_driven_develop` 仓库的 `plugins/spec-driven-develop/skills/review-spd` 子目录下，不是独立仓库；且自 `d5d3477` (2026-07-26) 起**冻结无任何更新**。combo 内嵌的 review-spd 是**有益分叉**——来自 fork `zhangweildlh/spec_driven_develop` @ `35cc1e8`，已含 JSON 输出改造，功能领先真上游，**不应以"跟随真上游"之名覆盖式回退**。
> - **OCR CLI 能力同步**：`ocr`（open-code-review）CLI 本体由你本地自装，随上游独立更新（当前实测 `v1.9.5`）；combo 目录内**仅维护 `open-code-review-delegate/SKILL.md` 文档副本**，既不分叉也不内嵌 CLI 本体。因此判断 CLI 能力请以本地 `ocr --version` 为准——不要因文档副本滞后而误判"CLI 不能做某件事"。文档副本中的 `ocr` 命令示例若与本地 CLI 行为不一致，以本地 CLI 为准，并将偏差登记到 6.7 保全清单作为待回放项。
> - **LLM Key 本地配置**：provider 凭证统一存放于本技能目录 `config/providers.json`（相对路径加载，模板见 `config/providers.example.json`，已被 `.gitignore` 忽略，绝不入库）。上游跟随**不涉及**此文件；ocr 运行时配置由 `select-provider` 启动时自动合并同步，Agent 无需手动改全局配置。

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

> **review-spd 实际同步源提示**：combo 内嵌的 review-spd 并非直接来自真上游 `zhu1090093659/spec_driven_develop`，而是来自 fork **`zhangweildlh/spec_driven_develop` 的 `feat/review-spd-json-output` 分支 @ `35cc1e8`**（含 JSON 输出改造，领先真上游）。因此 Agent 检查 review-spd 更新时，**除比对真上游 `d5d3477` 外，还应检查该 fork 分支是否有新提交**（`gh api repos/zhangweildlh/spec_driven_develop/commits?path=plugins/spec-driven-develop/skills/review-spd&per_page=1`）；若 fork 演进，以 fork 为准做 3-way 合并（base=`35cc1e8`），而非真上游。

### 6.4 快速跟进修改步骤（WorkBuddy 机械执行清单）

一旦 6.3 检查发现上游 SHA / 版本高于 6.6 记录，按以下清单执行：

#### 前置：3-way 合并通用操作（替代破坏性 `> file` 覆盖）

combo 内每个子技能副本均含**本地增强**（委托 `SKILL.md` 中文 1.1.0、review-spd JSON 输出改造、C-1 `--path` 补丁，见 6.7 保全清单）。直接 `gh api ... | base64 -d > file` 会清空这些增强，故一律改用 **3-way 合并（上游 blob + 本地增强 + 基线）** 保留本地偏离：

1. **取基线（base）**：记录于 6.6 的上游 SHA。open-code-review-delegate 基线 = `v1.9.5`（combo doc 副本已随上游 v1.9.5 纯镜像更新，仅顶部 6 行镜像声明为本地）；review-spd 真上游基线 = `d5d3477`，combo 副本基线 = fork `35cc1e8`。用 `gh api .../contents/<路径> --jq .content | base64 -d` 拉取该 SHA 文件存为 `base.md`。
2. **取本地增强副本（local）**：复制 combo 当前 `open-code-review-delegate/SKILL.md` / `review-spd/SKILL.md`（含全部本地增强）为 `local.md`。
3. **取上游最新 blob（remote）**：`gh api .../contents/<上游路径> --jq .content | base64 -d > remote.md`。
4. **三向合并**：`git merge-file -p local.md base.md remote.md > merged.md`（combo 目录本身不在 git 仓库，但可用 `git merge-file` 对单个文件做三向合并；冲突以 `<<<<<<<` / `=======` / `>>>>>>>` 标出）。
5. **保留本地偏离点**：逐段核对，确保 6.7 列出的本地增强（① 中文 1.1.0 / ② JSON 输出改造 / ③ C-1 `--path`）不被覆盖；冲突段以**本地增强为准**，仅在不冲突处吸收上游新增。
6. 将 `merged.md` 写回 combo 副本，删除临时 `base.md` / `local.md` / `remote.md` / `merged.md`。

> 说明：review-spd 真上游 `d5d3477` 已冻结且**落后** combo 副本（fork `35cc1e8` JSON 输出改造领先），其 3-way 合并（base=`35cc1e8`、local=combo 当前、remote=`d5d3477`）实质上以本地增强为准，仅当真上游罕见新增且有益时才并入；**绝不**以"跟随真上游"之名覆盖式回退 JSON 输出能力。

#### 情形 A：open-code-review-delegate 更新
1. **探测上游仓库结构，定位文件实际路径**（关键，避免直接套用占位路径）：
   - 列出根目录内容：`gh api repos/alibaba/open-code-review/contents/ --jq '.[].path'`，确认 `SKILL.md`、`references/`、`scripts/` 在根目录还是子目录（如 `skills/`、`src/`）。
   - 若 `SKILL.md` 位于子目录（例如 `skills/SKILL.md`），记下其**实际相对路径**，用于替换下文所有 `<上游SKILL.md实际路径>` 占位。
   - 分别列出 `references/`、`scripts/`（及下属子目录）的文件名：`gh api repos/alibaba/open-code-review/contents/<目录> --jq '.[].path'`，得到待逐个拉取的文件清单。
   - 若 `gh` 不可用，退化为 WebFetch 上游根目录页与子目录页，人工确认路径结构。
2. **3-way 合并到 combo 副本**（路径来自步骤 1 探测结果，禁止 `> file` 直接覆盖）：
   - 按本小节开头「前置：3-way 合并通用操作」执行。open-code-review-delegate 副本**通常只需合并 `SKILL.md`**（ocr CLI 自安装，无本地 `references/`/`scripts/`）；基线取 combo doc 当前已对齐的上游 `v1.9.5` 镜像，local=当前 combo `open-code-review-delegate/SKILL.md`（纯镜像 + 顶部 6 行本地声明，无中文分叉），remote=上游最新 `SKILL.md`。
   - `references/`、`scripts/` 内文件**仅当步骤 1 探测到上游 SKILL.md 引用了这些资源时才需要**；若需更新，同样对每个文件做 3-way 合并，保留本地偏离。
   - 若 `gh` 不可用，用 WebFetch 读取上游原始文件作为 remote，按同法做 3-way 合并。
3. **比对变更**，重点看三处：
   - ocr CLI 自动安装 / 自检逻辑是否变化（影响阶段一前置检查）。
   - 委托模式主流程（`ocr delegate preview` / `rule` / 阶段二宿主审查）命令参数是否变化。
   - JSON Schema（`files` / `rules` / `findings` / `summary` 字段）是否增减。
4. **同步 combo 的 Schema 约束**：若 ocr 的 JSON 字段增减（如新增 `verified_by`、`cross_check`），同步更新 `SKILL.md` 的「输出：唯一审计报告格式」JSON Schema 与阶段三合并逻辑（去重 key、summary 计数、字段说明）。
5. **兼容性校验**：确认 combo 阶段一对 ocr 的调用方式（`ocr delegate preview [--from <from_ref> --to <to_ref>]` 等）与上游一致。

#### 情形 B：review-spd 更新
1. **3-way 合并 review-spd 全量目录**到 combo 副本（禁止 `> file` 直接覆盖）：
   - 先 `gh api repos/zhu1090093659/spec_driven_develop/contents/plugins/spec-driven-develop/skills/review-spd` 列出文件（含 `references/`、`scripts/` 子目录，需递归列出），作为 remote 文件清单。
   - 对每个文件按本小节开头「前置：3-way 合并通用操作」做 3-way 合并：base=`35cc1e8`（combo 副本 fork 基线）、local=combo 当前 `review-spd/<相对路径>`（含 JSON 输出改造 + C-1 `--path`）、remote=真上游 `d5d3477` 对应文件。**真上游已冻结且落后，合并以本地增强为准，仅吸收真上游罕见新增且有益的内容，绝不覆盖式回退 JSON 输出能力。**
   - 若 `gh` 不可用，用 WebFetch 读取上游原始文件作为 remote，按同法做 3-way 合并。
2. **比对变更**，重点看三处：
   - Phase 1–6 流程是否变化（尤其 Phase 6 双输出的 mode/category/rules/findings Schema）。
   - `scripts/review-context.py` 参数与输出格式是否变化（影响阶段一/二上下文收集）。
   - 五焦点定义与 severity 定义是否变化。
3. **同步 combo 的 Schema 约束**：若 review-spd JSON Schema 变化（如 `category` 集合、`mode` 枚举），同步更新 `SKILL.md` 阶段二 / 阶段三的相关约束，确保两子技能 Schema 兼容、阶段三去重合并不失效。
4. **兼容性校验**：确认 combo 阶段二调用 `review-context.py` 的参数（`--branch` / `--base` 等）与上游脚本一致。

#### 通用收尾步骤（两种情形都必须做）
5. **更新 6.6 同步记录 + 核对 6.7 保全清单**：填写本次上游 SHA / 版本、同步时间、改动摘要；并逐条核对 6.7 本地修改保全清单（① 中文 1.1.0 / ② JSON 输出改造 / ③ C-1 `--path`），确认合并后这些本地增强仍存在、未被上游版本覆盖；若有冲突覆盖，回退到以本地增强为准。
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
| 2026-08-18 | open-code-review-delegate doc 同步升级 | 上游 `alibaba/open-code-review` @ **v1.9.5**（纯镜像，仅顶部 6 行本地声明） | 审计确认 combo `open-code-review-delegate/SKILL.md` 与上游 v1.9.5 发布版逐字节一致（仅顶部 6 行镜像声明为本地）。**修正 2026-08-17 行「文档副本滞后」结论**：delegate 文档已随 v1.9.5 镜像更新、不再滞后；基线由 `b1c7c6a` 更新为 `v1.9.5`。review-spd 真上游仍冻结 `d5d3477`、combo 副本（fork `35cc1e8` JSON 输出改造）领先上游，无需跟随。回归 `tests/test_merge_reports.sh` OVERALL PASS(11/11)；安装副本与 Git 副本 diff 逐字节一致。 |
| 2026-08-17 | **上游分叉现状更正（非功能性跟随）** | open-code-review 真上游自 combo 基线 `b1c7c6a` (2026-08-07) 后：delegate_cmd.go (#892 / #784)、shared.go (SARIF #820 / 遥测 / LLM 重试)、scan_cmd.go (SARIF / #783 `--format json` 修复)、resolver.go / keycmd.go / provider_cmd.go (#605 token-from-command / 多 provider) 均有实质更新 | **更正 2026-08-08 行「仓库最新仅改 CLI Go 代码」记录已过时**：open-code-review 自 `b1c7c6a` 后 delegate / scan / shared / resolver 多模块均有实代码更新（非仅 CLI 文案）。本质澄清：combo 与上游的偏离**此前**为 `open-code-review-delegate/SKILL.md` 文档副本滞后（非 CLI 分叉）；**但 delegate 文档副本已于 2026-08-18 审计同步升级为上游 v1.9.5 纯镜像（仅顶部 6 行本地声明），现已与上游最新发布版对齐，不再滞后**（见 6.6 同日期记录）。ocr CLI 本体仍由本地自装最新（实测 `v1.9.5`），combo 目录不内嵌 CLI、仅维护文档副本。review-spd 真上游仍冻结 `d5d3477`、combo 副本（fork `35cc1e8` JSON 输出改造）属领先上游的有益分叉，结论不变。后续跟进一律按 6.4「3-way 合并」保留本地增强，并据 6.7 保全清单回放。 |
| 2026-08-08 | open-code-review-delegate 上游跟随 + review-spd 复核 | open-code-review-delegate 委托模式 SKILL.md = `b1c7c6a` (2026-08-07)；仓库最新 `62e2b99` 仅改 CLI Go 代码与 cli-reference 文档；review-spd 真上游 = `d5d3477` (2026-07-26) | 按 README 6.4-A 比对：① open-code-review-delegate 委托模式 SKILL.md 较上次记录 `4ee453f` 新增 `ocr delegate preview`/`rule` 支持 `--format json`、Step 4 强制覆盖清单（reviewable_files 逐项 reviewed/skipped + 理由、大改动分批）、Step 6 summary 新增 `total_files`/`reviewed_files`/`skipped_files`/`coverage_rate`、Gotchas 新增「覆盖率为强制项」。combo 中文增强副本（1.1.0）已并入上述变更，保留 8 类 `category` 枚举与 JSON Schema 对齐；ocr CLI 仍由 SKILL.md 自安装，CLI Go 代码改动不影响 combo 副本。② review-spd 真上游 `d5d3477` 自 2026-07-31 检查后无新提交，combo 副本功能领先（含 JSON 输出改造），无需跟随。 |
| 2026-07-30 | review-spd | 真上游基线 = `zhu1090093659/spec_driven_develop`；**实际同步源 = fork `zhangweildlh/spec_driven_develop` 的 `feat/review-spd-json-output` 分支 commit `35cc1e8`**（含本地 JSON 输出改造 + L1/L2/M1 修复） | 统一 severity 定义（L1）、固化 branch 模式 `from=base`/`to=head`（L2）、Structured JSON 节补充文本↔JSON 对照示例（M1）。combo 的 review-spd 副本**实际来自 fork `35cc1e8`，非直接来自真上游**（真上游彼时尚未合入 JSON 输出改造）。后续 6.3 上游检查时，应比对真上游 `review-spd` 目录与 combo 副本的**内容差异**；若真上游已合入 `feat/review-spd-json-output` 或自身演进，以真上游为准重新同步，并记录真上游 SHA。 |
| 2026-07-30 | 初始构建 | — | 从 `spec_driven_develop` 仓库副本（含 JSON 输出改造）复制 review-spd；从已安装副本复制 open-code-review-delegate（其含 ocr CLI 自安装）。 |
| 2026-07-31 | 上游检查（无功能性跟随） | review-spd 真上游 = `d5d3477` (2026-07-26)；ocr 委托模式 SKILL.md = `4ee453f` (2026-07-16，仓库最新 `d55f5e5` 仅改 CLI Go 代码) | 真实 `gh api` + 内容 diff 比对：① review-spd 真上游 `d5d3477` 做 "single-source and slim all prompts" 精简重构，但**未合入**本 fork 的 JSON 输出改造（SKILL.md 无 Dual output 段、output-format.md 无 Structured JSON 段）；combo 副本含 JSON 输出，功能领先，故**不覆盖式跟随**（避免丢失 JSON 输出能力）。② ocr 委托模式 SKILL.md 仍为 `4ee453f`，近期提交仅改 CLI 代码；combo 副本（`1.1.0` 中文增强）的 `category` 8 类枚举、`--commit` 参数、JSON Schema 已与上游对齐，无需跟随。结论：两子技能当前无需功能性同步；持续监控真上游是否合入 JSON 输出。 |
| 2026-07-31 | **combo 局部增强（非上游同步）** | review-spd 副本 `review-context.py`（combo 内嵌） | 给 `review-context.py` 增加 `--path` 参数（子目录相对仓库根路径），使阶段二能自动将 git 上下文收敛到子目录——**修复 combo C-1**：目标为 Git 仓库子目录时 `review-context.py` 切 git 根导致范围扩大到父仓库。SKILL.md 同步增加 `path_filter` 输入维度 + 阶段一/二范围收敛说明 + 异常处理子目录提示。此增强为 combo 本地前瞻改进，不与上游 review-spd 冲突；若上游未来加同名参数，以本增强为参考合并。 |
| 2026-07-30 | **combo 文档修正（闭环 C-1 文档）** | review-spd 副本 `review-context.py`（已含 `--path`）+ `SKILL.md` / `review-spd/SKILL.md` | 重新 `gh api` 上游检查：review-spd 真上游仍为 `d5d3477` (2026-07-26)、ocr 委托模式 SKILL.md 仍为 `4ee453f` (2026-07-16)，两上游自上次记录后**无新更新**，combo 副本功能领先、无需覆盖式跟随。全过程检测发现 combo 内部文档缺陷：顶层 `SKILL.md` 阶段二「子目录范围收敛」仍写 `review-context.py`「**无路径限制**」（与已落地的 C-1 `--path` 实现矛盾，会误导宿主放弃 `--path`），且 `review-spd/SKILL.md` Phase 1 示例未展示 `--path`。已修复：① 顶层 `SKILL.md` 阶段二改为「已支持 `--path`，直接 `review-context.py --path <path_filter>` 得子目录级上下文，无需手工 `git diff` 收敛」，并补 phase2 单提交段 `--path` 枚举；② `review-spd/SKILL.md` Phase 1 增加 `--path <subdir>` 示例与子目录范围说明句。C-1 实现与 combo 文档（顶层 + 子技能）完全对齐。 |

### 6.7 本地修改保全清单（非破坏性演进依据）

combo 相对上游存在以下**本地偏离点**。每次 6.4 跟进必须据本表逐条回放 / 保全，**禁止**以"跟随上游"之名覆盖式抹除。

| # | 本地偏离点 | 来源 / 基线 | 回放 / 保全命令 | 责任人 |
|---|-----------|-------------|----------------|--------|
| ① | 委托 `SKILL.md` 为上游 **v1.9.5 纯镜像**（仅顶部 6 行镜像声明为本地、可整文件覆盖；**无中文 1.1.0 分叉**，中文编排在父 `SKILL.md`） | 上游 `alibaba/open-code-review` @ `v1.9.5`（纯镜像，无本地增强） | 随上游新发布版整文件覆盖 `open-code-review-delegate/SKILL.md` 并补回顶部 6 行镜像声明；无需 3-way 合并 | combo 维护者 |
| ② | review-spd JSON 输出改造（Dual output 文本↔JSON、`references/output-format.md` Structured JSON、统一 severity、branch 模式 `from=base`/`to=head`） | fork `zhangweildlh/spec_driven_develop` @ `35cc1e8`（领先真上游 `d5d3477`） | 保留 fork；定期 `gh api` 比对真上游 `d5d3477` 内容差异，仅吸收有益新增；**绝不**覆盖式回退 JSON 输出 | combo 维护者 |
| ③ | C-1 `--path` 补丁（`review-context.py` 子目录范围收敛 + 顶层 / 子技能 `SKILL.md` 范围说明与 `--path` 示例） | 本地（combo 前瞻改进） | 合并时 cherry-pick 此增强；若上游未来加同名参数，以本增强为参考合并 | combo 维护者 |

**保全纪律**：
- 任一 Agent 读 6.4 跟进前，先读本清单，确认 ① / ② / ③ 在 3-way 合并后仍存在。
- 若合并冲突段涉及上述偏离点，以**本地增强为准**；上游新增内容在不冲突前提下并入。
- OCR CLI 能力以本地 `ocr --version` 自装版本为准（见 6.1 注意），文档副本滞后不构成"CLI 不能"的依据；命令示例与本地 CLI 不一致时登记到本清单待回放。

---

## 七、本地化与定制地图（Localization & Customization Map）

> 本章是 `code-review-combo` 的「本地化 / 定制总地图」。**核心目标**：任一不了解本 Skill 的 Agent，读完本章（尤其 7.1–7.5）后应能：① 说出两个子技能各自的上游仓库 URL 与跟进命令；② 在**保持本地化 / 定制化不变、功能正常**的前提下，自动跟进上游仓库的演进。维护者请先读 6.7 保全清单再读本章——二者互补：6.7 是「本地偏离点清单」，本章是「为何偏离 + 如何零成本跟进」。

### 7.1 总览地图

目录树（标注每个条目的「身份」）：

```
code-review-combo/
├── SKILL.md                         【combo 本地·父编排】四阶段工作流、参数、Schema、异常；激活关键词在此
├── README.md                        【combo 本地】本文件（含 六 上游演进指南 + 本章）
├── config/                          【combo 本地·凭证外置】
│   ├── providers.json               【真实 Key，.gitignore 忽略，绝不入库】
│   └── providers.example.json       【模板，含占位符，进 git】
├── scripts/                         【combo 本地·增强脚本】
│   ├── select-provider              【combo 增强】Stage0 多 Key 选择器；新增 probe 子命令
│   └── merge_reports                【combo 增强】Stage3 合并；.json+.md、category 8↔5 映射、确定性
├── local/                           【combo 本地·集中化增强地】（从上游镜像抽离的指令层）
│   ├── setup.md                     【本地化】ocr CLI 自动安装 + Win11 PATH + ocr llm test + 两种配置
│   ├── coverage.md                  【本地化】全面功能覆盖表
│   ├── delegate-json-schema.md      【本地化】委托模式宿主 JSON Schema 包装（字段统一 content）
│   └── report-narrative.md          【本地化】人类报告 prompt 模板（只叙事不裁决）
├── open-code-review-delegate/       【上游纯镜像】alibaba/open-code-review @ v1.9.5，仅 SKILL.md
│   └── SKILL.md                     （顶部 6 行中文头部注释声明镜像；跟进即覆盖此文件）
└── review-spd/                      【fork 覆盖层】zhangweildlh/spec_driven_develop @ 35cc1e8（领先真上游 d5d3477）
    ├── SKILL.md                     （非纯镜像：含 Dual output 指令层 + combo 自加 --path 特性）
    ├── references/
    │   ├── output-format.md         （非纯镜像：含 "Structured JSON" 一节）
    │   └── reviewer-template.md
    └── scripts/
        └── review-context.py        （与上游逐字节相同，可独立纯镜像）
```

**设计哲学（一句话）**：子技能目录尽量保持「纯上游」（delegate 已做到），combo 的所有增强集中在 `local/`、`scripts/`、`config/`、`SKILL.md`；这样跟进上游时，纯镜像目录可直接覆盖、零 3-way 合并成本，本地增强零丢失。

### 7.2 解耦架构

**为何解耦**：早期版本中 combo 的本地增强（自动安装、功能覆盖表、宿主 JSON Schema、人类报告 prompt）直接混在子技能 `SKILL.md` 里。一旦上游 `open-code-review-delegate` 更新，必须做 3-way 合并来「保全本地增强」，成本高且易漏保。

**解耦前后对比**：

| 维度 | 解耦前（增强混在子技能 SKILL.md） | 解耦后（增强抽到 local/） |
|------|----------------------------------|--------------------------|
| delegate 跟进成本 | 3-way 合并，逐段核对本地增强 | 直接覆盖 `open-code-review-delegate/SKILL.md`，local/ 不动 |
| 本地增强丢失风险 | 高（冲突段易误覆盖） | 零（增强在独立文件，不在镜像内） |
| 增强可读性 | 散落、与上游混排 | 集中、可单独阅读 |
| 上游同步保真度 | 需人工判断保留/吸收 | 镜像原样覆盖，100% 同步 |

解耦后：`open-code-review-delegate/` 成为纯镜像（可整文件覆盖）；`local/`、`scripts/`、`config/`、`SKILL.md` 承载全部 combo 增强。

### 7.3 逐项明细表（本地化 / 定制内容清单）

| # | 内容 | 为何本地化 | 目的 | 实现路线 | 在原文件改了什么 | 新增 / 改动文件 | 新文件目的 · 位置 · 与原文的调用关系 |
|---|------|-----------|------|---------|----------------|---------------|--------------------------------------|
| 1 | 自动安装 ocr CLI + Win11 PATH 处理 | 上游镜像只给命令，不含「自动装 + Win11 PATH 修复」工程细节 | 开箱即用、避免 Win11 下 PATH 不生效 | 从 delegate `SKILL.md` 抽出安装/自检逻辑 | 上游镜像删除该段（→ local/） | 新增 `local/setup.md` | 用 delegate 时作补充指引；被父 `SKILL.md` 阶段一前置检查引用 |
| 2 | 全面功能覆盖表 | 上游镜像无「全子命令一览 + 是否需 LLM」表 | 一眼判断哪些子命令需 LLM、命令示例 | 从 delegate `SKILL.md` 抽表 | 上游镜像删除该段 | 新增 `local/coverage.md` | 父 `SKILL.md` 阶段一/二选型参考 |
| 3 | 委托模式宿主 JSON Schema 包装 | 上游委托模式不产 JSON，需宿主收敛；字段需统一 `content`（对齐 v1.9.5，弃用旧 `comment`） | 定义宿主输出 JSON 字段规范 + `coverage_rate` 强制纪律 | 从 delegate `SKILL.md` 抽出 §七 宿主 Schema 段；字段 `comment`→`content` | 上游镜像删除该段 | 新增 `local/delegate-json-schema.md` | 宿主读后产出 JSON；与确定性 `merge_reports` 衔接（content 双字段兼容） |
| 4 | 人类报告 prompt 模板 | 上游无「读 .json 写 .md」的叙事 prompt | 只叙事不裁决，忠实反映 merge 结论 | 新增 | — | 新增 `local/report-narrative.md` | 宿主读 `merge_reports` 的 `.json` 后生成 `.md`；强调不推翻裁决 |
| 5 | 激活关键词 | 上游 delegate 自带激活词，会与 review-spd 竞争 | 父编排统一控制，避免重复劳动/结论冲突 | 从 delegate 移出，留父 `SKILL.md` | 上游镜像保留原文，父 `SKILL.md` 统一编排禁用单独激活 | 改动父 `SKILL.md` | 父编排唯一入口 |
| 6 | Key 外置配置 | 凭证不进技能逻辑文件 | 安全：真实 Key 不入库 | `config/providers.json`（gitignore）+ `providers.example.json`（进 git）；`select-provider` 相对路径读取 | — | 新增 `config/providers.json`、`config/providers.example.json` | `scripts/select-provider` 经 `../config/providers.json` 读取并合并到 ocr 运行时 |
| 7 | 多 Key 轮询 probe | 跨厂商多 Key，跑通即用，全失效降级委托 | Stage0 选 Key | `scripts/select-provider` 新增 `probe` 子命令（默认 `config/providers.json`，`-c` 优先；串行探测；exit 0 命中 / exit 2 全失败） | 脚本新增 `cmd_probe` | 改动 `scripts/select-provider` | Stage0 调用 |
| 8 | merge_reports 增强 | 两子技能载体不同（.md / .json）需归一化、去重、定级 | Stage3 确定性合并出唯一报告 | `.json`+`.md` 双输出；category 8↔5 映射（maintainability/documentation→other，style→丢弃）；≥2 份输入；content↔comment 双字段兼容；确定性 | 重写 `scripts/merge_reports` | 改动 `scripts/merge_reports` | Stage3 调用；输出被 `local/report-narrative.md` 消费 |
| 9 | review-spd `--path` 子目录审查 | combo 前瞻改进：目标为 Git 子目录时 `review-context.py` 切 git 根会扩大范围（C-1） | 子目录范围收敛 | `review-spd/SKILL.md` Phase 1 加 `--path` 示例 + `review-context.py` 加 `--path` 参数（PATH_FILTER） | 改 `review-spd/SKILL.md` 与 `review-context.py` | 改动 `review-spd/SKILL.md`、`review-spd/scripts/review-context.py` | 与 JSON 镜像无关，单独保留 |

### 7.4 无法解耦项及原因

**review-spd 不能纯镜像真上游**（证据与原因，已逐字节验证）：

- 真上游 `zhu1090093659/spec_driven_develop` 的 `review-spd` 冻结于 `d5d3477` (2026-07-26)，其 `output-format.md` 仅人类可读散文、**不原生输出 ```` ```json findings ```` 块**。
- combo 的 Stage3 `merge_reports` 依赖该结构化 JSON 才能解析去重。因此「JSON 输出」能力必须保留。
- 经验证：`scripts/review-context.py` 与真上游**逐字节相同**（零代码改动）；"JSON 输出改造"纯在**指令层**——即 `review-spd/SKILL.md` 的 Phase 6 "Dual output" 一节 + `references/output-format.md` 的 "Structured JSON" 一节。
- 故 combo 内嵌的 review-spd 实际来自 **fork `zhangweildlh/spec_driven_develop` @ `35cc1e8`**（= 真上游 `d5d3477` + JSON 输出改造），属**有益分叉（领先上游）**，不可覆盖式回退。

**可直接抄写的结论段**：

> review-spd 不是真上游 `zhu1090093659/spec_driven_develop` 的纯镜像，而是其 fork `zhangweildlh/spec_driven_develop` @ `35cc1e8` 的副本（含 JSON 输出覆盖层）。代码 `review-context.py` 与上游逐字节相同、可独立纯镜像；JSON 能力纯在指令层（SKILL.md "Dual output" + output-format.md "Structured JSON"），必须保留。本地自加的 `--path` 子目录审查特性与 JSON 镜像无关，单独保留。跟进时只更新正文、绝不丢弃 Dual output 与 Structured JSON 两节。

**对照**：`open-code-review-delegate/` 已完全解耦——它是上游 v1.9.5 的**纯镜像**，全部 combo 增强已抽到 `local/`，可整文件覆盖、零合并成本。

### 7.5 跟进上游演进 SOP（让陌生 Agent 自动跟进）

以下命令任一 Agent 均可直接执行。**核心原则**：delegate 直接覆盖（纯镜像）；review-spd 取真上游正文 + 重新套用 JSON 指令层（覆盖层）。

**A. delegate（纯镜像）——直接覆盖，local/ 不动**

```bash
# 1) 取上游最新 SKILL.md（?ref 可填新 tag 或 commit SHA）
gh api repos/alibaba/open-code-review/contents/skills/open-code-review-delegate/SKILL.md?ref=<新tag或commit> \
  -H 'Accept: application/vnd.github.raw' > open-code-review-delegate/SKILL.md

# 2) 补回顶部 6 行中文头部注释（镜像声明，见当前文件头部），local/ 完全不动
```

> 头部注释固定模板（务必补回）：
> ```markdown
> <!--
> 本文件为上游 alibaba/open-code-review @ v1.9.5 的纯镜像（仅 SKILL.md 一个文件）。
> code-review-combo 的本地化增强（自动安装、Win11 路径、功能覆盖表、委托宿主 JSON Schema 包装、人类报告 prompt）已抽到 ./local/ 目录。
> 跟进上游：用 `gh api repos/alibaba/open-code-review/contents/skills/open-code-review-delegate/SKILL.md?ref=<新tag> -H 'Accept: application/vnd.github.raw'` 取最新内容覆盖本文件即可，combo 增强不受影响。
> -->
> ```

**B. review-spd（fork 覆盖层）——取正文 + 重套 JSON 指令层**

```bash
# ① 取真上游最新正文（?ref 填真上游新 sha；若 fork zhangweildlh 演进则填 fork 新 sha）
gh api repos/zhu1090093659/spec_driven_develop/contents/plugins/spec-driven-develop/skills/review-spd/SKILL.md?ref=<新sha> \
  -H 'Accept: application/vnd.github.raw' > review-spd/SKILL.md

# ② 在其 Phase 6 位置重新套用 fork 的 "Dual output" 一节（结构化 ```json findings 块指令）
# ③ references/output-format.md 同步补回 "## Structured JSON" 一节
# ④ review-context.py 可直接用上游最新（逐字节相同，无改动）
# ⑤ 保留本仓库自加的 --path 特性（SKILL.md Phase 1 --path 示例 + review-context.py --path 参数）
```

**验证清单（B 跟进后必做）**：
- `grep -n "Dual output" review-spd/SKILL.md` 确认 JSON 指令层在位；
- `grep -n "Structured JSON" review-spd/references/output-format.md` 确认 Structured JSON 节在位；
- `grep -n "\-\-path" review-spd/scripts/review-context.py` 确认 `--path` 特性未丢；
- 跑回归：`bash ./tests/test_merge_reports.sh` 确认 `merge_reports` 仍能解析（见下）。

**通用检查（两种情形都要）**：
```bash
# 取上游最新 SHA / 日期
gh api repos/alibaba/open-code-review/commits?per_page=1 --jq '.[0].sha, .[0].commit.committer.date'
gh api repos/zhu1090093659/spec_driven_develop/commits?path=plugins/spec-driven-develop/skills/review-spd\&per_page=1 --jq '.[0].sha, .[0].commit.committer.date'
# 列目录查资源文件增删
gh api repos/zhu1090093659/spec_driven_develop/contents/plugins/spec-driven-develop/skills/review-spd --jq '.[].path'
```
> 若 `gh` 不可用，退化为 WebFetch 上游原始文件 URL（如 `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`）人工比对。

**跟进后回归（质量门禁）**：
```bash
bash ./tests/test_merge_reports.sh   # 退出码 0 = 合并逻辑未破
```
另建议：更新 6.6 同步记录、核对 6.7 保全清单（① 中文增强 ② JSON 输出 ③ `--path`）；并按 八、维护验证清单 跑完整自审。

---

## 八、维护验证清单（每次跟进后必跑）

1. `ocr delegate preview` 能在目标 Git 仓库跑通（委托模式前置检查通过）。
2. `review-spd` 的 `scripts/review-context.py` 能收集 git 上下文（branch / commit-range / uncommitted 三种模式）。
3. combo 三阶段能产出唯一审计报告（人类可读文本 + 结构化 JSON，Schema 与两子技能兼容）。
4. 用 open-code-review-delegate 审计 `code-review-combo` 自身 → 无 BUG。
5. 用 review-spd 交叉验证 `code-review-combo` → 无 BUG。
6. 用 Skill 校验器 11 维校验 `code-review-combo` → 通过。

> 注：第 4–5 条审计 `code-review-combo` 自身时，因本技能目录不在 Git 仓库内、且主体为 `.md` 文件，走**宿主直接读取文件的静态审查**；这属于维护者主动选择的独立路径，与 SKILL.md 异常处理中「目标非 Git 仓库 → 停止」互不冲突——该拒绝规则仅针对**被审查目标**，而自审是维护动作，不触发拒绝。`review-context.py` 在该场景下不适用（其 `require_git_repo()` 会返回 `not inside a git repository`），故阶段二对 combo 自身不调用该脚本，改由宿主直读文件后按 review-spd 五焦点审查。
