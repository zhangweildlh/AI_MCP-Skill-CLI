# 六层冒烟测试（Smoke Test）

本目录是对《仓库规划与冒烟测试方案（草案 v0.1）》第三节的**落地实现**：在每次提交(commit) / 合并(merge)前，用最低成本验证每个 Skill 结构合法、能被正确加载、依赖可用、外部接口可达、触发符合预期，并守住方案 Y「多 Agent 并发 scope 纪律」。

## 设计原则

- **纯标准库实现**：所有脚本仅依赖 Python 标准库（`subprocess` / `re` / `json` 等），本地与云端 CI 零第三方依赖即可运行，契合「禁止本地编译」规则。
- **可分级运行**：日常改完只跑 Tier0+1（秒级）；开 PR 前跑 Tier2+3；push/PR 由云端 CI 兜底（smoke.yml 按变更 scope 决定全量或定向跑）。
- **致命阻断、警告提示**：`FATAL` 会阻断提交/合并；`WARN` 仅提示，除非 `--strict`。

## 六层体系

| 层级 | 文件 | 检查内容 | 阻断？ |
|---|---|---|---|
| Tier 0 | `tier0_secrets.py` | 密钥扫描（高危模式）+ `.gitignore` 策略校验 | 致命阻断 |
| Tier 1 | `tier1_structure.py` | frontmatter 完整、name 格式、name↔目录、引用断链 | 致命阻断 |
| Tier 2 | `tier2_compliance.py` | 复用 skill-checker 可自动化子集（维度 1/2.1/3/10） | 致命阻断 |
| Tier 3 | `tier3_runtime.py` | 环境探测 + 脚本自检（CLI/pytest）+ 可选接口探活 | 致命阻断（脚本/测试失败） |
| Tier 4 | `tier4_trigger.py` | 触发就绪度静态校验（触发短语 / 示例 / 关键词互斥） | 仅警告（行为级需 LLM） |
| Tier 5 | `tier5_scope_consistency.py` | 纪律一致性：AGENTS.md 结构（存在/六章标题）+ 第 2 章 scope 清单与 `discover_skills()` 实际结构一致 + 纪律必须文件 | 致命阻断 |

> Tier1/Tier2/Tier5 支持 `scope` 过滤：传入 `--scope dir/<目录名>` / `file/<name>` / `meta` 时，只检查匹配该 scope 的 Skill（Tier5 只校验对应清单条目）；scope 为空时全量检查。

> 关于 `ANYSEARCH_API_KEY`：按用户决策（D-2026-0811-01），`ref-material-writing/.env` 中的真实 Key 已授权入库，故 Tier0 将其列入路径级豁免（`EXEMPT_SCAN_PATHS`）并配可见性守卫——**豁免仅当仓库为 private 时生效**（CI 由环境变量 `github.repository_visibility` 判定；本地默认按 private 放行）。仓库转 public 后豁免自动失效、密钥恢复扫描阻断。收紧时移除 `tier0_secrets.py` 中 `EXEMPT_SCAN_PATHS` / `ALLOW_PATTERNS` 对应条目即可。

## 使用方法

```bash
# 仅列出发现的 Skill
uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --list

# 运行全部分层
uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py

# 仅 Tier0 + Tier1（日常改完、预提交钩子场景）
uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --tier 0,1

# CI 场景（不含行为级 Tier4），并产出 JSON 报告
uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --tier 0,1,2,3 --json smoke-report.json

# 按 scope 定向检查（CI smoke-scoped 场景）：只查 chrome-devtools 的结构+合规+纪律一致性
uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --tier 1,2,5 --scope dir/chrome-devtools

# 根级单文件 Skill 按 name 字段定向：file/<name>
uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --tier 1,2 --scope file/skill-forge

# meta scope（scripts/.github/README 等基础设施变更）：Tier5 全量纪律检查
uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --tier 5 --scope meta

# 严格模式：警告也视为失败
uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --strict
```

### `--scope` 参数说明

| 取值 | 含义 |
|---|---|
| `dir/<目录名>` | 目录型 Skill（如 `dir/chrome-devtools`），Tier1/2 只检查该目录的 SKILL.md，Tier5 只校验该清单条目 |
| `file/<name>` | 根级单文件 Skill，按 frontmatter 的 name 字段匹配（如 `file/skill-forge`） |
| `meta` | 共享/元 scope（`scripts/` `.github/` `README.md` `CHANGELOG.md` `AGENTS.md` `Memory-Data/`），无技能级检查，Tier5 跑全量纪律校验 |
| 缺省 / `all` | 全部（不按 scope 过滤，向后兼容） |

## 云端 CI（smoke.yml）job 结构

`.github/workflows/smoke.yml` 按方案 Y 实现「只跑变更 scope 的冒烟」，共 3 个 job：

1. **`scope-map`**：计算本次变更涉及的 scope 集合（`git diff` 变更路径 → `meta` / `dir/<名>` / `file/<name>`，输出 JSON 数组）。
2. **`smoke`（全量）**：仅当变更触及 meta 基础设施或无可判定 scope 时运行，执行 `--tier 0,1,2,3,5` 全量冒烟。
3. **`smoke-scoped`（matrix）**：仅当变更可判定到具体 skill scope 时，按 scope 各起一个 job，执行 `--tier 1,2,5 --scope <scope>` 定向检查。

判定规则：meta 基础设施/根级文档 → `meta`（全量）；根级 `Skill-*.md` → `file/<name>`；含 SKILL.md 的顶层目录 → `dir/<目录名>`；其余无法判定的路径 → 保守全量。任一 job 出现 FATAL 即标红并阻断合并。

## 预提交钩子（自动门禁）

钩子已置于 `.githooks/pre-commit`，每次提交(commit)自动跑 Tier0 + Tier1：

```bash
git config core.hooksPath .githooks   # 一次性安装
```

Python 不可用时钩子降级为警告并放行，避免锁死提交。

## 接口探活（可选）

默认关闭。需真实联网校验 AnySearch 端点时：

```bash
SMOKE_PROBE_API=1 uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --tier 3
```

CI 中通过设置仓库变量 `SMOKE_PROBE_API=1` 开启。

## 结果解读

- 退出码 `0` = 全部通过；`1` = 存在致命（或 strict 下存在警告）；`2` = 用法错误。
- 终端输出逐条 `[FATAL]/[WARN]/[OK]`；JSON 报告含 `summary` 与各层明细，便于归档。
