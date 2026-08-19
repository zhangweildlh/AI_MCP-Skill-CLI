# web-search

双工具双轨联网搜索父技能。详见 SKILL.md。

## 目录结构
```
web-search/
├── SKILL.md          # 父：协调 + 双轨裁决 + 强门禁（本地化资源集中于父层）
├── README.md         # 本文件：含上游演进快速跟进指南
├── VENDORING.md      # 上游 vendoring 约定（ALLOWLIST / HARD_EXCLUDES / 升级步骤）
├── orchestrate.py    # 父层编排（双轨印证 + 原生兜底 + 落盘）；密钥注入点
├── validate_output.py# 产物 schema 校验（唯一校验器）
├── .env              # 父级持有真实密钥（ANYSEARCH_API_KEY；FIRECRAWL_API_KEY 由 firecrawl login 提供），**已移出 git 跟踪（git-ignored，仅驻留本地磁盘）；该密钥曾入库历史，须到 anysearch 控制台轮换作废**
├── anysearch-skill/  # 子 Skill（上游 vendored 纯副本，非独立 clone，零本地补丁）
│   ├── SKILL.md      # 纯上游（overlay 已移出，见 VENDORING.md）
│   ├── scripts/anysearch_cli.py
│   └── .env.example
├── firecrawl/        # 适配层（基于官方 CLI，非 clone）
│   └── SKILL.md
├── scripts/
│   ├── check_upstream_drift.py  # 全子树上游漂移检测
│   └── sync_anysearch.py        # 一键 vendoring（升级上游）
└── tests/            # 回归测试（stdlib unittest）
    ├── test_fixes.py       # 契约守护（密钥注入/路径/交互/密钥不落盘/一致性/解耦干净）
    ├── test_orchestrate.py # 编排全场景 + 边界 + 对抗
    ├── test_output_schema.py # 产物 schema 校验
    └── test_drift.py       # 漂移检测全场景 + 边界
```

## 上游演进快速跟进指南

### A. AnySearch（一键 vendoring，非独立 clone）

- 上游：`anysearch-ai/anysearch-skill`（默认分支 main，当前 v3.0.1）
- 现状：`anysearch-skill/` 是上游 **vendored 纯副本**（文件级复制，**无嵌套 `.git`**，**零本地补丁**）。例如核心脚本 `anysearch-skill/scripts/anysearch_cli.py` 为纯上游版本，密钥由父层 `orchestrate.py` 在拉起子进程时注入，本地不对其做任何补丁。
  本地化逻辑（双轨编排、密钥注入、漂移检测、同步工具）全部在**父层**（`orchestrate.py` / `scripts/` / `tests/`）。
- 升级（一键同步，**禁止恢复独立 clone** —— 在父仓库内 `git clone` 会生成嵌套 `.git`，
  导致 `web-search/anysearch-skill/` 子目录文件全部脱离父仓库跟踪）：

  ```bash
  # 预览将覆盖/删除的文件清单
  uv run --with requests python scripts/sync_anysearch.py --dry-run
  # 实际同步（覆盖 ALLOWLIST + 清理 .github/.gitignore + 写回 .upstream_version）
  uv run --with requests python scripts/sync_anysearch.py
  ```

  详见 `VENDORING.md`：ALLOWLIST 仅覆盖上游约定文件；`.github/` 与 `.gitignore` 为
  HARD_EXCLUDES，同步后主动删除；任何"想改上游行为"的需求都应落在父层，而非编辑 vendored 副本。
- 校验：同步后运行 `python scripts/check_upstream_drift.py`，应无 DRIFT。
- 同步记录表：

| 日期 | 上游版本/commit | 变更摘要 |
|------|----------------|----------|
| 2026-08-18 | v3.0.1（基于上游 main） | 父子解耦整改：`anysearch-skill/` 改为 vendored 纯副本（移除 `_load_env` 父级探测补丁与子 SKILL.md overlay）；密钥注入上移至 `orchestrate.py::._load_parent_api_key`；新增 `VENDORING.md` / `scripts/sync_anysearch.py`；漂移检测扩展为全 ALLOWLIST 子树比对 |

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
| 2026-08-11 | 未抓取（待 `gh api` 跟进） | 本仓库安全整改同步：适配层 `name` 注释；复核「`FIRECRAWL_API_KEY` 不落盘」硬约束 |

## 密钥

- 父级 `.env` 持有 `ANYSEARCH_API_KEY` 真实值（**已移出 git 跟踪，明文仅驻留本地磁盘、未入库；该密钥曾进入 git 历史，须到 anysearch 控制台轮换作废**）；`FIRECRAWL_API_KEY` **不**入库，由 `firecrawl login` 全局凭据提供。
- 密钥注入：解耦后 `orchestrate.py::._load_parent_api_key` 在拉起 `anysearch_cli.py` 子进程时把 `ANYSEARCH_API_KEY` 注入子进程 env；上游 `_load_env` 不再探测父级 `.env`。
- 子技能 `anysearch-skill/.env.example` 仅占位；Firecrawl 适配层不存密钥，运行时由 `firecrawl login` 凭据注入。

## 安装（Firecrawl CLI 全局）

```bash
# 使用你自己配置好的 npm prefix（全局目录），确保该目录已在 PATH
npm install -g firecrawl-cli
firecrawl --version
```

## 回归测试

改动本技能（尤其 `orchestrate.py` 的密钥注入、父/子 SKILL.md 的调用契约）后**必须**跑一遍：

```bash
# 必须走 uv：被测脚本模块级 import requests，裸 python 会 ModuleNotFoundError
uv run --with requests python -m unittest discover -s web-search/tests -v
```

覆盖项（`tests/test_fixes.py`，契约守护）：

| 用例 | 守护的契约 |
|------|-----------|
| `test_f2_env_load_resolves_parent_env` | `orchestrate._load_parent_api_key` 能从 `web-search/.env` 解析 `ANYSEARCH_API_KEY`（解耦后密钥注入点） |
| `test_f4_no_hardcoded_assembly_path` | 父 SKILL.md 无本机绝对路径硬编码 |
| `test_f7_interact_uses_prompt_not_task` | firecrawl `interact` 文档模板用 `--prompt` |
| `test_c8_no_firecrawl_key_persisted_to_dotenv` | 适配层不给出把 `FIRECRAWL_API_KEY` 落盘写 `.env` 的指引 |
| `test_c10_skill_and_readme_contract_consistent` | SKILL.md 与 README.md 的脚本路径/密钥位置/升级方式描述一致；子 SKILL.md 已去本地化 overlay |
| `test_f7_cli_contract` | 真实执行 `firecrawl interact --help` 校验上游 CLI 契约（CLI 缺失则 skip） |
| `test_d8_env_lookup_stops_at_nearest` | 解耦后上游 `anysearch_cli.py` 不再含父级 `.env` 三级探测补丁；`orchestrate._load_parent_api_key` 就近优先 |

> `tests/test_orchestrate.py`（编排全场景+边界+对抗）、`tests/test_output_schema.py`（产物 schema 校验）、
> `tests/test_drift.py`（漂移检测全场景+边界）另覆盖对应模块。
> 该套件已接入仓库冒烟门禁 Tier 3（`scripts/smoke/tier3_runtime.py`），CI 会自动执行。
