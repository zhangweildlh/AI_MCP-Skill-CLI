---
name: firecrawl-adapter
description: web-search 的 Firecrawl 轨道适配层。封装官方 firecrawl CLI 的调用知识、密钥注入、输出解析与降级。
---

# Firecrawl 适配层（firecrawl/cli）

## 前置
- 官方 CLI 已全局安装（全局 `firecrawl` 命令，PATH 已注册）；`firecrawl --version` 可验证。
- 密钥 `FIRECRAWL_API_KEY`：默认由 `firecrawl login`（全局凭据）提供；亦可依用户授权驻留于 `web-search/.env`（该文件已 git-ignored，未入库，仅本地磁盘）。驻留时由父层 `orchestrate.py` 经 `_load_firecrawl_key` 自动注入当前进程/子进程 env，无需 `firecrawl login`（见下方「密钥注入」）。无论哪种供给，密钥均不进版本库；缺失则轨道降级。

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

> **硬约束**：`FIRECRAWL_API_KEY` 只允许存在于以下三处，且均**不**进入版本库：
>   ① `firecrawl login` 写入的全局凭据；② 父层 `orchestrate.py` 经 `_load_firecrawl_key` 自动注入的当前进程/子进程环境变量；③ 经用户显式授权、已 git-ignored 的 `web-search/.env` 本地文件（仅留本地磁盘，**不**入库）。
> **禁止**把密钥明文提交/推送到任何分支（gitignore 已覆盖 `web-search/.env`，落盘该本地文件即安全，不等于入库）；亦禁止在除已忽略的 `web-search/.env` 之外的路径下把密钥落盘。用户授权 `FIRECRAWL_API_KEY` 驻留 `.env` 仅限私有仓库本地，绝不扩展到公开/远端分支（与 `ANYSEARCH_API_KEY` 的豁免纪律一致，见 AGENTS.md §3.3）。

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
