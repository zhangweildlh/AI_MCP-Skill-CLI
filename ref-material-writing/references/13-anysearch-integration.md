# AnySearch 双引擎集成契约（ref-material-writing 引用 / 调用 / 加载来源）

> 本文件定义 `ref-material-writing`（副本 A）如何以**引用 / 调用 / 加载**方式接入 `anysearch-skill`，**不复制、不改写** anysearch-skill 本体。
> 来源（单一事实源）：`D:/Documents/AI_MCP-Skill-CLI/anysearch-skill`（含 `SKILL.md` 与 `runtime.conf`）。
> 对接点：步骤2 URL 双轨抓取（`extract`）、步骤5 轨道A 全量使用。

---

## 1. 固定调用命令（单一来源：anysearch-skill/runtime.conf）

anysearch-skill 的 `runtime.conf` 中 `Command` 字段为：

```
uv run --project D:/Tools/Assembly/python/myenv python D:/Documents/AI_MCP-Skill-CLI/anysearch-skill/scripts/anysearch_cli.py
```

该值与 ref-material-writing 内部所有硬编码镜像**完全一致**，即**单一事实源已存在**。⚠️ 路径统一用正斜杠 `/`（Bash 宿主下反斜杠 `\` 会被转义导致命令失败；正斜杠在 Bash 与 PowerShell 下均可用），本文件命令示例均已用正斜杠。

**ref-material-writing 内统一镜像写法（禁止省略 `uv run --project D:/Tools/Assembly/python/myenv` 而直接使用 `python`）**：

```
uv run --project D:/Tools/Assembly/python/myenv python D:/Documents/AI_MCP-Skill-CLI/anysearch-skill/scripts/anysearch_cli.py <子命令> [选项]
```

- API key 由该目录内 `.env`（`ANYSEARCH_API_KEY`）自动加载，**命令中无需传 key**。
- 路径为固定存放目录（`D:/Documents/AI_MCP-Skill-CLI/anysearch-skill`），用户明确指定，故**允许并应当硬编码**；但 ref-material-writing 内部资产路径仍须使用 `[Skill技能根目录]/[name]` 等占位符。
- **维护约定**：若未来 `runtime.conf` 命令变更，须**仅改 runtime.conf 并重写本文件及 6 处镜像**（`_router/bootstrap.md`、`_router/_contract.md`、`_router/step-02.md`、`_router/step-05.md`、`compatibility.md`、`references/02-environment-setup.md`）；禁止只改镜像不改 runtime.conf（反之亦然）。

---

## 2. 子命令表（日常调用形状）

> 引自 anysearch-skill `SKILL.md` Command Cheat Sheet，仅列 ref-material-writing 实际用到者。不要臆造额外输出格式 flag。

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

## 3. 垂直域规则（与 anysearch-skill 对齐）

> 依据 anysearch-skill `SKILL.md`「Vertical domain rule」。

- **默认走垂直路径（Path 2）**：命中受支持领域（finance / academic / travel / health / code / legal / gaming / film / business / security / ip / energy / environment / agriculture / resource / social_media）时，**先 `get_sub_domains` 再搜索**——垂直搜索显著优于通用搜索。
- **纯百科且无任何领域重合**为少数例外（Path 1），可走通用搜索（`omit --domain`）。
- 不确定通用还是垂直 → 用 HYBRID：`batch_search` 同时跑 1 条通用 + N 条垂直查询。

### 3.1 实证结论（中文任务特别规则，须固化）

anysearch-skill 的垂直域多为**美国 / 国际向**（例：`legal`=US Congress、`environment`=aqi、`business`/`energy` 等），**无中国国策 / 标准类垂直域**。因此：

- 涉及**中文政策文件**（HJ/GB 编号、国发 / 环发 / 生态环境部令等文号）、**中国国家标准 / 行业标准**的检索，**不走垂直域**，直接：
  `uv run ... anysearch_cli.py search "关键词" --max_results 10`（omit `--domain`），避免误判空域导致检索失败。
- 仅在任务主题确属上述国际向领域（如某跨国企业财报、美股代码、国际学术文献）时，才按 §3 正常走 `get_sub_domains` → 垂直搜索。
- 该结论须在本文件固化，避免续跑会话中 AI 误判中文政策为垂直域。

---

## 4. API Key 与降级

- **优先级**：`--api_key` 参数 > `.env`(`ANYSEARCH_API_KEY`) > 系统环境变量 > 匿名访问（低速率）。
- 脚本启动时自动从技能目录加载 `.env`，无需在命令传参。
- **匿名降级**：无 key 或 key 耗尽时自动匿名访问（速率更低），不阻断流程；如需更高限额引导用户配置 key。
- **不可用降级**：若 AnySearch 整体不可用（无 key / 配额耗尽 / 服务错误 / 网络失败），按 `_router/step-05.md` 双引擎降级矩阵转入 Firecrawl 或 NATIVE_WEB 轨道，**不静默跳过**。

---

## 5. 与副本 A 的对接点

| 对接位置 | 用法 |
|----------|------|
| `_router/bootstrap.md` | ANYSEARCH 固定命令登记（硬编码，非动态探测） |
| `_router/_contract.md` | ANYSEARCH 逻辑原语→固定外部命令绑定 |
| `_router/step-02.md` §2.2 | URL 双轨抓取调用 `extract <url>` |
| `_router/step-05.md` 轨道A | `search` / `batch_search` / `extract` / `get_sub_domains` 完整使用；§5.4 垂直域判定 |
| `references/02-environment-setup.md` 约束 15 | AnySearch 固定外部命令定义 |

> 本契约为"引用 / 调用 / 加载"接入，不复制 anysearch-skill 文件；任何接口疑问以 anysearch-skill 本体 `SKILL.md` / `runtime.conf` 为权威，必要时运行 `... anysearch_cli.py doc`。
