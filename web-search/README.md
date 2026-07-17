# web-search

> 深度联网搜索与信息下载助手（Skill 技能）。基于多引擎（AnySearch + Firecrawl）双轨并行 + LLM 原生工具补偿，对联网检索结果做多来源印证与可信度标记，最终交付结构化中文报告与可复用的 Markdown 素材文件。

---

## 目录

- [1. 概述](#1-概述)
- [2. 与 anysearch-skill 的关系（是否已彻底脱离）](#2-与-anysearch-skill-的关系是否已彻底脱离)
- [3. 功能特性](#3-功能特性)
- [4. 目录结构](#4-目录结构)
- [5. 依赖项](#5-依赖项)
- [6. 安装（Installation）](#6-安装installation)
- [7. 配置（Configuration）](#7-配置configuration)
  - [7.1 AnySearch API Key（可选）](#71-anysearch-api-key可选)
  - [7.2 uv 环境（Python venv + requests）](#72-uv-环境python-venv--requests)
  - [7.3 Firecrawl 访问配置（两种形态，二选一）](#73-firecrawl-访问配置两种形态二选一)
  - [7.4 Dynamic-mcp 连接器（仅形态 A 需要）](#74-dynamic-mcp-连接器仅形态-a-需要)
  - [7.5 runtime.conf（可选覆盖）](#75-runtimeconf可选覆盖)
- [8. 是否需要手动启动](#8-是否需要手动启动)
- [9. 使用方式（Usage）](#9-使用方式usage)
- [10. 删除 anysearch-skill 的影响](#10-删除-anysearch-skill-的影响)
- [11. 安全与隐私](#11-安全与隐私)
- [12. 常见问题（FAQ）](#12-常见问题faq)
- [13. 许可证](#13-许可证)

---

## 1. 概述

`web-search` 是一份**完全自包含**的 Skill 技能，面向个人日常的信息调研场景：

- 输入一句话需求（如「帮我搜一下磷石膏综合利用的扶持政策」），由 LLM 扮演「联网搜索与信息下载助手」角色；
- 先做显式/隐藏要素提取与多轮澄清，再按 **AnySearch（轨道 A）→ Firecrawl（轨道 B）** 双引擎双轨顺序执行（每关键词两轨都不得留空）；
- 任一引擎不可用时，由 LLM 原生 `web_search` / `web_fetch` 补偿保双轨；
- 对每条信息做多来源印证，打 ✅ 双引擎互证 / ✅ 多源验证通过 / ⚠️ 单源权威 / ❌ 未通过（[数据待核实]）标记；
- 交付：对话内结构化中文报告 + 落盘 Markdown 素材文件（统一 schema、含来源标签与印证标记）。

> 注意：本技能**不做**文档撰写、排版或代写，只做搜索、下载与印证标记。

---

## 2. 与 anysearch-skill 的关系（是否已彻底脱离）

**结论：本技能已彻底脱离 anysearch-skill，运行时不依赖、不加载、不引用 anysearch-skill 的任何文件。**

证据如下（均经实际核对）：

| 核对项 | 结果 |
|--------|------|
| web-search 是否 `load`/`include` 外部技能定义 | 否，SKILL.md 无技能加载指令 |
| web-search 是否引用 `../anysearch-skill/...` 路径 | 否，所有路径指向自身 `[Skill技能根目录]/web-search/...` |
| AnySearch 调用知识是否内联 | 是，已写入 `references/anysearch.md`，不读取 anysearch-skill 的 SKILL.md |
| AnySearch CLI 是否自带 | 是，`scripts/anysearch_cli.py` 为本技能**自带副本**（与 anysearch-skill 中的文件逐字节相同，已 `diff` 验证） |
| `.env` / `shared/` 资产是否自带 | 是，web-search 自带 `.env` 与 `scripts/shared/`（与 anysearch-skill 逐字节相同） |

**唯一残留关系**：web-search 内置的 `anysearch_cli.py` 是 anysearch-skill 中同名脚本的一份**拷贝（fork）**，目的是自包含，而非运行期引用。两者是「复制关系」，不是「依赖关系」。

> 一句话：删除 anysearch-skill 对本技能**没有任何功能影响**——本技能靠的是自己目录里的那份拷贝，而不是 anysearch-skill。

---

## 3. 功能特性

- **双引擎平权双轨**：AnySearch（先）+ Firecrawl（后）两轨都必须跑、结果独立、最后合并；非时间并行。
- **三级接力兜底**：引擎内某工具失败时，跨引擎同功能接力 → LLM 原生同功能接力 → 跳过并记录，不卡死、不编造。
- **垂直域智能路由**：命中受支持领域先 `get_sub_domains` 再垂直搜索；中文政策/国标特别规则（不走垂直域，直接通用搜索）。
- **多来源印证**：双引擎互证、多源验证、单源权威、未通过四级采信标记。
- **落盘素材**：统一 schema 的 Markdown 文件，来源标签 `[搜索K{n}-AnySearch|Firecrawl|Native]`，可跨会话追加。
- **强门禁**：合法性门禁、隐私脱敏门禁、输出目录绝对路径强门禁、交付前自检门禁。

---

## 4. 目录结构

```
web-search/
├── SKILL.md                # 技能定义（角色、工作流、规则）
├── README.md               # 本文件
├── .env                    # AnySearch API Key（已内置一份，可选覆盖）
├── scripts/
│   ├── anysearch_cli.py    # 自带的 AnySearch CLI（Python 版，本技能资产）
│   └── shared/             # CLI 离线参考（doc_spec.md / constants.json）
└── references/
    ├── anysearch.md        # AnySearch 调用知识（内联，独立可用）
    ├── firecrawl.md        # Firecrawl 调用知识（传输无关：中继或直接，内联）
    └── orchestration.md    # 双引擎编排与多来源印证逻辑（内联）
```

> 注意：本技能**不**携带 `runtime.conf`（anysearch-skill 带有该文件且写死了指向自身目录的绝对路径）。web-search 改用 SKILL.md / `references/anysearch.md` 中的命令构造作为单一事实源；若你在 web-search 目录下另放 `runtime.conf` 并含 `Command:` 行，将以该行覆盖（可选，见 [7.5](#75-runtimeconf可选覆盖)）。

---

## 5. 依赖项

| 依赖 | 是否必需 | 说明 |
|------|----------|------|
| `uv`（Python 包/环境管理器） | 必需 | 本技能统一用 `uv run` 运行(run) Python，禁用裸 `python` / `pip`。 |
| Python 3.6+（经 uv 管理的环境(venv)） | 必需 | 仅需含 `requests` 库。默认环境路径 `D:/Tools/Assembly/python/myenv`。 |
| 网络访问 | 必需 | AnySearch CLI 调用 `https://api.anysearch.com/mcp`。 |
| AnySearch API Key | 可选 | 无 Key 走匿名访问（更低速率限制），已内置一份 Key。 |
| Firecrawl（访问方式自适应） | 轨道 B 必需 | **两种形态任选其一即可**：① 经 Dynamic-mcp 中继（Dynamic-mcp 已连接 + 其下含 Firecrawl 分组，默认组名 `firecrawl-mcp`）；② LLM 平台直连 Firecrawl-MCP（工具集直接出现 `firecrawl_*`）。技能在运行时由 LLM 自动探测当前环境适用哪一种，无需用户指定；两者皆无则轨道 B 不可用、自动降级。 |
| LLM 原生 `web_search` / `web_fetch` | 补偿通道 | 任意引擎不可用时的兜底，通常随宿主可用。 |

---

## 6. 安装（Installation）

本目录是技能**源码/定义**，需放入宿主的技能目录才能被加载。二选一：

### 方式 A：用户级（跨项目可用）

将整个 `web-search` 文件夹复制(copy)到用户技能目录：

```
~/.workbuddy/skills/web-search/
```

即最终路径形如 `~/.workbuddy/skills/web-search/SKILL.md`。

### 方式 B：项目级（仅当前工作区可用）

复制到项目技能目录：

```
<workspace>/.workbuddy/skills/web-search/
```

### 可选：用 git 做版本管理

若希望对该技能做版本控制，可在本目录初始化一个 git 仓库(repository) 并提交(commit)（示例代码块保持原样，正文叙述见映射）：

```bash
cd /d/Documents/AI_MCP-Skill-CLI/web-search
git init
git add -A
git commit -m "feat: add web-search skill"
```

> 之后可用 `git clone <你的远端仓库(origin) 地址> ~/.workbuddy/skills/web-search` 在新机器拉取(pull) 安装。
> 注意：本技能含 `.env`（含密钥），请用 `.gitignore` 忽略后再提交(commit)（见 [第 11 节](#11-安全与隐私)）。

---

## 7. 配置（Configuration）

### 7.1 AnySearch API Key（可选）

- 已内置一份 `ANYSEARCH_API_KEY` 于 `web-search/.env`，开箱即用（匿名/低速率亦可，无需 Key）。
- 若要换成你自己的 Key：编辑 `web-search/.env`：

  ```
  ANYSEARCH_API_KEY=<your_api_key_here>
  ```

- 优先级：`--api_key` 命令行参数 > `.env` > 系统环境变量 > 匿名访问。命令中无需手动传 Key，CLI 会自动读取 `.env`。

### 7.2 uv 环境（Python venv + requests）

本技能默认以如下命令基运行(run) AnySearch CLI：

```bash
uv run --project D:/Tools/Assembly/python/myenv python D:/Documents/AI_MCP-Skill-CLI/web-search/scripts/anysearch_cli.py <子命令> [选项]
```

前置条件（一次性）：

1. 已安装 `uv`（本机环境管理工具，非 Docker）；
2. 路径 `D:/Tools/Assembly/python/myenv` 处存在一个 uv 管理的 Python 环境(venv)，且已安装 `requests`。

若该环境不存在，用 uv 创建并安装(install)依赖（**必须用 `uv pip` / `uv add`，禁用裸 `pip`**）：

```bash
uv venv D:/Tools/Assembly/python/myenv
uv pip install --python D:/Tools/Assembly/python/myenv requests
```

> 若你不想用固定环境路径，可在调用时省略 `--project`，直接用 `uv run python ...`（SKILL.md 已支持该写法，自动使用 uv 默认环境）。

### 7.3 Firecrawl 访问配置（两种形态，二选一）

轨道 B 依赖 Firecrawl，但**不绑定特定接入方式**。技能在运行时由 LLM 自动探测当前环境适用哪一种，无需你在技能内写死。你只需保证「至少一种」形态可用：

**形态 A — 经 Dynamic-mcp 中继（推荐，多 MCP 服务器统一治理）**

适用：宿主侧已连接 Dynamic-mcp，且 Firecrawl-MCP 作为 Dynamic-mcp 的上游分组（默认组名 `firecrawl-mcp`）。

手动配置步骤（在宿主 LLM 平台的 Dynamic-mcp 设置中）：

1. 确认 Dynamic-mcp 连接器已连接（connected）；
2. 在 Dynamic-mcp 中新增/确认一个分组，组名设为 `firecrawl-mcp`（默认；实际组名以 `list_groups` 返回为准，技能会自动识别，无需手改 SKILL.md）；
3. 在该组内填入你的 Firecrawl API Key 并完成鉴权。

运行期 LLM 会：`list_groups` 定位分组 → `get_dynamic_tools(group=...)` 拉工具说明 → `call_dynamic_tool(group=..., name=..., args=...)` 调用。

**形态 B — LLM 平台直连 Firecrawl-MCP（无 Dynamic-mcp）**

适用：宿主侧直接将 Firecrawl-MCP 作为 LLM 平台的上游连接器（无 Dynamic-mcp 中转），工具集直接出现 `firecrawl_*` 系列（或平台前缀等价形态，如 `mcp__firecrawl__firecrawl_search`）。

手动配置步骤（在宿主 LLM 平台的连接器设置中）：

1. 新增 Firecrawl 连接器并完成 API Key 鉴权；
2. 确认工具集中可见 `firecrawl_search` / `firecrawl_scrape` / `firecrawl_agent` 等工具。

运行期 LLM 会**直接调用**这些工具，无需 `list_groups` / `call_dynamic_tool`。

> 两种形态任一可用即可；皆不可用则轨道 B 自动降级为 LLM 原生 `web_search` / `web_fetch` 补偿，不影响轨道 A（AnySearch）与整体交付。

### 7.4 Dynamic-mcp 连接器（仅形态 A 需要）

若采用形态 A，请确认宿主侧 **Dynamic-mcp 连接器处于已连接状态**，且其中含可用的 Firecrawl 分组。该连接器未连接时，技能会自动切换到形态 B 探测，或直接降级（见 7.3）。形态 B 用户无需关心本节。

### 7.5 runtime.conf（可选覆盖）

web-search 默认**不**携带 `runtime.conf`，由 SKILL.md / `references/anysearch.md` 的命令构造作为单一事实源。

若你想固定运行(run)命令，可在 `web-search/` 下新建 `runtime.conf`，格式示例：

```
Runtime: Python
Command: uv run --project D:/Tools/Assembly/python/myenv python D:/Documents/AI_MCP-Skill-CLI/web-search/scripts/anysearch_cli.py
```

含 `Command:` 行时，技能会以该行为准（覆盖默认命令基）。

---

## 8. 是否需要手动启动

**不需要手动启动任何服务/进程（无 daemon、无后台进程）。**

- AnySearch CLI 是按需(on-demand)经 `uv run` 拉起的一次性进程，跑完即退出；
- Firecrawl 经已连接的 Dynamic-mcp 中继或直接由平台连接访问，无需你启动独立服务；
- 技能本身由宿主 Agent 框架在触发条件命中时自动加载，无需你每次手动「启动(start)」。

你只需做一次性的**配置**（启用连接器、确保 uv 环境存在），之后无需每次启动。

---

## 9. 使用方式（Usage）

用户用自然语言提出联网检索需求即可，典型触发短语：

- 「帮我搜一下……」
- 「查一下这个……」
- 「联网找资料……」
- 「下载这个网页……」

命中后，Agent 会按 SKILL.md 的八步工作流自动执行（要素提取 → 澄清 → 引擎准备 → 双轨搜索 → 印证 → 交付）。你只需在「澄清门禁」阶段回复输出目录绝对路径与歧义项。

---

## 10. 删除 anysearch-skill 的影响

**可以删除 anysearch-skill，且不会破坏 web-search。**

理由：

1. web-search 自带逐字节相同的 `anysearch_cli.py`、`.env`、`scripts/shared/`，运行期完全不读 anysearch-skill；
2. web-search 的 AnySearch 知识已内联在 `references/anysearch.md`，不依赖外部技能定义。

但请知悉两点：

- **维护一致性**：两份 `anysearch_cli.py` / `.env` 现为独立副本。若你将来只维护 web-search，删除 anysearch-skill 反而更干净，避免「改了一份、另一份没改」的漂移(drift)风险。
- **外部依赖差异**：web-search 比 anysearch-skill **多**一个外部依赖——Firecrawl。但 web-search 对 Firecrawl 的访问是**传输无关**的：既支持经 Dynamic-mcp 中继，也支持 LLM 平台直连 Firecrawl-MCP，运行期由 LLM 自动探测适用形态。若你目前没有任何一种 Firecrawl 接入，web-search 会优雅降级为「AnySearch + 原生工具」单/双轨；而 anysearch-skill 是纯 AnySearch 独立可用。即：删除 anysearch-skill 不会减少能力，但 web-search 的完整双引擎能力需要你至少配好一种 Firecrawl 接入形态。

---

## 11. 安全与隐私

- `web-search/.env` 内置了一份 `ANYSEARCH_API_KEY`（与 anysearch-skill 中的 Key 相同，属拷贝）。**请勿将该 Key 提交(commit)到公开 git 仓库(repository)**。建议：
  - 在 `.gitignore` 中加入 `.env`，或将 `.env` 排除后用自己的 Key；
  - 或仅保留 `.env.example` 占位，实际 Key 本地持有。
- 搜索查询、抓取 URL、API Key 会发往 `https://api.anysearch.com`；勿用于含密码、个人数据、商业秘密的敏感查询。
- `doc` 子命令为纯本地操作，无网络请求。
- 本技能内置合法性门禁与隐私脱敏门禁：涉及违法、侵犯隐私、恶意攻击的内容会被拒绝；真实敏感信息（手机号、身份证、密码、银行卡）在发出检索前会被脱敏或占位。

---

## 12. 常见问题（FAQ）

**Q1：web-search 会不会因为我删了 anysearch-skill 就报错？**
A：不会。两者是拷贝关系，非依赖关系，web-search 用自己目录里的 CLI。

**Q2：没有 Firecrawl 还能用吗？**
A：能。轨道 B 会降级为 LLM 原生 `web_search` / `web_fetch` 补偿，轨道 A（AnySearch）照常工作。

**Q3：必须用 `uv` 吗？能不能直接 `python anysearch_cli.py`？**
A：本技能约定统一用 `uv run` 运行(run) Python（禁用裸 `python` / `pip`）。直接裸跑不符合本机环境规范，且可能找不到正确的环境(venv)与 `requests`。

**Q4：`.env` 里的 Key 必须配吗？**
A：不必。无 Key 走匿名访问（更低速率）。有 Key 仅提升速率上限。

**Q5：web-search 比 anysearch-skill 多了 Firecrawl，接入很麻烦吗？**
A：web-search 定位为「多引擎双轨 + 多来源印证」的调研助手，Firecrawl 是其轨道 B；anysearch-skill 是单一 AnySearch 工具。Firecrawl 的接入并不绑定 Dynamic-mcp——你可以经 Dynamic-mcp 中继，也可以让 LLM 平台直连 Firecrawl-MCP，技能运行期会自动探测当前环境适用哪一种（见 [7.3](#73-firecrawl-访问配置两种形态二选一)），两种形态任一可用即可。

**Q6：我的平台没有 Dynamic-mcp，Firecrawl 还能用吗？**
A：能。只要 LLM 平台直接连接了 Firecrawl-MCP（工具集出现 `firecrawl_*`），技能会走直连形态直接调用，无需 Dynamic-mcp。这也正是本技能将「是否存在 Dynamic-mcp 中转」的判断交给 LLM 完成的原因——它不再硬性依赖 Dynamic-mcp。

---

## 13. 许可证

`license: Proprietary`（专有，作者 zhangweildlh）。AnySearch CLI 与 `.env` 中的接口/密钥归原 AnySearch 服务提供方，使用受该服务条款约束。
