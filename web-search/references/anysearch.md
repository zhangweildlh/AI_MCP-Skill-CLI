# AnySearch CLI 调用参考（web-search 内联，独立可用）

本文件为 web-search 自包含的 AnySearch 调用知识，不依赖外部 anysearch-skill 定义。AnySearch 是统一实时搜索服务，支持通用搜索、垂直域搜索、并行批量搜索、整页内容抽取，暴露单一 JSON-RPC 2.0 端点，无需 MCP 服务器，通过捆绑的跨平台 CLI 调用。

## 命令构造

命令基（由输入参数组装）：

```
uv run --project [anysearch_uv_env] python [Skill技能根目录]/web-search/scripts/anysearch_cli.py [子命令] [选项]
```

- AnySearch CLI 已随本技能捆绑于 `[Skill技能根目录]/web-search/scripts/anysearch_cli.py`（即本技能的 [name]目录）；CLI 为技能内资产，不依赖任何外部技能或外部目录。
- `[anysearch_uv_env]` 默认 `D:/Tools/Assembly/python/myenv`（绝对路径，硬编码，仅需含 `requests`；若未指定，命令省略 `--project` 直接用 `uv run` 默认环境）。
- 命令基默认即上式；若 `[anysearch_uv_env]` 未指定，省略 `--project` 直接用 `uv run python ...`；若 `[Skill技能根目录]/web-search` 下另放 `runtime.conf` 且含 `Command:` 行，则以该行覆盖（可选，单一事实源）。本技能默认不携带 `runtime.conf`，直接用上式构造。
- API Key 由捆绑的 `[Skill技能根目录]/web-search/.env` 的 `ANYSEARCH_API_KEY` 自动加载（CLI 会探测 `scripts/.env` 与其上级 `.env`），命令中无需传 key；路径统一正斜杠 `/`。

## 子命令表

| 子命令 | 用途 | 常用参数 | 调用示例 |
|--------|------|----------|----------|
| `search` | 通用 / 垂直搜索 | `"query"`、`--max_results N`(1–10，默认10)、`--domain`/`--sub_domain`/`--sub_domain_params` | `... anysearch_cli.py search "关键词" --max_results 10` |
| `batch_search` | 多关键词并行 | `--query "词"`(可重复) 或 `--queries @file.json` | `... anysearch_cli.py batch_search --query "词1" --query "词2"` |
| `extract` | URL 正文抓取（HTML→Markdown，截断 ~50k 字符） | `"https://..."` 或 `--url "..."` | `... anysearch_cli.py extract "https://..."` |
| `get_sub_domains` | 发现垂直子域（垂直搜索前必调） | `--domain X` / `--domains X,Y` | `... anysearch_cli.py get_sub_domains --domains finance,health` |
| `doc` | 离线查阅完整 CLI 参考（未知接口 / 失败恢复时） | 无 | `... anysearch_cli.py doc` |

命令速查：

```bash
# 通用搜索
[cmd] search "query" --max_results 5

# 垂直搜索（先 get_sub_domains 取得 sub_domain）
[cmd] search "AAPL" --domain finance --sub_domain finance.us_stock --sub_domain_params '{"ticker":"AAPL"}'

# 发现子域（垂直搜索前必调）
[cmd] get_sub_domains --domain finance
[cmd] get_sub_domains --domains finance,health

# 批量搜索（JSON 数组，可混合通用/垂直）
[cmd] batch_search --queries '[{"query":"q1","max_results":5},{"query":"q2","max_results":5}]'

# 正文抓取（输出已是 Markdown，无格式选项）
[cmd] extract "https://example.com/page"
[cmd] extract --url "https://example.com/page"
```

禁止写法：`extract --format markdown` / `extract --format json` / `extract --markdown` —— `extract` 无格式选项，输出已是 Markdown。子命令参数失败时应跑 `[cmd] [子命令] --help`，而非 `doc`。

## 参数细节

- `search`：`query` 位置参数必填；`--domain,-d` 垂直域（取值见域清单）；`--sub_domain,-s` 子域路由键，垂直搜索必填；`--sub_domain_params` JSON，按 `get_sub_domains` 返回 schema 填充；`--max_results,-m` int 1–10 默认 10（代码强制封顶 10）。
- `get_sub_domains`：`--domain` 单域；`--domains` 批量最多 5 域，逗号或 JSON，优先于 `--domain`；返回 Markdown 表；会话内缓存，不重复调用。
- `extract`：`url` 位置或 `--url/-u`；仅 HTML 页面，截断 50,000 字符。
- `batch_search`：`--query` 可重复最多 5 条；`--queries,-q` JSON 数组或 `@file.json`；代码强制最多 5 条，单条失败不阻断其他、结果合并。
- 通用：`--api_key` 优先级最高（缺省读 `ANYSEARCH_API_KEY` 环境变量）。

## 垂直域规则

- 默认走垂直路径（Path 2）：命中受支持领域时，先 `get_sub_domains` 再搜索，显著优于通用搜索。
- 纯百科且无领域重合为少数例外（Path 1），走通用搜索（omit `--domain`）。
- 不确定时走 HYBRID：`batch_search` 同时跑 1 条通用 + N 条垂直查询。
- 必填参数规则：`get_sub_domains` 返回标记 `(required)` 的参数必须全部纳入 `--sub_domain_params`；无适用值传空串 `{"required_key":""}`，缺省触发后端校验错误。

### 中文任务特别规则（须固化）

AnySearch 垂直域多为美国/国际向（如 `legal`=US Congress、`environment`=aqi、`business`/`energy`），无中国国策/标准类垂直域。因此：

- 中文政策文件（例如 HJ/GB 编号、国发令、环发令、生态环境部令）、中国国家标准/行业标准的检索，不走垂直域，直接 `search "关键词" --max_results 10`（omit `--domain`）。
- 仅主题确属国际向领域（跨国企业财报、美股代码、国际学术文献）时，才走 `get_sub_domains` → 垂直搜索。

## 可用域清单

```
general, resource, social_media, finance, academic, legal, health, business,
security, ip, code, energy, environment, agriculture, travel, film, gaming
```

## API Key 管理与降级

优先级：`--api_key` > `.env`(`ANYSEARCH_API_KEY`) > 系统环境变量 > 匿名访问（低速率）。无 key 或耗尽时自动匿名访问，不阻断流程；若整体不可用（无 key/配额耗尽/服务错误/网络失败），转入 Firecrawl 或原生工具补偿轨道，不静默跳过。

## 安全与隐私

- `doc` 命令纯本地、无网络请求。
- 搜索查询、抓取 URL、API Key 会发往 `https://api.anysearch.com`；勿用于含敏感信息（密码、个人数据、商业秘密）的查询，除非信任该提供商。
