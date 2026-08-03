---
name: web-search
description: 双工具双轨联网搜索与抓取父技能。协调 AnySearch（Python CLI，uv 管理）与 Firecrawl（官方 CLI，Node）两源独立搜索，多来源印证 + 相互补台 + Agent 原生 web_search/web_fetch 兜底，输出唯一可信调研素材。关键词：联网搜索、网页抓取、多来源印证、资料调研、事实核查。当用户需要联网查证、抓取网页内容、做多来源交叉验证或深度资料调研时触发此技能（如"帮我搜一下""查一下这个""联网找资料""抓取这个网页"）。不适用于：纯本地文件检索、无需联网的知识问答、代码仓库内搜索。
version: 1.0.0
---

# web-search（父技能）

## 角色
你是联网检索的总协调器。本技能不直接调用搜索引擎，而是按本文件约定的「双轨独立 + 多来源印证 + 相互补台 + 原生兜底」流程，编排两个子技能并复审裁决，向用户输出唯一可靠成果。

## 路径约定（可移植，禁止硬编码绝对路径）
- 本技能根目录记为 `{SKILL_ROOT}`（WorkBuddy 注入变量，运行期解析为技能实际所在目录）。
- 子技能目录：`{SKILL_ROOT}/anysearch-skill/`（Python，上游扁平并入，非独立 clone，无嵌套 .git；保留 `_load_env` 父级 .env 探测补丁）、`{SKILL_ROOT}/firecrawl/`（适配层，调官方 CLI）。
- 资源/脚本一律相对 `{SKILL_ROOT}` 引用；Python 脚本内部用 `Path(__file__).resolve().parent` 定位同目录资源（如 `shared/`）。
- 部署到任意目录（如 `~/.workbuddy/skills/web-search/`）均不失效。

## 双轨工作流

### 阶段A：双轨独立并行（互不依赖，各自跑完）
- 轨道1 AnySearch：见 `{SKILL_ROOT}/anysearch-skill/SKILL.md`。运行（严格 uv，禁裸 python）：
  `uv run --with requests python {SKILL_ROOT}/anysearch-skill/scripts/anysearch_cli.py search "查询" --max_results 5`
  - 密钥 `ANYSEARCH_API_KEY` 由 `anysearch_cli.py` 自动从 `{SKILL_ROOT}/.env` 加载（脚本已向上探测父技能 .env）；亦可 `--api_key` 或环境变量覆盖。
  - vertical 域（finance/academic/travel/legal 等）查询：**必须先** `get_sub_domains` 发现 `sub_domain`，再 `search --domain --sub_domain --sdp`，否则可能漏检；通用查询可直接 `search`。
- 轨道2 Firecrawl：见 `{SKILL_ROOT}/firecrawl/SKILL.md`。调用官方 CLI（全局 `firecrawl` 命令，PATH 已注册）：
  `firecrawl search "查询"`
  - 密钥 `FIRECRAWL_API_KEY` 由 `firecrawl login`（全局凭据）提供，**不**放入 `{SKILL_ROOT}/.env`；缺失时本轨道按阶段C/D 降级。
  若 `firecrawl` 命令不可用（未安装/无 key/网络失败），本轨道标记失败，进入阶段C补台。

### 阶段B：多来源印证
- 同一事实两源命中 → ✅ 互证（采信等级↑）
- 两源冲突 → 按信源权威性权重裁决（官方 API 优于聚合；带 citation 优于无）
- 仅一源命中 → 标记 `[数据待核实]`，附单源说明

### 阶段C：双工具相互补台
- 轨道1 失败/限流/无 key → 轨道2 全量补；反之同理
- 补台后仍缺 → 进入阶段D

### 阶段D：Agent 原生兜底
- `web_search` / `web_fetch` 工具兜底（强约束：不得静默跳过）

### 阶段E：父级复审裁决
- 去重合并 → 四级采信标记（✅互证 / ⚠️单源 / ❌冲突已裁决 / ➖缺失）→ 统一 schema 落盘 `{主题}_搜索素材.md`

## 强门禁（最高优先级）
1. 合法性：禁止检索/抓取明确违法或侵权内容。
2. 隐私：禁止输出个人敏感信息；密钥仅在本地进程内注入，绝不回显。`.env` 明文入库已按用户授权豁免（F1），但密钥不得出现在对话/日志/产物中。
3. 路径：落盘必须用用户指定绝对路径或相对 `{SKILL_ROOT}` 的路径，禁止猜测路径。
4. 交付自检：产物必须含采信标记与来源清单，否则不得交付。

## 输出 schema（落盘素材）
```
## 主题：<主题>
### 核心事实
- [✅互证] <事实> — 来源：AnySearch+Firecrawl
- [⚠️单源] <事实> — 来源：Firecrawl（待核实）
### 来源清单
- AnySearch: <查询/URL>
- Firecrawl: <查询/URL>
- 原生兜底: <查询>（若有）
```
