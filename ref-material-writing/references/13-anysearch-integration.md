# AnySearch 双引擎集成契约（ref-material-writing 内嵌自包含）

> 本文件定义 `ref-material-writing` 的 AnySearch 双引擎接入方式。
> **自 2026-08-03 起，本技能已内嵌自包含 AnySearch CLI 副本**（`scripts/anysearch_cli.py` + `scripts/shared/` + 技能根 `.env`），**不依赖任何外部 Skill 技能及其资源文件 / 脚本文件**。
> 权威接口参考：运行 `uv run --project D:/Tools/Assembly/python/myenv python scripts/anysearch_cli.py doc` 查看完整 CLI 规范（子命令、参数、输出格式均以该副本 `doc` 输出为准）。
> 对接点：步骤2 URL 双轨抓取（`extract`）、步骤5 轨道A 全量使用。

---

## 1. 固定调用命令（内嵌自包含副本）

```
uv run --project D:/Tools/Assembly/python/myenv python scripts/anysearch_cli.py <子命令> [选项]
```

- 路径解析：命令采用**基于技能目录的相对路径** `scripts/anysearch_cli.py`（以本技能根目录 `ref-material-writing/` 为解析基准，运行时拼接为绝对路径），指向本技能内嵌副本；与 Firecrawl 平权双引擎。
- API key 由技能根 `.env`（`ANYSEARCH_API_KEY`）自动加载（脚本启动时按 `scripts/.env` → 技能根 `.env` 顺序探测），**命令中无需传 key**。
- 路径分隔符**统一正斜杠 `/`**（Bash / PowerShell 双宿主一致；Bash 下反斜杠 `\` 会被转义导致路径失败）。
- **维护约定**：若 CLI 接口变更，改 `scripts/anysearch_cli.py` 并重跑 `doc` 复核；镜像同步 6 处（`_router/bootstrap.md`、`_router/_contract.md`、`_router/step-02.md`、`_router/step-05.md`、`compatibility.md`、`references/02-environment-setup.md`）；禁止只改镜像不改脚本（反之亦然）。

---

## 2. 子命令表（日常调用形状）

| 子命令 | 用途 | 常用参数 | 调用示例 |
|--------|------|----------|----------|
| `search` | 通用 / 垂直搜索 | `"query"`、`--max_results N`(1–10，默认10)、`--domain`/`--sub_domain`/`--sub_domain_params` | `... anysearch_cli.py search "关键词" --max_results 10` |
| `batch_search` | 多关键词并行 | `--query "词"`(可重复) 或 `--queries @file.json` | `... anysearch_cli.py batch_search --query "词1" --query "词2"` |
| `extract` | URL 正文抓取（HTML→Markdown，截断 ~50k 字符） | `"https://..."` 或 `--url "..."` | `... anysearch_cli.py extract "https://..."` |
| `get_sub_domains` | 发现垂直子域（垂直搜索前必调） | `--domain X` / `--domains X,Y` | `... anysearch_cli.py get_sub_domains --domains finance,health` |
| `doc` | 离线查阅完整 CLI 参考（未知接口 / 失败恢复时；日常**不调用**） | 无 | `... anysearch_cli.py doc` |

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
  `uv run ... anysearch_cli.py search "关键词" --max_results 10`（omit `--domain`），避免误判空域导致检索失败。
- 仅在任务主题确属上述国际向领域（如某跨国企业财报、美股代码、国际学术文献）时，才按 §3 正常走 `get_sub_domains` → 垂直搜索。
- 该结论须在本文件固化，避免续跑会话中 AI 误判中文政策为垂直域。

---

## 4. API Key 与降级

- **优先级**：`--api_key` 参数 > `.env`(`ANYSEARCH_API_KEY`) > 系统环境变量 > 匿名访问（低速率）。
- 脚本启动时自动从技能根加载 `.env`（内嵌副本），无需在命令传参。
- **匿名降级**：无 key 或 key 耗尽时自动匿名访问（速率更低），不阻断流程；如需更高限额引导用户配置 key。
- **不可用降级**：若 AnySearch 整体不可用（无 key / 配额耗尽 / 服务错误 / 网络失败），按 `_router/step-05.md` 双引擎降级矩阵转入 Firecrawl 或 NATIVE_WEB 轨道，**不静默跳过**。

---

## 5. 与副本 A 的对接点

| 对接位置 | 用法 |
|----------|------|
| `_router/bootstrap.md` | ANYSEARCH 固定命令登记（内嵌自包含，非动态探测） |
| `_router/_contract.md` | ANYSEARCH 逻辑原语→固定内部命令绑定 |
| `_router/step-02.md` §2.2 | URL 双轨抓取调用 `extract <url>` |
| `_router/step-05.md` 轨道A | `search` / `batch_search` / `extract` / `get_sub_domains` 完整使用；§5.4 垂直域判定 |
| `references/02-environment-setup.md` 约束 15 | AnySearch 内嵌命令定义 |

> 本技能现已内嵌 AnySearch CLI 副本，所有接口疑问以本技能 `scripts/anysearch_cli.py doc` 输出为权威；必要时重跑 `doc` 子命令获取最新接口说明。
