---
name: firecrawl-adapter
description: web-search 的 Firecrawl 轨道适配层。封装官方 firecrawl CLI 的调用知识、密钥注入、输出解析与降级。
---

# Firecrawl 适配层（firecrawl/cli）

## 前置
- 官方 CLI 已全局安装（全局 `firecrawl` 命令，PATH 已注册）；`firecrawl --version` 可验证。
- 密钥 `FIRECRAWL_API_KEY` 由 `firecrawl login`（全局凭据）提供，**不**放入 `web-search/.env`；缺失则轨道降级。

## 命令模板（具体 flag 以 `firecrawl <cmd> --help` 为准，上游 openapi.json 跟进时同步）
- 搜索：`firecrawl search "<查询>"`
- 抓取：`firecrawl scrape <URL>`
- 爬取：`firecrawl crawl <URL>`
- 站点地图：`firecrawl map <URL>`
- 智能体任务：`firecrawl agent "<任务描述>"`
- 交互：`firecrawl interact <URL> --prompt "<操作>"`（先有 scrape 产物；`-s/--scrape-id` 默认上次 scrape）

## 密钥注入（调用前，PowerShell 示例）
```powershell
# FIRECRAWL_API_KEY 由 `firecrawl login` 写入全局凭据；如需显式注入，可从凭据或环境变量取真实值
# 方式A：使用 firecrawl 自带 env 子命令拉取并写入本地 .env
firecrawl env
# 方式B：从凭据读出真实值后注入当前进程
$env:FIRECRAWL_API_KEY = (firecrawl env | Select-String 'FIRECRAWL_API_KEY=(.+)' | ForEach-Object { $_.Matches.Groups[1].Value })
firecrawl search "查询"
```

## 输出解析
- CLI 默认输出结构化结果；适配层提取事实条目，附 URL 作为 citation。

## 降级
- `firecrawl` 命令不存在 / 非零退出 / 无 key → 本轨道标记失败，交父技能进入阶段C（AnySearch 补台）或阶段D（原生兜底）。
- 不得静默返回空结果。
