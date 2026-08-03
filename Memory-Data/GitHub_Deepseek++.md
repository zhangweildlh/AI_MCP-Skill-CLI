# 永久记忆（跨项目）

> 跨项目永久记忆，本文件为 **GitHub 操作 + 本地环境约束** 的权威单一事源。
> 按「**会话启动 → 环境基础 → 账户身份 → 标准工作流 → Fork专项实证 → 技能提醒**」六大篇组织，遵循实际操作顺序排列。
> 单一事实源，避免重复；不同章节对同一事源/事项/要求/流程/操作的描述必须一致、互不矛盾。

---

# 速查索引表（意图 → 章节）

| 你要做的 | 看 |
| --- | --- |
| 所有回答的大白话与「汉语 + (英语单词)」表述规范 | `## 第3章 回答风格硬性规则` |
| 禁止强推/删除自家 main（及受保护分支）的全局硬禁令 | `### 1.1 禁止强推/删除自家 main` |
| 强推/删除受保护分支前的三段式二次授权铁律 | `### 1.2 二次显式授权铁律` |
| 本机无 Docker、忽略所有 Docker 安装方式、改用原生部署 | `### 2.1 Docker 禁用` |
| 本机默认走远程 CI；可用本机已有工具编译 | `### 2.2 本地编译有条件放开` |
| 运行 Python 必用 uv run、装依赖必用 uv add/uv pip、禁用裸 python/pip | `### 2.3 UV 管理 Python` |
| 工作目录 / Skill 目录 / GitHub 仓库根目录 / 临时目录 / Tool 根目录 约定 | `### 5.1 目录根约定` |
| 本地工具链（Node/UV/Python/Git/GH/ffmpeg 等）安装位置  | `### 5.2 本地工具安装位置` |
| Github 用户名/邮箱/我的 Fork 仓库清单 | ## 第7章 账户信息 |
| we-mp-rss 私人化定制 Fork 专项规则（绝不提PR / 冲突立即暂停 / 隐私项不推送） | `#### we-mp-rss 专项说明` |
| git/gh 工具与认证、路径、工具能力边界（gh 不能做什么） | `## 第8章 git/gh 工具与认证` |
| gh 命令速查 / 能力全览（gh 能做什么） | `## 第11章 gh 能力全览` |
| 新任务/每个 GitHub 流程先核验操作目录、路径异常先问用户（最高优先级） | `## 第9章 路径核验` |
| 读取/分析 GitHub 网址、搜索 GitHub 仓库或代码（gh 优先） | `第10章 信息读取与搜索` |
| 每日仓库巡检（本地↔你的远端仓库(origin)、你的远端仓库(origin)↔上游仓库(upstream) 同步、冲突暂停） | `第12章 日常同步巡检` |
| 冲突大白话解释、后果与暂停门禁（六类问题） | `### 12.4 冲突处理` |
| 修改/提交 GitHub 代码、开 PR、合并 | `## 第13章 标准代码修改工作流程` |
| 每次提交前按「改动类型 × Tier 1/2/3 分层检查清单」同步仓库文档 | `## 第14章 提交前文档同步门禁` |
| CI 变红排错（下载失败日志、clippy/rustfmt/审批闸门定位与修复回推） | `## 第15章 CI 失败排错工作流` |
| 发版/构建二进制（打 tag 触发、禁用发布 job、取 Release 产物） | `## 第16章 Release 发版工作流` |
| 清理已合并分支（本地+fork 远程删除、prune 陈旧引用） | `## 第17章 分支清理回收工作流` |
| 构建/CI、fork Actions 启用、标签重推触发 | `## 第18章 编译与构建规则` |
| Fork 实操坑、发布 job 禁用、rustfmt/clippy 坑、分支保护 | `## 第19章 Fork CI 实证要点` |
| GitHub 操作前先激活 github-personal-manager 技能 | `## 第22章 github-personal-manager 自动激活` |
| 技能自动激活判定（会话级闸门：GitHub→github-personal-manager） | `## 第4章 会话启动闸门` |

---

# 第一篇：全局基础与会话启动

> 本篇为最高优先级规则与会话初始化配置，所有操作前必须遵守。

## 第1章 全局硬禁令（最高优先级）

> 跨项目、跨仓库的硬禁令，优先级高于一切便利。任何 GitHub 操作前先核对本章。

### 1.1 禁止强推/删除自家 main（及受保护分支）

- **禁止对「你的远端仓库(origin) 的 main 分支」执行以下动作**（适用你名下所有仓库，含 `zhangweildlh/*` 各 fork）：
  - **强制推送(push)**：`git push --force` / `--force-with-lease` / `-f` 到 `origin/main`；
  - **删除 main 分支**：`git push origin --delete main`、`gh api` 删分支、仓库 Settings 删分支、本地 `git branch -D main` 后强推覆盖等。
- **禁止对「任何已开启分支保护(branch protection)的分支」执行强推/删除**（保护规则本身也可能挡下，但禁令优先于规则）。
- **正常（非强推）推送(push)到 main 不受限**：如推标签(tag) `git push origin vX.Y.Z`、或受保护时走 PR 流程合并(merge)后 GitHub 自动更新 main；仅强推与删除被禁。
- **标签移动/重推用「删远端标签 + 重推」（非强推）**：`git push origin :refs/tags/vX` → `git push origin vX`（见第18章编译与构建规则第3点、第16章 Release发版）。严禁用 `git push --force-with-lease origin <tag>` 之类的强推手段处理标签，以免与"禁止强推 main"的禁令混淆、且更可审计。
- **宁可多问一次，绝不赌一把**：凡涉及 `main` + `--force` / `--delete` / 分支删除，一律先暂停并大白话说明后果，等明确指令。
- **已落地的双保险（实例）**：`zhangweildlh/dynamic-mcp` 的 `origin/main` 已于 2026-07-15 通过 `gh` GraphQL 开启分支保护（CI 严格 5 检查全绿、禁强推、禁删分支、管理员可绕过、无审批、未强制要求 PR）。技术保护 + 本约定，双保险。详见第19章 Fork CI 实证要点第12点与该仓库项目记忆。

### 1.2 二次显式授权铁律

> 优先级高于一切便利。

- 任何"强推/删除自家 main（或任何受保护分支）"的操作，必须走三段式：
  1. 用户先显式授权（表达要做）；
  2. 我必须主动暂停，大白话说明后果、列出将执行的精确动作；
  3. 用户给出**第二次**显式授权后，方可执行。
- 缺任一环节（尤其第二次授权）一律不执行。
- 标签删除/分支删除等其它破坏性操作不受此铁律限制，但删除类仍遵循各自门禁（先列清单+状态、暂停等确认）。

---

## 第2章 环境硬约束

> 用户永久指令，全场景生效，跨项目单一事实源。本章包含 UV 管理 Python 的原则与全部详细操作规范（详见 2.3 节），确保"看了原则就能直接看到操作细节"。

### 2.1 Docker 禁用

- **本机无 Docker，且未来永久不安装 Docker。**
- 任何软件/工具的安装说明、部署方案，只要涉及 Docker（含 `docker`、`docker-compose`/`docker compose`、Docker Desktop、容器镜像 `docker.1ms.run/...`、`.dockerfile`、`compose/*.yaml` 等），**一律直接忽略，不纳入推荐步骤**，也不要提示"用 Docker 更方便"。
- 必须改用**本地原生安装路径**：优先 `D:\Tools\Assembly` 工具链 + UV 管理 Python 项目（见第5章目录与工具链约定及本章 2.3 节）；若某工具仅提供 Docker 部署、无原生方案，如实告知"该工具依赖容器、本机无法部署"，不虚构本地步骤。

### 2.2 本地编译有条件放开（默认仍走远程 CI）

- **原则：默认走远程 CI（GitHub Actions）构建二进制/产物**（见第18章编译与构建规则、第19章 Fork CI 实证要点）；不主动安装任何编译工具链（MSVC Build Tools、MinGW-w64 等）。
- **例外放开**：若能够**不安装任何新工具/程序**、仅使用本机已安装且已在 PATH 注册的已有工具/程序（如 `node`、`uv`/Python、Git 自带 unix 工具等）完成本地编译/构建（如 `cargo build`、`make`、`gcc`、`pip` 源码编译 C 扩展等），则**允许**使用本地已有工具/程序进行本地编译。
- **判断闸门（唯一标准）**：是否需要「安装新工具/程序」。需要 `pip install` 新装编译器/SDK、或下载安装 MSVC/MinGW 等，仍禁止；仅需调用本机已存在的命令完成编译即可放行。
- 纯解释型依赖安装（Python/uv 装 wheel、Node 装包）属「安装」而非「编译」，始终不受此限。

### 2.3 UV 管理 Python（含原则与详细操作）

> 本机 Python 一律由 UV 管理，禁止裸 `python` / `pip` 直接调用（与第5章 5.2 / 5.3 严格优先规则一致）。

- **解释器与项目**：UV 管理的 Python 项目为 `D:\Tools\Assembly\python\myenv`；其 `.venv\Scripts\python.exe` **不**在 PATH，Python 一律经 `uv run --project D:\Tools\Assembly\python\myenv <命令>` 调用。
- **运行脚本**：所有 Python 脚本（含审查 / 同步脚本）一律经 `uv run` 调用，不裸跑 `python`。
- **安装依赖**：用 `uv add <包>`（写入 pyproject）或 `uv pip install <包>`（仅装到当前环境）；严禁 `pip install` 裸调用。
- **解释器本体**：`D:\Tools\Assembly\python\cpython-3.14.5-windows-x86_64-none` 由 UV 管理使用，不在裸 PATH 注册。

---

## 第3章 回答风格硬性规则（对所有回答永久生效）

### 3.1 规则一：所有回答必须"大白话"

所有回答必须"大白话"，最大程度减少技术门槛、降低用户理解难度。涉及技术概念、命令、流程时，先用日常语言把"是什么、为什么、会怎样"讲清楚，再给精确命令/术语；避免堆砌术语、缩写、黑话。遇到用户可能不熟的概念，主动用类比或场景化说明。

### 3.2 规则二：所有回答一律用「汉语 + (英语单词)」表述

所有回答一律用「汉语 + (英语单词)」表述，不得出现裸英文单词（如 origin、upstream、push、pull、commit、merge、rebase、feat 等）。统一映射：

| 英文 | 中文映射 |
|---|---|
| origin | 你的远端仓库(origin) |
| upstream | 上游仓库(upstream) |
| push | 推送(push) |
| pull | 拉取(pull) |
| commit | 提交(commit) |
| merge | 合并(merge) |
| rebase | 变基(rebase) |
| feat 分支 | 功能分支(feat) |

错误→正确示例：
- "将来合 upstream" → "将来与上游仓库(upstream)合并"
- "还没 push" → "还没推送(push)"
- "已经往 origin/main" → "已经往 你的远端仓库(origin)/main"

> 注：代码块内的 git/gh 命令保留原样（如 `git pull origin main`），仅正文叙述使用上述映射。

---

## 第4章 会话启动闸门

> 每个新对话开始时必须执行的初始化动作与判定。


### 4.1 技能自动激活判定（会话级闸门）

在动手做任何事之前，先根据本次对话/主任务主题判定是否需要激活对应常驻技能：

| 任务主题 | 激活技能 | 判定依据章节 |
|---|---|---|
| GitHub 仓库/项目/代码操作 | `github-personal-manager` | 第22章 |

- 若涉及对应主题，先激活技能再正式开展；若不涉及，正常处理。
- 技能激活后仍须遵守所有全局禁令与硬约束（第1~2章、第9章路径核验等），技能不绕过任何顶级规则。

---

# 第二篇：本地环境与工具链

> 本篇定义本地操作的基础环境：目录结构、工具位置。所有路径与工具位置仅在此定义，其余章节引用，不重复。

## 第5章 目录与工具链约定（单一事源）

> 「本地工具链与规范」，作为本地一切操作的统一基准。

### 5.1 目录根约定

| 名称 | 默认路径 | 用途 |
|---|---|---|
| Skill 技能根目录 | `D:\Documents\AI_MCP-Skill-CLI` | 所有 Skill 资产（SKILL.md、脚本、资源、模板）存放根；**该目录本身也是用户的一个 GitHub 仓库/项目（独立 git 仓库）**。用户指定绝对路径则直接用，相对路径解析为 `[Skill 技能根目录]/[相对路径]` |
| GitHub 仓库根目录 | `D:\Documents\AI_Work_Temp` | 所有本地仓库/GitHub 代码/资产存放根；均为其一级子目录。**⚠️ 根目录本身「不是」GitHub 仓库/项目，绝不可对根目录执行 `git init` 或任何 git 操作**；每个仓库是独立一级子目录（如 `D:\Documents\AI_Work_Temp\Deepseek-pp`），`.git` 只存在于各子仓库目录内，根目录无 `.git`。用户指定绝对路径则直接用；相对路径/仓库名解析为 `[GitHub 仓库根目录]/[相对路径或仓库名]`；否则以自然语言询问用户 |
| 临时目录 | `D:\System\UserTemp` | 下载缓存、数据缓存、程序缓存（构造的 .py 等）的父目录 |
| Tool 和 CLI 存放根目录 | `D:\Tools\Assembly` | 所有工具 Tool 与 CLI 存放根 |

### 5.2 本地工具安装位置（Windows）

| 工具 | 安装目录 | PATH 注册（where.exe 实测，2026-07-20） |
|---|---|---|
| Node.js + npm | `D:\Tools\Assembly\nodejs` | （见 5.3 严格优先规则） |
| UV | `D:\Tools\Assembly\uv` | ✅ |
| Git | `D:\Tools\Assembly\git` | ✅ |
| GH | `D:\Tools\Assembly\gh.exe` | ✅ |
| Officecli | `D:\Tools\Assembly\officecli.exe` | ✅ |
| WMIC | `D:\Tools\Assembly\WMIC.exe` | （见 5.3 严格优先规则） |
| PECMD | `D:\Tools\Assembly\PECMD.exe` | （见 5.3 严格优先规则） |
| Python | `D:\Tools\Assembly\python\cpython-3.14.5-windows-x86_64-none`（由 UV 管理使用） | ✅ |
| ffmpeg（转码/处理） | `D:\Tools\Assembly\ffmpeg\ffmpeg.exe` | （见 5.3 严格优先规则） |
| ffprobe（信息分析） | `D:\Tools\Assembly\ffmpeg\ffprobe.exe` | （见 5.3 严格优先规则） |
| ffplay（音视频播放） | `D:\Tools\Assembly\ffmpeg\ffplay.exe` | （见 5.3 严格优先规则） |

> **PATH 注册与安装要点**：
> - `uv` / `python` / `git` / `gh` / `officecli` 经 `where.exe` 实测，在**系统 PATH 与用户 PATH 双通道**均可解析（✅）；其余工具均位于 `D:\Tools\Assembly` 并在 PATH（详见 5.3）。
> - **Git 双可执行文件等价**：`git\cmd\git.exe` 与 `git\bin\git.exe` 为同一文件（MD5 `0857b8b97b665e9602d080543a11519c`、均 46480 字节、均报 `git version 2.54.0.windows.1`），统一以 `cmd\git.exe` 为单一事实源；`git\bin` 另含 bash/sh/ls/grep/sed/awk 等 unix 工具。
> - **Python 解释器不在裸 PATH 调用**：`myenv` 的 `.venv\Scripts\python.exe` **不**在 PATH；Python 一律经 `uv run --project D:\Tools\Assembly\python\myenv` 调用（见第2章 2.3 节）。

### 5.3 严格优先规则（硬）

- **必须优先使用** `D:\Tools\Assembly` 下的工具：`nodejs`、`uv`、`git`、`gh.exe`、`officecli.exe` 等。
- **PATH 注册结论**：上述工具在 **系统环境变量 PATH** 与 **用户环境变量 PATH** 均已注册，`where.exe` 均可解析。
- **通用建议**：实测 `git --version` / `gh --version` / `uv --version` / `python --version` / `node --version` / `officecli --help`；若某项失效，先确认对应 `D:\Tools\Assembly` 路径仍在 PATH。

---

# 第三篇：账户与身份

> 本篇定义 GitHub 账户信息、Fork 仓库清单与工具认证配置。

## 第7章 账户信息

### 7.1 用户名与邮箱

- 用户名：`zhangweildlh`
- 邮箱：`157947621@qq.com`

### 7.2 Fork 仓库清单

| 仓库 | Fork 地址 | 上游仓库(upstream) | 备注 |
|---|---|---|---|
| dynamic-mcp | `https://github.com/zhangweildlh/dynamic-mcp` | `asyrjasalo/dynamic-mcp` | 标准 Fork |
| mcp-bridge | `https://github.com/zhangweildlh/mcp-bridge` | `mimicode/mcp-bridge` | 标准 Fork |
| chrome-md-editor | `https://github.com/zhangweildlh/chrome-md-editor` | `yishu-ziyu/chrome-md-editor` | 标准 Fork |
| deepseek-pp | `https://github.com/zhangweildlh/deepseek-pp` | `zhu1090093659/deepseek-pp` | 标准 Fork |
| we-mp-rss | `https://github.com/zhangweildlh/we-mp-rss` | `rachelos/we-mp-rss` | **私人化定制 Fork**（见下方专项说明） |

#### we-mp-rss 专项说明（私人化定制 Fork）

- 本地仓路径：`D:\Documents\AI_Work_Temp\we-mp-rss`
- **性质**：私人化定制 Fork。定制修改（微信扫码登录修复 / PDF 导出 / 360Chrome 适配）只提交到 `origin/main`（本地 `main` 直接放定制，符合标准巡检流程），**绝不向 `rachelos/we-mp-rss` 提 PR**。
- **同步工作流**（遵循 GitHub 标准操作）：`git fetch upstream` → `git merge upstream/main` 把上游更新合入本地 `main`；**若产生冲突，立即暂停、不自动解，交由你手动解决**（你明确要求上游不得覆盖你的仓库）。解完冲突后 `git push origin main`（快进，不触发强推禁令）。
- **隐私/体积项**：`.venv`/`data`/`config.yaml`/`db.db`/`.workbuddy`/运行时文件只留本地、靠 `.gitignore` 不推送；远端 Fork 仅为干净代码镜像。
- **当前状态**：已提交 1 个定制提交（`bd93d328`），领先 `origin/main` 1 个、尚未推送（用户选择先本地提交、暂不推送）。

---

## 第8章 git/gh 工具与认证

> 依据本机已验证环境：`D:\Tools\Assembly\gh.exe`（v2.96.0；已登录 `zhangweildlh`；scopes 含 `repo`/`workflow`/`admin:org`）。✅ = 本会话已实跑验证。

### 8.1 git / gh 本地路径

- **git**：负责本地版本控制（diff 自审、分支、commit、rebase、push/pull、force-push）；`cmd\git.exe` 与 `bin\git.exe` 为同一文件（MD5 `0857b8b97b665e9602d080543a11519c`），统一以 `cmd\git.exe` 为单一事实源。
- **gh**：负责 GitHub 平台交互（仓库/PR/Issue/CI/Release/API 等）。


### 8.2 能力边界（重要）

| `gh` 不能做 | 归属 |
|---|---|
| 本地提交/暂存/分支切换/rebase/diff（工作区） | 归 `git`（本地动作） |
| 编译、运行、测试代码 | 归 CI（`gh run`）或本地工具链 |
| 渲染 Markdown 为网页（导航/图片/样式） | 仅取原始文本，渲染需 Web |
| 直接读取非默认分支被代码搜索索引的内容 | 代码搜索仅索引默认分支 |
| 修改他人仓库（无写权限时） | 只读；改动须走 Fork+PR |
| `gh api repos/<owner>/<repo>/tags` 默认分页（常仅返最新 ~30 个标签） | 核对标签**全集**差集须用 `git ls-remote --tags <remote>`（无分页），勿凭 `gh api tags` 单页推断"本地独有/缺失"——已因此误判 `auto-*`/`v0.2-v0.5` 为杂标签险些误删（2026-07-23 Deepseek-pp 实证） |

---

# 第四篇：GitHub 标准工作流

> 本篇按**实际操作顺序**排列所有 GitHub 工作流：路径核验（前置）→ 读取搜索 → 日常巡检 → 代码修改 → 文档门禁 → CI 排错 → Release 发版 → 分支清理 → 编译构建。
>
> **⚠️ 所有工作流的第一步都必须是路径核验（第9章），未核验路径不得进入任何后续步骤。**

## 第9章 路径核验（硬规则，最高优先级）

> 2026-07-19 由一次严重误操作（把 `D:\Documents\AI_Work_Temp` 根目录误当 `Deepseek-pp` 仓库目录执行 `git` 操作，污染根目录并泄漏仓库文件）沉淀的硬规则。**本规则优先级高于一切便利与"少问多做"。**
>
> **⚠️ 强制绑定：每一个 GitHub 管理流程（日常同步巡检 / 标准代码修改 / CI 排错 / Release 发版 / 分支清理回收 / 信息读取与搜索 等）的第一步都必须是路径核验，未核验路径不得进入任何后续步骤。**

### 9.1 规则一：先核验"要操作的目录"再动手

- 任何任务启动、切换仓库、或执行 `git`/`gh`/文件读写前，**先用命令确认当前要操作的目录到底是什么**（如 `git rev-parse --show-toplevel`、`pwd`/`cd` 确认、`ls` 看一级子目录结构）。
- 仓库目录 = `[GitHub 仓库根目录]/[仓库名]`（如 `D:\Documents\AI_Work_Temp\Deepseek-pp`）。**绝不**对 `[GitHub 仓库根目录]`（即 `D:\Documents\AI_Work_Temp`）本身执行 `git init` 或任何 git 操作——它是根，不是仓库。
- Skill 相关操作目录 = `D:\Documents\AI_MCP-Skill-CLI`。

### 9.2 规则二：路径核验的正确命令写法

> 2026-07-24 实测根因：`git -C /d/...`（Unix 风格根路径）在 Git Bash 下**会被 git 误报 `fatal: not a git repository`**（exit=128），但 `git -C "D:/..."`（Windows 盘符+正斜杠）与 `cd /d/... && git` 均成功（exit=0）。此外，在"非仓库的当前目录"直接执行 `git rev-parse --show-toplevel` 也必然误报。两类误报曾反复触发"路径异常暂停"假警报，须从命令写法上根治。

- **推荐核验顺序（三步，任一成立即可判定为有效仓库）**：
  1. 先 `ls "<目录>/.git"` 确认 `.git` 目录存在（最直接、零歧义，不受路径格式影响）；
  2. 再用 `git -C "D:/绝对/Windows/路径" rev-parse --show-toplevel`（`D:/` 盘符格式）确认仓库根；
  3. 或 `cd /d/绝对/路径 && git rev-parse --show-toplevel`（先切换目录再执行，最稳）。
- **禁止的写法（会误报，严禁用于路径核验）**：
  - ❌ `git -C /d/Documents/...`（Unix 风格 `/d/` 根路径传给 git 的 `-C`）——实测必误报；
  - ❌ 在"非目标仓库的当前目录"直接 `git rev-parse --show-toplevel`（如工作区根 `2026-07-24-12-15-10`、临时目录）——必然误报。
- **误报判定铁律**：`git rev-parse` 返回 `fatal: not a git repository` 时，**先怀疑路径格式 / 当前目录错误，绝不直接判定"该目录不是 git 仓库"**；必须先 `ls "<目录>/.git"` 复核，确认 `.git` 真实不存在后才可下结论。



### 9.3 规则四：发现异常先问，对齐后再做

- 一旦发现路径异常（如 `git rev-parse --show-toplevel` 指向的不是预期仓库目录、根目录意外出现 `.git`、工作区文件出现在错误层级），**立即暂停，先问用户**，大白话说明发现了什么。
- **先排除"路径格式误报"再判定异常**：`git rev-parse` 报 `not a git repository` 时，**第一动作必须是 `ls "<目录>/.git"` 复核**；确认 `.git` 不存在才视为真异常并触发暂停。若 `.git` 存在，则是命令路径格式问题（见 9.2 规则二），改用正确写法重测，**不得据此触发"路径异常暂停"**，也不向用户发"路径核验关键异常"类告警。
- **只有与用户明确一致"要操作的文件夹路径"后，才能继续讨论工作流程、操作步骤和下一步内容。** 绝不绕过路径对齐直接进入执行。

---

## 第10章 信息读取与搜索（gh 优先原则）

> 核心规则：凡涉及 GitHub（https://*github.com/*）的读取/搜索/操作，一律优先使用 `gh`；仅当 `gh` 不可用或确实搜不到/无对应能力时，才回退网页工具。
>
> **启动前必须先完成路径核验（第9章）。**

### 10.1 适用范围

1. 用户给出 GitHub 网址（仓库/文件/PR/Issue/Release/Action 等）要求阅读、分析、核查。
2. LLM 工作流自身需要读取/分析 GitHub 上的信息、数据、代码、文档（调研、自审参考、查证 API）。
3. 任何"搜索 GitHub 仓库/代码/Issue/PR"的需求（无论用户要求还是流程需要）。
4. `gh` 能力总览覆盖的任务/事项/操作（见第11章）。

### 10.2 优先顺序（硬规则）

1. **首选 `gh`**：`D:\Tools\Assembly\gh.exe`。
2. **回退条件（仅限其一）**：
   - (a) `gh` 不可用（缺失/未登录/网络不可达）；
   - (b) `gh` 确实搜不到或无对应能力（代码搜索仅索引默认分支、需渲染网页导航/图片/样式）。
   满足才改用 WebFetch/WebSearch；一般网页搜索走 `firecrawl-mcp` 兜底。
3. **禁止**：无理由跳过 `gh` 直接用网页搜索；能用 `gh` 完成却改用 MCP/Web UI（除非 403 等明确失败）。

### 10.3 决策流

```
GitHub 读取/搜索/操作请求 → 是否 gh 能力覆盖？
   ├─ 是 → 用 gh → gh 可用且取到 → 完成
   │            └─ gh 不可用/搜不到/无对应能力 → 回退 WebFetch/WebSearch
   └─ 否（本地 VCS 动作）→ 用 git
```

### 10.4 跨命令通用约束（已验证）

- 代码搜索（`gh search code`）仅索引默认分支；搜索 qualifier 语法需正确（自由文本与 `--language` 等分列，勿混写进同一引号）。
- 全站搜索速率约 30 次/分钟（已登录）；`gh search` 要求 token 含 `repo` scope（已满足）。
- `gh` 返回为原始文本非网页渲染（`gh api contents` 返 base64，需解码）。

---

## 第11章 gh 能力全览（命令速查）

> 本章为 `gh` CLI 的完整命令清单与功能速查。具体使用原则见第10章。

### 11.1 认证与配置

| 命令 | 作用 |
|---|---|
| `gh auth login` / `logout` / `status` / `refresh` / `switch` | 登录/退出/查看/刷新/切换账号 |
| `gh config get` / `set` | 读写 `gh` 配置（默认编辑器、git protocol 等） |
| `gh auth setup-git` | 桥接令牌到 git credential（本机 `credential.helper` 为空时 `git push` 需此） |

### 11.2 仓库管理（`gh repo`）

| 命令 | 作用 |
|---|---|
| `gh repo view [owner/repo]` | 查看仓库元信息（描述、语言、星标、README 文本）✅ |
| `gh repo clone <repo>` | 克隆仓库（等价于 `git clone`，自动用 gh 协议） |
| `gh repo fork <repo>` | Fork 到本人账号（标准流程阶段 1 前置） |
| `gh repo create` | 新建仓库（private/public/desc） |
| `gh repo list` | 列出当前账号/组织的仓库 |
| `gh repo sync` | 将 fork 与 upstream 同步 |
| `gh repo rename` / `delete` / `archive` / `unarchive` / `edit` | 仓库维护操作 |

### 11.3 Pull Request（`gh pr`）

| 命令 | 作用 | 对应流程阶段 |
|---|---|---|
| `gh pr create` | 开 PR（`--repo`/`--base`/`--head`/`--title`/`--body`/`--body-file`） | 阶段 2 |
| `gh pr list` / `view` | 列出/查看 PR | 全阶段 |
| `gh pr checks` | 查看 PR 的 CI 状态（轮询） | 阶段 2/3 |
| `gh pr diff` | 查看 PR 差异 | 阶段 2 自审 |
| `gh pr review` | 提交 review（approve/request-changes/comment） | — |
| `gh pr merge` | 合并 PR（自有仓库/自测 PR 用） | 阶段 4 |
| `gh pr checkout` | 拉取 PR 到本地分支 | 阶段 5 |
| `gh pr comment` / `close` / `reopen` / `edit` | PR 互动 | — |

### 11.4 Issue 跟踪（`gh issue`）

| 命令 | 作用 |
|---|---|
| `gh issue create` / `list` / `view` | 建/列/查 Issue |
| `gh issue close` / `reopen` / `comment` / `edit` / `delete` | Issue 维护 |
| `gh issue status` | 查看与本人相关的 Issue/PR 总览 |

### 11.5 全站搜索（`gh search`）

| 命令 | 作用 | 验证 |
|---|---|---|
| `gh search repos "<q>" [--language --stars --owner]` | 搜仓库 | ✅ 返回全球公开仓库 |
| `gh search code "<q>" [--repo --language]` | 搜代码（仅默认分支） | ✅ 返回跨文件命中行 |
| `gh search issues "<q>"` | 搜 Issue | 可用 |
| `gh search prs "<q>"` | 搜 PR | 可用 |
| `gh search commits "<q>"` | 搜提交 | 可用 |

### 11.6 原生 API 访问（`gh api`）

- 调用任意 GitHub REST 端点：`gh api repos/<owner>/<repo>/contents/<path>` 读文件、`gh api user` 看本人信息。
- 支持 GraphQL：`gh api graphql -f query='...'`（分支保护即用此，见第19章第12点）。
- 常用选项：`-H` 自定义头、`-F` 参数、`-q` jq 过滤、`--silent`、`--hostname`（GitHub Enterprise）。
- REST 搜索等价：`gh api "/search/repositories?q=..."`。✅ `gh api repos/asyrjasalo/dynamic-mcp/contents/README.md -q .content` 返 base64（解码 `# dynamic-mcp…`）。

### 11.7 CI/CD（`gh run` / `gh workflow`）

| 命令 | 作用 | 对应流程 |
|---|---|---|
| `gh run list` | 列出 workflow runs | 阶段 2/3 轮询 |
| `gh run view` / `watch` | 查看/等待 run 完成 | 阶段 2/3 |
| `gh run rerun` / `cancel` | 重跑/取消 | — |
| `gh run download [--log/--log-failed]` | 下载日志（排错） | CI 失败时 |
| `gh workflow list` / `view` / `run` / `enable` / `disable` | 管理工作流（fork 启用 Actions 后） | 编译与构建规则 |

### 11.8 发布与制品（`gh release`）

| 命令 | 作用 |
|---|---|
| `gh release create <tag>` | 基于 tag 发布 Release |
| `gh release upload` / `download` | 上传/下载附件（构建产物） |
| `gh release list` / `view` / `delete` / `edit` | Release 维护 |

### 11.9 代码片段（`gh gist`）

`gh gist create` / `list` / `view` / `edit` / `delete` —— 管理 Gist 文本片段（贴配置、报错）。

### 11.10 密钥与变量（`gh secret` / `gh variable`）

| 命令 | 作用 |
|---|---|
| `gh secret set` / `list` / `get` / `remove` | 仓库/组织/环境级加密密钥（CI 用） |
| `gh variable set` / `list` / `get` / `delete` | 非机密变量（CI 用） |

> 写密钥通常需 `read:org`/`admin:org` scope（本机令牌含 `admin:org`，可用）。

### 11.11 标签 / 项目 / 规则集

| 命令 | 作用 |
|---|---|
| `gh label create` / `list` / `clone` / `edit` / `delete` | Issue/PR 标签管理 |
| `gh project list` / `view` / `item-add` / … | Projects V2（beta） |
| `gh ruleset list` / `view` / `check` / `create` / `update` / `delete` | 分支保护规则集（需相应权限） |

### 11.12 扩展与定制

| 命令 | 作用 |
|---|---|
| `gh extension install` / `list` / `create` / `remove` / `upgrade` | 安装社区扩展 |
| `gh alias set` / `list` / `delete` / `import` / `export` | 命令别名 |
| `gh completion` | 生成 shell 自动补全 |

### 11.13 其他

- `gh codespace ...`：Codespaces 生命周期管理（create/ssh/code/cp/delete）。
- `gh copilot ...`：交互式 Copilot（explain/suggest，gh 2.49+）。
- `gh attestation verify`：SLSA 制品来源校验。
- `gh billing ...`：查看 Actions/Packages/Storage 用量（需 admin 权限）。
- `gh status`：概览与本人相关的 PR/Issue。
- 统一输出格式：`--json <fields>` + `-q <jq>` 或 `-t <go-template>`，便于脚本化过滤。

---

## 第12章 日常同步巡检工作流（每日例行）

> 每日一次。原则：先校验配置，再分别检查「本地 ↔ 你的远端仓库(origin)」与「你的远端仓库(origin) ↔ 上游仓库(upstream)」；仅快进/无冲突类操作自动执行，一切冲突与公开动作一律大白话说明 + 后果 + 暂停等指令（强门禁，绝不跳过）。
>
> **启动前必须先完成路径核验（第9章）。**

### 12.1 阶段 0 — 配置校验（前置门槛）

- `git remote -v` 须同时存在 origin + upstream；`git rev-parse --abbrev-ref main@{upstream}` 须为 origin/main。
- 缺项 → 报告具体缺什么、暂停，请你提供信息后助手自动补齐（如 `git remote add upstream <url>`、`git branch --set-upstream-to=origin/main main`）。

### 12.2 第一步 — 本地 ↔ 你的远端仓库(origin)

- 工作区脏（有未提交(commit)改动）→ 硬停止整个巡检，大白话说明，等指令；你提交(commit)后手动重启。
- 停在 功能分支(feat) 且干净、有未推送(push)提交(commit) → 照常同步 main，绝不碰 feat；提醒"feat/xxx 有 N 个提交(commit) 没推到你的远端仓库(origin)"，是否推送(push) 由你定，默认不推。
- `git rev-list --left-right --count main...origin/main`（落后/领先）：
  - 仅落后 → `git pull --ff-only origin main`（自动）；
  - 仅领先 → `git push origin main`（自动）；
  - 双向分叉 → 暂停+智能建议（A 以你的远端仓库(origin) 为准 `git reset --hard origin/main` / B 以本地为准：经功能分支(feat) 走 PR 合并(merge) 后再同步（**禁止强推 main，见第1章**）/ C 合并(merge) 保留双方 / D 变基(rebase) / E 中止不动；疑似验证残留建议 A，仍暂停等确认）。

### 12.3 第二步 — 你的远端仓库(origin/fork) ↔ 上游仓库(upstream)

- `git rev-list --left-right --count origin/main...upstream/main` =（M = 你的远端仓库(origin) 领先, K = 上游仓库(upstream) 领先）。
- M=0, K=0 → 已同步；
- M=0, K>0 → 自动 `git merge upstream/main` + `git push origin main`（fork 跟随 上游仓库(upstream)）。
- M>0 → 查 PR（**用作者口径，弃用窄口径**）：`gh pr list --repo <upstream> --author zhangweildlh --state all`。
  - ⚠️ 口径区别：`--head zhangweildlh:main` 按"PR 的源分支"精确匹配，只返回源分支恰好叫 `main` 的 PR，会漏掉用 `feat/*`/`fix/*` 分支开的 PR；`--author zhangweildlh` 按"PR 作者"匹配，返回我开的所有 PR，不会漏判。仅在专门查"main→main 这条通道"时才叠加 `--head zhangweildlh:main`。
  - **有未合并也未拒绝的开放 PR（state=open）→ 记为「PR 待审」态**：大白话报告 PR 编号、base、状态，说明这是贡献回 上游仓库(upstream) 的正常通道；不重复开 PR、不覆盖、不暂停，继续巡检/结束；若同时 K>0（上游仓库(upstream) 已前进），额外提示「PR 可能落后于 上游仓库(upstream)」，建议 rebase 功能分支(feat) 后更新 PR，并暂停等你指令。
  - rejected（closed 且 merged=false）→ 问题四；
  - 无 PR → 问题三（向 上游仓库(upstream) 开 PR，已开不重复，暂停等指令）；
- M>0, K>0 → 问题五/六（`git merge-tree --write-tree origin/main upstream/main` 干净→全自动合并(merge)+推送(push)；冲突→暂停列 A/B/C/D）。

### 12.4 冲突处理（六类问题）

| 编号 | 场景 | 处理方式 |
|---|---|---|
| 问题一 | 本地 main ↔ 你的远端仓库(origin) 双向分叉 | A–E 方案，暂停等确认（见 12.2 双向分叉） |
| 问题二 | 停在 功能分支(feat) 有改动 | 未提交(commit)→硬停止等指令；已提交(commit)未推送(push)→同步 main、不碰 feat、提醒、默认不推 |
| 问题三 | fork 领先 上游仓库(upstream) 且停滞 | 不覆盖；无 PR 则向 上游仓库(upstream) 开 PR（`gh pr create --repo <upstream> --head zhangweildlh:<实际源分支，如 feat/v1.7.0-xxx> --base main`，暂停等指令），已开不重复。注：`--head` 这里是**创建 PR 时必填的源分支参数**（按当前工作分支填），与"查 PR 的查询口径"不是一回事，查询一律用 `--author` 口径 |
| 问题四 | fork 领先且 PR 被拒 | 有反馈→`git fetch upstream` 重看状态、在 功能分支(feat) 改、必要时 `git rebase upstream/main`、开新 PR（暂停等指令）；无反馈→保持 fork 领先、不重提 |
| 问题五 | 双方改、无文件冲突 | 全自动合并(merge)+推送(push) |
| 问题六 | 双方改、同文件冲突 | 暂停列 A 以 上游仓库(upstream) 为准 `git checkout --theirs <file>` / B 以你的远端仓库(origin) 为准 `git checkout --ours <file>` / C 手动合并 / D 中止 `git merge --abort`，绝不自动选 |

### 12.5 特殊场景（仓库残缺/本地无 .git / 本地独有文件）

- **本地仓库无 `.git`**（如 SyncFolders 同步丢失 `.git`，仅剩一份上游快照 + 本地独有文件）：
  用 `git init -b main` + `git remote add upstream <url>` + `git remote add origin <url>` + `git fetch upstream`（公开库读取免认证）→ `git reset --mixed upstream/main` 保留工作树 → 列差异 → 覆盖前先备份本地当前版本到临时目录 → `git checkout -- .` 刷跟踪文件到 upstream/main（不动未跟踪本地文件）；
  `git reset --hard`/`git clean` 均禁用以防误删 `.workbuddy`。
  远端 fork 推送前先 `gh auth setup-git` 桥接令牌（本机 github.com 已走 `gh auth setup-git` 桥接；若某环境 `git push` 因无凭据失败，先 `gh auth setup-git`）。
- **本地独有文件（如 `.workbuddy`）不进同步**：用 `.git/info/exclude`（本地专属、不提交不推送、位于 `.git` 内、`reset`/`checkout`/`pull upstream` 均不影响）写入忽略行，保持 fork 为上游干净镜像且无 `.gitignore` 分歧。若文件已被跟踪/推送过，需先 `git rm --cached -r <路径>`（保留磁盘、下次 push 删远端）再忽略。`.workbuddy` 是 WorkBuddy 项目记忆，**绝不删除**；忽略=不跟踪，不影响磁盘。

### 12.6 强门禁总述

仅「快进拉取(pull)、快进推送(push)、跟随/无冲突合并(merge)、M>0+开放 PR（K=0）报告继续」可自动执行；其余冲突或公开动作（双向分叉、工作区脏、feat 未提交、问题三开 PR、问题四、问题六）一律大白话 + 后果 + 暂停等指令。

---

## 第13章 标准代码修改工作流程

> 原则：尽量由助手用 `git`+`gh` 自动执行；仅「fork Actions 一次性手动启用」「upstream 维护者合并」需人类介入。
>
> **启动前必须先完成路径核验（第9章）。**

### 13.1 阶段 0 启动前闸门

1. **完整性**：预定文件全部编写/修改完毕，无残留 WIP、TODO 占位、空实现、调试残留。
2. **正确性**：逐文件 Read + `git diff` 复核，无语法/类型/逻辑 BUG 与瑕疵。
3. **静态校验**：有工具链则跑 lint/test（Rust：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-features`）；有意不装工具链时，以「开 PR 触发 CI + 严谨 diff 自审」替代入口，不得跳过自审。
4. 闸门未过 → 先修复，不进入阶段 1。

### 13.2 阶段 1 同步与建分支

- 一次性前置（已配置跳过）：`git remote add upstream <url>`；`git branch --set-upstream-to=origin/main main`
- `git switch main && git pull upstream main && git push origin main`
- `git switch -c feat/<topic>`（先建分支，再提交）
- ⚠️ **提交前 born 状态检查（防根提交异常）**：建分支后、首次 `git commit` 前，务必 `git rev-parse HEAD` 确认当前分支已 **born（解析出有效 SHA、有父提交）**。若报 `unknown revision` / HEAD 无效（unborn 状态），**绝不能**直接 `git add -A && git commit`——这会把整棵树当作"全新"生成无父**根提交**，且分支引用可能不被推进，造成游离对象与"无关历史合并"风险。✅ 正确修复：`git reset --mixed main`（保留工作树、让当前分支真正继承 main 为父）→ `git add -A` → 提交；复验 `git diff main --stat` 应为增量（如 `62 files changed, ...`），而非"N 文件全新增"假象。⚠️ **分支名含斜杠（如 `feat/2026-07-31-xxx`）在某些环境更易触发引用歧义致 unborn**，建分支后必跑 `git rev-parse HEAD` 核验（已实战验证于 `AI_MCP-Skill-CLI`：首次 `feat/2026-07-31-skill-updates` 提交即触发根提交 `e72379c`，经 `git reset --mixed main` 修复）。

### 13.3 阶段 2 提交 / 推送 / 触发 CI

- `git add <文件>` → `git commit -m "清晰描述，一 PR 一主题"`
- `git push -u origin feat/<topic>`
- ⚠️ **提交(commit)前硬门禁：文档—代码同步（分层检查清单）**（详见第14章）：先 `bash scripts/sop_docs_sync_check.sh <仓库路径>` 按 `references/docs-sync-checklist.md` 查仓库是否存在清单文件并分析同步状态；Tier 1（README/README_EN/CHANGELOG）未同步 → 必须基于 `git diff`/`git status` 真实变化更新相应章节并一并 `git add` 后再提交(commit)，严禁 Tier 1 未同步时直接提交(commit)代码；Tier 2（docs/·契约·i18n·examples 等）未同步须处理或说明；Tier 3（测试/锁文件）仅提示。
- **开 PR（用 `gh`，免 403）**：
  - **向 上游仓库(upstream) 贡献**：`gh pr create --repo <upstream> --head zhangweildlh:feat/<topic> --base main`
  - **在 fork 内部开 PR 触发 fork CI（base=fork main）**：`gh pr create --repo zhangweildlh/<fork> --head zhangweildlh:feat/<topic> --base main`
  - ⚠️ **多 remote 口径坑**：本地同时存在 origin+upstream（甚至 upstream-pr）时，`gh pr create` 默认取 upstream 报 "No commits between main and feat/..."。凡开 PR 一律显式带 `--repo`（fork 内部 PR 用 `zhangweildlh/<fork>`，上游贡献 PR 用 `<upstream>`），且 `feat` 分支已推到 `zhangweildlh/<fork>`。
  - ⚠️ **PR 正文用 `--body-file`**：here-doc 含中文括号（全/半角）会被 bash 解析失败；一律先写正文到文件再用 `gh pr create --body-file <file>`。
- 轮询 `gh pr checks` / `gh run list`，必须全部 green
- 注：dynamic-mcp 的 `ci.yml` 仅响应 `push:[main]` 或 `pull_request:[main]`；推特性分支不触发 CI，必须靠开 PR（fork 内部 PR 触发 fork CI，或上游贡献 PR 触发上游 CI）触发。

### 13.4 阶段 3 对齐上游并强推（功能分支(feat)，非 main）

- `git fetch upstream && git rebase upstream/main feat/<topic>`
- 冲突：助手就地解决（仅语义真不确定才问用户）→ `git rebase --continue` → `git push --force-with-lease origin feat/<topic>`（**仅强推 feat 分支，绝不强推 main**）
- 重跑 CI 至绿

### 13.5 阶段 4 合并

- 贡献 upstream：由 upstream 维护者合并，助手仅监控，不得自行合并（硬约束）。
- 自有仓库/自测 PR：助手用 `gh pr merge` 合并。
- fork 内部 PR（仅用于触发 fork CI 验证）：`gh pr merge --squash`（合并(merge) 即更新 fork main，无需强推 main）。

### 13.6 阶段 5 收尾同步与清理

- `git switch main && git pull upstream main && git push origin main`
- `git branch -d feat/<topic>`（本地）+ `git push origin --delete feat/<topic>`（fork 远程分支）

### 13.7 硬约束

- 本地 main 跟踪 origin/main，不跟踪 upstream/main。
- `git push` 只推 origin，绝不推 upstream。
- fork Actions 需一次性手动启用（GitHub 限制，无法 API 化）；启用后 PR 才跑校验。
- 给上游建 PR 用 `gh`（用户令牌免 403），Web UI 仅兜底。

---

## 第14章 提交前文档同步门禁（分层检查清单：改动类型 × Tier 1/2/3）

> 核心要求：每次向 GitHub 提交(commit)代码或文件前，必须基于本次仓库代码与文件的"真实变化"（以 `git status` / `git diff` 实际改动为准，**严禁凭空臆测**），按「改动类型 × Tier 1/2/3 分层检查清单」检查仓库内相关文件是否需要同步更新，确保"仓库日志记录"与"代码/文件变化"一致。
>
> 清单的权威定义见 `github-personal-manager` 技能的 `references/docs-sync-checklist.md`；检测由技能脚本 `sop_docs_sync_check.sh` 落地、由智能体基于结果实际改文档。
>
> **启动前必须先完成路径核验（第9章）。**

### 14.1 分层模型与处理语义

| 层级 | 内容 | 处理语义 |
|---|---|---|
| **Tier 1（阻断）** | 根 README / README_EN / CHANGELOG | 仓库门面与版本记录。存在但未纳入变更 → **必须先补文档再提交(commit)**（脚本 `exit 2`） |
| **Tier 2（强建议）** | docs/、CONTRIBUTING、配置样例、接口契约、i18n、examples | 存在但未纳入变更 → 提交(commit)前须处理，或显式说明为何不改；脚本加 `--strict` 可同样阻断 |
| **Tier 3（提示）** | 测试、包清单、锁文件 | 行为/依赖变动建议补测试或同步锁文件，仅提示不阻断 |

### 14.2 适用范围

- **触发**：凡走「标准代码修改工作流程」阶段 2 的 `git commit`（新增/修改/删除代码或文件，产生真实变化），提交(commit)动作前必须先过本门禁。
- **免触发**：① 本次仅改动文档本身（如只改 README/CHANGELOG/docs，无代码/文件真实变化）；② 仓库管理类动作（日常同步巡检的 merge、Release 打标签、分支清理回收）不产生新代码变化，不强制再写文档——避免无意义循环更新。

### 14.3 执行流程（查询 → 分析 → 需改先改 → 提交 → 推送）

1. **取真实变化**：以 `git status` / `git diff`（含已暂存 `--cached` 与未暂存）/ `git ls-files --others` 实际改动为准，**严禁凭空臆测**哪些变了。
2. **推导改动类型**：脚本按真实变化文件自动判定（命令/配置/功能/接口/依赖/重命名/行为/文案/示例/文档；无法判定则保守触发全部 Tier 2）。
3. **查仓库是否存在清单文件并分析同步状态**：运行 `bash scripts/sop_docs_sync_check.sh <仓库路径>`（技能内脚本，只读 dry-run，依据 `references/docs-sync-checklist.md` 数据块）——它查仓库是否存在清单文件、对存在文件核对是否已纳入本次变更，输出分层明细（`【Tier 1｜阻断】` / `【Tier 2｜强建议】` / `【Tier 3｜提示】`）与 `【文档同步状态】已同步 / 未同步`。
4. **需改则先改再提交(commit)**：
   - Tier 1 未同步 → 必须先基于真实变化更新 README/README_EN（命令·配置·依赖·接口·功能·目录结构等）与 CHANGELOG（功能性/可见行为变化在顶部追加条目），并把文档一并 `git add` 进同一次提交(commit)。**严禁在 Tier 1 未同步时直接 `git commit` 代码。**
   - Tier 2 未同步 → 按改动类型定位相关文件（功能/接口改动查 docs/ 与契约、文案改动查 i18n、示例改动查 examples），需更新则一并 `git add`；若判断无需改，须显式说明。
   - Tier 3 → 仅作提示，按需补测试/同步锁文件。
5. **已同步 / 无真实变化 → 正常继续**：按标准流程提交(commit)、推送(push)、开 PR。

### 14.4 与现有规则关系

- 本门禁**不绕过**任何顶级全局禁令 / 二次显式授权铁律 / 路径核验硬规则。
- 它只是"提交(commit)前的一道文档—代码一致性闸门"；与「标准代码修改工作流程」阶段 0 闸门（完整性/正确性/静态校验）并列、互补。
- 清单维护：增删同步文件或调整分层，只改 `references/docs-sync-checklist.md` 的「权威检查清单数据块」与「改动类型 → 应同步文件 映射表」，并同步 `sop_docs_sync_check.sh` 的回退清单与 SKILL.md/本记忆的引用。

---

## 第15章 CI 失败排错工作流

> 触发时机：`gh pr checks` 或 `gh run list` 出现失败（红），需定位原因并修复回推。原则：定位与修复属本地/功能分支(feat) 动作，助手自动执行；凡改动 workflow 文件、重推标签(tag) 等影响面较大的动作，先大白话说明再执行。多数具体坑见第19章 Fork CI 实证要点，本章只给排错主线。
>
> **启动前必须先完成路径核验（第9章）。**

### 15.1 第一步 — 定位失败的 run 与 job

```
gh run list --limit 5                       # 列最近的 workflow run，找红的那个
gh run view <run-id>                         # 看该 run 各 job 状态
gh run view <run-id> --log-failed            # 只看失败步骤日志（首选，最省时）
gh run download <run-id> --log-failed        # 需要完整失败日志时下载到本地细读
```

- ⚠️ **CI 结论取数坑**：`gh run watch --exit-status` 的退出码会被 `| tail ; echo $?` 掩盖；应再用 `gh run view <run-id> --json conclusion --jq .conclusion` 明确取结论。clippy 在 `-D warnings` 下输出 `error:` 而非 `warning:`，故在日志里 grep `error:` 找 clippy 失败。

### 15.2 第二步 — 按类型对号入座（详见第19章对应条目）

| 失败现象 | 根因与去处 | 修复方向 |
|---|---|---|
| `cargo fmt -- --check` 失败 | 手写多行调用被 rustfmt 折叠（实证第10点） | 本地装 minimal + rustfmt 组件格式化，或靠临时 push-to-main CI 间接确认 |
| clippy `-D warnings` 报错 | 如 `useless_conversion`（实证第9点） | 在 功能分支(feat) 改，`git push origin feat` 重验 |
| run 卡 `action_required` | fork→上游 PR 审批闸门（实证第1点） | 等上游维护者 Approve；验证改走 fork 内部 `push:[main]`（实证第2点） |
| 整条 CI 全红且与代码无关 | 勾了 "Require actions pinned to full-length SHA"（实证第8点） | 到 fork 规则设置取消勾选 |
| 发布类 job 失败 | fork 不该发布 crates.io/PyPI（实证第6点） | 给发布 job 加 `if: github.repository == '<upstream>'` 守卫（⚠️ actionlint 拒绝纯常量 `if: false`，须用非常量仓库名比较） |
| `create-release` 抽 notes 失败 | CHANGELOG 缺版本段（实证第7点） | 顶部补 `## [X.Y.Z] - <date>` |

### 15.3 第三步 — 修复回推与重跑

- 代码/格式/clippy 类：改在 功能分支(feat) → `git push origin feat/<topic>` → CI 自动重跑（自动执行）。
- 仅需重跑（疑似偶发/外部因素）：`gh run rerun <run-id> --failed`（只重跑失败 job）或 `gh run rerun <run-id>`（自动执行）。

#### ⚠️ git 推送 github.com:443 失败的两类情形（务必区分）

- **偶发瞬断（重试可过）**：`git push` 偶发 `github.com:443` 连接超时，用 for 循环重试 3~5 次可过；`gh` API 不受影响。
- **持续性重置（网络层封锁，重试无效）**：实测 `git push`/`git ls-remote` 报 `Recv failure: Connection was reset` 或 `Failed to connect to github.com port 443`，但 `gh api`（api.github.com）正常、且无任何代理变量。此时**不要重试 git**，改用 GitHub REST API 绕过 git 智能 HTTP 协议：
  1. 改文件提交到 origin/main：取 blob SHA（`gh api repos/<repo>/contents/<path>?ref=main --jq .sha`）→ 本地 base64 → `gh api -X PUT repos/<repo>/contents/<path> --input payload.json`（payload={message, sha, branch:"main", content}）；
  2. 建/移标签（等价于推送标签，触发 `on: push: tags`）：`gh api -X DELETE repos/<repo>/git/refs/tags/<tag>` + `gh api repos/<repo>/git/refs -X POST -f ref=refs/tags/<tag> -f sha=<commit>`；
  3. 多文件/大文件用 Node 脚本逐文件提交；注意 `jq` 在 Git Bash 不可用、且 `/tmp` 路径 Git Bash 与 Node 解析不一致（Node 解析为 `d:\tmp`）→ 直接用绝对 Windows 路径由 Node 读源文件。

#### 📌 通用可移植方法论（v1.11.5 四门禁级联复盘）


- **CI 多门禁是串行短路的**：每次只暴露第一个失败（actionlint→tsc→i18n→release-assets 依次触发），修一个重跑才暴露下一个；不要假设"一次改完"，需逐轮 `gh run view --log-failed` 确认下一个失败点再修。
- **i18n 类门禁查代码+注释**：`verify:i18n` 会审计源码与注释里的硬编码非英语文案（白名单除外）；修 bug 时注释也写英文，避免门禁失败。
- **升版本必须"三件套"同步**：`package.json`(顶层) + 子包 `package.json`(如 `packages/shell-host`) + `package-lock.json`(顶层/子包 version 字段) + 发布说明(`docs/releases/<ver>.md`) 必须同版本号；漏任一则 `verify:release-assets` 失败。改版本时一次性全改。
- **actionlint 拒绝纯常量 `if:`**：`if: false`/`if: true` 会被判 `constant expression` 错误；改用非常量条件（如 `if: github.repository == '<upstream>'`）或 `workflow_dispatch` 手动触发。

- 改 workflow 文件（加 `if: github.repository == '<upstream>'` 守卫、调 pinned 规则）或删/重推标签(tag)：属影响面较大的动作 → 先大白话说明改什么、为什么，再执行。⚠️ 勿用纯常量 `if: false` 守卫——actionlint 会报 `constant expression "false" in condition` 致整条 CI 失败。

---

## 第16章 Release 发版工作流

> 触发时机：需要构建二进制产物或正式发版时。**硬前提**：fork 发版仅用于自取构建产物，**绝不**发布到 crates.io / PyPI（见第19章第6点）。打标签(tag) 会触发 CI 并生成 Release，属公开动作 → 先说明将推的版本，暂停等指令。
>
> **启动前必须先完成路径核验（第9章）。**

### 16.1 第一步 — 发版前检查（缺一不可）

- CHANGELOG 顶部有对应 `## [X.Y.Z] - <date>` 段（实证第7点），否则 `create-release` 抽 notes 失败。
- `release.yml` 中 `publish-to-crates-io`/`pypi`/`build-python-wheels` 已加 `if: github.repository == '<upstream>'` 守卫（fork 上求值 false 自动跳过、上游上 true 正常发布），仅保留 `create-release` + `build-release`（实证第6点）。⚠️ 禁止写成纯常量 `if: false`（actionlint 拒绝）。
- 未勾 "Require actions pinned to full-length SHA"（实证第8点）。
- fork Settings→Actions→Workflow permissions = Read and write（`gh release create` 需 `contents: write`，实证约束）。

### 16.2 第二步 — 打标签(tag) 触发（公开动作，暂停等指令）

```
git tag -a v<version> -m "release v<version>"
git push origin v<version>                          # release.yml: on: push: tags:['v*'] 触发
```

- 需重新触发（同版本重跑）：先删远端标签(tag) 再重推 → `git push origin :refs/tags/v<version>` → `git push origin v<version>`（见第18章第3点）。**禁止用 `git push --force-with-lease origin v<version>` 强推标签**，以免与"禁止强推 main"禁令混淆。
- ⚠️ **标签 SHA 核对坑**：`git ls-remote --tags origin vX` 返回的 SHA 是**注解标签(tag)对象本身**的编号，不是它指向的提交(commit)编号。核对"标签是否已推送/指向是否正确"时，必须先用 `git rev-parse <tag>^{commit}`（或 `git rev-list -n 1 <tag>`）解引用出提交(commit) SHA 再与本地对比；切勿直接拿 `ls-remote` 的 SHA 与 `git rev-list` 的提交(commit) SHA 比较，否则会误判为"标签错位/未推送"。
- **门禁**：推标签(tag) 前，先大白话说明要发的版本号、将触发哪条工作流、产物是什么，暂停等你确认。

### 16.3 第三步 — 监控与取产物

```
gh run watch                                        # 等 Release 工作流跑完
gh release view v<version>                           # 查看 Release 与 assets 清单
gh release download v<version>                       # 下载构建产物（含 Windows 二进制）
```

- 无工作流自动发布、需手动建 Release 时：`gh release create v<version> --generate-notes` + `gh release upload v<version> <产物文件>`。

---

## 第17章 分支清理回收工作流

> 触发时机：功能分支(feat) 已合并(merge)（上游合并或自有 PR 合并）或确认废弃后回收。**删除不可逆**，故删除类动作一律：先列清单 + 合并状态 → 暂停等你确认 → 才删（强门禁）。
>
> **启动前必须先完成路径核验（第9章）。**

### 17.1 第一步 — 识别可清理分支（只读，自动）

```
git branch --merged main                            # 本地已合并进 main 的分支（可安全删）
git branch --no-merged main                         # 本地未合并分支（含未完成工作，勿删）
gh pr list --repo <upstream> --author zhangweildlh --state merged   # 确认你的 PR 已合并（在结果中核对 feat/<topic> 源分支）
git branch -r --merged origin/main                  # fork 远程已合并分支
```

### 17.2 第二步 — 清理（删除类动作，暂停等指令）

- 本地：`git branch -d feat/<topic>`（小写 `-d` 只删已合并分支；未合并会被拒绝，**绝不**擅自用 `-D` 强删）。
- fork 远程：`git push origin --delete feat/<topic>`。
- 清理陈旧远程跟踪引用：`git fetch --prune`（或 `git remote prune origin`）——只清本地过时引用、不动远程分支，**可自动执行**。

### 17.3 强门禁（删除专属）

- 只删「已确认合并(merge) 或你明确指定废弃」的分支；删除前先列出待删清单及各自合并状态，暂停等你确认。
- `main` 永不删；当前所在分支不删。
- 优先 `git branch -d`（拒删未合并）；`-D` 强删仅在你明确点名某分支后才用。

### 17.4 工区内部对象回收（git gc / reflog / 悬空提交）

> 分支删除后，git 内部可能残留无引用的「悬空对象」（如误产生的根提交、游离 commit）。按需回收以释放空间、保持仓库整洁。

- **现象**：`git gc --prune=now` 后 `git fsck --no-reflogs --unreachable` 仍列出悬空 commit/tree/blob。
- **根因**：`git gc` 默认**遵守 reflog 保留期**，若本地 HEAD/分支 reflog 仍引用这些对象，gc 不会回收它们（即使已无分支指向）。
- **正确回收（两步）**：先 `git reflog expire --expire=now --all`（清除本地所有 reflog 恢复点——仅影响本地恢复能力、不丢任何可达代码）→ 再 `git gc --prune=now` → 复验 `git fsck --no-reflogs --unreachable` 应为空。
- **可复用经验**：凡遇 `git gc` 不回收、悬空对象仍在，先怀疑 reflog 引用挡路，补 `reflog expire --expire=now --all` 一步即可彻底回收（已实战验证于 `AI_MCP-Skill-CLI` 清理：异常根提交 `e72379c` 经此两步回收成功）。

---

## 第18章 编译与构建规则

> 本章为编译/构建的通用规则，与第2章环境硬约束一致并互为补充。具体发版见第16章，Fork 实操坑见第19章。

1. **默认使用 GitHub Actions CI 构建**；禁止在本地安装任何编译工具链（MSVC Build Tools、MinGW 等）。若仅用本机已有工具/程序（不安装新工具）即可完成编译，则允许本地编译（详见第2章 2.2 节「本地编译有条件放开」）。
2. **Fork 仓库的 GitHub Actions 默认未启用**，需用户在浏览器手动启用（点 "I understand my workflows, go ahead and enable them"）。
3. **启用 Actions 后，通过删除并重新推送标签触发工作流**：`git push origin :refs/tags/v1.x.x` → `git push origin v1.x.x`（**非强推**；详见第1章标签移动条款与第16章标签 SHA 核对坑）。
4. **创建 PR/Issue 统一用 `gh` CLI**（用户令牌免 403）；Web UI 仅兜底。

---

# 第五篇：Fork 专项与实证要点

> 本篇记录 Fork 仓库 CI 实操中独有的坑与专属约束，已抽离账户/仓库/邮箱，可移植（占位符 `<upstream>`/`<fork>`/`<feat>`/`<version>`）。
> 标准阶段见第13章标准代码修改工作流；排错主线见第15章 CI 失败排错。

## 第19章 Fork CI 实证要点

### 19.1 关键问题与解决（实证）

1. **Fork→上游 PR 卡 `action_required`（fork PR 审批闸门）**：仅上游有写权限者可 Approve and run，作者无法自批；审批前上游 CI 不跑。→ 等维护者；验证改 fork 内部路径。

2. **Fork 内部 PR（base=fork main）不触发 `pull_request` workflow**（GitHub 固有）。→ 改用 `ci.yml` 的 `push:[main]`：把 `feat` 以 merge commit 合到 fork main 再 `git push origin main`（临时验证合并，事后精确恢复，见第3点）。

3. **临时验证后精确恢复 fork main（禁止强推 main）**：`git checkout main` → 在 功能分支(feat) 复现目标状态 → 开同源内部 PR(base=fork main) → 合并(merge) 即更新 main，无需强推（此路径见第13章阶段 4）。⚠️ 原步骤 `git push --force-with-lease origin main` 已被第1章「禁止强推/删除自家 main」禁止，绝不可再用。

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

### 19.2 约束 / 注意事项（fork 专属硬规则）

- `git push` 只推 origin（fork），绝不推 upstream（亦见第13章硬约束）。
- 上游合并由维护者完成，助手不自行合并（亦见第13章硬约束）。
- 不本地安装任何编译工具链（MSVC Build Tools / MinGW-w64 等）；但若本机已预装并可用（如 Rust toolchain / GCC 已在 PATH），可复用其进行本地编译。
- `gh pr close <n>` 无 `-y`/`--yes` 标志（误用报 `unknown flag`）。
- 临时验证合并可能被 GitHub 自动标为某 PR merged（检测到 head 已合入 base），正常，无需处理。
- 工作流权限：fork Settings→Actions→Workflow permissions 需 Read and write（`gh release create` 要 `contents: write`）；CI 本身只需读权限。

---

# 第六篇：技能与常驻提醒

> 本篇为跨项目复用的常驻技能与提醒事项，涉及对应场景时主动加载。

## 第20章 常用跨项目技能（常驻工具链，跨项目）

> 经多会话实证、跨项目复用的常驻技能；与 git/gh 流程互补（路径核验另见第9章），涉及对应场景时主动加载。

| 技能 | 用途 | 触发场景 |
|---|---|---|
| **`deep-discuss`**（结构化深度讨论） | 多轮问题分析、方案设计、决策推演 | 用户描述问题并期望结构化分析时优先加载 |
| **`code-review-combo`**（代码审查） | 审查未提交改动、某日期范围提交、或与主分支对比的差异；聚焦缺陷 / 回归 / 正确性 / 安全 / 缺失测试 | 代码审查场景；审查脚本一律经 `uv run` 调用（见第2章 2.3 节），不裸跑 python |
| **`github-personal-manager`**（GitHub 管理统一执行） | 提交 / 推送 / 开 PR / 同步 / 发版 / 分支清理等本地与远端 GitHub 操作的一站式技能 | 凡涉及 GitHub 仓库/项目/代码操作，**必须先按名称激活此技能**（详见第22章） |

---

## 第22章 github-personal-manager 自动激活（常驻提醒，跨平台可移植）

> 用户明确要求：把"`github-personal-manager` 技能自动激活"加入常驻记忆。凡涉及 GitHub 仓库/项目/代码操作的任务，主 Agent 必须在动手前先判断是否已激活该技能。
>
> 本规则面向"任何安装该技能的 Agent/LLM 平台"——**以技能名称引用、绝不写死安装路径**，确保跨平台可移植。

### 22.1 激活判定（会话/任务级闸门）

在动手做任何 GitHub 相关操作之前，先判断本次任务是否涉及 GitHub 仓库/项目/代码——包括但不限于：提交(commit)/推送(push)/开 PR、同步(origin↔upstream)、CI 失败排错、Release 发版、分支清理回收、读取/搜索 GitHub 仓库或代码、读写本地 GitHub 仓库目录。若涉及，先激活 `github-personal-manager` 技能，再按它的 `SKILL.md` 执行。

### 22.2 激活动作（仅按名称，严禁写死安装路径）

- 通过所在平台的技能系统**按名称 `github-personal-manager` 解析并加载**该技能。各平台技能存放路径各不相同（可能因 `~/.workbuddy/skills/`、`{workspace}/.workbuddy/skills/`、或其他自定义目录而异），**一律以平台自身的技能解析机制按名加载；绝不在记忆/提示词里写死任何绝对安装路径**（如 `D:/Documents/AI_MCP-Skill-CLI/...`）。
- 加载后**严格遵循该技能 `SKILL.md` 的指令与脚本调用约定**：脚本一律用相对路径调用（如 `bash scripts/sop_sync_precheck.sh <参数>`），以技能主文件 `SKILL.md` 所在目录为根解析；不自行猜测或改写脚本内部逻辑。
- 技能内部已具备"路径无关"能力：资源/脚本用相对路径自定位、git/gh 走 `where.exe` 运行时解析、仓库三元组(GH_USER/REPO_NAME/UPSTREAM)从 `git remote -v` 提取——这些都不依赖安装位置。因此记忆只需引用技能**名称**即可，无需关心它装在哪、也不需要在记忆里复述脚本路径。

### 22.3 能力覆盖范围

该技能是 GitHub 个人操作的统一执行入口，覆盖「日常同步巡检 / 标准代码修改 / 向上游贡献 PR / CI 失败排错 / Release 发版 / 分支清理回收 / 读取搜索 GitHub」等全部 GitHub 工作流；凡上述场景优先走该技能，而非手工拼 git/gh 命令。**各工作流章节已统一标注"启动前必须先完成路径核验"，即本门禁的落地**。

### 22.4 与现有 GitHub 规则的关系

本记忆各「工作流」章节给出"为什么、有什么约束"，`github-personal-manager` 技能给出"具体跑哪个脚本、怎么跑"的可执行实现；两者一致、互不矛盾——执行 GitHub 操作时以"本记忆的约束 + 技能的脚本"组合落地。

### 22.5 门禁仍生效

激活该技能**不绕过**任何顶级全局禁令 / 二次显式授权铁律 / 路径核验硬规则；技能自带的 dry-run(`--confirm` 二次门禁)、冲突暂停、仓库三元组解析等机制照常遵守。

