# web-search · 上游 vendoring 约定（父子解耦单一事实源）

> 本文件是 `anysearch-skill/` 子技能的**供应商（vendoring）约定**的权威文档。
> 它取代旧版"扁平并入 + 保留补丁"模式：父技能 `web-search/` 持有全部本地化资源，
> `anysearch-skill/` 是**纯上游副本、零本地改动**，升级只需一键同步。

## 1. 上游来源

- 仓库：`anysearch-ai/anysearch-skill`（GitHub）
- 默认分支：`main`
- 当前 vendored 版本：`v3.0.1`（记录在 `anysearch-skill/.upstream_version`）
- 上游无嵌套 `.git`：本副本是文件级复制，不是 `git clone`（避免父仓库内出现嵌套 `.git`）

## 2. 父子职责边界（解耦核心）

| 职责 | 归属 | 说明 |
|------|------|------|
| 双轨编排 / 多来源印证 / 原生兜底 / 落盘裁决 | 父层 `orchestrate.py` | 唯一本地业务逻辑 |
| 产物 schema 校验 | 父层 `validate_output.py` | 唯一校验器 |
| 上游漂移检测 | 父层 `scripts/check_upstream_drift.py` | 全 allowlist 子树比对 |
| 一键同步上游 | 父层 `scripts/sync_anysearch.py` | vendoring 工具 |
| 密钥 `ANYSEARCH_API_KEY` 注入 | 父层 `orchestrate.py`（`_load_parent_api_key`） | **不再**由上游 `_load_env` 探测父级 `.env` |
| 上游搜索 CLI 原样实现 | `anysearch-skill/scripts/anysearch_cli.*` | 100% 上游副本，零本地补丁 |
| 上游技能文档原样实现 | `anysearch-skill/SKILL.md` 等 | 100% 上游副本（overlay 已移出） |
| 适配层（Firecrawl） | `firecrawl/SKILL.md` | 官方 CLI 在仓库外，天然解耦 |

**关键原则**：`anysearch-skill/` 内**任何文件都不应含本地化改动**。一旦需要改上游行为，
改动必须落在父层（如密钥注入从 `_load_env` 上移到 `orchestrate.py`）。

## 3. ALLOWLIST（允许 vendoring 的上游文件）

同步时**仅**拉取以下文件覆盖到 `anysearch-skill/`：

> 单一常量源：`scripts/vendoring_config.py::ALLOWLIST` 是此清单的权威定义，`sync_anysearch.py`
> 与 `check_upstream_drift.py` 均引用该常量（审计 finding M1）。上游新增文件须在此处更新，
> 切勿在两脚本内再硬编码一份。

```
SKILL.md
LICENSE
NOTICE
README.md
README_zh.md
SECURITY.md
.env.example
requirements.txt
runtime.conf.example
scripts/anysearch_cli.py
scripts/anysearch_cli.js
scripts/anysearch_cli.ps1
scripts/anysearch_cli.sh
scripts/generate.py
scripts/shared/constants.json
scripts/shared/doc_spec.md
```

这些文件应与上游逐字一致（除上游自身发布的差异外）。本地改动若涉及其中任一文件，
应改为在父层实现，而**不要**直接编辑 vendored 副本。

## 4. HARD_EXCLUDES（vendored 副本中刻意排除的上游内容）

| 排除项 | 原因 |
|--------|------|
| `.github/` | 上游 CI 配置，与本副本运行无关；父仓库有独立 CI |
| `.gitignore` | 密钥治理由父仓库（根 `.gitignore`）统一负责 |

`sync_anysearch.py` 在同步后会**主动删除** `anysearch-skill/` 下的 `.github/` 与 `.gitignore`，
确保 vendored 副本纯净。

> ⚠️ **HARD_EXCLUDES 局限（审计 finding L1）**：当前仅排除 `.github/` 与 `.gitignore`。
> 上游未来若新增**不应** vendoring 的文件（如 `.gitlab-ci.yml`、`CONTRIBUTING.md`、
> `CODE_OF_CONDUCT.md` 等），不会被自动排除，会作为额外文件落入 vendored 纯副本、造成污染。
> 治理策略：升级上游后，手动核验 vendored 副本顶层无预期外文件；或后续将 `sync_anysearch.py`
> 改为「拉取上游根目录清单后仅保留 ALLOWLIST 命中项、其余一律清理」的严格模式。

## 5. 升级（一键同步，禁止恢复独立 clone）

```bash
# 预览将覆盖/删除的文件清单（不实际写）
uv run --with requests python scripts/sync_anysearch.py --dry-run

# 实际同步：拉取 ALLOWLIST 覆盖 + 清理 HARD_EXCLUDES + 写回 .upstream_version
uv run --with requests python scripts/sync_anysearch.py
```

`sync_anysearch.py` 会：
1. 遍历 ALLOWLIST，用 `gh api` 逐文件拉取上游内容并解码写入 `anysearch-skill/<path>`；
2. 删除 vendored 副本内的 `.github/` 与 `.gitignore`；
3. 写回 `anysearch-skill/.upstream_version`（含 ref / version / commit / updated_at）；
4. 末尾调用漂移检测，提示是否一致。

> ⚠️ **严禁**在 `anysearch-skill/` 内执行 `git clone` / `git submodule add` —— 会在父仓库内
> 生成嵌套 `.git`，导致该子目录文件全部脱离父仓库跟踪。

## 6. 漂移检测

```bash
uv run --with requests python scripts/check_upstream_drift.py
```

比对 `anysearch-skill/` 内 ALLOWLIST 每个文件的本地 sha256 与上游当前内容 sha256，
发现不一致即 exit 非 0（drift）。无网络 / `gh` 缺失时降级为 unknown（exit 0，不阻断 CI）。

> **性能说明（审计 finding L2）**：`check_anysearch_subtree` 对 ALLOWLIST 15 个文件**串行**调用
> `gh api`（每次约 1–2s，CI 中合计约 15–30s）。当前为低频手动操作，可接受；若未来纳入高频
> CI 门禁，可考虑并发拉取（如 `ThreadPoolExecutor`）或一次性缓存上游目录清单比对，以压缩耗时。

## 7. 本地化资源清单（父层，不随上游变动）

- `SKILL.md` / `README.md` / `VENDORING.md`：父层协调、契约、vendoring 约定
- `orchestrate.py` / `validate_output.py`：本地编排与校验
- `scripts/check_upstream_drift.py` / `scripts/sync_anysearch.py`：本地工具
- `tests/`：全部回归测试（含对"解耦干净"的断言）
- `.env`：父级真实密钥（**已移出 git 跟踪，仅驻留本地磁盘**）

## 8. 安全与密钥治理（审计 finding L4）

- **vendored 副本零真实密钥**：`anysearch-skill/` 内所有文件均为上游原版，密钥相关处仅含
  `<your_api_key_here>` 占位符（已核实，无真实 `ANYSEARCH_API_KEY` 值泄漏）。
- **历史密钥须轮换作废**：父级 `web-search/.env` 曾进入 git 历史并含真实 `ANYSEARCH_API_KEY`；
  当前虽已被仓库根 `.gitignore` 忽略，但**历史记录中的密钥值仍未吊销**。必须到 anysearch 控制台
  将该密钥轮换作废；若 `web-search/` 曾 `push` 到远端，历史提交中的密钥同样视为已暴露，必须轮换。
- 本仓库**绝不**将真实密钥写入任何 git 跟踪文件；密钥注入仅在运行时由父层内存 env 完成。

## 9. 密钥注入与调用约束（审计 finding L3）

解耦后 `ANYSEARCH_API_KEY` 由父层 `orchestrate.py` 持有并注入：

1. `orchestrate._load_parent_api_key(skill_root)` 就近优先读取 `web-search/.env` 的
   `ANYSEARCH_API_KEY`（明文或 None，绝不抛异常）；
2. `orchestrate.run_track1` 在拉起 `anysearch_cli.py` 子进程前，将密钥注入子进程 `env`
   （仅当 `env` 中尚无该变量时），上游 `_load_env` 不再探测父级 `.env`。

> ⚠️ **禁止不经 `orchestrate` 直接调用 `anysearch_cli.py`**：上游 `_load_env` 仅探测
> `anysearch-skill/` 下的 `.env`（均不存在），不经父层直接调用将无法获得密钥（除非显式
> `--api_key` 或环境变量），导致搜索静默失败。所有本地检索必须经由 `orchestrate.py` 编排入口。
