---
name: code-review-combo
description: "功能：将两种互补的代码审查子技能（open-code-review 委托模式确定性审查 + delegate 升平等主审 + review-spd 五焦点语义深度审查）三路交叉验证，产出唯一合并审计报告（人类可读文本 + 结构化 JSON），为同一代码改动提供高置信度的单一审查结论。关键词：代码审查、代码审计、代码检查、协同审查、BUG审查、查找BUG、审查提交、审查分支、审查PR、多 Key 轮询（probe 探测 Key 活/死）、delegate 平等主审、非 Git 审查。当用户要求审查代码改动、提交、分支或工作区时触发；当用户提及上述关键词时触发。适用于 Git 仓库的代码改动审查（工作区未提交改动、单提交、分支对比、PR 式 diff），也支持非 Git 文件夹（走 scan 整库扫描或全 Key 失效时的通用非 Git 委托分支兜底）。不适用于非代码审查类任务（如文档润色、需求分析）。"
metadata:
  version: "1.0.1"
---

# 联合代码审查（code-review-combo）

本技能将两个子技能组合，对代码改动做**交叉验证式**审查，最终产出**一份唯一的审计报告**。两个子技能已内嵌于本技能的子目录，**无需单独安装**，由本技能直接编排：

- `./open-code-review-delegate/SKILL.md` —— 基于 open-code-review（OCR）的委托模式。OCR 承担确定性工程（范围筛选、规则解析、整库扫描），宿主承担语义审查；其 SKILL.md 内置 `ocr` CLI 的**自动安装与自检查**，无需 LLM Key 即可走委托模式。
- `./review-spd/SKILL.md` —— findings-first 五焦点（正确性 / 回归兼容 / 测试 / 安全 / 性能并发）强制语义深度审查，自带 `./review-spd/scripts/review-context.py` 收集 git 上下文。

> **术语约定**：正文中的「open-code-review-delegate 子技能」与其底层工具「OCR / ocr」指代同一子技能；JSON 字段 `verified_by` 取值 `ocr-only` 即「仅 open-code-review-delegate 子技能发现」。

> **调用约定**：本技能不通过 Skill 工具单独激活任一子技能，而是**直接读取子目录的 SKILL.md 并按其指令执行**（子技能未单独安装）。请勿在本技能运行时再单独触发 open-code-review-delegate 或 review-spd，避免重复与结论冲突。

> **一句话地图（本地化与定制）**：本技能的本地化增强（自动安装、功能覆盖表、委托宿主 JSON Schema 包装、人类报告 prompt）统一集中在 `./local/` 目录；内嵌的两个子技能中，`./open-code-review-delegate/` 是上游 alibaba/open-code-review @ v1.9.5 的**纯镜像**，`./review-spd/` 是其 fork `zhangweildlh/spec_driven_develop` @ `35cc1e8` 的 **JSON 输出覆盖层**（非纯镜像，原因见该文件头部注释）。本地化与定制全貌详见 README「本地化与定制地图」章节。

## 自动激活关键词

本技能的中文场景触发词（原置于 delegate 子技能、现已上移至父 SKILL.md 统一管控）。当用户输入命中以下任一关键词或意图时，应激活 `code-review-combo`：

- 代码审查 / 代码审计 / 代码检查 / 协同审查
- 审查提交 / 审查分支 / 审查 PR / 审查工作区 / 审查改动 / 审查 diff
- 查找 BUG / 找 bug / 查 bug / BUG 审查
- 多 Key 轮询审查 / 多模型交叉验证审查 / 全 Key 失效兜底审查
- 非 Git 审查 / 整库扫描审查 / 委托模式审查 / delegate 审查 / host LLM 主审

> 注：`open-code-review-delegate` 与 `review-spd` 作为纯镜像 / 覆盖层内嵌于本技能，**不要单独激活**；全部编排由本技能（父 SKILL.md）统一驱动。

## 前置条件

- 目标**可以是 Git 仓库（优先）或非 Git 文件夹**：
  - **Git 仓库** → Stage1 用 `ocr review` 基于 diff 审查（默认路径）。
  - **非 Git 文件夹** → Stage1 用 `ocr scan` 整库/目录扫描（`requireGit=false`，已实测支持）；若所有 LLM Key 均失效，则降级为「通用非 Git 委托分支」（宿主直读文件审查，与 git 无关，复用既有委托能力），不报错退出。
- `open-code-review-delegate` 子技能会在首次运行时自动安装并自检 `ocr` CLI（委托模式无需 LLM Key）；使用 Stage1 的 `ocr review` / `ocr scan` 原生能力时需按**方案 β**配置**至少一个 LLM provider**：在 ocr 配置的 `custom_providers` 中注册多个跨厂商 provider（如 `nvidia`、`sensenova`），由 **Stage0 `probe`** 探测 Key 活/死、跑通即用。配置与轮询细节见 Stage0，Key 一律用占位符、绝不落明文。
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

## 核心原则：三路交叉验证（不叠加、不重复劳动）

Stage1 并行跑三路：`ocr review`（外部 Key，广覆盖 + 规则分组）、`ocr delegate`（host LLM **平等主审**，独立全量审查、零 Key 依赖）、`review-spd`（host LLM 五焦点语义深度）。三路共享同一段业务上下文 `-b`，互为交叉验证：

1. `review-spd` 先**验证** `ocr review` 与 `ocr delegate` 的发现是否属实（读取实际代码核实，误报标注为假阳性）；
2. 再**独立挖掘** 两路未覆盖的盲区（review-spd 五焦点深度）。

`ocr delegate` 已升为与 `ocr review` **平等的「主审」**（不再是全 Key 失效才兜底的从属路径），与 OCR 原生审查互补；三者统一在 Stage3 由 `merge_reports` 确定性合并去重，既保留「多引擎交叉验证」价值，又避免纯重复劳动与结论打架。

**架构质量镜（S.U.P.E.R，跨切面）**：三路审查同时套用 `./local/super-philosophy.md` 的「S.U.P.E.R 10 项评审核查」作为架构质量维度（单一职责 / 单向流 / 端口优于实现 / 环境无关 / 可替换），补足 combo 此前「仅缺陷维度」的缺口。架构质量问题（如硬编码密钥、循环依赖、不可序列化 I/O、隐式全局依赖）以 `category: other` 的发现产出（severity 由宿主在 Stage3 据实判定；安全类密钥泄漏升 `security`）。**不新增第 4 条审查路、不改 `merge_reports` 的确定性合并逻辑**——S.U.P.E.R 只是各路与宿主共享的检查清单，产出走既有 `findings[]` 通道。

## 工作流（Stage0 选择器 probe 探测 Key 活/死 → Stage1 OCR 原生审查 + delegate 平等主审 + review-spd 三路并行 → Stage2 review-spd 交叉验证 → Stage3 merge_reports 合并去重）

### Stage0：select-provider 选择器（先 `probe` 判定 Key 活/死）

本阶段先实打实**探测**各 provider 的 LLM Key 是否可用，再决定 Stage1 走「多 Key + delegate 平等主审」还是「全死 → delegate 降级」。读取 `./scripts/select-provider`（bash + node 解析 JSON，无裸 python/pip），运行其 `probe` 子命令：

```bash
bash ./scripts/select-provider probe [-c <config>]   # 默认读本技能目录 config/providers.json
#   exit 0  → 至少 1 个 provider 可用：stdout 打印 {"ok":true,"provider":"<P>","model":"...","url":"...","latency_ms":...}
#   exit 2  → 全部 provider 不可用：stdout 打印 {"ok":false,"all_failed":true,"results":[...]}
```

- **Key 活（exit 0）**：记下返回的 `provider` 名（首个探测成功的 provider），供 Stage1 的 `ocr review --provider <P>` 使用（`probe` 已把它串行设为 ocr 全局激活 provider，Stage1 可直接复用，无需再显式 `--provider`）。进入 Stage1「Key 活」三路。
- **Key 死（exit 2）**：全部 provider 不可用 → **跳过 `ocr review`，进入 Stage1「Key 死」降级两路**（跑 `ocr delegate` + `review-spd`）。不报错退出。

`probe` 的实现要点（与 `list` / `mark` / `clear` 共用同一套两级 TTL 缓存机制）：

- **串行探测**：按 `config/providers.json` 的 `custom_providers` 顺序逐个跑 `ocr llm test`，首个成功即停（exit 0），全失败才 exit 2；因 `ocr config set provider` 改全局配置，必须串行轮询。
- **复用两级 TTL 死 Key 缓存**（`.ocr-provider-cache.json`，落盘于 combo 目录内）：
  - 硬失效（HTTP 401/403，Key 无效/被吊销）→ 长 TTL 拉黑 24h（`hard`）；
  - 软不可用（HTTP 429 / 超时 / 单日额度耗尽）→ 按次日 00:00 本地时间解禁（`soft`）。
  - 下次 `probe` 直接跳过已拉黑项，避免重复烧 Key。
- **最省 Token**：每轮探测复用 `ocr llm test` 连通性检查（约 100 token/次），**不**触发完整审查，相比直接 `ocr review` 实跑大幅省成本。
- **手动调试（可选）**：
  ```bash
  bash ./scripts/select-provider mark <provider> hard   # 401/403 拉黑 24h
  bash ./scripts/select-provider mark <provider> soft   # 429/超时/额度耗尽 次日解禁
  bash ./scripts/select-provider clear [<provider>]      # 解除拉黑（调试/恢复）
  ```

> **Key 配置（方案 β · 外置于技能目录，相对路径加载）**：provider 凭证统一存放于本技能目录 `config/providers.json`（模板 `config/providers.example.json`，含占位符，已被 `.gitignore` 忽略，**绝不进 git**）。`select-provider` 启动时经相对路径读取该文件并自动合并同步到 ocr 运行时配置（`~/.opencodereview/config.json`，备份后仅合并、不覆盖 `provider` / `llm` 等其它键），后续 `ocr review`/`ocr scan` 即可直接使用。结构示例：
> ```json
> { "custom_providers": { "<NAME>": { "api_key": "<PROVIDER_API_KEY>", "url": "https://...", "protocol": "openai", "model": "<MODEL>" } } }
> ```
> 兼容旧路径：也可直接 `ocr config set custom_providers.<NAME>.api_key "<PROVIDER_API_KEY>"` 写入 ocr 全局配置（此时 `select-provider` 回退读取全局配置）。无论哪种，**真实 Key 仅在本机、绝不写入技能逻辑文件或 git 历史**。resolver 优先级：**config 完整 provider > 环境变量**（实测裁决：env 被忽略），故一律用 `custom_providers` 显式配置，并以 `--provider <name>` 覆盖为准。ocr CLI 自动安装、Win11 PATH 处理、LLM 连通性验证见 `./local/setup.md`。

### Stage1：OCR 原生审查 + delegate 平等主审 + review-spd 并行（多 Key / 全 Key 失效降级）→ 报告 A / A' / B

本阶段把**三路审查并行跑起来**，互为交叉验证；`ocr delegate` 已升为与 `ocr review` **平等的「主审」**（独立全量审查，不依附 OCR 发现）。业务上下文用 `-b/--background` **注入一次、三路同食**（v1.9.5 最大杠杆：显著降低误报、提升真阳性）。

#### 0. 前置：先跑 Stage0 `probe`
按 Stage0 取可用 provider：
- **probe exit 0** → 记下 `provider`（首个探测成功者），走下方「Key 活」三路；
- **probe exit 2**（全死）→ 走下方「Key 死」降级两路（跳过 `ocr review`）。

#### Key 活：并行三路
以 Git 仓库为例（非 Git 文件夹把 ① 换成 `ocr scan`，规则见下方「非 Git 目标」）：

```bash
# ① OCR 原生审查（外部 Key，广覆盖 + 规则分组）→ 报告 A
ocr review --provider <P> --format json --audience agent \
  -b "$CTX" [--repo <target_repo>] [--from <base> --to <head>]   # 工作区省略 --from/--to；单提交用 --commit <hash>

# ② delegate 平等主审（host LLM 独立全量主审，零外部 Key 依赖）→ 报告 A'
ocr delegate preview [--from <from_ref> --to <to_ref>]          # 单提交用 --commit <hash>
ocr delegate rule <paths>                                        # 规则分组
#   宿主按规则逐文件审查，按 ./local/delegate-json-schema.md 收敛为 comments[]（字段用 content）

# ③ review-spd（host LLM，5 焦点：正确性/回归兼容/测试/安全/性能并发；排除 style 噪音）→ 报告 B
#   详见 Stage2（与 ① ② 并行执行，产出 findings[] 直接进 Stage3）
```

- **报告 A**（`ocr review`）：取 stdout 的 **`comments[]`** 数组（review 含 `manifest`，合并绝不可依赖它）。**不要设 `--max-tokens-budget`**（或若必设则 ≥250000：实测 20000 触发预算护栏导致 0 findings）；`--audience agent` 使 stdout 为纯 JSON、进度落 stderr。首个成功产出即用。
- **报告 A'（delegate 平等主审）**：宿主产出，按 `./local/delegate-json-schema.md` 的**宿主 JSON Schema 包装**收敛；强约束 `summary.coverage_rate` 必须为 `100%`（每个 `preview` 文件都 `reviewed` 或带明确理由 `skipped`，零遗漏），字段统一用 `content`（非旧版 `comment`）。此路**完全不依赖外部 LLM Key**，是 delegate 升主审的核心保障。
- **报告 B**（`review-spd`）：见 Stage2，产出 `findings[]`（5 类 category），直接进 Stage3 合并。

> **delegate 升平等主审要点**：`ocr delegate` 不再是「OCR 全死才兜底的从属路径」，而是与 `ocr review` 并列的**独立主审引擎**——由宿主 LLM 直接、完整地审查全部改动文件（preview → rule 分组 → 逐文件审查 → 收敛 JSON）。它与 OCR 原生审查互补：OCR 擅长广覆盖与规则分组、delegate 擅长语义深度与零 Key 依赖；二者 + review-spd 在 Stage3 统一合并去重。

#### Key 死：降级两路（跳过 `ocr review`）
probe exit 2 时**跳过 ① `ocr review`**，仅并行跑：
- ② `ocr delegate`（host LLM 主审，零 Key 依赖，照常产出报告 A'）；
- ③ `review-spd`（host LLM，5 焦点，产出报告 B）。
两路产出报告 A'、B 后继续 Stage3 合并去重，不报错退出。
  - **Git 目标** → 走 `open-code-review-delegate` 委托模式（前置 `ocr` CLI 自动安装/自检见 `./local/setup.md`）：`ocr delegate preview` → `ocr delegate rule` → 取 diff（`git diff HEAD` / `merge_base..to` / `git show <commit_hash>` / 未跟踪新文件用 `cat`）→ 宿主逐文件审查 → 按 `./local/delegate-json-schema.md` 收敛为报告 A'。
  - **非 Git 目标** → 「通用非 Git 委托分支」：宿主直读目标文件夹源码逐文件审查（与 git 无关），按同 Schema 收敛为报告 A'。此分支复用既有委托能力，不新造逻辑。

#### 系统性业务上下文注入 `-b`（关键杠杆）
三路**共用同一段** `-b/--background "<业务上下文>"`（一次撰写、三路同食）：
```bash
ocr review --provider <P> --format json --audience agent -b "$CTX" ...
# delegate / review-spd 在各自指令中同样接收 $CTX（见 ./local/delegate-json-schema.md 与 Stage2）
```
`$CTX` 应描述：模块用途、关键不变量、历史雷区、本次改动意图。v1.9.5 实测：有业务上下文时误报率显著下降、真阳性召回上升。

#### 失败处理（仅 ① `ocr review` 适用）
实跑遇 401/403 → `bash ./scripts/select-provider mark <P> hard`；遇 429/超时/单日额度耗尽 → `mark <P> soft`；随后试下一个候选。所有候选全失败 → 自动转入「Key 死」降级两路。

> **边界（.md 等不支持扩展名）**：若 `preview` 标记 `excluded: unsupported_ext`（仅委托模式场景），沿用委托本质——由宿主直接读取这些文件并审查，再按 `./local/delegate-json-schema.md` 收敛，不走 OCR 文件筛选。

> **非 Git 目标**：① 改为 `ocr scan`（以目标目录为 cwd 运行；默认 whole，或 `--path <相对子路径>`，**绝不用绝对路径**）：
> ```bash
> cd <target_folder> && ocr scan --provider <P> --format json --audience agent -b "$CTX" [--path <相对子路径>]
> ```
> 若 Stage0 probe 全死或 ① 实跑全失败 → 走「通用非 Git 委托分支」兜底（宿主直读文件审查，与 git 无关），不报错退出。

> **Windows 路径注意（重要）**：`ocr` 为 **Go 二进制，不识别 POSIX 风格路径**（如 `/d/path/to/repo`），传入 `--repo /d/...` 会被误转为 `D:\d\...` 导致 `stat` 失败。Windows 下**推荐 cwd 方式**：在目标仓库目录内直接运行 `ocr review`/`ocr scan`（不传 `--repo`）；或给 `--repo` 传 **Windows 绝对路径**（如 `D:\path\to\repo`）。本技能的 `select-provider`/`merge_reports` 已统一用 `pwd -W` 取 Windows 路径规避该问题。

> **子目录目标的范围收敛（重要）**：当 `target_repo` 是一个 Git 仓库、实际要审查的是其中**子目录**（如 `AI_MCP-Skill-CLI/github-personal-manager`）时：
> - `ocr review` 支持 `--repo <仓库根> --from/--to` 但无 `--path` 子目录限制，会扩大到整个父仓库。正确做法：用 `git diff HEAD -- <path_filter>` 精确取子目录 diff 作为审查范围；或 `ocr delegate preview --repo <仓库根> --exclude '<其他顶级目录>'`。
> - `ocr scan` 可用 `--path <子目录>`（相对扫描根的子目录）收敛，或直接以该子目录为 cwd 运行 `ocr scan`。
> 宿主按此收敛后的文件列表执行审查。

### Stage2：review-spd 交叉验证（Stage1 并行三路之第③路）→ 产出报告 B

> 本阶段即 Stage1「Key 活 / Key 死」三路中的第③路，**与 `ocr review` / `ocr delegate` 并行执行**；其产出**报告 B（`findings[]`，5 类 category：bug / security / performance / test / other，排除 style 噪音）**直接进 Stage3 由 `merge_reports` 合并去重。

读取 `./review-spd/SKILL.md`，按其 Phase 1–6 流程执行，但采用**方案 B 交叉验证变体（同时验证 `ocr review` 与 `ocr delegate` 两路发现）**：

- **子目录目标的范围收敛（已支持 `--path`，C-1 修复）**：`review-context.py` 会切到 git 根（`require_git_repo()`），并支持 `--path <subdir>` 参数（相对仓库根的子目录）将收集范围精确收敛到该子目录——该参数把 `-- <subdir>` 注入所有 git 命令（status / diff / log），因此 Stage2 直接运行 `python ./review-spd/scripts/review-context.py --path <path_filter>` 即可得到子目录级上下文，无需宿主再手工 `git diff HEAD -- <path_filter>` 收敛。省略 `--path` 时脚本收集整个父仓库上下文，此时才需要宿主手工收敛或按「异常处理」告知范围已扩大到整个仓库。
- **Phase 2 上下文增强**：除运行 `./review-spd/scripts/review-context.py` 收集 git 上下文外，**额外把 Stage1 的 diff 与报告 A / A'（`comments[]`）的发现列表**作为补充输入提供给审查者。
  - **单提交模式（`commit_hash`）**：`review-context.py` 支持 `--branch` / `--base` / `--since` / `--until` / `--path`，但无 `--commit`。因此 Stage2 **不调用该脚本的 date-range / branch 参数**，而是直接以 `git show <commit_hash>` 的 diff（与 Stage1 同一来源）作为 git 上下文提供给 review-spd；同时照常把 Stage1 的报告 A / A' 作为交叉验证输入。Stage3 输出 JSON 的 `target.type` 取 `commit`、`target.commit` 填 `<commit_hash>`。
- **Phase 4 子代理指令注入（关键）**：在每一个 focused reviewer 的指令中加入——
  > 「你已收到 open-code-review-delegate 的报告 A / A'（JSON 发现列表，结构化于 `comments[]` 或委托模式 `findings`）。请先逐一核对其标出的每项发现是否属实（读取实际代码验证，误报请标注为假阳性并说明原因）；随后再独立审查本焦点盲区，挖掘报告 A / A' 未覆盖的缺陷。最终只产出你独立确认或新发现的、证据充分的发现。」
- **Phase 6 输出**：除 review-spd 原生 findings-first 文本外，按 `./review-spd/references/output-format.md` 的「Structured JSON」同时产出报告 B JSON（与报告 A / A' 同 Schema，下游兼容；`mode` 用 `workspace | range | commit`）。

产出 **报告 B**：findings-first 文本 + 结构化 JSON。

### Stage3：merge_reports 确定性合并去重 → 唯一审计报告（.json + .md）

> **可执行自动化（推荐）**：本技能内置 `./scripts/merge_reports`（bash + node，零外部依赖，含 `bash ./tests/test_merge_reports.sh` 回归校验）完成「归一化 + 跨源去重 + 按 severity 排序 + 唯一报告输出（`.json` + `.md`）」的全部逻辑。三路报告（报告 A = `ocr review`、报告 A' = `ocr delegate`、报告 B = `review-spd`）循环读入、统一合并：
> ```bash
> bash ./scripts/merge_reports <报告A.json> <报告A'.json> <报告B.md|json> [<输出名>]
> #   位置参数均为输入报告（≥2 份，顺序不限）；
> #   最后一段若以 .json/.md 结尾且参数≥3，则视为输出名，其余皆为输入报告。
> #   载体自动识别：.md → 抽 ```json 块 findings[]（review-spd）；
> #                 .json 含 comments[] → ocr/delegate（content→comment 双字段兼容）；
> #                 .json 含 findings[] → review-spd。
> # 输出：<输出>.json（机器可操作）+ <输出>.md（人类可读，确定性结构化）
> ```
> 合并规则（确定性，非 LLM）：
> - **跨源判定**：同一 `(path, start_line, end_line, category)` 被两路及以上报告 → `verified_by=both`；severity 一致 → `cross_check=confirmed`，不一致 → `cross_check=disputed` 并**取两源中更高 severity**（保守升级）；仅单源 → `ocr-only` / `review-spd-only` + `cross_check=new`。
> - **category 8↔5 映射**：ocr/delegate 的 8 类归一；`maintainability` / `documentation` → 归入 `other`；`style` 视为噪音**整体丢弃**（计入 `summary.dropped_style`），保证跨源 `both` 在映射后口径一致。
> - **双字段兼容**：ocr/delegate 用 `content`，review-spd 用 `comment`；`suggestion_code` ↔ `suggestion`，脚本自动归一。
>
> **两份产物**：
> - **`.json`（机器可操作）**：结构化 findings + summary，可直接交给 Agent / 下游工具**自动改代码修 BUG**（稳定字段：`path`/`start_line`/`end_line`/`category`/`severity`/`comment`/`content`/`suggestion`/`verified_by`/`cross_check`）。
> - **`.md`（人类可读，确定性）**：机器生成的表格化报告（总览 / Top 风险 / 按文件分组 / 修复建议），不调用 LLM，结果可复现。
>
> **可选：host LLM 叙事增强**：如需更连贯的人类报告，宿主 LLM 可读取 `.json` 后按 `./local/report-narrative.md` 的 prompt 生成更流畅的 `.md` 叙事——**只叙事、不裁决**（severity / 误报 / 去重已由 `merge_reports` 决定，宿主不得推翻或重判）。

### Stage3 裁决契约（writer model · 融合自上游范式）

> 来源：上游 `zhu1090093659/spec_driven_develop` 的 `plugins/spec-driven-develop/agents/code-reviewer.md`（blob `37e2c6c24e2b00451140f3d9b7d01b92e18b981b`，MIT License）。combo 已有相同设计，此处将其**显式立为契约**。

combo 的编排遵循「单一写者」模型（writer model），与上游执行环路的评审员契约一致：

- **子技能 / 各路审查只产出报告**：`ocr review` / `ocr delegate` / `review-spd` 各自产出 `comments[]` / `findings[]`，**绝不写共享状态**（不创建/修改 Issue、PR、进度文件、治理面、记忆面）。
- **宿主（编排者）是验收权威**：`merge_reports` 做确定性合并去重并产出审计报告文件（`.json`+`.md`，机器可复现）；宿主 LLM 仅按 `./local/report-narrative.md` **叙事、不重判**——对合并结果给出 `APPROVED` / `FIXED` / `ESCALATE` 三态 Verdict 标签并写入叙事，但**绝不重判单条 finding 的 severity / 误报 / 去重**（这些由 `merge_reports` 决定性决定），对外 status 也仅基于该合并结果标注。
- **最终裁决词汇**：对齐上游评审员契约，宿主对合并结果给出 `APPROVED`（全部交叉验证通过、无保留项） / `FIXED`（单源或 disputed 项经宿主实读代码核实后已确认有效或已修复） / `ESCALATE`（存在需 redesign 或需用户决策的高风险项）三态结论；`ESCALATE` 项须在报告中显式列出并说明下一步。

由本技能（宿主）执行最终裁决——即基于合并结果给出 `APPROVED` / `FIXED` / `ESCALATE` 三态 Verdict，**必须结合实际代码**（尤其对 `ocr-only` / `review-spd-only` 单源项与 `disputed` 项实读代码核实，见步骤 2），但**绝不重判单条 finding 的 severity / 误报 / 去重**（这些由 `merge_reports` 决定性决定，见上方「宿主是验收权威」段）。

> **合并基准（关键）**：合并去重**仅基于 `comments[]` / `findings[]` 的发现数组**，按每条发现的 `path` + `start_line` + `end_line` + `category` 去重；**绝不依赖 `manifest`**——`ocr review` 的 `manifest` 仅含 operation/coverage 元数据、`ocr scan` 输出**无 `manifest`**，二者都无法承载 findings，合并逻辑不得读取 `manifest`。Stage1 的 OCR / delegate 报告以 `comments[]` 为载体（字段用 `content`），review-spd 报告以 `findings[]` 为载体（字段用 `comment`），Stage3 统一归一化后去重。

1. **交叉比对**：读取各报告，逐项归类——
   - 多源都报的（高置信，保留）；
   - 仅单源报的（重点验证：读取实际代码核实真伪，确认则保留，误报则丢弃）；
   - severity 冲突的（读取代码核实后取较高者或据实定级）；
   - 疑似误报（无代码证据支撑的，静默丢弃）。
2. **真实验证**：对「仅单源报」或「disputed」项，必须打开实际代码核实，禁止直接采信子技能结论。**注意**：`merge_reports` 完成机械合并后，宿主仍须对「仅单源（ocr-only / review-spd-only）」与「disputed」项实读代码核实。
3. **去重合并与字段赋值**：按 `path` + `start_line` + `end_line` + `category` 去重（与「合并基准」一致），合成一份 findings 列表，按 severity 排序（Critical / High / Medium / Low）。若同一代码位置被多源以不同 `category` 报告，视为同一缺陷合并，`category` 取更具体者（优先 bug / security / performance，其次 test，再次 other），并据来源标记 `verified_by`。对每条去重后的 finding **显式赋值** `verified_by`（both / ocr-only / review-spd-only）与 `cross_check`（confirmed / new / disputed）；并据 `verified_by` 统计 `summary.ocr_only` / `summary.review_spd_only`。
4. **唯一审计报告**：同时给出
   - 人类可读文本（findings-first，按严重度分组，含 `Residual Risks` / `Testing Gaps` / `Verification`）；
   - 结构化 JSON（combo 自有 Schema，见下文「输出：唯一审计报告格式」，字段稳定便于下游 / Agent 消费）。

## 输出：唯一审计报告格式（结构化 JSON）

> 以下 Schema 与 `scripts/merge_reports` 的**真实输出**逐字对应（见 `merge_reports` 的 `report` 对象与 `summary` 对象）。`merge_reports` 仅输出 `tool` / `mode` / `sources` / `findings` / `summary` 五个顶层键——**不输出** `repository` / `target` / `files` / `rules`（这些字段由调用方按需从输入报告或 git 上下文另行拼装，不在合并产物中）。

```json
{
  "tool": "code-review-combo",
  "mode": "dual-cross-validation",
  "sources": [ "open-code-review-delegate", "review-spd" ],
  "findings": [
    {
      "path": "src/foo.go",
      "start_line": 10,
      "end_line": 12,
      "category": "bug | security | performance | test | other   # merge 后 8→5 归一：maintainability/documentation→other，style 已丢弃",
      "severity": "critical | high | medium | low",
      "comment": "问题描述（与 content 双字段兼容，见下）",
      "content": "问题描述（ocr/delegate 用 content，review-spd 用 comment，脚本已归一）",
      "suggestion": "修复建议（可选）",
      "existing_code": "相关代码片段（可选）",
      "verified_by": "both | ocr-only | review-spd-only",
      "cross_check": "confirmed | new | disputed"
    }
  ],
  "summary": {
    "total_findings": 1,
    "files_reviewed": 1,
    "by_source": { "ocr": 0, "review-spd": 0 },
    "verified_by": { "both": 0, "ocr-only": 0, "review-spd-only": 0 },
    "confirmed": 0,
    "disputed": 0,
    "new": 0,
    "ocr_only": 0,
    "review_spd_only": 0,
    "severity_dist": { "critical": 0, "high": 0, "medium": 0, "low": 0 },
    "category_dist": {},
    "dropped_style": 0
  }
}
```

- `verified_by`：该项由两者共同确认（both）/ 仅 open-code-review-delegate 发现（ocr-only）/ 仅 review-spd 发现（review-spd-only）。
- `cross_check`：交叉验证结论（确认 confirmed / 新发现 new / 有争议 disputed）。下游可据此判断置信度。
- `summary.ocr_only` / `summary.review_spd_only`：仅由单一引擎发现、经 Stage3 核实后保留的项数，用于量化交叉覆盖效果。
- `summary.severity_dist`：按 `critical / high / medium / low` 嵌套的 severity 分布（**权威字段**）；为兼容旧消费方，`summary` 顶层**同时**存在扁平的 `critical / high / medium / low` 别名（由 `merge_reports` 同值回填），下游应优先读取 `severity_dist`。
- `summary.by_source` / `verified_by` / `confirmed` / `disputed` / `new` / `category_dist` / `dropped_style` / `total_findings` / `files_reviewed`：交叉覆盖与分类统计，详见 `merge_reports` 实现。
- `content` 与 `comment` 双字段兼容：ocr/delegate 报告用 `content`，review-spd 报告用 `comment`，`merge_reports` 归一后**两者都保留**在输出中（下游任选其一即可）。

> 注意：上文 Schema 即 `merge_reports` 的真实产物；若上游 OCR / review-spd JSON 字段增减，须同步更新 `merge_reports` 的 `cleanFindings` 白名单与 `summary` 统计，并据实更新本节。

## 异常处理

- **目标非 Git 文件夹**：不再拒绝。默认走 Stage1 `ocr scan`（整库/目录扫描，`requireGit=false` 已实测）；若 Stage0 `probe` exit 2（全部 provider 死 Key）或 ① `ocr review` 实跑全失败 → 走「通用非 Git 委托分支」兜底（宿主直读文件审查，与 git 无关），不报错退出。
  - 注：维护期「审计 combo 自身」（见 README）属于维护者主动选择的静态直读路径——此时不调用 `review-context.py`（combo 是 Git 仓库子目录，`require_git_repo()` 不会报错，但会切到 monorepo 根收集整个父仓库上下文，超出 combo 范围），改由宿主直读 `.md` 文件按五焦点审查。
- **全部 LLM Key 失效（全 Key 失效降级）**：Stage0 `select-provider probe` exit 2（全部 provider 不可用）或 ① `ocr review` 所有候选 provider 实跑失败 → **降级 delegate**：Git 目标走 `open-code-review-delegate` 委托模式（无需 Key，产出报告 A'），非 Git 目标走通用非 Git 委托分支；均产出报告 A' 后继续 Stage3，不中断。
- **目标为 Git 仓库的子目录且未指定 `path_filter`**：combo 无法自动识别子目录边界，审查范围将扩大到整个父仓库。应在输入参数补充 `path_filter`，并按「Stage1 范围收敛」说明用 `git diff HEAD -- <path_filter>` 收敛；否则继续执行（不阻断）并明确告知：「⚠️ 检测到 `<path>` 不是 Git 仓库根（其 git 根在 `<toplevel>`）；若仅审查该子目录请指定 `path_filter`，否则将审查整个仓库。」
- **无可审查内容**（工作区干净且无分支 / 提交差异，或 preview 全 `excluded`，或 scan 命中 0 文件）：输出「No findings（无可审查改动）」并附 `Residual Risks`。
- **OCR CLI 安装 / 自检失败**（open-code-review-delegate 子技能前置异常）：停止并展示失败原因，提示检查 npm / 网络；不编造 LLM Key。
- **Stage3 后 findings 为空**：唯一审计报告输出「No findings」，附 `Testing Gaps` / `Residual Risks`。

## 示例与上游跟进

完整示例、注意事项、术语约定与**上游演进快速跟进指南**见同目录 `README.md`（含 open-code-review-delegate / review-spd 上游更新检查与 `code-review-combo` 快速跟进的可执行清单）。
