# 冒烟测试方案与流程（约束 #6）

本目录是 `github-personal-manager` 的**冒烟测试基座**。在脚本编写（约束 #7）之前，先在此建立可运行的绿色基线，并固化「契约规格」。

## 分层

- **L0 环境测试**（`tests/test_env.sh`）：`git`/`gh` 可用、版本、登录态。
- **L1 夹具行为测试**（`tests/test_fixtures.sh`）：用临时 git 仓库模拟 behind/ahead/diverge/dirty 等状态，断言 `git` 原生探测计数正确（绿色基线，必须全绿）。
- **L2 契约规格测试**（`tests/test_contracts.sh`）：每个脚本的「应做 / 不应做」以用例固化。**当前脚本未编写 → 一律 SKIP**，但契约文本必须齐全。脚本写完后由 SKIP 转 PASS。

## 流程

1. 复制 `../config/github-sop.config.template.sh` → `../config/github-sop.config.sh`，填入本机 `GIT_BIN`/`GH_BIN` 等（`github-sop.config.sh` 已被 `.gitignore` 忽略，不入库）。
2. 执行：`bash smoke/run-smoke.sh`。
3. 查看汇总：**L0+L1 必须全绿**方可进入脚本编写；L2 当前为 SKIP（契约齐全即达标）。

## 设计要点

- 基座不依赖任何被测脚本：脚本缺失时 L2 仅 SKIP，基座整体不变红。
- 夹具仓库生成于 `smoke/tmp/`（gitignore），运行后残留可手动清理。
- 所有写操作类契约（分叉不自动改、脏区硬停、main 守卫、prune 不动远程）在脚本实现后由对应 L2 用例真实断言。

详见 `../SKILL.md` 中「工作流五」相关章节，以及 `../scripts/` 下的 sop_worktree_*.sh 脚本。
