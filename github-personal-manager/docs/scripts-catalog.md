# 脚本目录（中文名 / 功能 / 记忆映射 / 档位）

> 本文件是 `sop-plan.md` 第 3 节的权威落地版。所有脚本均含中文名 + 中文功能说明（脚本首部注释 + `--help`），通用可移植，四类调用方（GitExtensions / 终端 / LLM / 本助手）均可调用。

## A 档（只读 / 幂等，低风险，可直接用）

| 脚本文件 | 中文名 | 功能 | 对应记忆章节 | 触发 |
|---|---|---|---|---|
| `sop_sync_precheck.sh` | 巡检前置预检 | 只读输出 remote、`main` 跟踪、工作区脏状态、本地↔origin 与 origin↔upstream 领先/落后计数 | 日常同步巡检·阶段0 | 菜单 |
| `sop_pr_checks.sh` | 轮询 CI 状态 | `gh pr checks` + 最近 `gh run list`；只读 | CI 排错·第一步 | 菜单/右键 |
| `sop_ci_failed_log.sh` | 下载失败日志 | 取最近失败 run 的 `--log-failed`；只读 | CI 排错·第一步 | 右键 |
| `sop_branch_merged_status.sh` | 只读合并状态 | 输出 `--merged`/`--no-merged main` 与 fork 远程已合并分支；只读 | 分支清理·第一步 | 菜单 |
| `sop_fetch_prune.sh` | 清理过时远程跟踪引用 | `git fetch --prune`；只清本地过时引用，不动远程 | 分支清理·第二步 | AfterPull/菜单 |

## B 档（涉及 push / merge / PR，强门禁，默认 dry-run）

| 脚本文件 | 中文名 | 功能 | 对应记忆章节 | 触发 |
|---|---|---|---|---|
| `sop_sync_pull_ff.sh` | 快进拉取 main | 守卫后 `pull --ff-only`(落后)/`push origin main`(领先)；双向分叉只打印 A–E 并退出，绝不自动 reset/merge/rebase | 日常同步巡检·第一步 | 菜单 |
| `sop_sync_upstream.sh` | 合并上游并推 fork | 按 M/K 决策树合并 `upstream/main`+推 `origin/main`；冲突/分叉暂停列 A–D | 日常同步巡检·第二步 | 菜单 |
| `sop_pr_create.sh` | 开 PR | 守卫(非 `main`)+`gh pr create --fill`；公开动作需确认 | 标准代码修改·阶段2 | 菜单 |
| `sop_ci_rerun.sh` | 重跑失败 CI | 重跑最近 run 的失败 job；公开动作需确认 | CI 排错·第三步 | 菜单 |

## C 档（不自动化，由助手在对话中执行）

Release 打标签触发、分支删除（`branch -d`/`push --delete`）、强推 `main`、冲突处理。理由：不可逆或强门禁，违反约束「暂停等指令」。

## 通用调用方式

```sh
# 终端 / 助手 / LLM
bash scripts/sop_sync_pull_ff.sh [仓库路径] [--confirm]
bash scripts/sop_sync_upstream.sh [仓库路径] [--confirm]
bash scripts/sop_pr_create.sh [仓库路径] [--base main] [--confirm]
bash scripts/sop_ci_rerun.sh [仓库路径] [--confirm]

# 只读脚本无需 --confirm
bash scripts/sop_sync_precheck.sh [仓库路径]
bash scripts/sop_fetch_prune.sh [仓库路径]
```

- 所有写操作默认 **dry-run**（只打印将执行的操作），加 **`--confirm`** 才真正执行。
- 所有脚本可用 `[仓库路径]` 指定目标仓库，不传则对当前目录操作。
- 逻辑严格对齐「永久记忆」，遇冲突/双向分叉/脏工作区一律**暂停并报告**，绝不替你决策。
