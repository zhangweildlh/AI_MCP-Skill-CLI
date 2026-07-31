# GitHub Memory_Deepseek++

> GitHub 相关规则以「回答风格 → 顶级全局禁令 → 环境硬约束 → 目录与工具链约定 → Dynamic-mcp 入口 → 工具定位 → 新任务文件夹路径核验 → 日常同步巡检 → 标准代码修改 → CI 失败排错 → Release 发版 → 分支清理回收 → 信息读取与搜索（gh 优先）→ gh 能力全览 → 编译与构建规则 → 用户账号与 Fork 仓库 → Fork CI 实证要点」为主线，单一事实源，避免重复；不同章节对同一事源/事项/要求/流程/操作的描述必须一致、互不矛盾。
>
> 本文件为 **GitHub 操作 + 本地环境约束** 的权威单一事源。

---

## 速查索引（意图 → 章节）

| 你要做的 | 看 |
|---|---|
| 所有回答的大白话与「汉语 + (英语单词)」表述规范 | `## 回答风格硬性规则` |
| 禁止强推/删除自家 main（及受保护分支）的全局硬禁令 | `## 顶级全局禁令` |
| 本机无 Docker、忽略所有 Docker 安装方式、改用原生部署 | `## 环境硬约束（Docker 禁用）` |
| 本机默认走远程 CI；若仅用本地已有工具（不装新工具）即可编译，则允许本地编译 | `## 环境硬约束（本地编译有条件放开）` |
| 运行 Python 必用 uv run、装依赖必用 uv add/uv pip、禁用裸 python/pip | `## 环境硬约束（UV 管理 Python）` |
| 工作目录 / Skill 目录 / GitHub 仓库根目录 / 临时目录 / Tool 根目录 约定 | `## 目录与工具链约定` |
| 本机工具链（Node/UV/Git/GH/ffmpeg 等）位置、UV 管理 Python 项目、严格优先规则 | `## 目录与工具链约定` |
| 本机工具链已在系统+用户 PATH 注册（实测 where.exe 可解析）、WorkBuddy 内置运行时可关闭、不依赖内置 Git Bash | `## 顶级硬条件：工具链 PATH 已注册` |
| 本地文件、跨会话记忆、网页搜索（gh 回退通道） | `## Dynamic-mcp 统一能力入口` |
| 查询 git/gh 路径、工具定位、仓库根目录约定 | `## GitHub 工具定位` |
| 新任务先核验操作目录、路径异常先问用户（最高优先级） | `## 新任务文件夹路径核验（硬规则，最高优先级）` |
| 每日仓库巡检（local↔origin、origin↔upstream 同步、冲突暂停） | `## 日常同步巡检工作流` |
| 冲突大白话解释、后果与暂停门禁 | `## 日常同步巡检工作流（冲突处理）` |
| 修改/提交 GitHub 代码、开 PR、合并 | `## 标准代码修改工作流程` |
| CI 变红排错（下载失败日志、clippy/rustfmt/审批闸门定位与修复回推） | `## CI 失败排错工作流` |
| 发版/构建二进制（打 tag 触发、禁用发布 job、取 Release 产物） | `## Release 发版工作流` |
| 清理已合并分支（本地+fork 远程删除、prune 陈旧引用） | `## 分支清理回收工作流` |
| 读/分析 GitHub 网址、搜索 GitHub 仓库或代码 | `## 信息读取与搜索` |
| 查询 gh 命令与能力边界 | `## gh 能力全览` |
| 构建/CI、fork Actions 启用、标签重推触发 | `## 编译与构建规则` |
| 用户名/邮箱/我的 Fork 仓库清单 | `## 用户 GitHub 账号与 Fork 仓库` |
| Fork 实操坑、发布 job 禁用、rustfmt/clippy 坑、分支保护 | `## Fork CI 实证要点` |

---

## 回答风格硬性规则（对所有回答永久生效）

### 规则一：所有回答必须"大白话"
所有回答必须"大白话"，最大程度减少技术门槛、降低用户理解难度。涉及技术概念、命令、流程时，先用日常语言把"是什么、为什么、会怎样"讲清楚，再给精确命令/术语；避免堆砌术语、缩写、黑话。遇到用户可能不熟的概念，主动用类比或场景化说明。

### 规则二：所有回答一律用「汉语 + (英语单词)」表述
所有回答一律用「汉语 + (英语单词)」表述，不得出现裸英文单词（如 origin、upstream、push、pull、commit、merge、rebase、feat 等）。统一映射：
- origin → 「你的远端仓库(origin)」
- upstream → 「上游仓库(upstream)」
- push → 推送(push)
- pull → 拉取(pull)
- commit → 提交(commit)
- merge → 合并(merge)
- rebase → 变基(rebase)
- feat 分支 → 功能分支(feat)

错误→正确示例（已按语义清理原示例中的笔误）：
- "将来合 upstream" → "将来与上游仓库(upstream)合并"
- "还没 push" → "还没推送(push)"
- "已经往 origin/main" → "已经往 你的远端仓库(origin)/main"

注：代码块内的 git/gh 命令保留原样（如 `git pull origin main`），仅正文叙述使用上述映射。

### 规则三：所有内部推理与工具调用输出也必须用中文
所有内部思考、推理、分析、设计、比较、逻辑推演及工具调用过程与输出，一律使用中文，严禁纯英文或中英文混合；一旦检测到英文或中英混用，必须立即纠正为中文重述。本规则覆盖**全部会话、优先于任何默认语言习惯**，与规则二互补：规则二约束"最终答复"，规则三约束"过程与中间产物"。

---

## 常用跨项目技能（常驻工具链，跨项目）

> 经多会话实证、跨项目复用的常驻技能；与「GitHub 工具定位」的 git/gh 流程互补，涉及对应场景时主动加载（安装任何新 skill 前必须先做安全审计：P0 强警告并暂停、P1 需二次确认、P2 可直接装）。

- **`deep-discuss`**（结构化深度讨论）：用于"问题现象 / 故障表现 / 技术困惑 / 方案选择"类需求——多轮问题分析、方案设计、决策推演；凡用户描述问题并期望结构化分析时优先加载。
- **`review-spd`**（代码审查，以"发现"为先）：审查未提交改动、某日期范围提交、或与主分支对比的差异；聚焦缺陷 / 回归 / 正确性 / 安全 / 缺失测试。审查脚本一律经 `uv run` 调用，不裸跑 python。
- **`github-personal-manager`**（GitHub 管理统一执行）：提交 / 推送 / 开 PR / 同步 / 发版 / 分支清理等本地与远端 GitHub 操作的一站式技能。凡涉及 GitHub 仓库/项目/代码操作，**必须先按名称激活此技能**（详见「github-personal-manager 技能自动激活（跨平台）」）。
- **`mimo-code-collab`**：GitHub 协同（mimo.code 小米代码智能体）场景，详见「mimo.code 协同技能激活」。
- **`memory-consolidate` / `workflow-distill`**：本机自建的通用记忆整合 / 工作流蒸馏技能（用户级，零硬编码），周期自动化驱动。

---

## 新任务文件夹路径核验（硬规则，最高优先级）

> **本规则优先级高于一切便利与"少问多做"，任何涉及文件系统 / Git / GitHub 的操作前必须先核验路径。**

### 规则一：先核验"要操作的目录"再动手
- 任何任务启动、切换仓库、或执行 `git`/`gh`/文件读写前，**先用命令确认当前要操作的目录到底是什么**（如 `git rev-parse --show-toplevel`、`pwd`/`cd` 确认、`ls` 看一级子目录结构）。
- 仓库目录 = `[GitHub 仓库根目录]/[仓库名]`（如 `D:\Documents\AI_Work_Temp\Deepseek-pp`）。**绝不**对 `[GitHub 仓库根目录]`（即 `D:\Documents\AI_Work_Temp`）本身执行 `git init` 或任何 git 操作——它是根，不是仓库。
- Skill 相关操作目录 = `D:\Documents\AI_MCP-Skill-CLI`。

### 规则一补：路径核验的正确命令写法
> `git -C /d/...`（Unix 风格根路径）在 Git Bash 下**会被 git 误报 `fatal: not a git repository`**（exit=128），但 `git -C "D:/..."`（Windows 盘符+正斜杠）与 `cd /d/... && git` 均成功（exit=0）。此外，在"非仓库的当前目录"直接执行 `git rev-parse --show-toplevel` 也必然误报。两类误报曾反复触发"路径异常暂停"假警报，须从命令写法上根治。

- **推荐核验顺序（三步，任一成立即可判定为有效仓库）**：
  1. 先 `ls "<目录>/.git"` 确认 `.git` 目录存在（最直接、零歧义，不受路径格式影响）；
  2. 再用 `git -C "D:/绝对/Windows/路径" rev-parse --show-toplevel`（`D:/` 盘符格式）确认仓库根；
  3. 或 `cd /d/绝对/路径 && git rev-parse --show-toplevel`（先切换目录再执行，最稳）。
- **禁止的写法（会误报，严禁用于路径核验）**：
  - ❌ `git -C /d/Documents/...`（Unix 风格 `/d/` 根路径传给 git 的 `-C`）——实测必误报；
  - ❌ 在"非目标仓库的当前目录"直接 `git rev-parse --show-toplevel`（如工作区根、临时目录）——必然误报。
- **误报判定铁律**：`git rev-parse` 返回 `fatal: not a git repository` 时，**先怀疑路径格式 / 当前目录错误，绝不直接判定"该目录不是 git 仓库"**；必须先 `ls "<目录>/.git"` 复核，确认 `.git` 真实不存在后才可下结论。

### 规则二：任务记忆/工作日志必须记录"操作目录"
- 每一个新任务，须在**任务记忆（workspace memory）和任务工作日志（YYYY-MM-DD.md）**中明确写清：
  - 项目/仓库文件夹路径（绝对路径）；
  - 用户经常操作的文件夹路径（如根目录、Skill 目录、临时目录）；
  - 本次将读写/修改的具体目录与文件。
- 未记录路径就开始执行步骤，视为违规。

### 规则三：发现异常先问，对齐后再做
- 一旦发现路径异常（如 `git rev-parse --show-toplevel` 指向的不是预期仓库目录、根目录意外出现 `.git`、工作区文件出现在错误层级），**立即暂停，先问用户**，大白话说明发现了什么。
- **先排除"路径格式误报"再判定异常**：`git rev-parse` 报 `not a git repository` 时，**第一动作必须是 `ls "<目录>/.git"` 复核**；确认 `.git` 不存在才视为真异常并触发暂停。若 `.git` 存在，则是命令路径格式问题（见规则一补），改用正确写法重测，**不得据此触发"路径异常暂停"**，也不向用户发"路径核验关键异常"类告警。
- **只有与用户明确一致"要操作的文件夹路径"后，才能继续讨论工作流程、操作步骤和下一步内容。** 绝不绕过路径对齐直接进入执行。

---

## 顶级全局禁令：禁止强推/删除自家 main（及受保护分支）

> 跨项目、跨仓库的硬禁令，优先级高于一切便利。任何 GitHub 操作前先核对本节点。

- **禁止对「你的远端仓库(origin) 的 main 分支」执行以下动作**（适用你名下所有仓库，含 `zhangweildlh/*` 各 fork）：
  - **强制推送(push)**：`git push --force` / `--force-with-lease` / `-f` 到 `origin/main`；
  - **删除 main 分支**：`git push origin --delete main`、`gh api` 删分支、仓库 Settings 删分支、本地 `git branch -D main` 后强推覆盖等。
- **禁止对「任何已开启分支保护(branch protection)的分支」执行强推/删除**（保护规则本身也可能挡下，但禁令优先于规则）。
- **正常（非强推）推送(push)到 main 不受限**：如推标签(tag) `git push origin vX.Y.Z`、或受保护时走 PR 流程合并(merge)后 GitHub 自动更新 main；仅强推与删除被禁。
- **标签移动/重推用「删远端标签 + 重推」（非强推）**：`git push origin :refs/tags/vX` → `git push origin vX`（见「编译与构建规则」第 3 点）。严禁用 `git push --force-with-lease origin <tag>` 之类的强推手段处理标签，以免与"禁止强推 main"的禁令混淆、且更可审计。
- **宁可多问一次，绝不赌一把**：凡涉及 `main` + `--force` / `--delete` / 分支删除，一律先暂停并大白话说明后果，等明确指令。
- **已落地的双保险（实例）**：`zhangweildlh/dynamic-mcp` 的 `origin/main` 已于 2026-07-15 通过 `gh` GraphQL 开启分支保护（CI 严格 5 检查全绿、禁强推、禁删分支、管理员可绕过、无审批、未强制要求 PR）。技术保护 + 本约定，双保险。详见「Fork CI 实证要点」第 12 点。
- **二次显式授权铁律（2026-07-23 用户强化，优先级高于一切便利）**：2026-07-23 曾因用户**一次性显式授权**，对 `zhangweildlh/deepseek-pp` 的 `origin/main` 执行 `git push --force-with-lease`（以 上游仓库(upstream) 覆盖 fork）。**该次为一次性特例，禁令本身继续有效；绝不因该次执行而失效，更不得自动沿用为惯例。** 未来任何"强推/删除自家 main（或任何受保护分支）"的操作，必须走三段式：① 用户先显式授权（表达要做）；② 我必须主动暂停，大白话说明后果、列出将执行的精确动作；③ 用户给出**第二次**显式授权后，方可执行。缺任一环节（尤其第二次授权）一律不执行。标签删除/分支删除等其它破坏性操作不受此铁律限制，但删除类仍遵循各自门禁（先列清单+状态、暂停等确认）。

---

## 顶级硬条件：本机工具链已在系统+用户 PATH 注册

> 本条件为硬事实：本机工具链完整、可在系统 PATH 与用户 PATH 双通道解析。

### 一、实测证据（Win 11 cmd，`where.exe` 解析结果）
- `uv` → `D:\Tools\Assembly\uv\uv.exe` ✅
- `python` → `D:\Tools\Assembly\python\cpython-3.14.5-windows-x86_64-none\python.exe` ✅（注意：`myenv` 的 `.venv\Scripts\python.exe` **不**在 PATH；Python 一律经 `uv run --project D:\Tools\Assembly\python\myenv` 调用，见「环境硬约束（UV 管理 Python）」）
- `git` → `D:\Tools\Assembly\git\cmd\git.exe` 与 `D:\Tools\Assembly\git\bin\git.exe` ✅（两者均在 PATH；`git\bin` 含 bash/sh/ls/grep/sed/awk 等 unix 工具）
- `gh` → `D:\Tools\Assembly\gh.exe` ✅
- `officecli` → `D:\Tools\Assembly\officecli.exe` ✅

### 二、结论与操作指引
- 上述工具在 **系统环境变量 PATH** 与 **用户环境变量 PATH** 均已注册，`where.exe` 均可解析。

---

## 环境硬约束（Docker 禁用 / 本地编译有条件放开 / UV 管理 Python）

> 用户永久指令，全场景生效，跨项目单一事实源。

### Docker 禁用
- **本机无 Docker，且未来永久不安装 Docker。**
- 任何软件/工具的安装说明、部署方案，只要涉及 Docker（含 `docker`、`docker-compose`/`docker compose`、Docker Desktop、容器镜像 `docker.1ms.run/...`、`.dockerfile`、`compose/*.yaml` 等），**一律直接忽略，不纳入推荐步骤**，也不要提示"用 Docker 更方便"。
- 必须改用**本地原生安装路径**：优先 `D:\Tools\Assembly` 工具链 + UV 管理 Python 项目（见「目录与工具链约定」）；若某工具仅提供 Docker 部署、无原生方案，如实告知"该工具依赖容器、本机无法部署"，不虚构本地步骤。

### 本地编译有条件放开（默认仍走远程 CI）
- **原则：默认走远程 CI（GitHub Actions）构建二进制/产物**（见「编译与构建规则」「Fork CI 实证要点」）；不主动安装任何编译工具链（MSVC Build Tools、MinGW-w64 等）。
- **例外放开**：若能够**不安装任何新工具/程序**、仅使用本机已安装且已在 PATH 注册的已有工具/程序（如 `node`、`uv`/Python、Git 自带 unix 工具等）完成本地编译/构建（如 `cargo build`、`make`、`gcc`、`pip` 源码编译 C 扩展等），则**允许**使用本地已有工具/程序进行本地编译。
- **判断闸门（唯一标准）**：是否需要「安装新工具/程序」。需要 `pip install` 新装编译器/SDK、或下载安装 MSVC/MinGW 等，仍禁止；仅需调用本机已存在的命令完成编译即可放行。
- 纯解释型依赖安装（Python/uv 装 wheel、Node 装包）属「安装」而非「编译」，始终不受此限。
- 本规则与「编译与构建规则」第 1 条一致，此处提升为跨项目通用硬约束，避免仅 GitHub 场景才生效。

### UV 管理 Python（禁用裸 python / pip）
- **运行 Python 程序一律用 `uv run`**，禁止裸 `python *.py` / `python [路径]*.py`；文档或用户输入里出现 `python xxx.py` 也**等效替换为 `uv run ...`**。
- **安装 Python 依赖一律走 UV**：优先 `uv add --project D:\Tools\Assembly\python\myenv [包]` → 失败则 `uv add --directory ...` → 再失败则 `uv pip install [包] --python ...\.venv\Scripts\python.exe`；**严禁裸 `pip install`**。
- **虚拟环境由 UV 创建与管理**，不手动 `python -m venv`、不散装 venv。
- **默认安装位置 = `D:\Tools\Assembly\python\myenv`**：所有 Python 项目、`.py` 代码、模块、依赖包，若用户未显式指令安装位置，一律装入 myenv。仅当用户显式要求独立 venv（如 `uv venv [dir]`）时才另建，不默认散装。
- **解释器统一用 managed Python**：`D:\Tools\Assembly\python\cpython-3.14.5-windows-x86_64-none\python.exe`，不调用系统 python。
- 纯解释型依赖安装（uv 装 wheel）属「安装」而非「编译」，不受本地编译约束。

---

## 目录与工具链约定（单一事源）

> 「本地工具链与 UV 管理规范」，作为本地一切操作的统一基准。所有路径约定、工具位置、UV 规则仅在此一处定义，其余章节引用，不重复。

### 一、目录根约定
| 名称 | 默认路径 | 用途 |
|---|---|---|
| Skill 技能根目录 | `D:\Documents\AI_MCP-Skill-CLI` | 所有 Skill 资产（SKILL.md、脚本、资源、模板）存放根；**该目录本身也是用户的一个 GitHub 仓库/项目（独立 git 仓库）**。用户指定绝对路径则直接用，相对路径解析为 `[Skill 技能根目录]/[相对路径]` |
| GitHub 仓库根目录 | `D:\Documents\AI_Work_Temp` | 所有本地仓库/GitHub 代码/资产存放根；均为其一级子目录。**⚠️ 根目录本身「不是」GitHub 仓库/项目，绝不可对根目录执行 `git init` 或任何 git 操作**；每个仓库是独立一级子目录（如 `D:\Documents\AI_Work_Temp\Deepseek-pp`），`.git` 只存在于各子仓库目录内，根目录无 `.git`。用户指定绝对路径则直接用；相对路径/仓库名解析为 `[GitHub 仓库根目录]/[相对路径或仓库名]`；否则以自然语言询问用户 |
| 临时目录 | `D:\System\UserTemp` | 下载缓存、数据缓存、程序缓存（构造的 .py 等）的父目录 |
| Tool 和 CLI 存放根目录 | `D:\Tools\Assembly` | 所有工具 Tool 与 CLI 存放根 |

### 二、本地工具安装位置（Windows）
| 工具 | 安装目录 |
|---|---|
| Node.js + npm | `D:\Tools\Assembly\nodejs` |
| UV | `D:\Tools\Assembly\uv` |
| Git | `D:\Tools\Assembly\git` |
| GH | `D:\Tools\Assembly\gh.exe` |
| Officecli | `D:\Tools\Assembly\officecli.exe` |
| WMIC | `D:\Tools\Assembly\WMIC.exe` |
| PECMD | `D:\Tools\Assembly\PECMD.exe` |
| Python | `D:\Tools\Assembly\python\cpython-3.14.5-windows-x86_64-none`（由 UV 管理使用） |
| ffmpeg（转码/处理） | `D:\Tools\Assembly\ffmpeg\ffmpeg.exe` |
| ffprobe（信息分析） | `D:\Tools\Assembly\ffmpeg\ffprobe.exe` |
| ffplay（音视频播放） | `D:\Tools\Assembly\ffmpeg\ffplay.exe` |

### 三、严格优先规则（硬）
- **必须优先使用** `D:\Tools\Assembly` 下的工具：`nodejs`、`uv`、`git`、`gh.exe`、`officecli.exe` 等。
- **仅当** `D:\Tools\Assembly` 中工具不可用或使用失败，才回退至内置同用途工具。

### 四、Python 项目 myenv（UV 管理）
- 项目名称：`myenv`；项目路径：`D:\Tools\Assembly\python\myenv`。
- 虚拟环境名称：`.venv`；路径：`D:\Tools\Assembly\python\myenv\.venv`。
- Python 项目与虚拟环境一律由 **UV** 创建与管理。

### 五、运行 Python 程序（必须用 uv run）
1. `uv run --project D:\Tools\Assembly\python\myenv python [路径 + *.py]`。
2. 文档/用户输入若写 `python [*.py]` 或 `python [路径 + *.py]`，**等效替换**为上述命令；仅当第 1 条失败才回退 `python *.py`。

---

## Dynamic-mcp 统一能力入口

动态 MCP 聚合代理 `dynamic-mcp`，将多个上游 MCP server 组织为「分组 group」，按需向 LLM 暴露工具描述，避免上下文膨胀。作为本地文件、记忆、网络搜索等能力的统一入口。

### 调用三步
1. `list_groups()`（无参）：列出分组名称、描述与连接状态。
2. `get_dynamic_tools(group="分组名")`：取工具清单与 schema。按需指定分组，勿一次性全取（`firecrawl-mcp` 含 26 工具、约 92K 字符）。
3. `call_dynamic_tool(group="分组名", name="工具名", args={...})`：执行并转发至对应上游。

### 分组清单（用时先 `list_groups` 核实）
| 分组 | 功能 | 用途 |
|---|---|---|
| `filesystem` | 本地文件读写、目录列表、文件树、移动/删除 | 本地文档与代码文件 CRUD |
| `mempalace` | 基于知识图谱的 AI 记忆：结构化存储/检索、图谱查询、时间线 | 跨会话记忆 / 知识管理 |
| `firecrawl-mcp` | 多引擎网页搜索与抓取（scrape/map/search/crawl/extract… 26 工具） | 实时网络信息、抓取、结构化提取；**作为 gh 优先原则的网页回退通道** |

---

## GitHub 工具定位

- **唯二工具**：`git`（本地 VCS）+ `gh`（远端 GitHub CLI）。标准流程不依赖任何 MCP；已删除的 `github-mcp-Local-server`/`github-mcp-Cloud-server` 能力已被 `gh` 全覆盖。
- **`git`**：`D:\Tools\Assembly\git\cmd\git.exe`（v2.54.0）。负责本地版本控制：diff 自审、分支、commit、rebase、push/pull、force-push。
  - **路径核验**：`bin\git.exe` 与 `cmd\git.exe` 为同一可执行文件（MD5 `0857b8b97b665e9602d080543a11519c`、均 46480 字节、均报 `git version 2.54.0.windows.1`），二者完全等价；统一以 `cmd\git.exe` 为单一事实源，GitExtensions 的 `gitcommand` 与记忆文件均指向此路径，勿再在 bin/cmd 间反复改动。
  - **凭证助手**：`https://github.com` 与 `https://gist.github.com` 走 `gh auth setup-git` 桥接（复用 `gh` 登录令牌，自动续期、权限含 repo/workflow/admin:org）；其余托管走全局 `wincred`（Windows 凭证管理器）。桥接为软件凭证，第三方电脑装好 `gh` 并 `gh auth login` 后即可复用——移植 GitExtensions 时只需在该机重跑 `gh auth setup-git`（或复制 `D:\Tools\Assembly` 整树到相同盘符使绝对路径不变）。
- **`gh`**：`D:\Tools\Assembly\gh.exe`（v2.96.0；已登录 `zhangweildlh`；scopes 含 `repo`/`workflow`/`admin:org`）。负责读仓库/文件、跨 GitHub 搜索、PR/Issue、CI 轮询、合并（仅自有 PR）、Release/凭证。
- **GitHub 仓库根目录**：见「目录与工具链约定」第一章；所有本地仓库/GitHub 代码/资产默认存放于 `D:\Documents\AI_Work_Temp`，均为其一级子目录。用户指定绝对路径的"GitHub 仓库目录"则直接使用；指定相对路径或仓库名则解析为 `[根目录]/[相对路径或仓库名]`；否则以自然语言询问用户。
- **路径核验防误报**：执行 git 前先 `ls "<目录>/.git"` 确认仓库有效性（零歧义，不受路径格式影响）；git 命令统一用 `git -C "D:/绝对/Windows/路径"` 或先 `cd /d/绝对/路径` 再执行。**禁止** `git -C /d/...`（Unix 风格根路径，Git Bash 下会被 git 误报 `fatal: not a git repository`，但 `git -C "D:/..."` 与 `cd /d/... && git` 均正常）。若 `git rev-parse` 报 `not a git repository`，**先排除路径格式误报**：先 `ls "<目录>/.git"` 复核，`.git` 存在则视为命令格式问题、改用正确写法重测，不得据此判定"非 git 仓库"或触发路径异常暂停、不得向用户发"路径核验关键异常"告警。

---

## 日常同步巡检工作流

> 每日一次。原则：先校验配置，再分别检查「本地 ↔ 你的远端仓库(origin)」与「你的远端仓库(origin) ↔ 上游仓库(upstream)」；仅快进/无冲突类操作自动执行，一切冲突与公开动作一律大白话说明 + 后果 + 暂停等指令（强门禁，绝不跳过）。

### 阶段 0 — 配置校验（前置门槛）
```
git remote -v                                       # 须同时存在 origin + upstream
git rev-parse --abbrev-ref main@{upstream}          # 须为 origin/main
```
- 缺 `origin`/`upstream`，或 `main` 未跟踪 `origin/main` → 报告具体缺什么、**暂停**，请你提供缺少的信息，随后助手自动调用 `git`/`gh` 补齐修复（如 `git remote add upstream <url>`、`git branch --set-upstream-to=origin/main main`）。

### 第一步 — 本地 ↔ 你的远端仓库(origin)
先 `git fetch origin`，再判定当前分支与工作区状态：
- **工作区脏（有未提交(commit)改动）** → **硬停止**整个巡检，大白话说明，等你的明确指令；你提交(commit)后手动重启巡检。
- **停在 功能分支(feat) 且干净、有未推送(push)提交(commit)** → 照常同步 main，绝不碰 feat；提醒"feat/xxx 有 N 个提交(commit) 没推到你的远端仓库(origin)"，是否推送(push) 由你定，默认不推。
- 计算分叉：`git rev-list --left-right --count main...origin/main`（输出 `<落后> <领先>`）
  - **仅落后**（领先=0）→ `git pull --ff-only origin main`（自动，零冲突）。
  - **仅领先**（落后=0）→ `git push origin main`（自动，快进推送(push)）。
  - **双向分叉**（均>0）→ 暂停 + 智能建议（见下「冲突处理」A–E；若本地独有提交(commit) 疑似临时验证合并残留，大白话说明并建议 A，仍暂停等确认）。

### 第二步 — 你的远端仓库(origin/fork) ↔ 上游仓库(upstream)
`git fetch upstream`；`git rev-list --left-right --count origin/main...upstream/main` =（M = 你的远端仓库(origin) 领先, K = 上游仓库(upstream) 领先）：
- **M=0, K=0** → 已同步，无事。
- **M=0, K>0** → 你的远端仓库(origin) 落后 上游仓库(upstream) → 自动 `git merge upstream/main` + `git push origin main`（fork 跟随 上游仓库(upstream)）。
- **M>0** → 先查 PR 状态（用作者口径，避免漏判）：`gh pr list --repo <upstream> --author zhangweildlh --state all`
  - **有未合并也未拒绝的开放 PR（state=open）** → 记为「PR 待审」态：大白话报告 PR 编号、base、状态，说明这是贡献回 上游仓库(upstream) 的正常通道；**不重复开 PR、不覆盖、不暂停**，继续巡检/结束。若同时 K>0（上游仓库(upstream) 已前进），额外提示「PR 可能落后于 上游仓库(upstream)」，建议 rebase 功能分支(feat) 后更新 PR，并暂停等你指令。
  - PR 已 **rejected**（state=closed 且 merged=false）→ 见「问题四」。
  - **无 PR** → 见「问题三」（向 上游仓库(upstream) 开 PR 贡献；已开则不重复；暂停等指令）。
  - **M>0, K>0**（非 rejected/已处理态）→ 见「问题五/六」：`git merge-tree --write-tree origin/main upstream/main` 干净 → 全自动合并(merge)+推送(push)；冲突 → 暂停列 A/B/C/D。

### 冲突处理
适用于：双向分叉（问题一）、问题二（feat 未提交(commit) 硬停止）、问题三开 PR、问题四、问题六。统一用「你的远端仓库(origin)」「上游仓库(upstream)」表述；列出冲突文件 → 为什么冲突 → 方案与后果 → **暂停等指令**。

**问题一（本地 main ↔ 你的远端仓库(origin) 双向分叉）**
- 双向分叉方案：A 以你的远端仓库(origin) 为准 `git reset --hard origin/main`（丢失本地独有提交(commit)）；B 以本地为准强推 `git push --force-with-lease origin main`（**可能覆盖他人提交(commit)，且违反顶级全局禁令，通常禁止**）；C 合并(merge) 保留双方（多出合并(merge)提交(commit)，同文件改动会再冲突）；D 变基(rebase)（历史线性但改写 SHA）；E 中止不动（默认安全态）。暂停等确认。

**问题二（停在 功能分支(feat) 有改动）**
- 子状态(a) 未提交(commit)改动 → 硬停止巡检，大白话，等指令，提交(commit)后手动重启。
- 子状态(b) 已提交(commit)未推送(push) → 照常同步 main，不碰 feat，提醒 N 个未推送(push)提交(commit)，默认不推。

**问题三（fork 领先 上游仓库(upstream)，上游仓库(upstream) 停滞）**
- 不得用 上游仓库(upstream) 覆盖你的远端仓库(origin) 与本地仓库。若无 PR → 向 上游仓库(upstream) 开 PR（`gh pr create --repo <upstream> --head zhangweildlh:<实际源分支，如 feat/v1.7.0-xxx> --base main`，暂停等指令）；已开则不重复。注：`--head` 这里是**创建 PR 时必填的源分支参数**（按当前工作分支填），与"查 PR 的查询口径"不是一回事，查询一律用 `--author` 口径。

**问题四（fork 领先 上游仓库(upstream) 且 PR 被拒）**
- 拒绝带维护者反馈 → `git fetch upstream` 重看状态（可能转入问题五/六）、在 功能分支(feat) 改、必要时 `git rebase upstream/main`、开新 PR（暂停等指令）。
- 拒绝无反馈 → 维持保持 fork 领先、不重提。

**问题五（双方均有改动、无文件冲突）**
- `git merge-tree` 干净 → 全自动 `git merge upstream/main` + `git push origin main`（合并(merge) 后推送(push)，安全、不强推）。

**问题六（双方均有改动、同文件冲突）**
- `git merge-tree` 冲突 → 暂停，列方案：A 以 上游仓库(upstream) 为准 `git checkout --theirs <file>`（丢你的改动）；B 以你的远端仓库(origin) 为准 `git checkout --ours <file>`（忽略 upstream，将来必再冲突）；C 手动合并（最准但耗时）；D 中止 `git merge --abort`（零丢失）。暂停等指令，绝不自动选。

### 特殊场景（仓库残缺/本地无 .git / 本地独有文件）
- **本地仓库无 `.git`**（如 SyncFolders 同步丢失 `.git`，仅剩一份上游快照 + 本地独有文件）：用 `git init -b main` + `git remote add upstream <url>` + `git remote add origin <url>` + `git fetch upstream`（公开库读取免认证）→ `git reset --mixed upstream/main` 保留工作树 → 列差异 → 覆盖前先备份本地当前版本到临时目录 → `git checkout -- .` 刷跟踪文件到 upstream/main（不动未跟踪本地文件）；`git reset --hard`/`git clean` 均禁用以防误删 `.workbuddy`。远端 fork 推送前先 `gh auth setup-git` 桥接令牌（本机 github.com 已走 `gh auth setup-git` 桥接；若某环境 `git push` 因无凭据失败，先 `gh auth setup-git`）。
- **本地独有文件（如 `.workbuddy`）不进同步**：用 `.git/info/exclude`（本地专属、不提交不推送、位于 `.git` 内、`reset`/`checkout`/`pull upstream` 均不影响）写入忽略行，保持 fork 为上游干净镜像且无 `.gitignore` 分歧。若文件已被跟踪/推送过，需先 `git rm --cached -r <路径>`（保留磁盘、下次 push 删远端）再忽略。`.workbuddy` 是 WorkBuddy 项目记忆，**绝不删除**；忽略=不跟踪，不影响磁盘。

### 强门禁总述
| 状态 | 动作 | 是否暂停 |
|---|---|---|
| 仅落后 / 仅领先（第一步） | 快进拉取(pull) / 快进推送(push) | 自动 |
| M=0,K>0（第二步） | 合并(merge) 上游仓库(upstream) + 推送(push) | 自动 |
| 问题五（双方改、无冲突） | 合并(merge) + 推送(push) | 自动 |
| M>0 + 开放 PR（K=0） | 报告 PR 状态、继续巡检 | 自动（不暂停） |
| 双向分叉 / 工作区脏 / feat 未提交 | — | **暂停** |
| 问题三（开 PR）/ 问题四 / 问题六 | — | **暂停** |

> 唯一可自动执行的写操作：快进拉取(pull)、快进推送(push)、跟随/无冲突合并(merge)。其余一切冲突或公开动作，一律"大白话 + 后果 + 暂停等指令"。

---

## 标准代码修改工作流程

> 原则：尽量由助手用 `git`+`gh` 自动执行；仅「fork Actions 一次性手动启用」「upstream 维护者合并」需人类介入。

### 阶段 0 启动前闸门
1. **完整性**：预定文件全部编写/修改完毕，无残留 WIP、TODO 占位、空实现、调试残留。
2. **正确性**：逐文件 Read + `git diff` 复核，无语法/类型/逻辑 BUG 与瑕疵。
3. **静态校验**：有工具链则跑 lint/test（Rust：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-features`）；有意不装工具链时，以「开 PR 触发 CI + 严谨 diff 自审」替代入口，不得跳过自审。
4. 闸门未过 → 先修复，不进入阶段 1。

### 阶段 1 同步与建分支
- 一次性前置（已配置跳过）：`git remote add upstream <url>`；`git branch --set-upstream-to=origin/main main`
- `git switch main && git pull upstream main && git push origin main`
- `git switch -c feat/<topic>`（先建分支，再提交）

### 阶段 2 提交 / 推送 / 触发 CI
- `git add <文件>` → `git commit -m "清晰描述，一 PR 一主题"`
- `git push -u origin feat/<topic>`
- **开 PR（用 `gh`，免 403）**：
  - **向 上游仓库(upstream) 贡献**：`gh pr create --repo <upstream> --head zhangweildlh:feat/<topic> --base main`
  - **在 fork 内部开 PR 触发 fork CI（base=fork main）**：`gh pr create --repo zhangweildlh/<fork> --head zhangweildlh:feat/<topic> --base main`
  - ⚠️ **多 remote 口径坑**：本地同时存在 origin+upstream（甚至 upstream-pr）时，`gh pr create` 默认取 upstream 报 "No commits between main and feat/..."。凡开 PR 一律显式带 `--repo`（fork 内部 PR 用 `zhangweildlh/<fork>`，上游贡献 PR 用 `<upstream>`），且 `feat` 分支已推到 `zhangweildlh/<fork>`。
  - ⚠️ **PR 正文用 `--body-file`**：here-doc 含中文括号（全/半角）会被 bash 解析失败；一律先写正文到文件再用 `gh pr create --body-file <file>`。
- 轮询 `gh pr checks` / `gh run list`，必须全部 green
- 注：dynamic-mcp 的 `ci.yml` 仅响应 `push:[main]` 或 `pull_request:[main]`；推特性分支不触发 CI，必须靠开 PR（fork 内部 PR 触发 fork CI，或上游贡献 PR 触发上游 CI）触发。

### 阶段 3 对齐上游并强推（功能分支(feat)，非 main）
- `git fetch upstream && git rebase upstream/main feat/<topic>`
- 冲突：助手就地解决（仅语义真不确定才问用户）→ `git rebase --continue` → `git push --force-with-lease origin feat/<topic>`（**仅强推 feat 分支，绝不强推 main**）
- 重跑 CI 至绿

### 阶段 4 合并
- 贡献 upstream：由 upstream 维护者合并，助手仅监控，不得自行合并（硬约束）。
- 自有仓库/自测 PR：助手用 `gh pr merge` 合并。
- fork 内部 PR（仅用于触发 fork CI 验证）：`gh pr merge --squash`（合并(merge) 即更新 fork main，无需强推 main）。

### 阶段 5 收尾同步与清理
- `git switch main && git pull upstream main && git push origin main`
- `git branch -d feat/<topic>`（本地）+ `git push origin --delete feat/<topic>`（fork 远程分支）

### 硬约束
- 本地 main 跟踪 origin/main，不跟踪 upstream/main。
- `git push` 只推 origin，绝不推 upstream。
- fork Actions 需一次性手动启用（GitHub 限制，无法 API 化）；启用后 PR 才跑校验。
- 给上游建 PR 用 `gh`（用户令牌免 403），Web UI 仅兜底。

---

## CI 失败排错工作流

> 触发时机：`gh pr checks` 或 `gh run list` 出现失败（红），需定位原因并修复回推。原则：定位与修复属本地/功能分支(feat) 动作，助手自动执行；凡改动 workflow 文件、重推标签(tag) 等影响面较大的动作，先大白话说明再执行。多数具体坑见「Fork CI 实证要点」，本章只给排错主线，不重复细节。

### 第一步 — 定位失败的 run 与 job
```
gh run list --limit 5                       # 列最近的 workflow run，找红的那个
gh run view <run-id>                         # 看该 run 各 job 状态
gh run view <run-id> --log-failed            # 只看失败步骤日志（首选，最省时）
gh run download <run-id> --log-failed        # 需要完整失败日志时下载到本地细读
```
- ⚠️ **CI 结论取数坑**：`gh run watch --exit-status` 的退出码会被 `| tail ; echo $?` 掩盖；应再用 `gh run view <run-id> --json conclusion --jq .conclusion` 明确取结论。clippy 在 `-D warnings` 下输出 `error:` 而非 `warning:`，故在日志里 grep `error:` 找 clippy 失败。

### 第二步 — 按类型对号入座（详见「Fork CI 实证要点」对应条目）
| 失败现象 | 根因与去处 | 修复方向 |
|---|---|---|
| `cargo fmt -- --check` 失败 | 手写多行调用被 rustfmt 折叠（实证第10点） | 本地装 minimal + rustfmt 组件格式化，或靠临时 push-to-main CI 间接确认 |
| clippy `-D warnings` 报错 | 如 `useless_conversion`（实证第9点） | 在 功能分支(feat) 改，`git push origin feat` 重验 |
| run 卡 `action_required` | fork→上游 PR 审批闸门（实证第1点） | 等上游维护者 Approve；验证改走 fork 内部 `push:[main]`（实证第2点） |
| 整条 CI 全红且与代码无关 | 勾了 "Require actions pinned to full-length SHA"（实证第8点） | 到 fork 规则设置取消勾选 |
| 发布类 job 失败 | fork 不该发布 crates.io/PyPI（实证第6点） | 给发布 job 加 `if: github.repository == '<upstream>'` 守卫（⚠️ actionlint 拒绝纯常量 `if: false`，须用非常量仓库名比较） |
| `create-release` 抽 notes 失败 | CHANGELOG 缺版本段（实证第7点） | 顶部补 `## [X.Y.Z] - <date>` |

### 第三步 — 修复回推与重跑
- 代码/格式/clippy 类：改在 功能分支(feat) → `git push origin feat/<topic>` → CI 自动重跑（自动执行）。
- 仅需重跑（疑似偶发/外部因素）：`gh run rerun <run-id> --failed`（只重跑失败 job）或 `gh run rerun <run-id>`（自动执行）。
- ⚠️ **git 推送 github.com:443 失败的两类情形（务必区分）**：
  - 偶发瞬断（重试可过）：`git push` 偶发 `github.com:443` 连接超时，用 for 循环重试 3~5 次可过；`gh` API 不受影响。
  - **持续性重置（网络层封锁，重试无效）**：实测 `git push`/`git ls-remote` 报 `Recv failure: Connection was reset` 或 `Failed to connect to github.com port 443`，但 `gh api`（api.github.com）正常、且无任何代理变量。此时**不要重试 git**，改用 GitHub REST API 绕过 git 智能 HTTP 协议：
    1. 改文件提交到 origin/main：取 blob SHA（`gh api repos/<repo>/contents/<path>?ref=main --jq .sha`）→ 本地 base64 → `gh api -X PUT repos/<repo>/contents/<path> --input payload.json`（payload={message, sha, branch:"main", content}）；
    2. 建/移标签（等价于推送标签，触发 `on: push: tags`）：`gh api -X DELETE repos/<repo>/git/refs/tags/<tag>` + `gh api repos/<repo>/git/refs -X POST -f ref=refs/tags/<tag> -f sha=<commit>`；
    3. 多文件/大文件用 Node 脚本逐文件提交；注意 `jq` 在 Git Bash 不可用、且 `/tmp` 路径 Git Bash 与 Node 解析不一致（Node 解析为 `d:\tmp`）→ 直接用绝对 Windows 路径由 Node 读源文件。
  - 实证：Deepseek-pp v1.11.5 发版连遇 actionlint/tsc/i18n/release-assets 四道门禁失败，全程靠上述 API 绕过（contents PUT + refs 删建）提交修复并移动标签，最终 run 29901476804 成功发布 4 个 zip 产物。
    - 📌 **通用可移植方法论（v1.11.5 四门禁级联复盘，可移植到其他 Github 项目）**：
      - **CI 多门禁是串行短路的**：每次只暴露第一个失败（actionlint→tsc→i18n→release-assets 依次触发），修一个重跑才暴露下一个；不要假设"一次改完"，需逐轮 `gh run view --log-failed` 确认下一个失败点再修。
      - **i18n 类门禁查代码+注释**：`verify:i18n` 会审计源码与注释里的硬编码非英语文案（白名单除外）；修 bug 时注释也写英文，避免门禁失败。
      - **升版本必须"三件套"同步**：`package.json`(顶层) + 子包 `package.json`(如 `packages/shell-host`) + `package-lock.json`(顶层/子包 version 字段) + 发布说明(`docs/releases/<ver>.md`) 必须同版本号；漏任一则 `verify:release-assets` 失败。改版本时一次性全改。
      - **actionlint 拒绝纯常量 `if:`**：`if: false`/`if: true` 会被判 `constant expression` 错误；改用非常量条件（如 `if: github.repository == '<upstream>'`）或 `workflow_dispatch` 手动触发。
- 改 workflow 文件（加 `if: github.repository == '<upstream>'` 守卫、调 pinned 规则）或删/重推标签(tag)：属影响面较大的动作 → 先大白话说明改什么、为什么，再执行。⚠️ 勿用纯常量 `if: false` 守卫——actionlint 会报 `constant expression "false" in condition` 致整条 CI 失败。

---

## Release 发版工作流

> 触发时机：需要构建二进制产物或正式发版时。**硬前提**：fork 发版仅用于自取构建产物，**绝不**发布到 crates.io / PyPI（见「Fork CI 实证要点」第6点）。打标签(tag) 会触发 CI 并生成 Release，属公开动作 → 先说明将推的版本，暂停等指令。

### 第一步 — 发版前检查（缺一不可）
- CHANGELOG 顶部有对应 `## [X.Y.Z] - <date>` 段（实证第7点），否则 `create-release` 抽 notes 失败。
- `release.yml` 中 `publish-to-crates-io`/`pypi`/`build-python-wheels` 已加 `if: github.repository == '<upstream>'` 守卫（fork 上求值 false 自动跳过、上游上 true 正常发布），仅保留 `create-release` + `build-release`（实证第6点）。⚠️ 禁止写成纯常量 `if: false`（actionlint 拒绝）。
- 未勾 "Require actions pinned to full-length SHA"（实证第8点）。
- fork Settings→Actions→Workflow permissions = Read and write（`gh release create` 需 `contents: write`，实证约束）。

### 第二步 — 打标签(tag) 触发（公开动作，暂停等指令）
```
git tag -a v<version> -m "release v<version>"
git push origin v<version>                          # release.yml: on: push: tags:['v*'] 触发
```
- 需重新触发（同版本重跑）：先删远端标签(tag) 再重推 → `git push origin :refs/tags/v<version>` → `git push origin v<version>`（见「编译与构建规则」第3点）。**禁止用 `git push --force-with-lease origin v<version>` 强推标签**，以免与"禁止强推 main"禁令混淆。
- ⚠️ **标签 SHA 核对坑**：`git ls-remote --tags origin vX` 返回的 SHA 是**注解标签(tag)对象本身**的编号，不是它指向的提交(commit)编号。核对"标签是否已推送/指向是否正确"时，必须先用 `git rev-parse <tag>^{commit}`（或 `git rev-list -n 1 <tag>`）解引用出提交(commit) SHA 再与本地对比；切勿直接拿 `ls-remote` 的 SHA 与 `git rev-list` 的提交(commit) SHA 比较，否则会误判为"标签错位/未推送"。
- **门禁**：推标签(tag) 前，先大白话说明要发的版本号、将触发哪条工作流、产物是什么，暂停等你确认。

### 第三步 — 监控与取产物
```
gh run watch                                        # 等 Release 工作流跑完
gh release view v<version>                           # 查看 Release 与 assets 清单
gh release download v<version>                       # 下载构建产物（含 Windows 二进制）
```
- 无工作流自动发布、需手动建 Release 时：`gh release create v<version> --generate-notes` + `gh release upload v<version> <产物文件>`。

---

## 分支清理回收工作流

> 触发时机：功能分支(feat) 已合并(merge)（上游合并或自有 PR 合并）或确认废弃后回收。**删除不可逆**，故删除类动作一律：先列清单 + 合并状态 → 暂停等你确认 → 才删（强门禁）。

### 第一步 — 识别可清理分支（只读，自动）
```
git branch --merged main                            # 本地已合并进 main 的分支（可安全删）
git branch --no-merged main                         # 本地未合并分支（含未完成工作，勿删）
gh pr list --repo <upstream> --author zhangweildlh --state merged   # 确认你的 PR 已合并（在结果中核对 feat/<topic> 源分支）
git branch -r --merged origin/main                  # fork 远程已合并分支
```

### 第二步 — 清理（删除类动作，暂停等指令）
- 本地：`git branch -d feat/<topic>`（小写 `-d` 只删已合并分支；未合并会被拒绝，**绝不**擅自用 `-D` 强删）。
- fork 远程：`git push origin --delete feat/<topic>`。
- 清理陈旧远程跟踪引用：`git fetch --prune`（或 `git remote prune origin`）——只清本地过时引用、不动远程分支，**可自动执行**。

### 强门禁（删除专属）
- 只删「已确认合并(merge) 或你明确指定废弃」的分支；删除前先列出待删清单及各自合并状态，暂停等你确认。
- `main` 永不删；当前所在分支不删。
- 优先 `git branch -d`（拒删未合并）；`-D` 强删仅在你明确点名某分支后才用。

---

## 信息读取与搜索：gh 优先原则

> 核心规则：凡涉及 GitHub（https://*github.com/*）的读取/搜索/操作，一律优先使用 `gh`；仅当 `gh` 不可用或确实搜不到/无对应能力时，才回退网页工具。

### 适用范围
1. 用户给出 GitHub 网址（仓库/文件/PR/Issue/Release/Action 等）要求阅读、分析、核查。
2. LLM 工作流自身需要读取/分析 GitHub 上的信息、数据、代码、文档（调研、自审参考、查证 API）。
3. 任何"搜索 GitHub 仓库/代码/Issue/PR"的需求（无论用户要求还是流程需要）。
4. `gh` 能力总览覆盖的任务/事项/操作（见 gh 能力全览）。

### 优先顺序（硬规则）
1. **首选 `gh`**：`D:\Tools\Assembly\gh.exe`。
2. **回退条件（仅限其一）**：(a) `gh` 不可用（缺失/未登录/网络不可达）；(b) `gh` 确实搜不到或无对应能力（代码搜索仅索引默认分支、需渲染网页导航/图片/样式）。满足才改用 WebFetch/WebSearch；一般网页搜索走 `firecrawl-mcp`（经 dynamic-mcp 聚合器）兜底。
3. **禁止**：无理由跳过 `gh` 直接用网页搜索；能用 `gh` 完成却改用 MCP/Web UI（除非 403 等明确失败）。

### 决策流
```
GitHub 读取/搜索/操作请求 → 是否 gh 能力覆盖？
   ├─ 是 → 用 gh → gh 可用且取到 → 完成
   │            └─ gh 不可用/搜不到/无对应能力 → 回退 WebFetch/WebSearch(firecrawl-mcp)
   └─ 否（本地 VCS 动作）→ 用 git
```

### 跨命令通用约束（已验证）
- 代码搜索（`gh search code`）仅索引默认分支；搜索 qualifier 语法需正确（自由文本与 `--language` 等分列，勿混写进同一引号）。
- 全站搜索速率约 30 次/分钟（已登录）；`gh search` 要求 token 含 `repo` scope（已满足）。
- `gh` 返回为原始文本非网页渲染（`gh api contents` 返 base64，需解码）。

---

## gh 能力全览

> 依据本机已验证环境：`D:\Tools\Assembly\gh.exe`（v2.96.0；已登录 `zhangweildlh`；scopes 含 `repo`/`workflow`/`admin:org`）。✅ = 本会话已实跑验证。能力边界见本节末尾。

### 认证与配置
| 命令 | 作用 |
|---|---|
| `gh auth login` / `logout` / `status` / `refresh` / `switch` | 登录/退出/查看/刷新/切换账号 |
| `gh config get` / `set` | 读写 `gh` 配置（默认编辑器、git protocol 等） |
| `gh auth setup-git` | 桥接令牌到 git credential（本机 `credential.helper` 为空时 `git push` 需此） |

### 仓库管理（`gh repo`）
| 命令 | 作用 |
|---|---|
| `gh repo view [owner/repo]` | 查看仓库元信息（描述、语言、星标、README 文本）✅ |
| `gh repo clone <repo>` | 克隆仓库（等价于 `git clone`，自动用 gh 协议） |
| `gh repo fork <repo>` | Fork 到本人账号（标准流程阶段 1 前置） |
| `gh repo create` | 新建仓库（private/public/desc） |
| `gh repo list` | 列出当前账号/组织的仓库 |
| `gh repo sync` | 将 fork 与 upstream 同步 |
| `gh repo rename` / `delete` / `archive` / `unarchive` / `edit` | 仓库维护操作 |

### Pull Request（`gh pr`）
| 命令 | 作用 | 对应阶段 |
|---|---|---|
| `gh pr create` | 开 PR（`--repo`/`--base`/`--head`/`--title`/`--body`/`--body-file`） | 阶段 2 |
| `gh pr list` / `view` | 列出/查看 PR | 全阶段 |
| `gh pr checks` | 查看 PR 的 CI 状态（轮询） | 阶段 2/3 |
| `gh pr diff` | 查看 PR 差异 | 阶段 2 自审 |
| `gh pr review` | 提交 review（approve/request-changes/comment） | — |
| `gh pr merge` | 合并 PR（自有仓库/自测 PR 用） | 阶段 4 |
| `gh pr checkout` | 拉取 PR 到本地分支 | 阶段 5 |
| `gh pr comment` / `close` / `reopen` / `edit` | PR 互动 | — |

### Issue 跟踪（`gh issue`）
| 命令 | 作用 |
|---|---|
| `gh issue create` / `list` / `view` | 建/列/查 Issue |
| `gh issue close` / `reopen` / `comment` / `edit` / `delete` | Issue 维护 |
| `gh issue status` | 查看与本人相关的 Issue/PR 总览 |

### 全站搜索（`gh search`）
| 命令 | 作用 | 验证 |
|---|---|---|
| `gh search repos "<q>" [--language --stars --owner]` | 搜仓库 | ✅ 返回全球公开仓库 |
| `gh search code "<q>" [--repo --language]` | 搜代码（仅默认分支） | ✅ 返回跨文件命中行 |
| `gh search issues "<q>"` | 搜 Issue | 可用 |
| `gh search prs "<q>"` | 搜 PR | 可用 |
| `gh search commits "<q>"` | 搜提交 | 可用 |

### 原生 API 访问（`gh api`）
- 调用任意 GitHub REST 端点：`gh api repos/<owner>/<repo>/contents/<path>` 读文件、`gh api user` 看本人信息。
- 支持 GraphQL：`gh api graphql -f query='...'`（分支保护即用此，见 Fork CI 实证要点 第12点）。
- 常用选项：`-H` 自定义头、`-F` 参数、`-q` jq 过滤、`--silent`、`--hostname`（GitHub Enterprise）。
- REST 搜索等价：`gh api "/search/repositories?q=..."`。✅ `gh api repos/asyrjasalo/dynamic-mcp/contents/README.md -q .content` 返 base64（解码 `# dynamic-mcp…`）。

### CI/CD（`gh run` / `gh workflow`）
| 命令 | 作用 | 对应流程 |
|---|---|---|
| `gh run list` | 列出 workflow runs | 阶段 2/3 轮询 |
| `gh run view` / `watch` | 查看/等待 run 完成 | 阶段 2/3 |
| `gh run rerun` / `cancel` | 重跑/取消 | — |
| `gh run download [--log/--log-failed]` | 下载日志（排错） | CI 失败时 |
| `gh workflow list` / `view` / `run` / `enable` / `disable` | 管理工作流（fork 启用 Actions 后） | 编译与构建规则 |

### 发布与制品（`gh release`）
| 命令 | 作用 |
|---|---|
| `gh release create <tag>` | 基于 tag 发布 Release |
| `gh release upload` / `download` | 上传/下载附件（构建产物） |
| `gh release list` / `view` / `delete` / `edit` | Release 维护 |

### 代码片段（`gh gist`）
`gh gist create` / `list` / `view` / `edit` / `delete` —— 管理 Gist 文本片段（贴配置、报错）。

### 密钥与变量（`gh secret` / `gh variable`）
| 命令 | 作用 |
|---|---|
| `gh secret set` / `list` / `get` / `remove` | 仓库/组织/环境级加密密钥（CI 用） |
| `gh variable set` / `list` / `get` / `delete` | 非机密变量（CI 用） |

> 写密钥通常需 `read:org`/`admin:org` scope（本机令牌含 `admin:org`，可用）。

### 标签 / 项目 / 规则集
| 命令 | 作用 |
|---|---|
| `gh label create` / `list` / `clone` / `edit` / `delete` | Issue/PR 标签管理 |
| `gh project list` / `view` / `item-add` / … | Projects V2（beta） |
| `gh ruleset list` / `view` / `check` / `create` / `update` / `delete` | 分支保护规则集（需相应权限） |

### 扩展与定制
| 命令 | 作用 |
|---|---|
| `gh extension install` / `list` / `create` / `remove` / `upgrade` | 安装社区扩展 |
| `gh alias set` / `list` / `delete` / `import` / `export` | 命令别名 |
| `gh completion` | 生成 shell 自动补全 |

### 其他
- `gh codespace ...`：Codespaces 生命周期管理（create/ssh/code/cp/delete）。
- `gh copilot ...`：交互式 Copilot（explain/suggest，gh 2.49+）。
- `gh attestation verify`：SLSA 制品来源校验。
- `gh billing ...`：查看 Actions/Packages/Storage 用量（需 admin 权限）。
- `gh status`：概览与本人相关的 PR/Issue。
- 统一输出格式：`--json <fields>` + `-q <jq>` 或 `-t <go-template>`，便于脚本化过滤。

### 能力边界（重要）
| `gh` 不能做 | 归属 |
|---|---|
| 本地提交/暂存/分支切换/rebase/diff（工作区） | 归 `git`（阶段 0/1/3 本地动作） |
| 编译、运行、测试代码 | 归 CI（`gh run`）或本地工具链 |
| 渲染 Markdown 为网页（导航/图片/样式） | 仅取原始文本，渲染需 Web |
| 直接读取非默认分支被代码搜索索引的内容 | 代码搜索仅索引默认分支 |
| 修改他人仓库（无写权限时） | 只读；改动须走 Fork+PR |
| `gh api repos/<owner>/<repo>/tags` 默认分页（常仅返最新 ~30 个标签） | 核对标签**全集**差集须用 `git ls-remote --tags <remote>`（无分页），勿凭 `gh api tags` 单页推断"本地独有/缺失"——已因此误判 `auto-*`/`v0.2-v0.5` 为杂标签险些误删 |

---

## 编译与构建规则
1. 默认使用 GitHub Actions CI 构建；不主动安装任何编译工具链（MSVC Build Tools、MinGW 等）。若仅用本机已有工具/程序（不安装新工具）即可完成编译，则允许本地编译（见「环境硬约束（本地编译有条件放开）」）。
2. Fork 仓库的 GitHub Actions 默认未启用，需用户在浏览器手动启用（点 "I understand my workflows, go ahead and enable them"）。
3. 启用 Actions 后，通过删除并重新推送标签触发工作流：`git push origin :refs/tags/v1.x.x` → `git push origin v1.x.x`（**非强推**；详见「顶级全局禁令」标签移动条款与「Release 发版工作流」标签 SHA 核对坑）。
4. 创建 PR/Issue 统一用 `gh` CLI（用户令牌免 403）；Web UI 仅兜底。

---

## 用户 GitHub 账号与 Fork 仓库
- 用户名：`zhangweildlh` ｜ 邮箱：`157947621@qq.com`
- Fork 仓库：
  - dynamic-mcp：`https://github.com/zhangweildlh/dynamic-mcp`（upstream：`asyrjasalo/dynamic-mcp`）
  - mcp-bridge：`https://github.com/zhangweildlh/mcp-bridge`（upstream：`mimicode/mcp-bridge`）
  - chrome-md-editor：`https://github.com/zhangweildlh/chrome-md-editor`（upstream：`yishu-ziyu/chrome-md-editor`）
  - deepseek-pp：`https://github.com/zhangweildlh/deepseek-pp`（upstream：`zhu1090093659/deepseek-pp`）
  - we-mp-rss：`https://github.com/zhangweildlh/we-mp-rss`（upstream：`rachelos/we-mp-rss`；本地仓 `D:\Documents\AI_Work_Temp\we-mp-rss`）
    - 性质：**私人化定制 Fork**。定制修改（微信扫码登录修复 / PDF 导出 / 360Chrome 适配）只提交到 `origin/main`（本地 `main` 直接放定制，符合标准巡检流程），**绝不向 `rachelos/we-mp-rss` 提 PR**。
    - 同步工作流（遵循 GitHub 标准操作）：`git fetch upstream` → `git merge upstream/main` 把上游更新合入本地 `main`；**若产生冲突，立即暂停、不自动解，交由你手动解决**（你明确要求上游不得覆盖你的仓库）。解完冲突后 `git push origin main`（快进，不触发强推禁令）。
    - 隐私/体积项（`.venv`/`data`/`config.yaml`/`db.db`/`.workbuddy`/运行时文件）只留本地、靠 `.gitignore` 不推送；远端 Fork 仅为干净代码镜像。
    - 当前已提交 1 个定制提交（`bd93d328`），领先 `origin/main` 1 个、尚未推送（用户选择先本地提交、暂不推送）。

---

## Fork CI 实证要点

> 标准阶段见「标准代码修改工作流程」。本节约记 dynamic-mcp v1.5.1→v1.8.2 实操中独有的坑与 fork 专属约束；已抽离账户/仓库/邮箱，可移植（占位符 `<upstream>`/`<fork>`/`<feat>`/`<version>`）。

### 关键问题与解决（实证）
1. **Fork→上游 PR 卡 `action_required`（fork PR 审批闸门）**：仅上游有写权限者可 Approve and run，作者无法自批；审批前上游 CI 不跑。→ 等维护者；验证改 fork 内部路径。
2. **Fork 内部 PR（base=fork main）不触发 `pull_request` workflow**（GitHub 固有）。→ 改用 `ci.yml` 的 `push:[main]`：把 `feat` 以 merge commit 合到 fork main 再 `git push origin main`（临时验证合并，事后精确恢复，见第 3 点）。
3. **临时验证后精确恢复 fork main（禁止强推 main）**：在 功能分支(feat) 复现目标状态 → 开同源内部 PR(base=fork main) → 合并(merge) 即更新 main，无需强推（此路径见「标准代码修改工作流程」阶段 4）。⚠️ 原步骤 `git checkout main` → `git reset --hard <原main-SHA>` → `git push --force-with-lease origin main` 已被「顶级全局禁令：禁止强推/删除自家 main」禁止，绝不可再用。
4. **Fork main 与 feat 重复实现致 merge 冲突**：`git checkout --ours <file>` 保留已验证版本（feat 自身改动仍完整，将来合上游不冲突）。
5. **构建二进制（不仅是验证）**：Release 工作流 `on: push: tags: ['v*']` → `git tag -a v<version>` + `git push origin v<version>` 触发；产物作 release assets（含 Windows 二进制）。
6. **⚠️ 禁用发布类 job（关键）**：fork 的 `release.yml` 常含 `publish-to-crates-io`/`pypi`/`build-python-wheels`——fork 绝不能发布。给这些 job 加 `if: github.repository == '<upstream>'` 守卫（fork 上 false 跳过、上游上 true 发布），保留 `create-release` + `build-release`（PR 来自 feat 分支，release.yml 不在其 diff 内，不影响上游 PR）。⚠️ 勿用纯常量 `if: false`——actionlint 报 `constant expression "false" in condition` 会直接判 CI 失败。
7. **CHANGELOG 需有对应版本段**：`create-release` 用 `awk "/^## [<ver>]/"` 抽 notes；无段回退 `--generate-notes`，文件不存在才 awk 失败。顶部加 `## [X.Y.Z] - <date>`。
8. **勿勾 "Require actions to be pinned to a full-length commit SHA"**：`ci.yml`/`release.yml` 用 tag 引用 action（`actions/checkout@v4`）时勾选必败（整 CI 红）。
9. **clippy 坑（`-D warnings` 必查）**：如 `clippy::useless_conversion`（`serde_json::Value::Object(map.into())` 中 `map` 已是 `JsonObject`，`.into()` 为 identity）。修复提交到 **feat 分支**并 `git push origin feat`，重做验证。
10. **rustfmt 关卡（`cargo fmt -- --check`）**：可装 minimal toolchain + 仅 rustfmt 组件（只解析语法、不编译、不需链接器）做精准格式化；或靠临时 push-to-main CI 间接确认。手写多行调用会被 rustfmt 折叠，是主要风险点。
11. **CLI flag 重命名 / clippy 踩坑（v1.8.1 实证）**：合并 `--http-host/--http-port/--http-path` 为 `--http-endpoint` 时连踩两处 CI 错误，根因都是「只改了一部分、没全仓扫」：
    - **改函数签名为 `&str` 后必须同步改全部下游 `&param`**：`check_singleton` 内 `format!(...)` 改直接用 `endpoint: &str` 参数，函数体内 4 处 `&endpoint`→`endpoint` 改了，却漏 `try_acquire_lock(&endpoint, …)`（singleton.rs:518），被 `clippy::needless-borrow` + `-D warnings` 升级为 CI 错误。
    - **重命名 CLI flag 必须全仓 grep 旧 flag 字符串**（含 `tests/`/`examples/`/`README*`）：只改 `tests/singleton_cli.rs` 的 L19-20，漏 L47-48 的另一个 `--http-port`，导致 Test 任务用已删除的旧参数启动二进制而失败。
    - **本地只跑 `cargo fmt --check` 预过 fmt 门；clippy 原则交 CI**（clippy 需 Rust 工具链，默认不本地跑；若本机已预装且可用则可本地跑）。
    - **覆盖含未提交改动的文件前先 `git diff origin/main -- <file> > /tmp/<file>.bak.patch` 存补丁**——本次 README 误覆盖靠这条恢复（恢复时基底提交必须与生成补丁时的 origin/main 一致，否则 apply 失败；详见项目级记忆同款记录）。
12. **用 gh 开启分支保护（2026-07-15 实测）**：`gh api graphql -F query=@-`（heredoc 喂 mutation）调用 `createBranchProtectionRule`。关键字段：`repositoryId`（用 `gh api repos/<owner>/<repo> -q .node_id` 取）、`pattern:"main"`、`requiresStatusChecks:true` + `requiredStatusCheckContexts:[...]`（精确匹配 CI 检查名，matrix 会产生 `Build (ubuntu-latest)` 等多条）、`requiresStrictStatusChecks:true`、`allowsForcePushes:false`、`allowsDeletions:false`、`isAdminEnforced:false`（即不开启 Do not allow bypassing，管理员/AI 可紧急绕过）、`requiresApprovingReviews:false`。⚠️ **API 无法表达「要求 PR + 0 审批」**：REST 的 `required_approving_review_count` 最小为 1，GraphQL 无独立 `requiresPullRequest` 字段；故以「CI 绿 + 禁强推 + 禁删 + 管理员可绕过 + 无审批」为最大化可达保护。注意 `gh api graphql` 默认会跑 schema 自检，必须用 `-F query=@-` 从 stdin 喂查询才会真正执行。

### 约束 / 注意事项（fork 专属硬规则）
- `git push` 只推 origin（fork），绝不推 upstream（亦见硬约束）。
- 上游合并由维护者完成，助手不自行合并（亦见硬约束）。
- 不本地安装任何编译工具链（MSVC Build Tools / MinGW-w64 等）；但若本机已预装并可用（如 Rust toolchain / GCC 已在 PATH），可复用其进行本地编译。
- `gh pr close <n>` 无 `-y`/`--yes` 标志（误用报 `unknown flag`）。
- 临时验证合并可能被 GitHub 自动标为某 PR merged（检测到 head 已合入 base），正常，无需处理。
- 工作流权限：fork Settings→Actions→Workflow permissions 需 Read and write（`gh release create` 要 `contents: write`）；CI 本身只需读权限。

---

