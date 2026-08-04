# web-search

双工具双轨联网搜索父技能。详见 SKILL.md。

## 目录结构
```
web-search/
├── SKILL.md          # 父：协调 + 双轨裁决 + 本地化 overlay + 强门禁
├── README.md         # 本文件：含上游演进快速跟进指南
├── .env              # 父级持有真实密钥（ANYSEARCH_API_KEY；FIRECRAWL_API_KEY 由 firecrawl login 提供），已入库（明文，用户已知晓并接受）
├── anysearch-skill/  # 子 Skill（上游扁平并入，非独立 clone）
│   ├── SKILL.md
│   ├── scripts/anysearch_cli.py
│   └── .env.example
├── firecrawl/        # 适配层（基于官方 CLI，非 clone）
│   └── SKILL.md
└── tests/            # 审计修复回归测试（stdlib unittest）
    └── test_fixes.py
```

## 上游演进快速跟进指南

### A. AnySearch（手动同步上游，非独立 clone）
- 上游：`anysearch-ai/anysearch-skill`（默认分支 main，当前 v3.0.1）
- 现状：本仓库已将 anysearch-skill **扁平并入** `web-search/anysearch-skill/`（**无嵌套 .git**），无法独立 `git pull`。
- 升级（直接覆盖，**禁止恢复独立 clone** —— 在父仓库内 `git clone` 会生成嵌套 `.git`，导致 `web-search/anysearch-skill/` 子目录文件全部脱离父仓库跟踪）：
  - 从上游下载 `scripts/anysearch_cli.py`（及 `.js/.ps1/.sh`）、`SKILL.md`、`shared/` 覆盖到 `{SKILL_ROOT}/anysearch-skill/`，**保留本仓库对 `_load_env` 的父级 .env 探测补丁与子 SKILL.md 顶部的「本仓库本地化调用约定」overlay**；切勿在子目录内执行 `git clone`。
- 校验：diff 上游 `scripts/anysearch_cli.py` 与本地，确认调用契约未变（尤其 `_load_env` 父级 .env 探测）
- 同步记录表：

| 日期 | 上游 commit | 变更摘要 |
|------|------------|----------|
|      |            |          |

### B. Firecrawl（gh-api 跟进适配层，非 clone）
- 官方 CLI：`firecrawl/cli`（npm 全局安装，PATH 已注册）；适配知识在 `firecrawl/SKILL.md`
- 权威契约：`firecrawl/firecrawl` 的 `apps/api/openapi.json`（单一信源，113KB）
- 升级步骤（WorkBuddy 自主执行）：
  1. `gh api repos/firecrawl/firecrawl/contents/apps/api/openapi.json` → base64 解码
  2. 对比 `firecrawl/SKILL.md` 中 /search /scrape /crawl /map /agent /interact 的参数/枚举/endpoint（注：extract 仅 REST /v2/extract，CLI 无 extract 子命令）
  3. 仅更新参数/枚举/示例；**不动**父级裁决逻辑与本地化 overlay
  4. 登记下方同步记录表
  5. 校验：`firecrawl search "test"` 冒烟（用全局凭据或 dry-run）
- 同步记录表：

| 日期 | openapi 版本/SHA | 变更摘要 |
|------|------------------|----------|
|      |                  |          |

## 密钥
- 父级 `.env` 持有 `ANYSEARCH_API_KEY` 真实值（已入库，明文，用户已知晓并接受）；`FIRECRAWL_API_KEY` **不**入库，由 `firecrawl login` 全局凭据提供。
- 子技能 `anysearch-skill/.env.example` 仅占位；Firecrawl 适配层不存密钥，运行时由 `firecrawl login` 凭据注入。

## 安装（Firecrawl CLI 全局）
```bash
# 使用你自己配置好的 npm prefix（全局目录），确保该目录已在 PATH
npm install -g firecrawl-cli
firecrawl --version
```

## 回归测试

改动本技能（尤其是 `anysearch-skill/scripts/anysearch_cli.py` 的 `_load_env`、父/子 SKILL.md 的调用契约）后**必须**跑一遍：

```bash
# 必须走 uv：被测脚本模块级 import requests，裸 python 会 ModuleNotFoundError
uv run --with requests python -m unittest discover -s web-search/tests -v
```

覆盖项（`tests/test_fixes.py`）：

| 用例 | 守护的契约 |
|------|-----------|
| `test_f2_env_load_resolves_parent_env` | `_load_env` 能解析父级 `web-search/.env` 的 `ANYSEARCH_API_KEY`（解耦回归防线） |
| `test_f4_no_hardcoded_assembly_path` | 父 SKILL.md 无本机绝对路径硬编码 |
| `test_f7_interact_uses_prompt_not_task` | firecrawl `interact` 文档模板用 `--prompt` |
| `test_c8_no_firecrawl_key_persisted_to_dotenv` | 适配层不给出把 `FIRECRAWL_API_KEY` 落盘写 `.env` 的指引 |
| `test_c10_skill_and_readme_contract_consistent` | SKILL.md 与 README.md 的脚本路径/密钥位置/升级方式描述一致 |
| `test_f7_cli_contract` | 真实执行 `firecrawl interact --help` 校验上游 CLI 契约（CLI 缺失则 skip） |
| `test_d8_env_lookup_stops_at_nearest` | `_load_env` 命中第一个 .env 后 break（就近优先），父级 .env 不得静默覆盖 |

该套件已接入仓库冒烟门禁 Tier 3（`scripts/smoke/tier3_runtime.py`），CI 会自动执行。
