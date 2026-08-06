---
name: firecrawl-adapter
description: web-search 的 Firecrawl 轨道适配层。封装官方 firecrawl CLI 的调用知识、密钥注入、输出解析与降级。
---

# Firecrawl 适配层（firecrawl/cli）

## 前置
- 官方 CLI 已全局安装（全局 `firecrawl` 命令，PATH 已注册）；`firecrawl --version` 可验证。
- 密钥 `FIRECRAWL_API_KEY` 由 `firecrawl login`（全局凭据）提供，**不**放入 `web-search/.env`；缺失则轨道降级。

## 访问形态（Dynamic-mcp 中继 / 直连，由运行环境决定）
Firecrawl 在不同 LLM 平台有两种接入形态，本适配层不假定其中任何一种，由运行时探测选用：
- **中继形态（经 Dynamic-mcp）**：若工具集存在 `mcp__Dynamic-mcp__list_groups` / `get_dynamic_tools` / `call_dynamic_tool`，则 Firecrawl 经 Dynamic-mcp 中转——`list_groups` 定位分组（以实际返回为准，勿臆造组名）→ `get_dynamic_tools` 拉取 → `call_dynamic_tool` 执行；每次调用前按需 `ToolSearch` 重索引。
- **直连形态（LLM 平台直接连 Firecrawl-MCP）**：若直接出现 `firecrawl_*` 系列工具，则直接调用，无需中转。
- **铁律**：无论哪种形态，禁止臆造工具名/组名，一律以 `list_groups` / `get_dynamic_tools` / 平台工具列表的实际返回为准；Firecrawl 不可用时按「降级」处理。

## 命令模板（具体 flag 以 `firecrawl <cmd> --help` 为准，上游 openapi.json 跟进时同步）
- 搜索：`firecrawl search "<查询>"`
- 抓取：`firecrawl scrape <URL>`
- 爬取：`firecrawl crawl <URL>`
- 站点地图：`firecrawl map <URL>`
- 智能体任务：`firecrawl agent "<任务描述>"`
- 交互：`firecrawl interact <URL> --prompt "<操作>"`（先有 scrape 产物；`-s/--scrape-id` 默认上次 scrape）

## 密钥注入（调用前，PowerShell 示例）

> **硬约束**：`FIRECRAWL_API_KEY` 只允许存在于 `firecrawl login` 写入的全局凭据与**当前进程环境变量**中。
> **禁止**在 `web-search/`（含任意子目录）下执行任何会把密钥落盘的导出动作（例如把 `firecrawl env` 输出重定向写入 `.env`）——
> 该目录的 `.env` 已被 git 跟踪，落盘即等于把 Firecrawl 密钥明文入库。用户的明文入库豁免仅覆盖 `ANYSEARCH_API_KEY`，**不含**本密钥。

```powershell
# 常规路径：已 firecrawl login 后，CLI 自动读全局凭据，无需任何注入
firecrawl search "查询"

# 仅当需要显式注入到当前进程（例如子进程继承）时，从凭据读出真实值，只进内存、不落盘
$env:FIRECRAWL_API_KEY = (firecrawl env | Select-String 'FIRECRAWL_API_KEY=(.+)' | ForEach-Object { $_.Matches.Groups[1].Value })
firecrawl search "查询"
```
- 注入后不得回显 `$env:FIRECRAWL_API_KEY`，不得写入日志、对话或落盘产物。
- 未登录（无凭据）时不要伪造 key，直接按下方「降级」处理。

## 输出解析
- CLI 默认输出结构化结果；适配层提取事实条目，附 URL 作为 citation。

## 降级
- `firecrawl` 命令不存在 / 非零退出 / 无 key → 本轨道标记失败，交父技能进入阶段C（AnySearch 补台）或阶段D（原生兜底）。
- 不得静默返回空结果。
