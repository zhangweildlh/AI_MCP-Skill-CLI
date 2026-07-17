# Firecrawl 工具集参考（web-search 内联，独立可用、传输无关）

本文件为 web-search 自包含的 Firecrawl 调用知识，不依赖外部技能定义。参数名/枚举/默认值来自 Firecrawl 源码 `apps/api/src/controllers/v2/types.ts`。

## 访问方式（由 LLM 按当前环境判定，传输无关）

Firecrawl 在不同 LLM 平台有两种接入形态。本技能**不假定**其中任何一种，由你在运行时探测并选用当前环境实际可用的那一种：

- **中继形态（经 Dynamic-mcp）**：若当前工具集存在 `mcp__Dynamic-mcp__list_groups` / `get_dynamic_tools` / `call_dynamic_tool`（即 Dynamic-mcp 已连接、Firecrawl-MCP 是其上游某个分组），则 Firecrawl 经 Dynamic-mcp 中转。
  1. `list_groups`（无参数）列出所有分组，定位 Firecrawl 所在分组（默认组名 `firecrawl-mcp`，但**须以 `list_groups` 实际返回为准，切勿臆造组名**）。
  2. `get_dynamic_tools(group="<实际组名>")` 拉取该组工具说明（支持 `mode=compact` / `page` / `page_size` / `land_to_file` / `capabilities`，按需、分页，避免一次性淹没上下文）。
  3. `call_dynamic_tool(group="<实际组名>", name="<工具名>", args={<参数>})` 执行。
  4. 中继形态下 deferred 索引会在每次调用后丢失 `call_dynamic_tool`，故**每次调用前按需 `ToolSearch` 重索引**再调用。

- **直连形态（LLM 平台直接连 Firecrawl-MCP）**：若工具集中直接出现 `firecrawl_*` 系列工具（或平台前缀等价形态，如 `mcp__firecrawl__firecrawl_search`），说明 Firecrawl-MCP 是 LLM 平台的上游、无 Dynamic-mcp 中转。此时**直接调用**这些工具即可，无需 `list_groups` / `call_dynamic_tool`。

> **判定优先级**：先探测是否存在 `mcp__Dynamic-mcp__list_groups` / `get_dynamic_tools` / `call_dynamic_tool` 三个门面工具 → 存在则走**中继**；否则探测 `firecrawl_*` 直连工具 → 存在则走**直连**；两者皆无则 Firecrawl 不可用，按 `orchestration.md` 降级表处理。
> **铁律**：无论哪种形态，禁止臆造工具名或组名，一律以 `list_groups` / `get_dynamic_tools` / 平台工具列表的**实际返回**为准。
> **会话内缓存**：首次判定出某种形态后，本次会话内缓存该结果、后续 Firecrawl 调用复用，不重复 `list_groups` 探测；仅当环境明显变化或调用报错提示索引/工具缺失时，才重新探测（等价捕获「探测一次」收益，且不承担状态文件成本）。

调用模板：

```
# 中继形态（Dynamic-mcp 已连接）
发现分组：  mcp__Dynamic-mcp__list_groups()
拉取工具：  mcp__Dynamic-mcp__get_dynamic_tools(group="<实际组名>")
执行工具：  mcp__Dynamic-mcp__call_dynamic_tool(group="<实际组名>", name="[工具名]", args={[参数]})

# 直连形态（Firecrawl-MCP 已直连，工具直接可见）
直接调用：  firecrawl_search(...) / mcp__firecrawl__firecrawl_search(...) 等
```

## 工具名枚举（9 个）

```
firecrawl_search / firecrawl_scrape / firecrawl_extract / firecrawl_agent /
firecrawl_agent_status / firecrawl_map / firecrawl_crawl /
firecrawl_batch_scrape / firecrawl_interact
```

> 中继形态下，上述工具名作为 `call_dynamic_tool` 的 `name` 参数传入；直连形态下，上述工具名（或平台前缀等价）即为可直接调用的工具。

## 能力目录（8 类）

| 能力 | 工具名 | 用途 | 返回 |
|------|--------|------|------|
| Search | `firecrawl_search` | 自主多引擎搜索 | 搜索结果（含 snippet/url） |
| Scrape | `firecrawl_scrape` | 单页转结构化（markdown/json/截图） | 页面内容 |
| Extract | `firecrawl_extract` | 多页结构化抽取（JSON Schema） | 结构化 JSON |
| Agent | `firecrawl_agent` + `firecrawl_agent_status` | 黑盒自主多站研究（异步） | 研究汇总报告 + 来源 |
| Map | `firecrawl_map` | 站点 URL 发现 | URL 清单 |
| Crawl | `firecrawl_crawl` | 整站爬取 | 全站页面 |
| Batch Scrape | `firecrawl_batch_scrape` | 批量异步抓取 | 多页内容 |
| Interact | `firecrawl_interact` | 浏览器自动化（登录/翻页/点击） | 动态内容 |

## AI 决策矩阵（缺口 → Firecrawl 能力）

| 缺口类型 | 首选 Firecrawl 能力 | 关键参数 |
|----------|-------------------|----------|
| 政策/事实/数据（结构化） | Search `categories:["research","pdf"]` + `sources` 每源 `tbs` | `tbs:qdr:m`, `lang:"zh"`, `includeDomains:["gov.cn"]` |
| 通用信息/新闻/趋势 | Search `sources:["web","news"]` + `asyncScraping` | `tbs:qdr:d`, `highlights` |
| 深度多源研究（复杂主题） | Agent（AGENT_SEARCH） | `prompt`, `schema`, `maxCredits`, `model` |
| 特定网页正文/结构化字段 | Scrape `formats:["json"]`+`schema` 或 Extract `schema` | `onlyMainContent`, `waitFor`, `proxy` |
| 整站/官网全貌 | Map → Crawl / Batch Scrape | `includePaths`, `limit`, `sitemap` |
| 需登录/点击/翻页的动态内容 | Scrape + `actions` | `click`/`write`/`wait`/`executeJavascript` |
| 批量候选 URL 抓全文 | Batch Scrape | `urls[]`, `maxConcurrency` |

## 关键参数速查

- Search：`query`(必填) / `limit`(1-100,默认10) / `tbs`(qdr:h/d/m/y) / `lang`(默认"en"，中文设"zh") / `country`(未设且无 location 默认"us"，中文设"cn") / `sources`(web/images/news，每源可独立 tbs/lang) / `categories`(github/research/pdf) / `includeDomains`/`excludeDomains`(互斥) / `asyncScraping` / `scrapeOptions`。
- Scrape：`formats`(markdown/html/rawHtml/links/images/summary/json/deterministicJson/changeTracking/screenshot/attributes/branding/product/question/highlights/query/audio/video) / `onlyMainContent`(默认true) / `waitFor`(≤60000,且 ≤timeout/2) / `proxy`(basic/stealth/enhanced/auto；stealth/enhanced 自动提 timeout 至120000) / `actions`。
- Extract：`urls`(≤10) / `prompt` / `schema`(JSON Schema) / `enableWebSearch` / `showSources`。
- Agent：`prompt`(必填≤10000) / `urls` / `schema` / `maxCredits` / `model`(`spark-1-pro`/`spark-1-mini`)；无 `max_steps` 参数；异步返回 `task_id`，须跨回合轮询 `firecrawl_agent_status(id)` 至 `completed`（轮询节流见下「异步轮询协议」：提交后每回合重索引再单查，最多补偿 2 次仍 processing 则降级 Search+Scrape）。
- Map：`limit`(默认5000，最大100000) / `search` / `sitemap`(skip/include/only)。
- Crawl：`crawlerOptions`(includePaths/excludePaths/maxDiscoveryDepth/limit/crawlEntireDomain/allowExternalLinks/sitemap/delay≤60s)。
- Interact(actions)：`wait`(milliseconds|selector) / `click` / `screenshot` / `write` / `press` / `scroll` / `scrape` / `executeJavascript` / `pdf`。

## 关键约束（代码实证）

- `z.strictObject`：请求体不能有多余字段，否则 400 拒绝。
- `waitFor ≤ timeout/2`；总交互等待 ≤ ACTIONS 上限。
- `includeDomains` 与 `excludeDomains` 互斥。
- `json` 与 `deterministicJson` 互斥；`changeTracking` 须配 `markdown`。
- `extract.urls` 单次最多 10 个；`map.limit` 最大 100000。
- Search 中 `lang`/`tbs`/`filter` 仅 `web`/`news` 源继承，`images` 源不继承。
- `country` 未设且无 `location` 时默认 `"us"`——中文研究显式 `country:"cn"` 或 `location`。

## 异步轮询协议（Agent）

1. 提交（中继）：`call_dynamic_tool(group="<实际组名>", name="firecrawl_agent", args={prompt, model:"spark-1-pro", maxCredits:50})` → 返回 `task_id`。
   提交（直连）：`firecrawl_agent(prompt=..., model="spark-1-pro", maxCredits=50)`（或平台前缀等价工具）→ 返回 `task_id`。
2. 回读（抗索引驱逐，仅中继形态需重索引）：提交后，在下一回合先 `ToolSearch` 重索引，再单轮 `call_dynamic_tool(...agent_status..., args={id})` 回读。
3. 状态判定：`completed` → 读取结果；`failed`/`expired` → 降级 `firecrawl_search`+`firecrawl_scrape`；`processing` → 再重索引+再查（最多补偿 2 次），仍 processing → 降级。
4. 严禁在单回合内紧循环轮询（每次调用后索引会被回收，循环必败）。
