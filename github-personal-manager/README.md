# github-personal-manager 技能说明（GitHub 个人管理助手）

> 本文件是 `github-personal-manager` 技能（版本 `2.1.0`，Apache-2.0）的**结构化总入口**：先给目录地图，再分层介绍硬约束、核心功能与用法、九个标准工作流详解、双形态输出架构，最后给出质量门禁、参考文档与安装加载方式。
> 权威规则以同目录 [`SKILL.md`](SKILL.md) 为唯一事源；本 README 是其面向「人类读者」的导读，不重复定义规则细节。

---

## 一、这是什么（定位与适用对象）

`github-personal-manager` 是一个面向**个人日常 GitHub 管理与操作**的一站式技能：把「看状态、同步、开 PR、查 CI、清理分支、多工作树并行」等高频动作固化成一组可执行脚本（`scripts/` 下的 `sop_*.sh`），由 AI 助手（Agent）按 [`SKILL.md`](SKILL.md) 的工作流调度，安全、规范地执行。

- **适用对象**：AI Agent / LLM（具备推理、读输出、决策、转述能力），以及经 `workflows/` 封装后不懂 git 的纯图形界面用户。
- **触发词**：用户说「帮我改一下 XX 仓库」「向 XX 上游提个 PR」「同步一下仓库」「发个版」「看看 CI 为什么红」「清理分支」「清理工区」等。
- **能力边界**：覆盖 9 个标准工作流（见第五章）；**不适用于**与 GitHub 无关的通用文件编辑、非 git 版本控制的文档操作，以及需要他人仓库写权限且未走 Fork+PR 的操作。

---

## 二、目录地图（含每个子目录与文件用途）

### 2.1 一级结构树

```
github-personal-manager/            ← 技能根目录（可整体移动到任意盘符/路径）
├── SKILL.md                         # 权威单一事源：9 工作流 + 9 条硬约束 + 示例
├── README.md                        # 本文件：结构化总入口（目录地图 + 功能/用法 + 工作流 + 双形态）
├── config/
│   ├── github-sop.config.sh         # 本机实例配置（.gitignore 忽略，不入版本库）
│   └── github-sop.config.template.sh# 配置模板（入版本库，供复制成实例）
├── scripts/                         # SOP 业务脚本（Agent 路径，相对路径自定位）
│   ├── lib/sop-common.sh            # 公共函数库（工具探测/仓库解析/配置加载/守卫）
│   ├── sop_resolve_repo.sh          # 仓库三元组（GH_USER/REPO_NAME/UPSTREAM）提取
│   ├── sop_status_all.sh            # 批量总览：扫描 REPO_ROOT 下所有 fork 状态
│   ├── sop_sync_precheck.sh         # 同步第一步：只读看清状态
│   ├── sop_sync_pull_ff.sh          # 同步第二步：本地 ↔ origin（只快进）
│   ├── sop_sync_upstream.sh         # 同步第三步：origin ↔ upstream（合并前记 tip）
│   ├── sop_sync_report.sh           # 同步第四步：上游更新分析报告
│   ├── sop_branch_merged_status.sh  # 分支清理：只读合并状态
│   ├── sop_fetch_prune.sh           # 分支清理：清理过时远程跟踪引用
│   ├── sop_docs_sync_check.sh       # 提交前文档同步门禁（Tier 1/2/3）
│   ├── sop_privacy_gate.sh          # 入库隐私闸门（密钥/手机号/身份证扫描）
│   ├── sop_pr_create.sh             # 开 PR（守卫拒 main/分离 HEAD）
│   ├── sop_pr_checks.sh             # 轮询 PR 的 CI 状态
│   ├── sop_ci_failed_log.sh         # CI 排错：下载失败日志
│   ├── sop_ci_rerun.sh              # CI 排错：重跑失败 job（需 --confirm）
│   ├── sop_worktree_add.sh          # 多工作树：开工作树
│   ├── sop_worktree_merge.sh        # 多工作树：--no-ff 合并回主线
│   ├── sop_worktree_cleanup.sh      # 多工作树：清理工作树 + 分支
│   └── .gitkeep
├── references/                      # 参考文档（规则补充与命令清单）
│   ├── gh-capability.md             # gh CLI 能力全览（认证/仓库/PR/Issue/CI/Release…）
│   ├── docs-sync-checklist.md       # 提交前文档同步·分层检查清单（Tier 1/2/3 权威数据）
│   └── fork-ci-pitfalls.md          # Fork CI 实证要点与编译构建规则（踩坑库）
├── smoke/                           # 冒烟测试基座（质量门禁）
│   ├── README.md                    # 测试方案与分层说明
│   ├── lib/harness.sh               # 测试harness公共库
│   ├── run-smoke.sh                 # 一键运行全部用例
│   └── tests/                       # L0~L2 用例（env/fixtures/contracts/各脚本契约…）
├── templates/
│   └── sync-upstream.yml            # 可选：定期同步 upstream 的 GitHub Actions 模板
├── workflows/                       # 图形客户端按钮封装（纯 GUI 通道，详见 §七）
│   ├── README.md                    # workflows 设计/挂接/脚本用途总说明
│   └── wf_*.sh                      # 8 个父脚本（wf_common/wf_sync/wf_pr/wf_ci/…）
└── .gitignore                       # 忽略本机 config 实例、夹具临时目录等
```

### 2.2 文件用途一览表

| 路径 | 用途 | 是否入库 |
|------|------|----------|
| `SKILL.md` | 权威单一事源：角色、阶段 0、脚本约定、9 条硬约束、9 工作流、示例、边界 | 是 |
| `config/github-sop.config.sh` | 本机运行配置实例（git/gh 路径、主分支、远端别名、REPO_ROOT、GH_USER 等） | 否（.gitignore） |
| `config/github-sop.config.template.sh` | 配置模板，复制为实例后填值 | 是 |
| `scripts/lib/sop-common.sh` | 公共函数库：`_sop_probe_tools`（工具探测）、`_sop_resolve_remotes`（三元组解析）、`_sop_load_config`（配置加载）、各类守卫 | 是 |
| `scripts/sop_resolve_repo.sh` | 一次性提取并复用仓库三元组（GH_USER/REPO_NAME/UPSTREAM） | 是 |
| `scripts/sop_status_all.sh` | 批量总览所有 fork 的落后/领先/未提交/未推送（默认不 fetch） | 是 |
| `scripts/sop_sync_*.sh`（4 个） | 同步巡检四步链：看清 → 本地↔origin → origin↔upstream → 出报告 | 是 |
| `scripts/sop_branch_merged_status.sh` / `sop_fetch_prune.sh` | 分支清理：只读合并状态 + 清理过时引用 | 是 |
| `scripts/sop_docs_sync_check.sh` | 提交前文档同步门禁，按 `references/docs-sync-checklist.md` 判定 Tier 1/2/3 | 是 |
| `scripts/sop_privacy_gate.sh` | 入库隐私闸门：扫描密钥/手机号/身份证等敏感信息 | 是 |
| `scripts/sop_pr_create.sh` / `sop_pr_checks.sh` | 开 PR（守卫）+ 轮询 CI 状态 | 是 |
| `scripts/sop_ci_failed_log.sh` / `sop_ci_rerun.sh` | CI 排错：取失败日志 + 重跑 job | 是 |
| `scripts/sop_worktree_*.sh`（3 个） | 多工作树：开 / --no-ff 合并 / 清理 | 是 |
| `references/gh-capability.md` | `gh` CLI 能力清单（各命令用途、是否已实跑验证） | 是 |
| `references/docs-sync-checklist.md` | 文档同步分层检查清单权威数据（改动类型→Tier 文件映射） | 是 |
| `references/fork-ci-pitfalls.md` | Fork CI 实证坑与编译构建规则（可移植方法论） | 是 |
| `smoke/` | 冒烟测试基座：L0 环境 / L1 夹具 / L2 契约，改脚本后须跑通 | 是 |
| `templates/sync-upstream.yml` | 可选上游同步 CI 模板（默认不启用，复制到 fork 的 `.github/workflows/` 才运行） | 是 |
| `workflows/` | 图形客户端按钮封装（详见 §七，本 README 不重复） | 是 |

---

## 三、硬约束（安全底线，独立执行亦完整）

本技能的全部约束内嵌于 [`SKILL.md`](SKILL.md)，无需外部记忆即可独立、正确运行。要点如下。

### 3.1 阶段 0 · 工具探测（每次第一件事，强制）

每次进入技能先 `where.exe git` / `where.exe gh` 取实际路径，并 `gh auth status` 确认登录。**任一工具缺失即立刻暂停**，用大白话告诉用户怎么装或请其给出绝对路径，绝不继续后续步骤。脚本层（`lib/sop-common.sh` 的 `_sop_probe_tools`）也有同样探测，双重防护。

### 3.2 九条顶级全局禁令（自包含规则）

1. **路径核验（最高优先级）**：任何 git/gh 前先 `ls "<目录>/.git"` + `git -C "D:/绝对/Windows/路径" rev-parse --show-toplevel` 确认仓库根；绝不对根目录操作；禁 `git -C /d/...`。
2. **禁强推/删 origin/main 及受保护分支**：含 `push --force` 到 `origin/main`、删除 main。
3. **标签重推用「删远端标签 + 重推」**，禁强推标签。
4. **只推 origin，绝不推 upstream**；给上游贡献一律走 PR。
5. **三段式二次授权铁律**：强推/删 main 等须「用户授权 → 暂停说明后果 → 二次显式授权」三环齐全。
6. **入库隐私闸门**：`git add --dry-run` 预览 + 推送前 `sop_privacy_gate.sh` 扫描；测试目录默认 gitignore。
7. **dry-run 优先**：写操作脚本默认只打印，加 `--confirm` 才执行。
8. **合并与回滚纪律**：合并一律 `git merge --no-ff`；回滚一律 `git revert -m 1`，禁 `reset --hard` + 强推；已推送提交禁改写。
9. **公开动作一律暂停确认**：删分支/打标签/发版/删远端先说明后果、暂停等指令。

### 3.3 关键安全机制小结

- **dry-run 优先**：所有写脚本默认只打印将做什么，避免误执行。
- **入库隐私闸门**：推送前扫描真实手机号/身份证/令牌(token)/密钥，命中即暂停。
- **合并回滚纪律**：`--no-ff` 保留谱系，`revert -m 1` 可整段回滚，绝不改写历史。
- **决策点暂停**：凡冲突/双向分叉/脏工作区/公开动作，停下用大白话说明并等指令，绝不自动选。

---

## 四、核心功能与用法

### 4.1 脚本调用约定

- 脚本位于技能根 `scripts/`，靠 `BASH_SOURCE` 相对解析，**不写死安装位置**。
- 调用格式：`bash scripts/sop_xxx.sh <仓库路径> [--confirm]`；不带 `--confirm` 仅预览（dry-run）。
- 绝大多数脚本第一个参数为「仓库路径」；不传则对当前目录（需已 `cd` 进目标仓库）操作。
- 不要自行猜测或改写脚本内部逻辑，严格按各工作流列出的脚本与参数调用。

### 4.2 仓库解析与三元组提取

运行 `bash scripts/sop_resolve_repo.sh <仓库路径>`，从 `git remote -v` 确定性提取并在当前任务复用三项：**GH_USER**（origin 拥有者）、**REPO_NAME**（origin 仓库名）、**UPSTREAM**（upstream 远端 `owner/name`，无则空）。每个脚本调用也会重新提取，不依赖会话上下文。

### 4.3 本机配置

- 首次部署：复制 `config/github-sop.config.template.sh` → 同目录 `config/github-sop.config.sh`，填入本机值（该实例文件被 `.gitignore` 忽略、不入库）。
- 关键字段：`GIT_BIN`/`GH_BIN`（留空则由 `where.exe` 自动解析，刻意不硬编码）、`MAIN_BRANCH`、`ORIGIN_REMOTE`、`UPSTREAM_REMOTE`、`UPSTREAM_REPO`（留空则运行期自动解析）、`REPO_ROOT`（默认 `D:/Documents/AI_Work_Temp`，用户绝对路径优先）、`GH_USER`/`GH_EMAIL`。
- 无 config 也能运行（回退 PATH 解析），config 仅作可选覆盖。

### 4.4 可用操作清单（用户未指定任务时列举）

| 编号 | 操作 | 对应工作流 |
|------|------|-----------|
| 1 | 信息读取与搜索（gh 优先） | 工作流二 |
| 2 | 日常同步巡检 | 工作流三 |
| 3 | 标准代码修改 | 工作流四 |
| 4 | 多工作树并行开发 | 工作流五 |
| 5 | CI 失败排错 | 工作流六 |
| 6 | Release 发版 | 工作流七 |
| 7 | 分支清理回收 | 工作流八 |
| 8 | PR 全生命周期 | 工作流九 |
| 9 | 清理工区维护 | 工作流十 |
| 10 | 仓库管理（clone/fork/create…） | 见 `references/gh-capability.md` |
| 11 | Issue/PR 管理 | 见 `references/gh-capability.md` 与工作流九 |
| 12 | Release/制品/密钥/标签/规则集 | 见 `references/gh-capability.md` 与 `references/fork-ci-pitfalls.md` |

### 4.5 结构化结果报告（交付物规范）

每个工作流执行完毕（成功/失败/暂停）都须输出**分节 + 表格**的中文报告：操作对象 → 执行了什么 → 结果（领先/落后/PR 编号/CI 状态等）→ 风险与异常 → 下一步建议。报告既是交付物也是审计痕迹。

---

## 五、九个标准工作流详解（核心实现）

> 各工作流自包含、可独立执行；脚本均位于 `scripts/`（Agent 路径）。下为用途、关键脚本与使用场景。工作流编号沿用 [`SKILL.md`](SKILL.md) 既有约定（从「工作流二」起）。

### 5.1 工作流二 · 信息读取与搜索（gh 优先）

- **用途**：读/分析 GitHub 网址内容；搜索仓库/代码/Issue/PR。
- **关键脚本**：无专属脚本，首选 `gh`（仅当 `gh` 不可用或代码搜索需渲染网页时回退 WebFetch/WebSearch）；纯读取亦不豁免路径核验。
- **使用场景**：用户给 GitHub 链接要分析、要搜某个仓库/某段代码。
- **要点**：`gh search code` 仅索引默认分支；`gh api contents` 返 base64 需解码；命令总览见 `references/gh-capability.md`。

### 5.2 工作流三 · 日常同步巡检

- **用途**：把本地 ↔ 你的远端(origin) ↔ 上游(upstream) 三方对齐。
- **关键脚本（四步链）**：`sop_sync_precheck.sh`（看清状态）→ `sop_sync_pull_ff.sh`（本地↔origin，只快进）→ `sop_sync_upstream.sh`（origin↔upstream，合并前先 `git rev-parse HEAD` 记 tip）→ `sop_sync_report.sh`（上游更新报告）。批量总览可选 `sop_status_all.sh`。
- **使用场景**：每天点一次「同步」；双向分叉/工作区脏时脚本列 A–E 选项并暂停，绝不擅自选。
- **要点**：合并 upstream 前务必记「合并前本地 tip」作报告基准，严禁用合并后 HEAD。

### 5.3 工作流四 · 标准代码修改

- **用途**：改代码/写文件 → 提交(commit) → 推送(push) → 开 PR → 轮询 CI。
- **关键门禁**：阶段 0 工具探测；提交前 `sop_docs_sync_check.sh`（Tier 1 未同步阻断）；推送前 `sop_privacy_gate.sh`；开 PR 走 `sop_pr_create.sh`（守卫拒 main/分离 HEAD）；CI 轮询 `sop_pr_checks.sh`。
- **使用场景**：给某仓库加功能/修 BUG 并提 PR。
- **要点**：建分支后首次 commit 前先 `git rev-parse HEAD` 确认 born；提交信息建议 conventional commits 前缀（`feat:`/`fix:`/…）。

### 5.4 工作流五 · 多工作树并行开发

- **用途**：同一仓库多任务并行、代码隔离，最终 `--no-ff` 合并回主线、整段可回滚。
- **关键脚本**：`sop_worktree_add.sh`（开工作树）→ 工作树内开发测试 → `sop_worktree_merge.sh`（--no-ff 合并，含分支保护 fail-safe 核验）→ `sop_worktree_cleanup.sh`（清理工作树+分支，删远端须确认且先核 open PR）。
- **使用场景**：登录功能与导出功能要并行改、互不干扰。
- **要点**：合并碑双父结构，回滚唯一命令 `git revert -m 1`；删远端前须 `gh pr list --head <分支> --state open` 确认无 open PR。

### 5.5 工作流六 · CI 失败排错

- **用途**：定位红 run、修复回推。
- **关键脚本**：`sop_ci_failed_log.sh`（下载失败日志）→ `sop_pr_checks.sh`（轮询状态）→ `sop_ci_rerun.sh`（重跑，需 `--confirm`）。
- **使用场景**：PR 的 CI 红了，要查哪步挂、修完重跑。
- **要点**：按现象对号入座（fmt/clippy/action_required/发布 job 等）见 `references/fork-ci-pitfalls.md`；`git push` 偶发 443 超时用 for 循环重试，持续重置改用 `gh api` 绕过。

### 5.6 工作流七 · Release 发版

- **用途**：打标签(tag) + 取构建产物。无专门脚本，按手动流程（均为公开动作，需暂停确认）。
- **关键流程**：发版前先开 Release PR（须在 `release/X.Y.Z` 分支，不可在 main）→ 合并后才打 tag → 监控 `gh run watch` / `gh release *`。
- **使用场景**：功能稳定要发一个正式版本。
- **要点**：重触发用「删远端标签 + 重推」禁强推标签；标签 SHA 须 `git rev-parse vX^{commit}` 解引用核对；fork 仅自取产物，绝不发布到 crates.io/PyPI。

### 5.7 工作流八 · 分支清理回收

- **用途**：删已合并的本地/远端分支。
- **关键脚本**：`sop_branch_merged_status.sh`（只读合并状态）→ `sop_fetch_prune.sh`（清过时远程跟踪引用）。删除前先列「合并状态 + PR open 状态」两维、暂停确认。
- **使用场景**：功能合完，清理一堆 feat/x 分支。
- **要点**：`main`/当前分支永不删；本地 `-d`（只删已合并）绝不擅自 `-D`；删远端前先核无 open PR。

### 5.8 工作流九 · PR 全生命周期

- **用途**：开 PR、评审回应、合并、收尾全覆盖。
- **关键**：开 PR 前「三核验」（路径/分支 born/对齐 upstream）+ 重复 PR 检查 + 读上游 CONTRIBUTING/模板；开 PR 走 `sop_pr_create.sh`；评审回应以真实代码为唯一基准、根因修复不叠补丁；合并 upstream 由维护者、fork 内部用 `--squash`。
- **使用场景**：从开 PR 到合并收尾的完整协作。
- **要点**：PR 正文用 `--body-file` 避免中文括号被 bash 解析失败；文档同步门禁（Tier 1）未同步不得开 PR。

### 5.9 工作流十 · 清理工区维护

- **用途**：清理工区垃圾/临时/过期文件（不碰远程/CI/发版）。
- **强门禁**：先搜列（逐项路径+大小+时间）→ 暂停等你确认 → 确认后删（中文路径用 `Remove-Item -LiteralPath`，优先回收站、小批量≤10）。
- **使用场景**：文件夹堆了一堆过程性报告/截图/构建产物要清理。
- **要点**：受保护清单（`.git/`、`.workbuddy/`、`src/`、`README.md`、`CHANGELOG.md`、冒烟测试文件等）永不删。

---

## 六、双形态输出架构（Agent 路径 vs GUI 按钮路径）

`github-personal-manager` 采用「双形态输出」：同一套 `sop_*.sh` 既经 [`SKILL.md`](SKILL.md) + Agent 路径服务 LLM，又经 `workflows/wf_*.sh` 服务纯图形界面用户（详见 §七）。下面从设计意图层面对比两种形态，并给出对 Agent 的正向价值与代价，作为「是否让 Agent 直接调 `wf_*.sh`」的裁决依据。

### 6.1 两种形态的设计意图对比

| 维度 | `SKILL.md` + `scripts/sop_*.sh`（Agent 路径） | `workflows/wf_*.sh`（纯 GUI 路径） |
|---|---|---|
| 目标用户 | Agent/LLM（具备推理、读输出、决策、转述能力） | 不懂 git 的小白（无 Agent，只有按钮） |
| 决策点处理 | Agent 读"暂停等指令"选项 → 智能裁决 → 执行下一步 | 打印 A–E 选项 + `wf_decide` 四段大白话 → 等人手选 |
| 信息粒度 | 完整（中间步骤、冲突详情、PR 状态全呈现） | 收敛（多步压成一步，复杂场景只给精简选项） |
| 灵活性 | 高（可针对异常定制命令） | 低（固化步骤链，仅 `--confirm` 切换预览/执行） |

### 6.2 对 Agent 的正向价值（有限）

- **可选快捷封装**：若只需执行标准全链（如"一键同步巡检"），直接调 `wf_sync.sh` 比手工拼 [`SKILL.md`](SKILL.md) 的 4 步更省 token/步骤。
- **兼容性无碍**：`wf_*.sh` 内部"暂停等指令"会 `exit 2` 并打印选项，Agent 读到后同样能接手决策，不会卡死。

### 6.3 对 Agent 的代价（更关键）

1. **信息损失**：`wf_*.sh` 隐藏中间细节。Agent 在冲突/双向分叉/open PR 核对等复杂场景需要完整上下文才能正确决策，收敛后的选项不如直接读 `sop_*.sh` + [`SKILL.md`](SKILL.md) 决策树信息全。
2. **单一事源冲突**：若 [`SKILL.md`](SKILL.md) 同时描述"逐步调 sop_*.sh"和"一键调 wf_*.sh"，两路并存易失同步（`sop_*.sh` 改了 `wf_*.sh` 没跟上），直接违反 `github-personal-manager` 自身的"单一事源"纪律。
3. **决策能力降级**：Agent 本可智能处理决策点（如自动建议 rebase 还是 merge），`wf_*.sh` 将其固化为面向人的 A–E 选项，剥夺了 Agent 的自主判断空间，反而降低了处理效率。

> **裁决结论**：Agent 主路径仍是 `SKILL.md` + `sop_*.sh`；`wf_*.sh` 仅作为面向纯 GUI 用户的并列通道，不接入 [`SKILL.md`](SKILL.md) 作 Agent 主路径。标准全链场景可选用 `wf_*.sh` 省 token，但复杂/异常场景务必回退到 `sop_*.sh` + 决策树以保全信息。

---

## 七、workflows 图形按钮封装（纯 GUI 通道）

`workflows/` 把 `sop_*.sh` 串成步骤链、面向**不懂 git 的纯 GUI 用户**封装为图形客户端按钮（SourceGit `CustomActions` / Git Extensions `ownScripts`），让用户点一下就办、决策点由 `wf_decide` 打印四段大白话指引。

详细设计、使用对象、按钮配方、各脚本用途与引用关系见 **[`workflows/README.md`](workflows/README.md)**（本 README 不重复赘述）。

---

## 八、质量门禁（smoke 冒烟测试）

`smoke/` 是本技能的**质量门禁**：修改任何 `sop_*.sh`、`SKILL.md`、`references` 或 `config` 后，于技能根目录运行

```bash
bash smoke/run-smoke.sh
```

全部用例须通过（退出码 0）方可视为改动安全。分层：

- **L0 环境测试**（`test_env.sh`）：`git`/`gh` 可用、版本、登录态。
- **L1 夹具行为测试**（`test_fixtures.sh`）：用临时仓库模拟 behind/ahead/diverge/dirty，断言原生探测计数正确。
- **L2 契约规格测试**（`test_contracts.sh` 等）：每个脚本的「应做/不应做」以用例固化；脚本缺失时 SKIP，写完后转 PASS。

套件本地只读/受控执行，不触碰任何远端仓库；用例清单与编写规范见 `smoke/README.md`。

---

## 九、参考文档索引

| 文档 | 用途 |
|------|------|
| `references/gh-capability.md` | `gh` CLI 能力全览（认证、仓库、PR、Issue、CI、Release 等命令与已验证标记） |
| `references/docs-sync-checklist.md` | 提交前文档同步·分层检查清单权威数据（改动类型 → Tier 1/2/3 文件映射） |
| `references/fork-ci-pitfalls.md` | Fork CI 实证要点与编译构建规则（踩坑库、可移植方法论） |
| `templates/sync-upstream.yml` | 可选上游同步 CI 模板（默认不启用；复制到 fork 的 `.github/workflows/` 才按 schedule 运行；只推 origin、绝不推 upstream） |

---

## 十、安装、加载与触发

1. **获取技能**：克隆/复制 `github-personal-manager` 到本机（整体目录可移动到任意盘符/路径，脚本靠 `BASH_SOURCE` 自定位）。
2. **配置（可选）**：`cp config/github-sop.config.template.sh config/github-sop.config.sh` 并填本机值；无 config 也能跑（回退 PATH）。
3. **加载**：经平台技能系统按名 `github-personal-manager` 加载；加载后即为完整能力集，无需外部记忆。
4. **触发**：用户说「帮我改一下 XX 仓库」「同步一下仓库」「发个版」「清理分支」「清理工区」等 GitHub 意图，即按名激活并进入阶段 0。
5. **纯 GUI 按钮（仅 `workflows/`）**：见 [`workflows/README.md`](workflows/README.md) 在 SourceGit / Git Extensions 写入 `CustomActions` / `ownScripts`。
6. **改动守护**：任何脚本/文档/配置变更后先 `bash smoke/run-smoke.sh` 跑通门禁再交付。

> 本 README 为技能结构化总入口；完整规则、参数、示例以 [`SKILL.md`](SKILL.md) 为权威；图形按钮封装以 [`workflows/README.md`](workflows/README.md) 为权威。
