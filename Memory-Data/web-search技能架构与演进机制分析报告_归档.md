---
title: web-search 父技能架构、技术路线与演进升级机制分析报告
target: D:\Documents\AI_MCP-Skill-CLI\web-search
date: 2026-08-09
analyst: WorkBuddy
verdict: 单一权威结论（本报告作废此前一切分散结论）
---

# web-search 父技能架构、技术路线与演进升级机制分析报告

## 〇、结论摘要

`web-search` 是一个**「文档即控制平面（Documentation-as-Control-Plane）」的父技能**：它自身**不含任何业务代码**，全部能力由两条异构子轨道提供，父级只用 Markdown 承载编排逻辑、裁决规则与硬约束。

四条核心判断：

1. **架构本质是「控制反转 + 供应商解耦」**。父技能持有全部本地化/私有化约束（uv 调用契约、密钥位置、中文政策检索规则、四级采信标记），两个子技能保持上游原貌或纯知识形态，使上游演进的跟进成本降到「覆盖文件 + 保留补丁」。
2. **两个子技能的耦合形态截然不同**，不可混为一谈：AnySearch 是**代码型子技能**（扁平并入的真实文件树 + 本地补丁），Firecrawl 是**知识型适配层**（零代码，仅一份 SKILL.md 描述如何驱动外部全局 CLI）。二者的升级路径因此完全不同。
3. **README.md 是面向 Agent 的可执行 Runbook（操作手册），而非说明文档**——它是本技能演进机制的**唯一控制入口**，但目前为「人工触发 + Agent 手动执行」，缺自动触发器、缺版本锚点、缺漂移检测脚本。
4. **本次实证检出 5 处真实缺陷**，其中 1 处为高危（Firecrawl 密钥落盘指令在语义层失效）、2 处为上游同步滞后。详见第八章。

---

## 一、资产清单与拓扑

### 1.1 目录结构（实测，24 个受 git 跟踪文件）

```
web-search/                             ← 父技能根（{SKILL_ROOT}）
├── SKILL.md          (4,886 B)         ← 控制平面：编排 + 裁决 + 强门禁
├── README.md         (4,819 B)         ← 演进平面：升级 Runbook + 同步记录表
├── .env                                ← 密钥平面：仅 ANYSEARCH_API_KEY（授权明文入库）
├── anysearch-skill/                    ← 轨道 1：代码型子技能（上游扁平并入）
│   ├── SKILL.md      (200 行)          ← 上游原文 + 顶部本地化 overlay（14 行差异）
│   ├── scripts/
│   │   ├── anysearch_cli.py  (557 行)  ← 唯一被本地打补丁的代码文件（8 行差异）
│   │   ├── anysearch_cli.js  (486 行)  ← 与上游完全一致
│   │   ├── anysearch_cli.ps1 (622 行)  ← 与上游完全一致
│   │   ├── anysearch_cli.sh  (460 行)  ← 与上游完全一致
│   │   ├── generate.py       (210 行)  ← 四语言一致性代码生成器
│   │   └── shared/{constants.json, doc_spec.md}  ← 单一数据源
│   ├── .github/workflows/ci.yml        ← ★ 僵尸文件：并入后永不执行（见 8.3-D3）
│   ├── TEST_PLAN.md                    ← ★ 上游已删除，本地滞留（见 8.1）
│   └── {README.md, README_zh.md, SECURITY.md, LICENSE, NOTICE, requirements.txt}
├── firecrawl/
│   └── SKILL.md      (48 行)           ← 轨道 2：纯知识适配层，零代码、零密钥
└── tests/
    └── test_fixes.py (252 行, 7 用例)  ← 契约回归防线，接入仓库 Tier 3 门禁
```

### 1.2 三个平面的职责切分

| 平面 | 载体 | 职责 | 变更频率 |
|------|------|------|----------|
| **控制平面** | `SKILL.md` | 运行时编排、裁决规则、门禁、输出 schema | 低（本地策略变更时） |
| **演进平面** | `README.md` | 上游跟进 SOP、同步记录、回归测试指引 | 中（每次上游同步） |
| **执行平面** | `anysearch-skill/`、`firecrawl/`、全局 CLI | 实际检索与抓取 | 由上游驱动 |

这种切分是本技能设计上最值得肯定之处：**运行时逻辑与维护逻辑物理分离**，Agent 执行检索任务时只需加载 `SKILL.md`（约 4.9 KB），不必背负升级知识的 token 成本；仅在执行维护任务时才加载 `README.md`。这正是 Agent Skills 规范「渐进式披露（Progressive Disclosure）」的正确落地。

---

## 二、技术路线

### 2.1 双轨异构：不是冗余，是互补

两条轨道并非同质备份，而是**能力维度互补**：

| 维度 | 轨道 1 · AnySearch | 轨道 2 · Firecrawl |
|------|-------------------|-------------------|
| 定位 | 搜索引擎（Search） | 抓取引擎（Crawl/Scrape） |
| 协议 | JSON-RPC 2.0 单端点 `api.anysearch.com/mcp` | REST `/v2/*` |
| 运行时 | Python（`uv run --with requests`） | Node.js（全局 `firecrawl` v1.19.27） |
| 交付形态 | 源码并入仓库 | 外部全局工具，仅并入知识 |
| 核心优势 | 17 个垂直域（finance/academic/legal…）、`batch_search` 并行、匿名可用 | 站点级 `crawl`/`map`、浏览器 `interact`、AI `agent` 抽取 |
| 密钥治理 | 父级 `.env` 明文（授权豁免） | `firecrawl login` 全局凭据，**禁入库** |
| 失效影响 | 轨道降级，由 Firecrawl 补台 | 轨道降级，由 AnySearch 补台 |

**权衡说明**：双轨带来约 2 倍的调用成本与延迟，换取的是「多来源印证」这一**可信度增量**。对用户的主业场景（政策文件核查、招投标信息核实）而言，错误信息的代价远高于双倍 API 调用成本，该权衡成立。

### 2.2 关键技术决策及其代价

| 决策 | 收益 | 代价 | 评价 |
|------|------|------|------|
| **扁平并入而非 git submodule/clone** | 避免嵌套 `.git` 导致父仓库脱管；文件全部受父仓库跟踪与门禁扫描 | 丧失 `git pull` 一键升级；升级退化为手工覆盖 | 合理。父仓库是「技能集合仓」，嵌套 git 会破坏 Tier0 密钥扫描与 Tier1 结构门禁的全量覆盖 |
| **Overlay 覆盖而非 fork 改造** | 上游文件保持最大一致性，diff 面积最小（实测仅 2 文件、22 行差异） | 每次覆盖需人工识别并保全补丁 | 合理，但**必须配套漂移检测**，否则补丁会在某次覆盖中静默丢失 |
| **Firecrawl 只做知识层不并入代码** | 零维护成本；上游 CLI 自行升级 | 本地 SKILL.md 与 CLI 真实契约会漂移（实测已漂移，见 8.2） | 合理，但**必须配套契约核验** |
| **`uv run --with requests` 而非 `--project`** | 不依赖本机固定虚拟环境，可移植 | 每次调用有依赖解析开销 | 正确。这是从本机硬编码路径（`D:\Tools\Assembly`）修正而来的，已由测试 F4 守护 |
| **`{SKILL_ROOT}` 占位符而非绝对路径** | 部署到 `~/.workbuddy/skills/` 等任意目录均不失效 | 需运行时注入 | 正确，已由测试 F4 守护 |

### 2.3 子技能内部的技术亮点：单一数据源代码生成

`anysearch-skill` 上游用 `scripts/generate.py` + `shared/constants.json` + `shared/doc_spec.md` 解决**四语言实现（py/js/ps1/sh）的一致性漂移**问题：

- 每个 CLI 脚本用 `BEGIN GENERATED:CONSTANTS` / `BEGIN GENERATED:DOC_SPEC` 成对标记划出生成区；
- `generate.py` 从 `constants.json` 渲染出各语言语法的域名列表，注入标记区；
- `generate.py --check` 作为 CI 门禁，检测「手改了脚本但没改数据源」的漂移。

**实测验证**：`uv run --with requests python scripts/generate.py --check` → 四个脚本全部 `OK`，退出码 0，说明本地并入的副本未发生生成漂移。

**但**：该 `--check` 在本仓库**没有任何门禁调用它**（Tier 3 只跑 `--help` 与 `tests/`），上游自带的 `ci.yml` 又因位于子目录而永不执行。这是演进链路上的一个断点。

---

## 三、父技能与子技能的关系

### 3.1 三种耦合形态对照

| 关系维度 | 父 ↔ AnySearch | 父 ↔ Firecrawl |
|---------|----------------|----------------|
| **物理关系** | 文件树并入父目录，受父仓库 git 跟踪 | 仅一份适配层文档在父目录；被适配对象在父目录之外（npm 全局） |
| **调用关系** | 父直接执行子目录内的 Python 脚本 | 父按适配层知识调用 PATH 中的全局命令 |
| **控制关系** | 父用 overlay 覆盖子技能自身的调用说明 | 父定义降级策略；适配层定义命令模板 |
| **权威关系** | 冲突时**以父 SKILL.md 为准**（overlay 显式声明） | 冲突时**以 `firecrawl <cmd> --help` 实测为准**（文档显式声明） |
| **密钥关系** | 子脚本主动向上探测父级 `.env`（三级探测） | 子层零密钥，运行时由全局凭据注入 |
| **升级关系** | 下载上游文件覆盖 + 保全本地补丁 | 追踪上游 `openapi.json` + 更新文档参数 |

### 3.2 Overlay 覆盖机制（本技能最关键的设计）

上游 `anysearch-skill/SKILL.md` 原本主张「Runtime Detection：Python > Node.js > Shell，用 `python`/`python3` 直调」。这与本机硬约束（禁裸 `python`/`pip`，一律 `uv run`）**直接冲突**。

解决方案不是改写上游文件，而是在其**顶部插入一段 overlay 声明**，明确宣告「下文的 Runtime Detection 仅供上游参考，本仓库一律以父技能调用契约为准」。

这是一种「**声明式覆盖**」而非「侵入式修改」：

- 上游正文 186 行**原样保留**，未来覆盖升级只需重新贴回这 14 行 overlay；
- 冲突的优先级被显式书写，Agent 读到时不会二义；
- 由测试 `test_c10_skill_and_readme_contract_consistent` 强制守护 overlay 存在（含「非独立 clone」「uv run --with requests python」两个锚点断言）。

**同类机制在代码层的对应物**是 `anysearch_cli.py` 的 `_load_env` 补丁——实测本地与上游的全部差异仅 8 行：

```python
# 本地补丁（上游只有前两级、且无 break）
for env_path in [
    os.path.join(script_dir, ".env"),          # 1. 脚本同目录
    os.path.join(script_dir, "..", ".env"),    # 2. anysearch-skill/
    os.path.join(script_dir, "..", "..", ".env"),  # 3. ★ 新增：web-search/（父级）
]:
    if os.path.isfile(env_path):
        ...
        break  # ★ 新增：就近优先，防父级 .env 静默覆盖子目录 key
```

第三级探测使密钥可以统一收口在父技能根目录，是「父持有密钥、子无状态」这一设计得以成立的技术前提。

### 3.3 控制权边界（谁说了算）

```
父 SKILL.md ─── 定义 ──▶ 调用方式、密钥位置、检索策略、裁决规则、落盘格式
                          （子技能的对应表述一律作废）

子 SKILL.md ─── 定义 ──▶ 子命令语法、参数枚举、垂直域规则、错误码语义
                          （父技能不重复描述，避免双份事实源）

外部真实契约 ─ 定义 ──▶ CLI 实际 flag（`--help` 为准）、API 实际 schema（openapi.json 为准）
                          （文档与之冲突时，文档错）
```

这条三级权威链是**单一事实源原则**在跨仓库场景的落地：本地策略 > 子技能文档 > 上游真实契约，各管一段，不交叉定义。

---

## 四、工作模式与工作流程

### 4.1 五阶段流水线

| 阶段 | 名称 | 触发条件 | 行为 | 失败处置 |
|------|------|---------|------|---------|
| **A** | 双轨独立并行 | 技能激活 | 两轨互不依赖各自跑完 | 任一轨失败 → 标记，进入 C |
| **B** | 多来源印证 | A 完成 | 两源命中 → 互证；冲突 → 按信源权威性裁决；单源 → 标 `[数据待核实]` | — |
| **C** | 相互补台 | 任一轨失败/限流/无 key | 存活轨道全量补 | 仍缺 → 进入 D |
| **D** | 原生兜底 | 双轨均缺 | 调用 Agent 原生 `web_search`/`web_fetch` | **强约束：不得静默跳过** |
| **E** | 父级复审裁决 | 素材齐备 | 去重合并 → 四级采信标记 → 统一 schema 落盘 | 无标记则不得交付 |

### 4.2 轨道 1 内部的关键分支：中文政策检索特别规则

这是父技能中**唯一一条业务领域定制规则**，直接服务于用户主业：

> AnySearch 的垂直域多为美国/国际向（`legal` = US Congress，`environment` = aqi），**无中国国策/标准类垂直域**。中文政策文件（HJ/GB 编号、国发令、环发令、生态环境部令）与中国国标/行标检索，**不走垂直域**，直接 `search "关键词" --max_results 10`（省略 `--domain`）；仅当主题确属国际向（跨国财报、美股代码、国际学术文献）时才走 `get_sub_domains` → 垂直搜索。

此规则的价值在于：它**逆转**了上游 SKILL.md 的默认主张（上游写的是「DEFAULT search path is Path 2（vertical）」）。若无这条本地规则，Agent 检索「HJ 1300-2023」时会先调 `get_sub_domains --domain environment`，落到 aqi 空气质量子域，返回大量无关的美国 AQI 数据。这是一条**由真实踩坑沉淀的领域知识**，是父技能存在价值的最佳例证。

### 4.3 降级链的完整性

```
AnySearch 可用 ──┐
                 ├──▶ 双源印证（最高可信）
Firecrawl 可用 ──┘

AnySearch 挂 ────▶ Firecrawl 全量补 ────▶ 标 [单源待核实]
Firecrawl 挂 ────▶ AnySearch 全量补 ────▶ 标 [单源待核实]
双轨都挂 ────────▶ 原生 web_search/web_fetch ─▶ 标 [原生兜底]
全部失败 ────────▶ 标 [缺失]，禁止编造，禁止静默返回空
```

值得注意的是 AnySearch 支持**匿名访问**（无 key 也能用，仅限速），意味着轨道 1 的「硬失效」概率极低；Firecrawl 无凭据则完全不可用。因此实际运行中轨道 1 是主力、轨道 2 是增强，二者可用性不对等。

---

## 五、工作约束（三层门禁体系）

### 5.1 第一层：父技能内 4 条强门禁（运行时自律）

| # | 门禁 | 内容 |
|---|------|------|
| 1 | 合法性 | 禁止检索/抓取明确违法或侵权内容 |
| 2 | 隐私 | 禁输出个人敏感信息；密钥仅进程内注入，**绝不回显**；`.env` 明文入库为授权豁免，但密钥不得出现在对话/日志/产物 |
| 3 | 路径 | 落盘必须用用户指定绝对路径或相对 `{SKILL_ROOT}` 路径，**禁止猜测路径** |
| 4 | 交付自检 | 产物必须含采信标记与来源清单，否则**不得交付** |

### 5.2 第二层：仓库五层冒烟门禁（提交时拦截）

父仓库 `AI_MCP-Skill-CLI` 有 Tier 0–4 门禁（`scripts/smoke/`），通过 `.githooks/pre-commit` 与 `.github/workflows/smoke.yml` 双触发：

| Tier | 名称 | 对 web-search 的作用 |
|------|------|---------------------|
| Tier 0 | 密钥扫描 | 扫 `web-search/.env`；`ANYSEARCH_API_KEY` 已列入 `ALLOW_PATTERNS` 白名单（用户决策 #10 授权豁免），**其它密钥一律致命** |
| Tier 1 | 结构合规 | 校验 `SKILL.md` frontmatter 的 `name`/`description` 存在、长度 1–1024、单行 |
| Tier 2 | 内容合规 | 通用合规检查 |
| Tier 3 | **运行冒烟** | ① `anysearch_cli.py --help` 可执行（真实报错=致命）；② **执行 `web-search/tests/` 全部用例**（非依赖类异常=致命）；③ 可选 API 探活（`SMOKE_PROBE_API=1`） |
| Tier 4 | 触发词检查 | description 触发覆盖度 |

Tier 3 的错误三分类逻辑设计精细：**启动失败（解释器不存在）→ 跳过；依赖缺失（ModuleNotFoundError）→ 警告；脚本真实报错 → 致命**，且明确禁止依赖缺失掩盖真实缺陷（注释中记录了此前 sticky flag 导致假阴性的教训）。

### 5.3 第三层：契约回归测试矩阵（7 用例）

| 用例 | 守护的契约 | 手法 |
|------|-----------|------|
| `test_f2_env_load_resolves_parent_env` | `_load_env` 能解析父级 `.env` | 动态 import 触发模块级 `_load_env`，回读 `os.environ` |
| `test_f4_no_hardcoded_assembly_path` | 父 SKILL.md 无本机绝对路径 | 字符串断言 |
| `test_f7_interact_uses_prompt_not_task` | 文档中 `interact` 用 `--prompt` | 正则 |
| `test_c8_no_firecrawl_key_persisted_to_dotenv` | 适配层不给出密钥落盘指引 | 正则 + 锚定硬约束块本体 |
| `test_c10_skill_and_readme_contract_consistent` | 父/子/README 三文档契约一致 | 交叉断言 + **按指令形态布防**（用「命令片段不含 CJK 字符」区分「真实可执行的 `git clone`」与「禁止 clone 的中文说明」） |
| `test_d8_env_lookup_stops_at_nearest` | 就近优先（命中即 break） | 临时目录布置两份冲突 `.env`，子进程回读 |
| `test_f7_cli_contract` | **上游 CLI 真实契约** | 真实执行 `firecrawl interact --help`，CLI 缺失则 skip |

这套测试的工程质量显著高于一般技能仓库，三点尤为突出：

1. **`test_f7_cli_contract` 打通了「文档 ↔ 外部真实契约」的验证闭环**——这是知识型适配层唯一可靠的防漂移手段；
2. **`test_c10` 的 CJK 判据**解决了「禁令文本被误判为违规指令」的经典误报问题，思路巧妙；
3. **`test_f2` 的 `detach()` 处理**——被测脚本会用 `io.TextIOWrapper(sys.stdout.buffer)` 顶替标准流，直接丢弃 wrapper 会在 GC 时连带关闭共享底层 buffer，导致后续用例 `ValueError: I/O operation on closed file`。测试中用 `flush() → detach() → 复原` 三步正确拆解，属于对 Python IO 语义有深入理解的写法。

---

## 六、Agent 经 README.md 检查/演进/升级子技能的技术路线

### 6.1 机制本质：README 是「Agent 可执行 Runbook」

`web-search/README.md` 的「上游演进快速跟进指南」章节，其读者不是人，而是 Agent。它具备 Runbook 的三个特征：

1. **步骤可直接映射为工具调用**（`gh api ...` → Bash 工具；「下载覆盖」→ WebFetch/Write 工具）；
2. **有状态回写位**（两张「同步记录表」要求 Agent 执行后登记）；
3. **有验收判据**（AnySearch：`diff` 确认调用契约未变；Firecrawl：`firecrawl search "test"` 冒烟）。

其技术路线可概括为：**用自然语言文档承载「本应由脚本承载的维护流程」，以 Agent 的工具调用能力充当解释器**。这样做的收益是零脚本维护成本、流程可读可改；代价是**不可自动触发、不可断言、执行质量依赖 Agent 遵从度**。

### 6.2 轨道 1（AnySearch）升级路径：覆盖式同步 + 补丁保全

README 定义的路径：

| 步骤 | 动作 | 硬约束 |
|------|------|--------|
| 1 | 从上游 `anysearch-ai/anysearch-skill`（默认分支 main）下载 `scripts/anysearch_cli.{py,js,ps1,sh}`、`SKILL.md`、`shared/` | — |
| 2 | 覆盖到 `{SKILL_ROOT}/anysearch-skill/` | **禁止在子目录内执行 `git clone`**（会产生嵌套 `.git`，导致子目录全部脱离父仓库跟踪） |
| 3 | 保留两处本地补丁：`_load_env` 父级 `.env` 探测 + 子 SKILL.md 顶部 overlay | 由测试 F2/D8/C10 守护 |
| 4 | `diff` 上游与本地，确认调用契约未变 | — |
| 5 | 登记同步记录表（日期 / 上游 commit / 变更摘要） | 目前**表为空** |
| 6 | 跑回归测试 `uv run --with requests python -m unittest discover -s web-search/tests -v` | 必须走 uv |

**「禁止 clone」这条约束被三重布防**：README 正文文字说明 + 子 SKILL.md overlay 声明 + 测试 `GIT_CLONE_ANYSEARCH_RE` 正则（按可执行指令形态而非文案措辞布防）。这是本技能中防护最严密的一条约束，实测本地确认**无嵌套 `.git`**，契约保持完好。

### 6.3 轨道 2（Firecrawl）升级路径：契约跟随

README 定义的 5 步：

1. `gh api repos/firecrawl/firecrawl/contents/apps/api/openapi.json` → base64 解码
2. 对比 `firecrawl/SKILL.md` 中 `/search /scrape /crawl /map /agent /interact` 的参数、枚举、endpoint
3. **仅更新参数/枚举/示例，不动**父级裁决逻辑与本地化 overlay
4. 登记同步记录表
5. 冒烟校验 `firecrawl search "test"`

**实测该路径第 1 步仍然有效**：`apps/api/openapi.json` 存在，SHA `249678f5`，113,759 字节，最近变更 2026-06-15（`feat(api): add generic endpoint feedback`）。

### 6.4 实现方法的四项技术要件（现有实现的支撑点）

| 要件 | 现有实现 | 强度 |
|------|---------|------|
| **可达性**——Agent 能拿到上游状态 | `gh` CLI 已装（v2.96.0）并通过凭据助手认证；`gh api` 可直读 contents/commits | 强 |
| **可比性**——能判断本地与上游差异 | 仅口头要求「diff」，无脚本 | **弱** |
| **可保全性**——补丁不在覆盖中丢失 | 测试 F2/D8/C10 事后断言 | 中（事后拦截，非事前保护） |
| **可追溯性**——记录已同步到哪个版本 | 两张同步记录表 | **失效（表为空）** |

**结论**：现有实现的「可达性」已经打通（工具齐备、路径有效），瓶颈在「可比性」与「可追溯性」——**没有版本锚点，就无法回答「本地当前对应上游哪个 commit」，也就无法判断该不该升级**。这是整个演进机制最实质的短板。

---

## 七、实证核验结果（2026-08-09 实跑）

### 7.1 AnySearch 漂移矩阵

方法：`git hash-object` 计算本地 blob SHA，与 `gh api .../contents/<path>` 返回的上游 blob SHA 逐一比对；差异项再规范化行尾（本地 CRLF / 上游 LF）后 `diff` 定性。

| 文件 | 状态 | 定性 |
|------|------|------|
| `scripts/anysearch_cli.js` | SHA 一致 | ✅ Clean |
| `scripts/anysearch_cli.ps1` | SHA 一致 | ✅ Clean |
| `scripts/anysearch_cli.sh` | SHA 一致 | ✅ Clean |
| `scripts/generate.py` | SHA 一致 | ✅ Clean |
| `scripts/shared/constants.json` | SHA 一致 | ✅ Clean |
| `scripts/shared/doc_spec.md` | SHA 一致 | ✅ Clean |
| `scripts/anysearch_cli.py` | 差异 8 行 | ✅ **Patched（预期）**——第三级 `.env` 探测 + `break` 就近优先 |
| `SKILL.md` | 差异 14 行 | ✅ **Patched（预期）**——本地化 overlay |
| `README.md` | 差异 **1 行** | ⚠️ **Stale**——本地目录树多一行 `TEST_PLAN.md`，系上游删除后未同步 |
| `TEST_PLAN.md` | 上游 404 | ⚠️ **Stale**——上游已于 `69b3088`（2026-08-04）删除，本地滞留 |

**上游当前状态**：默认分支 `main`，最新 commit `69b3088`（2026-08-04 10:34 UTC，"docs: remove test plan"）；版本号仍为 v3.0.1（`caed9ea`，2026-07-22）。

**判定**：本地对应上游 `caed9ea`～`955aae7` 之间的状态，落后 2 个 commit，**且落后内容为纯文档删除，不影响调用契约**。核心 CLI 脚本与共享数据源完全同步，生成漂移检测 `generate.py --check` 通过。

### 7.2 Firecrawl 契约覆盖缺口

实测本地 `firecrawl` CLI v1.19.27 暴露 **26 个子命令**，`firecrawl/SKILL.md` 适配层仅覆盖 6 个（search / scrape / crawl / map / agent / interact）。**未覆盖但对本用户高价值**的子命令：

| 子命令 | 能力 | 对用户主业的价值 |
|--------|------|-----------------|
| `parse <file>` | 本地文件（PDF/DOCX/XLSX/RTF/ODT）解析为 markdown，走 `/v2/parse` | **高**——招投标文件、政策 PDF 的本地解析，无需上传 |
| `monitor` | 定时重复抓取 + 内容变更追踪 | **高**——契合「季度经营跟踪信息表」「政策更新监测」 |
| `credit-usage` | 查询团队配额余额 | 中——可在降级判定前预判限流 |
| `doctor` | 环境诊断（含按 job-id 诊断） | 中——轨道健康探测，替代盲目重试 |
| `research` | arXiv 论文与 GitHub 历史研究 | 低（副业场景） |
| `setup skills` | 官方 skills/workflows/mcp 集成安装 | 需评估——官方可能已提供 Firecrawl 官方 Skill，与本适配层存在职责重叠 |

### 7.3 缺陷清单

| 编号 | 严重度 | 位置 | 问题 | 证据 |
|------|--------|------|------|------|
| **G1** | **高** | `firecrawl/SKILL.md` 密钥注入段 | 文档推荐 `$env:FIRECRAWL_API_KEY = (firecrawl env \| Select-String ...)`，把 `firecrawl env` 当作「输出到 stdout 的读取命令」。但实测其官方语义为 **"Pull FIRECRAWL_API_KEY into a local .env file"**，默认写入当前目录 `.env`，且**无 stdout-only 选项**（仅有 `-f/--file` 改目标、`--overwrite`）。若 Agent 在 `web-search/` 下执行该命令，将**直接把 Firecrawl 密钥明文写入已被 git 跟踪的 `web-search/.env`**——正是同文档 C8 硬约束要禁止的后果，而这条「推荐命令」本身就是触发器 | `firecrawl env --help` 实测输出 |
| **G2** | 中 | `tests/test_fixes.py::test_c8_*` | C8 测试按**字面形态**布防（检测 `firecrawl env ... > .env` 或 `\| Out-File .env`），无法识别 G1 这种「命令自身即隐式落盘」的语义型违规，形成守护盲区 | 代码审阅 |
| **G3** | 中 | `anysearch-skill/TEST_PLAN.md`、`README.md` | 上游已删除的文件在本地滞留；README 目录树同步失配。虽不影响功能，但证明「同步记录表为空 → 无人知道落后了什么」 | 7.1 漂移矩阵 |
| **G4** | 中 | `anysearch-skill/.github/workflows/ci.yml` | 该文件被父仓库 git 跟踪，但 GitHub Actions 只识别**仓库根** `.github/workflows/`，故其 `generate.py --check` 与 `doc` 占位符泄漏检查**永不执行**。上游的一致性防线在并入后完全失效，而本仓库 Tier 3 未接管这两项检查 | `git ls-files` + Tier 3 源码审阅 |
| **G5** | 低 | `anysearch-skill/runtime.conf` | 子 SKILL.md 大篇幅描述「若 `runtime.conf` 存在则读 Runtime/Command 走快速路径」，但本地**只有 `.example`、无实际文件**，该逻辑分支恒不成立。overlay 虽已声明「一律以父契约为准」，但残留描述仍占 token 并可能诱导 Agent 去读不存在的文件 | 文件系统实测 |
| **G6** | 低 | 演进机制 | 直接用 blob SHA 比对会 **100% 假阳性**：本地文件为 CRLF、上游为 LF，Git blob SHA 必然不同。任何自动化漂移检测必须先规范化行尾 | 7.1 实测（`file` 命令确认 CRLF） |

---

## 八、改进建议

按投入产出比排序，均为可落地项。

### 建议 1（对应 G1，最高优先级）：修正 Firecrawl 密钥注入指引

将 `firecrawl/SKILL.md` 中的注入示例整体替换。推荐方案（按优先级）：

1. **首选：不注入**。已 `firecrawl login` 后 CLI 自动读全局凭据，直接 `firecrawl search "查询"` 即可，绝大多数场景无需任何注入。
2. **确需进程内注入时**：改用写入 git 之外的临时路径再读取即删，禁止在 `web-search/` 下裸跑 `firecrawl env`：
   ```powershell
   $tmp = Join-Path $env:TEMP ("fc_" + [guid]::NewGuid().ToString() + ".env")
   firecrawl env -f $tmp --overwrite | Out-Null
   $env:FIRECRAWL_API_KEY = (Get-Content $tmp | Select-String 'FIRECRAWL_API_KEY=(.+)').Matches.Groups[1].Value
   Remove-Item -LiteralPath $tmp -Force
   ```
3. 同步在文档中加一句显式警告：**`firecrawl env` 是写盘命令，不是读取命令**。

### 建议 2（对应 G2）：把 C8 测试从字面防护升级为语义防护

在 `test_c8_no_firecrawl_key_persisted_to_dotenv` 增加断言：文档中出现的任何 `firecrawl env` 调用，必须同时满足「带 `-f` 指向 `$env:TEMP`/临时路径」或「后跟 `Remove-Item`」，否则失败。同时保留原有重定向正则。

### 建议 3（对应 G3/G4/G6，核心补强）：建立版本锚点 + 漂移检测脚本

新增 `web-search/scripts/check_upstream_drift.py`（约 120 行，纯标准库 + `gh`）：

```
输入：web-search/upstream.lock.json
{
  "anysearch": {
    "repo": "anysearch-ai/anysearch-skill",
    "synced_commit": "955aae7",
    "synced_at": "2026-08-09",
    "patched_files": {
      "scripts/anysearch_cli.py": "_load_env 三级探测 + break 就近优先",
      "SKILL.md": "顶部本地化 overlay"
    }
  },
  "firecrawl": {
    "repo": "firecrawl/firecrawl",
    "spec_path": "apps/api/openapi.json",
    "synced_sha": "249678f565f33262867451209f68a519f3656181",
    "cli_version": "1.19.27"
  }
}

行为：
1. gh api 取上游各文件当前 blob SHA
2. 本地文件先 tr -d '\r' 规范化行尾 后再算 SHA（规避 G6 假阳性）
3. 三分类输出：Clean（一致）/ Patched（在 patched_files 白名单内，仅提示）/ Drift（★需处理）
4. 上游新增/删除文件单列
5. 对 firecrawl：比对 openapi.json SHA，变化则提示复核适配层参数
6. 退出码：仅 Drift 非空时返回 1
```

配套：
- 在 `tier3_runtime.py` 中调用它（**网络失败仅 WARN**，避免 CI 网络抖动阻断）；
- 顺带把 `generate.py --check` 也接入 Tier 3，补上 G4 的失效防线；
- 删除或在文件头注明 `anysearch-skill/.github/workflows/ci.yml` 为「上游遗留、本仓库不执行，检查已由 Tier 3 接管」。

### 建议 4（对应 G3）：清理滞留文件并回填同步记录表

- 删除 `anysearch-skill/TEST_PLAN.md`，同步修正 `anysearch-skill/README.md` 目录树中的对应行；
- 在 `web-search/README.md` 的 AnySearch 同步记录表补首行：`2026-08-09 | 955aae7 | 基线登记：核心 CLI 与 shared/ 与上游一致；删除上游已移除的 TEST_PLAN.md`；
- Firecrawl 表补：`2026-08-09 | 249678f5 | 基线登记；CLI v1.19.27`。

### 建议 5（对应 7.2）：扩充 Firecrawl 适配层覆盖面

优先补 `parse` 与 `monitor` 两个子命令的调用模板与适用场景说明——前者可直接用于本地招投标 PDF/DOCX 解析，后者可支撑政策更新的周期性监测，均与用户主业强相关。同时评估 `firecrawl setup skills` 提供的官方 Skill 是否与本适配层职责重叠。

### 建议 6（对应 G5）：清理 runtime.conf 死分支

在子 SKILL.md 的 overlay 中追加一句：「本仓库不生成 `runtime.conf`，下文所有 `runtime.conf` 快速路径描述在本仓库内不适用」，避免 Agent 无效探测。

### 建议 7：为演进机制补一个触发器

现有 Runbook 只能人工发起。建议在 `README.md` 顶部增加一句面向 Agent 的常驻指令：

> **检查时机**：当本技能连续两次调用出现参数错误、或距 `upstream.lock.json` 的 `synced_at` 超过 30 天时，Agent 应主动执行 `uv run python web-search/scripts/check_upstream_drift.py` 并向用户报告。

这把「被动等人想起」变成「有条件自动发起」，是本机制从 Runbook 走向自治的最小一步。

---

## 九、总体评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构设计 | **优** | 控制平面/演进平面/执行平面三分，职责清晰；双轨异构互补而非冗余；overlay 声明式覆盖是处理上游冲突的正确范式 |
| 技术选型 | **优** | 扁平并入避嵌套 git、`uv run --with requests` 免环境绑定、`{SKILL_ROOT}` 可移植——三项决策均正确且有测试守护 |
| 约束体系 | **良** | 三层门禁（技能内 4 条 + 仓库 Tier0-4 + 7 条契约测试）密度高于同类技能；扣分项为 C8 存在语义盲区（G1/G2） |
| 演进机制 | **中** | 路径设计合理且工具链就绪，但**无版本锚点、无漂移检测、记录表为空、无触发器**——从「可执行」到「可自治」尚缺关键一环 |
| 文档质量 | **良** | 父/子/README 三方契约一致性由测试强制；扣分项为上游滞留文件与 runtime.conf 死分支 |

**一句话结论**：这是一个**架构与约束设计达到生产级、但维护自动化尚停留在手册级**的技能。补齐「版本锚点 + 漂移检测脚本 + 触发条件」三件套（建议 3 与建议 7），即可让它从「Agent 照着 README 干活」升级为「Agent 自主发现并处置上游演进」。最紧急的单点是 G1 的密钥落盘风险，建议优先修复。

---

## 附：本次核验使用的命令（可复现）

```bash
# 1. 上游状态
gh api repos/anysearch-ai/anysearch-skill --jq '{default_branch,pushed_at}'
gh api "repos/anysearch-ai/anysearch-skill/commits?per_page=3" --jq '.[]|{sha:.sha[0:7],date:.commit.committer.date}'

# 2. 逐文件 blob SHA 漂移比对
for f in scripts/anysearch_cli.py SKILL.md README.md ...; do
  loc=$(git hash-object "$f")
  up=$(gh api "repos/anysearch-ai/anysearch-skill/contents/$f" --jq '.sha')
  [ "$loc" = "$up" ] && echo "$f 一致" || echo "$f ★漂移"
done

# 3. 规范化行尾后定性（规避 CRLF/LF 假阳性）
gh api "repos/.../contents/scripts/anysearch_cli.py" --jq '.content' | base64 -d > /tmp/up_cli.py
diff <(tr -d '\r' < scripts/anysearch_cli.py) <(tr -d '\r' < /tmp/up_cli.py)

# 4. 生成漂移检测
uv run --with requests python scripts/generate.py --check

# 5. Firecrawl 真实契约
firecrawl --help ; firecrawl env --help ; firecrawl interact --help
gh api repos/firecrawl/firecrawl/contents/apps/api/openapi.json --jq '{path,size,sha}'

# 6. 回归测试
uv run --with requests python -m unittest discover -s web-search/tests -v
```

