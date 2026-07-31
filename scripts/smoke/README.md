# 五层冒烟测试（Smoke Test）

本目录是对《仓库规划与冒烟测试方案（草案 v0.1）》第三节的**落地实现**：在每次提交(commit) / 合并(merge)前，用最低成本验证每个 Skill 结构合法、能被正确加载、依赖可用、外部接口可达、触发符合预期。

## 设计原则

- **纯标准库实现**：所有脚本仅依赖 Python 标准库（`subprocess` / `re` / `json` 等），本地与云端 CI 零第三方依赖即可运行，契合「禁止本地编译」规则。
- **可分级运行**：日常改完只跑 Tier0+1（秒级）；开 PR 前跑 Tier2+3；push/PR 由云端 CI（Tier5）兜底。
- **致命阻断、警告提示**：`FATAL` 会阻断提交/合并；`WARN` 仅提示，除非 `--strict`。

## 五层体系

| 层级 | 文件 | 检查内容 | 阻断？ |
|---|---|---|---|
| Tier 0 | `tier0_secrets.py` | 密钥扫描（高危模式）+ `.gitignore` 策略校验 | 致命阻断 |
| Tier 1 | `tier1_structure.py` | frontmatter 完整、name 格式、name↔目录、引用断链 | 致命阻断 |
| Tier 2 | `tier2_compliance.py` | 复用 skill-checker 可自动化子集（维度 1/2.1/3/10） | 致命阻断 |
| Tier 3 | `tier3_runtime.py` | 环境探测 + 脚本自检（CLI/pytest）+ 可选接口探活 | 致命阻断（脚本/测试失败） |
| Tier 4 | `tier4_trigger.py` | 触发就绪度静态校验（触发短语 / 示例 / 关键词互斥） | 仅警告（行为级需 LLM） |
| Tier 5 | `.github/workflows/smoke.yml` | 云端 CI：push 到 main 或开 PR 自动跑 Tier0–3 | CI 标红阻断 |

> 关于 `ANYSEARCH_API_KEY`：按用户决策，两个 `.env` 中的真实 Key 已授权入库，故 Tier0 将其列入允许清单，命中不报致命。收紧时移除 `tier0_secrets.py` 中 `ALLOW_PATTERNS` 对应条目即可。

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

# 严格模式：警告也视为失败
uv run --project D:/Tools/Assembly/python/myenv python scripts/smoke/run_all.py --strict
```

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
