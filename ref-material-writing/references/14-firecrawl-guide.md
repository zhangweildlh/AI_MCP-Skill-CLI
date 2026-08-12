# Firecrawl 高阶能力指南（ref-material-writing 内部参考）

> 用途：将 Firecrawl 代码库（apps/api v2）挖掘出的 AI/LLM 可自主调用方法，转化为本技能步骤5 联网补全可用的操作指引。
> 路由前提：本环境 Firecrawl 的**访问形态（直连 `firecrawl_*` / 中继经 Dynamic-mcp）由调用方环境决定**（见 `_router/bootstrap.md` 与 `references/02-environment-setup.md`）。本文件只规定"如何用 Firecrawl 工具"（能力枚举 / 决策矩阵 / 参数 / 异步），不规定接入路径。
> 参数名/枚举/默认值均来自源码（`apps/api/src/controllers/v2/types.ts` 等 Firecrawl 代码库）。

---

## 0. 规范版本追踪

> 目的：建立 Firecrawl 上游规范的版本追踪机制，使本指南能跟进 Firecrawl API / `openapi.json` 的演进，避免参数与能力描述随上游漂移而失效。本小节仅做追踪，不改动下方 8 类能力、AI 决策矩阵、参数速查、代码实证约束等内容。

### 0.1 基线版本记录（待人工填写）

- **记录时间**：<待人工填写，例如 YYYY-MM-DD>
- **Firecrawl API 基线版本**：`<VERSION_PLACEHOLDER>`（如 `v2` / 具体 release tag；若无法联网确认精确版本，请在此标注 "待人工核对"）
- **Firecrawl MCP 服务器版本**：`<MCP_VERSION_PLACEHOLDER>`（以所用 Firecrawl MCP / npx `firecrawl-mcp` 的版本说明为准）
- **openapi.json 基线来源**：`<OPENAPI_SOURCE_PLACEHOLDER>`（例如 `https://docs.firecrawl.dev/api-reference` 或自托管实例的 `openapi.json` 路径）

> 版本号由人工定期核对后填入上列占位符；本指南不自动联网拉取，避免引入外部依赖与不确定性。

### 0.2 基线获取方式（如何取得规范原文）

- **Firecrawl 官方文档**：`https://docs.firecrawl.dev/`（含 API Reference、`openapi.json`、变更说明）
- **Firecrawl MCP 服务器**：查阅所用 `firecrawl-mcp` 的版本说明 / changelog（npx 包版本或自托管服务的 `/health`、`/` 版本端点）
- **GitHub 仓库**：`https://github.com/mendableai/firecrawl` 的 `apps/api` 与 `apps/mcp-server` 的 release / tag

### 0.3 后续跟进机制（人工核查点）

定期（建议每月或重大写作任务前）执行以下人工核查：

1. 访问 Firecrawl 官方 changelog / docs，确认 API 与 MCP 服务器是否有新版本或破坏性变更。
2. 比对 `0.1` 中记录的基线版本与上游 latest；若不一致，修订占位符并记录变更日期。
3. 若参数名/枚举/默认值发生变化，回到下方对应小节（能力目录、参数速查、约束）做同步修订，并保留"代码实证"来源标注。
4. 可运行 `scripts/check_firecrawl_spec.py` 打印当前记录版本并获取去何处核对 latest 的指引（详见脚本注释）。

---

## 1. 调用模板（权威）

```
# 直连形态（平台直接连接 Firecrawl-MCP）：工具直接为 firecrawl_*（或平台前缀 mcp__firecrawl__*），无需 Dynamic-mcp、无索引驱逐
调用：  firecrawl_<工具名>(args={<参数>})          # 例：firecrawl_search(args={query})

# 中继形态（经 Dynamic-mcp 门面）
发现：  mcp__Dynamic-mcp__get_dynamic_tools(group="firecrawl-mcp")     # 组名以 list_groups 实际返回为准
调用：  mcp__Dynamic-mcp__call_dynamic_tool(group="<实际组名>", name="<工具名>", args={<参数>})
重索引：仅中继形态——若 call_dynamic_tool 不在可用索引 → 先 ToolSearch 重索引再调用
```

> 工具名枚举：`firecrawl_search` / `firecrawl_scrape` / `firecrawl_extract` / `firecrawl_agent` / `firecrawl_agent_status` / `firecrawl_map` / `firecrawl_crawl` / `firecrawl_batch_scrape` / `firecrawl_interact`。
> 实测（仅中继形态）：连接器重连后 deferred 索引会丢失 `call_dynamic_tool`，须 `ToolSearch` 重索引；直连形态无此限制。

---

## 2. 能力目录（8 类）

| 能力 | 工具名 | 用途 | 返回 |
|------|--------|------|------|
| Search | `firecrawl_search` | 自主多引擎搜索 | 搜索结果（含 snippet/url） |
| Scrape | `firecrawl_scrape` | 单页转结构化（markdown/json/截图等） | 页面内容 |
| Extract | `firecrawl_extract` | 多页结构化抽取（JSON Schema） | 结构化 JSON |
| Agent（AGENT_SEARCH） | `firecrawl_agent` + `firecrawl_agent_status` | 黑盒自主多站研究（异步） | 研究汇总报告 + 来源 |
| Map | `firecrawl_map` | 站点 URL 发现 | URL 清单 |
| Crawl | `firecrawl_crawl` | 整站爬取 | 全站页面 |
| Batch Scrape | `firecrawl_batch_scrape` | 批量异步抓取 | 多页内容 |
| Interact | `firecrawl_interact` | 浏览器自动化（登录/翻页/点击） | 动态内容 |

---

## 3. AI 决策矩阵（写稿缺口 → Firecrawl 能力）

| 缺口类型 | 首选 Firecrawl 能力 | 关键参数 |
|----------|-------------------|----------|
| 政策/事实/数据（结构化） | Search `categories:["research","pdf"]` + `sources` 每源 `tbs` | `tbs:qdr:m`, `lang:"zh"`, `includeDomains:["gov.cn"]` |
| 通用信息/新闻/趋势 | Search `sources:["web","news"]` + `asyncScraping` | `tbs:qdr:d`, `highlights` |
| 深度多源研究（复杂主题） | **Agent（AGENT_SEARCH）** | `prompt`, `schema`, `maxCredits`, `model` |
| 特定网页正文/结构化字段 | Scrape `formats:["json"]`+`schema` 或 Extract `schema` | `onlyMainContent`, `waitFor`, `proxy` |
| 整站/官网全貌 | Map → Crawl / Batch Scrape | `includePaths`, `limit`, `sitemap` |
| 需登录/点击/翻页的动态内容 | Scrape + `actions` | `click`/`write`/`wait`/`executeJavascript` |
| 批量候选 URL 抓全文 | Batch Scrape | `urls[]`, `maxConcurrency`, `webhook` |

> 与 AnySearch 互补：Search 的 `categories`（`github`/`research`/`pdf`）与 AnySearch 垂直域互补；`asyncScraping` 可"搜索即带正文"减少一次显式 scrape；`extract` 的 `schema`+`showSources` 是"带可引用来源的结构化素材"最佳来源，对接步骤5 的 `[搜索K{序号}-Firecrawl]` 标签。

---

## 4. 关键参数速查

- **Search**：`query`(必填) / `limit`(1-100,默认10) / `tbs`(qdr:h/d/m/y) / `lang`(默认"en"，中文设"zh") / `country`(未设且无 location 默认"us"，中文设"cn") / `sources`(web/images/news，每源可独立 tbs/lang) / `categories`(github/research/pdf) / `includeDomains`/`excludeDomains`(互斥) / `asyncScraping` / `scrapeOptions`。
- **Scrape**：`formats`(markdown/html/rawHtml/links/images/summary/json/deterministicJson/changeTracking/screenshot/attributes/branding/product/question/highlights/query/audio/video) / `onlyMainContent`(默认true) / `waitFor`(≤60000,且 ≤timeout/2) / `proxy`(basic/stealth/enhanced/auto；stealth/enhanced 自动提 timeout 至120000) / `actions`。
- **Extract**：`urls`(≤10) / `prompt` / `schema`(JSON Schema) / `enableWebSearch` / `showSources`。
- **Agent**：`prompt`(必填≤10000) / `urls` / `schema` / `maxCredits` / `model`(`spark-1-pro`/`spark-1-mini`)；**无 `max_steps` 参数**；异步返回 `task_id`，须轮询 `firecrawl_agent_status(id)` 至 `completed`（≤30 次，失败回退 Search+Scrape）。
- **Map**：`limit`(默认5000，最大100000) / `search` / `sitemap`(skip/include/only)。
- **Crawl**：`crawlerOptions`(includePaths/excludePaths/maxDiscoveryDepth/limit/crawlEntireDomain/allowExternalLinks/sitemap/delay≤60s)。
- **Interact(actions)**：`wait`(milliseconds|selector) / `click` / `screenshot` / `write` / `press` / `scroll` / `scrape` / `executeJavascript` / `pdf`。

---

## 5. 关键约束（代码实证，AI 易踩坑）

- `z.strictObject`：请求体**不能有多余字段**，否则 400 拒绝。
- `waitFor ≤ timeout/2`；总交互等待 ≤ ACTIONS 上限。
- `includeDomains` 与 `excludeDomains` **互斥**。
- `json` 与 `deterministicJson` 格式互斥；`changeTracking` 须配 `markdown`。
- `extract.urls` 单次最多 10 个；`map.limit` 最大 100000。
- Search 中 `lang`/`tbs`/`filter` **仅 `web`/`news` 源继承**，`images` 源不继承。
- `country` 未设且无 `location` 时默认 `"us"`——中文研究记得显式 `country:"cn"` 或 `location`。

---

## 6. 与步骤5 的对接

- 轨道B 默认走 **Agent（AGENT_SEARCH）**；agent 超时/失败按 `fb` 路径降级 Search+Scrape。
- 结构化字段缺口优先 Scrape(`json`+`schema`) / Extract；动态内容缺口用 Interact；官网全貌用 Map→Crawl。
- 所有结果统一带 `[搜索K{序号}-Firecrawl]` 标签写入 `_网络搜索素材.md`，与 `[搜索K{序号}-AnySearch]` 合并交叉验证。
