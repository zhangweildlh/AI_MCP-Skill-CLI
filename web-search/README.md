# web-search

双工具双轨联网搜索父技能。详见 SKILL.md。

## 目录结构
```
web-search/
├── SKILL.md          # 父：协调 + 双轨裁决 + 本地化 overlay + 强门禁
├── README.md         # 本文件：含上游演进快速跟进指南
├── .env              # 父级持有真实密钥（ANYSEARCH_API_KEY / FIRECRAWL_API_KEY），不入库
├── anysearch-skill/  # 子 Skill（git clone 上游，纯净）
│   ├── SKILL.md
│   ├── scripts/anysearch_cli.py
│   └── .env.example
└── firecrawl/        # 适配层（基于官方 CLI，非 clone）
    └── SKILL.md
```

## 上游演进快速跟进指南

### A. AnySearch（git clone 即升级）
- 上游：`anysearch-ai/anysearch-skill`（默认分支 main，当前 v3.0.1）
- 升级：
  - 若保留子目录内 `.git`：`cd {SKILL_ROOT} && git -C anysearch-skill pull`
  - 或删后重新 clone：`git clone --depth 1 https://github.com/anysearch-ai/anysearch-skill anysearch-skill`
- 校验：diff 上游 `scripts/anysearch_cli.py` 与本地，确认调用契约未变
- 同步记录表：

| 日期 | 上游 commit | 变更摘要 |
|------|------------|----------|
|      |            |          |

### B. Firecrawl（gh-api 跟进适配层，非 clone）
- 官方 CLI：`firecrawl/cli`（npm 全局，落在 `D:\Tools\Assembly\nodejs\node_global`）；适配知识在 `firecrawl/SKILL.md`
- 权威契约：`firecrawl/firecrawl` 的 `apps/api/openapi.json`（单一信源，113KB）
- 升级步骤（WorkBuddy 自主执行）：
  1. `gh api repos/firecrawl/firecrawl/contents/apps/api/openapi.json` → base64 解码
  2. 对比 `firecrawl/SKILL.md` 中 /search /scrape /crawl /extract 的参数/枚举/endpoint
  3. 仅更新参数/枚举/示例；**不动**父级裁决逻辑与本地化 overlay
  4. 登记下方同步记录表
  5. 校验：`firecrawl search "test"` 冒烟（用 .env 真实 key 或 dry-run）
- 同步记录表：

| 日期 | openapi 版本/SHA | 变更摘要 |
|------|------------------|----------|
|      |                  |          |

## 密钥
- 父级 `.env` 持有 `ANYSEARCH_API_KEY`、`FIRECRAWL_API_KEY` 真实值（不入库）。
- 子技能 `anysearch-skill/.env.example` 仅占位；Firecrawl 适配层不存密钥，运行时从父 `.env` 注入。

## 安装（Firecrawl CLI 全局，落到 node_global）
```bash
# npm prefix 已设 D:\Tools\Assembly\nodejs\node_global，无需重设
"D:\Tools\Assembly\nodejs\npm.cmd" install -g firecrawl-cli
# 确保 D:\Tools\Assembly\nodejs\node_global 已在 PATH
firecrawl --version
```
