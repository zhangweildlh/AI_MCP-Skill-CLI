# github-personal-manager 项目规划（深度思考 + 规划）

> 本文件是约束 #6「先深度思考，然后规划」的交付物。实际脚本代码的编写须在「冒烟测试基座」验收合格（约束 #7）后方可开始。

---

## 0. 项目定位与目标

`github-personal-manager` 是一套**工具无关、可移植**的 Git/GitHub 标准操作（SOP）脚本集，逻辑**严格对齐个人「永久记忆」中的 GitHub 工作流**。

四大设计基点（由约束 3/4/5 推导）：

1. **工具无关**：底层引擎仅为 `git` + `gh`（GitHub CLI）。四类调用方统一可用：
   - GitExtensions 自定义脚本（`Command=bash`, `Arguments=-c '…'` 或调用本仓库脚本）；
   - 终端 CLI（`bash scripts/xxx.sh`）；
   - LLM Agent（调用 `bash` 执行脚本或读取其 `--help` 契约）；
   - 本助手（WorkBuddy 直接执行）。
2. **纯手动触发**：不含任何自动运行/定时逻辑（约束 3）。需要「每日无人值守巡检」的场景，由 Windows 任务计划程序或 WorkBuddy 自动化另行驱动，本仓库只提供被调用的脚本。
3. **中文可读**：每个脚本必有中文名 + 中文功能说明（脚本首部注释块 + `--help` 输出），让用户/LLM 明白用途、功能、适用场景、注意事项。文件名为 ASCII（可移植），中文名体现在文档与脚本内。
4. **逻辑一致**：脚本的决策树、分支守卫、暂停语义，必须与「永久记忆」逐条一致（约束 5）。

---

## 1. 设计原则（由约束推导的硬规则）

- **守卫优先（Guard-first）**：所有写操作（push/merge/reset）内嵌分支守卫——
  - 仅当「当前非 `main` 分支」或「明确作用于非 `main` 目标」时才允许；
  - 工作区脏（`git status --porcelain` 非空）一律硬停止。
  - 把「顶级全局禁令：禁止强推/删除 `main`」固化进代码，而非依赖人工记忆。
- **暂停即打印并退出（Pause = report & exit）**：遇冲突、双向分叉、脏工作区、公开动作（开 PR/打标签/删分支）时，脚本**只报告、列选项、退出**，绝不替用户决策（强门禁）。
- **配置外置（Config external）**：`git`/`gh` 路径、被操作仓库、远端名、upstream 仓库等均来自配置模板，不硬编码。
- **可读可审计**：bash 实现，含中文注释与关键步骤回显；单文件单职责。
- **路径核验防误报**：脚本/助手执行 git 前，先 `ls "<目录>/.git"` 确认仓库有效（零歧义、不受路径格式影响）；git 命令用 `git -C "D:/绝对/Windows/路径"` 或先 `cd /d/绝对/路径` 再执行。**禁止** `git -C /d/...`（Unix 风格根路径在 Git Bash 下会被 git 误报 `not a git repository`）。若 `git rev-parse` 报该错，先 `ls .git` 复核，`.git` 存在即视为命令格式问题、改用正确写法重测，不得判定"非 git 仓库"或中止于路径误报。

---

## 2. 仓库结构

```
github-personal-manager/
├── README.md                      # 项目说明（中文，入口）
├── sop-plan.md                    # 本规划文件
├── .gitignore
├── config/
│   └── github-sop.config.template.sh   # 配置模板（用户复制为 .config.sh 后填本机值）
├── scripts/                       # 实际脚本（约束 #7 后逐一编写）
│   └── .gitkeep
├── docs/
│   └── scripts-catalog.md         # 脚本目录：中文名/功能/记忆映射/档位（与 PLAN 第 3 节同源）
└── smoke/                         # 冒烟测试基座（约束 #6）
    ├── README.md                  # 冒烟测试方案 + 流程
    ├── run-smoke.sh               # 入口
    ├── lib/harness.sh             # 断言/夹具框架
    ├── tests/                     # L0/L1/L2 用例
    └── tmp/                       # 运行期夹具仓库（gitignore）
```

---

## 3. 脚本目录（与永久记忆映射）

| 脚本文件 | 中文名 | 中文功能说明（概要） | 对应记忆章节 | 档位 | 手动触发方式 |
|---|---|---|---|---|---|
| `sop_sync_precheck.sh` | 巡检前置预检 | 一键输出 remote、`main` 跟踪关系、工作区脏状态、本地↔origin 领先/落后计数 | 日常同步巡检·阶段0/第一步 | A | 终端/GitExtensions 菜单 |
| `sop_sync_pull_ff.sh` | 快进拉取 main | 守卫后仅做 `pull --ff-only origin main`；非快进或脏区即中止 | 日常同步巡检·第一步 | B | 菜单 |
| `sop_sync_upstream.sh` | 合并上游并推 fork | 按记忆决策树合并 `upstream/main` 并推 `origin/main`；冲突/分叉即暂停 | 日常同步巡检·第二步 | B | 菜单 |
| `sop_pr_create.sh` | 开 PR | 守卫(非 `main`)+`gh pr create --fill`；公开动作，需确认 | 标准代码修改·阶段2 | B | 菜单 |
| `sop_pr_checks.sh` | 轮询 CI 状态 | `gh pr checks` + 最近 `gh run list`；只读 | CI 排错·第一步 | A | 菜单/右键 |
| `sop_ci_failed_log.sh` | 下载失败日志 | 取最近失败 run 的 `--log-failed`；只读 | CI 排错·第一步 | A | 右键 |
| `sop_ci_rerun.sh` | 重跑失败 CI | 重跑最近 run 的失败 job；公开动作，需确认 | CI 排错·第三步 | B | 菜单 |
| `sop_branch_merged_status.sh` | 只读合并状态 | 输出 `--merged`/`--no-merged main` 与 fork 远程已合并分支；只读 | 分支清理·第一步 | A | 菜单 |
| `sop_fetch_prune.sh` | 清理过时远程跟踪引用 | `git fetch --prune`；只清本地过时引用，不动远程 | 分支清理·第二步 | A | AfterPull/菜单 |

**C 档（不写成自动脚本，由助手在对话中执行）**：Release 打标签触发、分支删除（`branch -d`/`push --delete`）、强推 `main`、冲突处理。理由：不可逆或强门禁，违反约束 5 的"暂停等指令"要求。

---

## 4. 关键逻辑与永久记忆逐条对齐（重点，约束 #5）

### 4.1 本地 ↔ origin（记忆 line 201）

状态探测：`git rev-list --left-right --count main...origin/main` → `(behind, ahead)`。

- **仅落后（behind>0, ahead=0）** → 自动 `git pull --ff-only origin main`。
- **仅领先（behind=0, ahead>0）** → 自动 `git push origin main`。
- **双向分叉（behind>0 且 ahead>0）** → **打印 A–E 选项并退出，绝不自动 reset/merge/rebase**：
  - A：以 origin 为准 `git reset --hard origin/main`
  - B：以本地为准：经 feat 分支走 PR 合并后再同步（**禁止强推 main**）
  - C：合并保留双方
  - D：变基
  - E：中止不动
  - 疑似验证残留建议 A，但仍**暂停等确认**。
- **前置条件**：工作区脏 → 硬停止，等指令；停在 feat 且干净、有未推送提交 → 同步 `main`、不碰 feat、提醒默认不推。

### 4.2 origin（fork）↔ upstream（记忆 line 204-206）

状态探测：`git rev-list --left-right --count origin/main...upstream/main` → `(M=fork领先, K=upstream领先)`。

- **M=0, K=0** → 已同步。
- **M=0, K>0** → 自动 `git merge upstream/main` + `git push origin main`。
- **M>0** → `gh pr list --repo <upstream> --author zhangweildlh --state all`：
  - 有 open PR → 报告「PR 待审」继续（不重复开、不覆盖、不暂停）；
  - 同时 K>0 → 额外提示「PR 可能落后上游」，建议 rebase feat 后更新 PR，**暂停等指令**；
  - rejected（closed 且 merged=false）→ 问题四（保持 fork 领先、不重提，除非有反馈）；
  - 无 PR → 问题三（向 upstream 开 PR），但**暂停等指令，不自动开**。
- **M>0, K>0** → `git merge-tree --write-tree origin/main upstream/main` 干净 → 自动合并+推送；冲突 → **暂停列 A/B/C/D**，绝不自动选。

> 查 PR 一律用 `--author zhangweildlh` 口径（防漏判 feat/* 源分支的 PR）；仅查「main→main 通道」才叠加 `--head zhangweildlh:main`。

### 4.3 分支守卫（顶级全局禁令，记忆 line 61-72）

- 任何脚本凡涉及 push：若当前分支=`main` 且为非快进/强推 → **拒绝并退出**。
- 脚本中**绝不出现**：`git push --force`/`--force-with-lease` 到 `main`、`git push origin --delete main`、`git branch -D main`。
- feat 强推仅限 `git push --force-with-lease origin feat/<topic>`，且**默认不启用**（属 B 档手动、需确认）；本仓库不提供强推 `main` 的任何入口。

### 4.4 凭证（与约束「桥接可移植」一致）

脚本依赖 `gh` 读取其本地凭据（`gh auth setup-git` 桥接）。脚本**不含任何令牌**；第三方电脑复制本仓库 + `gh auth login` 后即可用，满足约束 4 可移植性。

---

## 5. 冒烟测试方案（约束 #6）

### 5.1 目标

在脚本编写**之前**建立可运行的测试基座，验证：
- **环境**：`git`/`gh` 可用、版本、配置模板加载正确；
- **夹具行为**：用临时 git 仓库模拟 behind/ahead/diverge/dirty/prune 等状态，断言 `git`/`gh` 在对应状态下的原生行为（建立绿色基线）；
- **契约规格齐全**：每个脚本的「应做 / 不应做」以测试用例固化（如：diverge 时脚本不得修改任何引用、必须打印 A–E）。脚本缺失时该用例标记为「未实现/跳过」，基座本身仍绿。

### 5.2 测试分层

- **L0 环境测试**：`git`/`gh` 存在、版本达标、config 加载成功。
- **L1 夹具行为测试**：临时仓库模拟各状态，断言 git/gh 原生行为（基线，必须全绿）。
- **L2 契约规格测试**：每个脚本的「应做/不应做」用例固化。脚本未写时标记 `SKIP`（未实现），基座不因此变红；脚本写完后由 `SKIP` 转 `PASS`。

### 5.3 冒烟测试流程

1. 复制 `config/github-sop.config.template.sh` → `config/github-sop.config.sh`，填入本机 `GIT_BIN`/`GH_BIN` 等。
2. 执行 `bash smoke/run-smoke.sh`。
3. 输出 通过/跳过/失败 汇总；**L0+L1 必须全绿**方可进入脚本编写。

### 5.4 配置模板字段（`config/github-sop.config.template.sh`）

```sh
GIT_BIN=""          # git 可执行文件绝对路径，如 D:/Tools/Assembly/git/cmd/git.exe
GH_BIN=""           # gh 可执行文件绝对路径，如 D:/Tools/Assembly/gh.exe
MAIN_BRANCH="main"  # 主分支名
ORIGIN_REMOTE="origin"
UPSTREAM_REMOTE="upstream"
UPSTREAM_REPO=""    # 上游仓库 owner/name，如 gitextensions/gitextensions
GH_USER=""          # GitHub 登录名，如 zhangweildlh
TEST_REPO_DIR=""    # 冒烟夹具仓库根（运行期生成，可留空用默认 tmp）
```

---

## 6. 验收门槛（约束 #7）

- **全套冒烟（L0+L1）全绿** 且 **L2 契约规格齐全** → 验收合格 → 开始逐一编写脚本（A 档 → B 档）。
- 每个脚本写完后，其对应 L2 用例由 `SKIP` 转为 `PASS`，并跑回归。

---

## 7. 实施顺序

1. 建仓（本地 `D:\Documents\AI_MCP-Skill-CLI\github-personal-manager` + 远端 `zhangweildlh/github-personal-manager`）—— 本步。
2. 写 sop-plan.md（本步）。
3. 写配置模板 + 冒烟基座（L0/L1/L2 框架）+ 运行 → **验收**。
4. 逐一写脚本（A 档 → B 档），每写完一个跑对应 L2 用例。
5. 编写 GitExtensions 集成说明（`docs/`）：如何让 GitExtensions 调用本仓库脚本。
6. 更新永久记忆 / 本项目 `MEMORY` 引用。

---

## 8. 风险与边界

- GitExtensions 脚本无定时触发器，故「每日无人值守巡检」不归本仓库自动化，仅提供被调用的脚本（已在约束 3 明确纯手动）。
- 远端仓库默认 **private**（个人 SOP，可逆）；如需公开分享可 `gh repo edit --visibility public`。
- 所有写操作均经守卫 + 暂停门禁，杜绝「禁止强推/删除 main」被绕过。
