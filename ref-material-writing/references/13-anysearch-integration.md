# AnySearch 双引擎集成契约（ref-material-writing 内嵌自包含）

> 本文件定义 `ref-material-writing` 的 AnySearch 双引擎接入方式。
> **自 2026-08-03 起，本技能已内嵌自包含 AnySearch CLI 副本**（`scripts/anysearch_cli.py` + `scripts/shared/` + 技能根 `.env`），**不依赖任何外部 Skill 技能及其资源文件 / 脚本文件**。
> 权威接口参考：运行 `<ANYSEARCH_CMD> doc`（`<ANYSEARCH_CMD>` 见下文 §1 唯一定义）查看完整 CLI 规范（子命令、参数、输出格式均以该副本 `doc` 输出为准）。
> 对接点：步骤2 URL 双轨抓取（`extract`）、步骤5 轨道A 全量使用。

---

## 1. 固定调用命令（内嵌自包含副本）—— 全技能唯一定义处（单一事实源）

> **单点化约定（强制）**：本节是 `ref-material-writing` 内 AnySearch 固定调用命令的**唯一定义处**。技能内其余文件（`SKILL.md`、`_router/bootstrap.md`、`_router/_contract.md`、`_router/step-02.md`、`_router/step-05.md`、`compatibility.md`、`references/02-environment-setup.md`、`assets/_流水线状态.md`）**一律不得重复写死该命令**，只以占位符 `<ANYSEARCH_CMD>` 引用本节；执行前须先读本节取得完整命令前缀，再拼接子命令与选项。

```
uv run --project <UV_PROJECT> python scripts/anysearch_cli.py <子命令> [选项]
```
（`UV_PROJECT>` = 本机 uv 工程路径；默认值为运行环境专属的 UV 工程目录，可由环境变量 `REF_MATERIAL_UV_PROJECT` 覆盖——脚本启动时读取，未设置则回退默认。）

- **占位符约定（`<ANYSEARCH_CMD>`）**：本文件及技能内其他文件中出现的 `<ANYSEARCH_CMD>`，一律代表上述命令前缀 `uv run --project <UV_PROJECT> python scripts/anysearch_cli.py`（`<UV_PROJECT>` 按本机环境展开；默认值为运行环境专属的 UV 工程目录，可由 `REF_MATERIAL_UV_PROJECT` 覆盖）。书写 `<ANYSEARCH_CMD> search "关键词"` 即等价于展开后的完整命令。
- **UV 前缀不可省（强制）**：严禁省略 `uv run --project <UV_PROJECT>` 前缀而直接使用 `python scripts/anysearch_cli.py`。
- 路径解析：脚本路径 `scripts/anysearch_cli.py` 基于技能目录的相对路径（以本技能根目录 `ref-material-writing/` 为解析基准，运行时拼接为绝对路径）；**uv 工程前缀 `<UV_PROJECT>` 为运行环境专属绑定**（默认值为运行环境专属的 UV 工程目录，即用户本机工具链目录），并非技能相对路径——跨机 / 跨用户须改为各自 uv 工程或设置 `REF_MATERIAL_UV_PROJECT`。与 Firecrawl 平权双引擎。
- API key 由技能根 `.env`（`ANYSEARCH_API_KEY`）自动加载（脚本启动时按 `scripts/.env` → 技能根 `.env` 顺序探测），**命令中无需传 key**。
- 路径分隔符**统一正斜杠 `/`**（Bash / PowerShell 双宿主一致；Bash 下反斜杠 `\` 会被转义导致路径失败）。
- **维护约定（单点维护）**：若 CLI 接口或调用前缀变更，改 `scripts/anysearch_cli.py` 并重跑 `doc` 复核，命令文本**只需改本节这一处**——其余文件均为 `<ANYSEARCH_CMD>` 引用，无需逐处 rewrite。禁止在其他文件重新写死该命令；亦禁止只改本节不改脚本（反之亦然）。

---

## 2. 子命令表（日常调用形状）

| 子命令 | 用途 | 常用参数 | 调用示例 |
|--------|------|----------|----------|
| `search` | 通用 / 垂直搜索 | `"query"`、`--max_results N`(1–10，默认10)、`--domain`/`--sub_domain`/`--sub_domain_params` | `<ANYSEARCH_CMD> search "关键词" --max_results 10` |
| `batch_search` | 多关键词并行 | `--query "词"`(可重复) 或 `--queries @file.json` | `<ANYSEARCH_CMD> batch_search --query "词1" --query "词2"` |
| `extract` | URL 正文抓取（HTML→Markdown，截断 ~50k 字符） | `"https://..."` 或 `--url "..."` | `<ANYSEARCH_CMD> extract "https://..."` |
| `get_sub_domains` | 发现垂直子域（垂直搜索前必调） | `--domain X` / `--domains X,Y` | `<ANYSEARCH_CMD> get_sub_domains --domains finance,health` |
| `doc` | 离线查阅完整 CLI 参考（未知接口 / 失败恢复时；日常**不调用**） | 无 | `<ANYSEARCH_CMD> doc` |

> **调用数量约束（与内嵌副本对齐，避免限流 / 拒答）**：
> - `batch_search`：单条命令 `--query` 可重复 **2–5 条**（或用 `--queries @file.json`，单次调用 2–5 条）；超出 5 条副本直接报错退出。
> - `get_sub_domains`：`--domains` 单次建议 **≤5** 个领域（逗号分隔或 JSON 数组），过多可能被后端拒绝。
> - `search --max_results`：取值 **1–10**（默认 10）；垂直搜索 `--sub_domain_params` 中标记 `(required)` 的参数**必须**全部纳入（无适用值传空串 `{"required_key":""}`）。

- `extract` **无格式选项**：禁止 `extract --format markdown/json` 等写法；输出已是 Markdown。
- 垂直搜索必填参数：当 `get_sub_domains` 返回标记 `(required)` 的参数，**必须**全部纳入 `--sub_domain_params`（无适用值传空串 `{"required_key":""}`），缺省会触发后端校验错误。

---

## 3. 垂直域规则（与内嵌副本对齐）

- **默认走垂直路径（Path 2）**：命中受支持领域（finance / academic / travel / health / code / legal / gaming / film / business / security / ip / energy / environment / agriculture / resource / social_media）时，**先 `get_sub_domains` 再搜索**——垂直搜索显著优于通用搜索。
- **纯百科且无任何领域重合**为少数例外（Path 1），可走通用搜索（`omit --domain`）。
- 不确定通用还是垂直 → 用 HYBRID：`batch_search` 同时跑 1 条通用 + N 条垂直查询。

### 3.1 实证结论（中文任务特别规则，须固化）

内嵌副本的垂直域多为**美国 / 国际向**（例：`legal`=US Congress、`environment`=aqi、`business`/`energy` 等），**无中国国策 / 标准类垂直域**。因此：

- 涉及**中文政策文件**（HJ / GB 编号、国发 / 环发 / 生态环境部令等文号）、**中国国家标准 / 行业标准**的检索，**不走垂直域**，直接：
  `<ANYSEARCH_CMD> search "关键词" --max_results 10`（omit `--domain`），避免误判空域导致检索失败。
- 仅在任务主题确属上述国际向领域（如某跨国企业财报、美股代码、国际学术文献）时，才按 §3 正常走 `get_sub_domains` → 垂直搜索。
- 该结论须在本文件固化，避免续跑会话中 AI 误判中文政策为垂直域。

---

## 4. API Key 与降级

- **优先级**：`--api_key` 参数 > `.env`(`ANYSEARCH_API_KEY`) > 系统环境变量 > 匿名访问（低速率）。
- 脚本启动时自动从技能根加载 `.env`（内嵌副本），无需在命令传参。
- **匿名降级**：无 key 或 key 耗尽时自动匿名访问（速率更低），不阻断流程；如需更高限额引导用户配置 key。
- **不可用降级**：若 AnySearch 整体不可用（无 key / 配额耗尽 / 服务错误 / 网络失败），按 `_router/step-05.md` 双引擎降级矩阵转入 Firecrawl 或 NATIVE_WEB 轨道，**不静默跳过**。

---

## 5. 引用方清单（均以 `<ANYSEARCH_CMD>` 引用本文件 §1，不重复定义命令）

| 引用位置 | 用法 |
|----------|------|
| `SKILL.md` 关键决策规则 | AnySearch 命令来源：指向本文件 §1 |
| `_router/bootstrap.md` Gate-0 | ANYSEARCH 固定命令登记（内嵌自包含，非动态探测），命令取自本文件 §1 |
| `_router/_contract.md` 原语绑定表 | ANYSEARCH 逻辑原语→固定内部命令绑定，命令取自本文件 §1 |
| `_router/step-02.md` §2.2 | URL 双轨抓取调用 `<ANYSEARCH_CMD> extract "<url>"` |
| `_router/step-05.md` 轨道A | `search` / `batch_search` / `extract` / `get_sub_domains` 完整使用；§5.4 垂直域判定 |
| `references/02-environment-setup.md` 约束 15 | AnySearch 内嵌命令使用约束（命令本体见本文件 §1） |
| `compatibility.md` 工具映射表 | ANYSEARCH 行登记，命令取自本文件 §1 |
| `assets/_流水线状态.md` §13 | 运行期工具能力映射表 ANYSEARCH 行，命令取自本文件 §1 |

> 上述文件**只引用不定义**：命令文本的唯一权威是本文件 §1，任何变更只改 §1 一处。
> 本技能现已内嵌 AnySearch CLI 副本，所有接口疑问以本技能 `<ANYSEARCH_CMD> doc` 输出为权威；当命令变更或 `doc` 输出与脚本不一致时重跑 `doc` 子命令获取最新接口说明。
