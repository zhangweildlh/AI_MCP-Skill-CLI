---
title: "全局禁令与环境约束"
topic: "全局禁令与环境约束"
tags: [git, discipline, red-line, environment, session-gate, toolchain]
related: ["MEMORY.md"]
scope: "永久记忆"
created: "2026-08-27T20:00:00+08:00"
updated: "2026-08-27T20:00:00+08:00"
parent: "MEMORY.md"
summary: "总则、全局禁令、环境约束、会话启动闸门、目录与工具链约定"
keywords: ["禁强推", "Docker禁用", "UV管Python", "路径核验", "工具链"]
priority: "high"
status: "active"
---
> **本文件速查索引**（按章节顺序排列）
> 精确定位到 ### 级别，避免全文加载。

| 适用场景 | 章节位置 | 备注 |
|---------|---------|------|
| 1 总则 · 信任但必须验证（跨 SOP 全局） | `## 1 总则 · 信任但必须验证（跨 SOP 全局）` |  |
| 2 全局禁令（最高优先级） | `## 2 全局禁令（最高优先级）` |  |
| 2.1 禁止强推/删除自家 main（及受保护分支） | `### 2.1 禁止强推/删除自家 main（及受保护分支）` |  |
| 2.2 三段式二次授权铁律 | `### 2.2 三段式二次授权铁律` |  |
| 2.3 入库隐私闸门（2026-08-04 实测拦截后确立） | `### 2.3 入库隐私闸门（2026-08-04 实测拦截后确立）` |  |
| 2.4 Git 撤销/回退安全（reset 三模式 + 硬约... | `### 2.4 Git 撤销/回退安全（reset 三模式 + 硬约束）` |  |
| 3 环境约束 | `## 3 环境约束` |  |
| 3.1 Docker 禁用 | `### 3.1 Docker 禁用` |  |
| 3.2 本地编译有条件放开（默认仍走远程 CI） | `### 3.2 本地编译有条件放开（默认仍走远程 CI）` |  |
| 3.3 UV 管理 Python（禁用裸 python / ... | `### 3.3 UV 管理 Python（禁用裸 python / pip）— 原则与详细操作` |  |
| 3.4 Node.js / npm / npx 全局安装规范 | `### 3.4 Node.js / npm / npx 全局安装规范` |  |
| 3.5 交付脚本须纯标准库、禁用 WorkBuddy 自带运... | `### 3.5 交付脚本须纯标准库、禁用 WorkBuddy 自带运行时（2026-08-11 确立）` |  |
| 4 会话启动闸门 | `## 4 会话启动闸门` |  |
| 4.1 新对话首条消息执行 list_groups（常驻提醒... | `### 4.1 新对话首条消息执行 list_groups（常驻提醒，跨项目）` |  |
| 4.2 技能自动激活判定（会话级闸门） | `### 4.2 技能自动激活判定（会话级闸门）` |  |
| 5 目录与工具链约定 | `## 5 目录与工具链约定` |  |
| 5.1 目录根约定 | `### 5.1 目录根约定` |  |
| 5.2 本地工具安装位置（适用于 Windows 环境） | `### 5.2 本地工具安装位置（适用于 Windows 环境）` |  |
| 5.3 严格优先规则 | `### 5.3 严格优先规则` |  |
<!-- INDEX_END -->
# 第一篇：全局基础与会话启动

> 本篇为最高优先级规则与会话初始化配置，所有操作前必须遵守。

## 1 总则 · 信任但必须验证（跨 SOP 全局）

不把"看起来对"当作已验证；在向你报告、展示或输出成果前，必须基于既有事实、实物与真实信息源复验证，禁止凭我的记忆、推测或编造来回答；代码改完即验证，文档 / 测算写完即核来源、口径与事实，外部信息一律视为待核实输入。本记忆各 SOP 均为操作指引，执行前仍以实际仓库与环境状态为准，不凭记忆或 SOP 条文直接声称已完成。

## 2 全局禁令（最高优先级）

> 跨项目、跨仓库的硬禁令，优先级高于一切便利。任何 GitHub 操作前先核对本章。

### 2.1 禁止强推/删除自家 main（及受保护分支）

- **禁止对「你的远端仓库(origin) 的 main 分支」执行以下动作**（适用你名下所有仓库，含 `zhangweildlh/*` 各 fork）：
- **强制推送(push)**：`git push --force` / `--force-with-lease` / `-f` 到 `origin/main`；
- **删除 main 分支**：`git push origin --delete main`、`gh api` 删分支、仓库 Settings 删分支、本地 `git branch -D main` 后强推覆盖等。
- **禁止对「任何已开启分支保护(branch protection)的分支」执行强推/删除**（保护规则本身也可能挡下，但禁令优先于规则）。
- **正常（非强推）推送(push)到 main 不受限**：如推标签(tag) `git push origin vX.Y.Z`、或受保护时走 PR 流程合并(merge)后 GitHub 自动更新 main；仅强推与删除被禁。
- **标签移动/重推用「删远端标签 + 重推」（非强推）**：`git push origin :refs/tags/vX` → `git push origin vX`。严禁用 `git push --force-with-lease origin <tag>` 之类的强推手段处理标签，以免与"禁止强推 main"的禁令混淆、且更可审计。
- **宁可多问一次，绝不赌一把**：凡涉及 `main` + `--force` / `--delete` / 分支删除，一律先暂停并大白话说明后果，等明确指令。
- **已落地的双保险（实例）**：某 fork 仓库的 `origin/main` 已于 2026-07-15 通过 `gh` GraphQL 开启分支保护（CI 严格 5 检查全绿、禁强推、禁删分支、管理员可绕过、无审批、未强制要求 PR）。技术保护 + 本约定，双保险。**此实例仅说明"为何立此禁令"，禁令本身对所有仓库（含你名下全部 fork）生效，不绑定该仓库。**

### 2.2 三段式二次授权铁律

> 优先级高于一切便利。

- 任何"强推/删除自家 main（或任何受保护分支）"的操作，必须走三段式：

1. 用户先显式授权（表达要做）；
2. 我必须主动暂停，大白话说明后果、列出将执行的精确动作；
3. 用户给出**第二次**显式授权后，方可执行。

- 缺任一环节（尤其第二次授权）一律不执行。
- 标签删除/分支删除等其它破坏性操作不受此铁律限制，但删除类仍遵循各自门禁（先列清单+状态、暂停等确认）。

### 2.3 入库隐私闸门（2026-08-04 实测拦截后确立）

> 目的：防止把浏览器 profile、密码库、Cookies 等隐私数据推送到公开仓库。一旦推送即进入 git 历史，事实上不可撤回。

- **`git add` 前必须 `--dry-run` 预演并逐行核对**，尤其当参数是目录（`git add .` / `git add <dir>/`）时。禁止"先 add 再看"。
- **push 前跑隐私闸门（必跑，命中即中止）**：`bash scripts/sop_privacy_gate.sh <仓库路径>`（rc=1 拦截 / rc=0 放行）。脚本扫三类范围（工作区未跟踪 + 暂存区 + 已提交 diff）、含文件名指纹（profile/Login Data/Cookies/favdb/.env/id_rsa/.pem/.key/credentials/.token）与密钥内容指纹（GitHub PAT/AWS/JWT/PEM 私钥块等），比手写 grep 覆盖更全。
- 手写 `git diff --name-only origin/main..HEAD | grep -iE "profile|Login Data|Cookies|favdb|\.env|id_rsa"` 仅作**不充分的兜底**（不扫未跟踪目录、无密钥内容指纹），绝不可单独作为闸门；真实防护以 `sop_privacy_gate.sh` 脚本为准。
- **测试/运行产物目录的 `.gitignore` 一律用「默认拒绝 + 白名单」，禁止黑名单式逐项排除**：

```gitignore
<dir>/*
!<dir>/*.md
!<dir>/*.mjs
```

原因（实测事故）：Chrome-Markdown-Edit 的 `.test-run/` 同时生成 `profile/` 与 `profile-<时间戳>/` 两种命名，黑名单只写了 `profile/`，预演中被 `profile-1785730431818/` 逃逸，其中含 360 浏览器 `Login Data`（密码库）与 Cookies，差点推上公开 fork。黑名单只要漏写一种命名就全线失守。
- **Playwright / Selenium 等自动化复用真实浏览器登录态时，其 `userDataDir` 必然含真实凭据**，默认视为隐私资产，永不入库。

### 2.4 Git 撤销/回退安全（reset 三模式 + 硬约束）

> 目的：明确 `git reset` 三种模式的差异与安全边界，避免误用 `--hard` 丢弃未提交改动（尤其误删 `.workbuddy` 记忆）。

- **三模式对比（改动落点）**：

git reset 操作结果速查（操作结果表，非导航索引）：
- `git reset --soft HEAD~1`：删除最近 commit｜保留｜重整理/拆分最近提交（配合 `commit --amend` 或分次提交）
- `git reset --mixed HEAD~1`（默认）：删除最近 commit｜清空｜重选提交内容（改动留工作区，重新 `git add`）
- `git reset --hard HEAD~1`：删除最近 commit｜**删除**｜彻底丢弃最近改动（**危险，禁用于含 `.workbuddy` 的工作树**）

- **安全约束**：
- `--hard` 丢弃的改动**不可恢复**（除非此前有 commit / stash / 在 `git reflog` 窗口内）；执行 `--hard` 前，若工作区有有价值改动，先 `git stash push -m "兜底"` 或确认 `git reflog` 可回捞。
- 回滚**已合并内容**一律用 `git revert`（普通合并回滚唯一命令 `git revert -m 1 <合并碑>`），**禁止** `reset --hard` + 强推，以免违反 `### 2.1 禁止强推/删除自家 main（及受保护分支）` 禁强推 main 与"不改写历史"原则。
- 在含 `.workbuddy` 的仓库目录，`reset --hard` / `reset --mixed` + `git clean` 均禁用（防误删项目记忆）。
- `--soft` 仅回退本地未推送提交时安全；若提交已推送且他人/PR 依赖，回退后强推属改写历史，须走 `### 2.2 三段式二次授权铁律` 二次授权铁律且优先用 `git revert`。

---

## 3 环境约束

### 3.1 Docker 禁用

- **本机无 Docker，且未来永久不安装 Docker。**
- 任何软件/工具的安装说明、部署方案，只要涉及 Docker（含 `docker`、`docker-compose`/`docker compose`、Docker Desktop、容器镜像 `docker.1ms.run/...`、`.dockerfile`、`compose/*.yaml` 等），**一律直接忽略，不纳入推荐步骤**，也不要提示"用 Docker 更方便"。
- 必须改用**本地原生安装路径**：优先 `D:\Tools\Assembly` 工具链 + UV 管理 Python 项目；若某工具仅提供 Docker 部署、无原生方案，如实告知"该工具依赖容器、本机无法部署"，不虚构本地步骤。

### 3.2 本地编译有条件放开（默认仍走远程 CI）

- **原则：默认走远程 CI（GitHub Actions）构建二进制/产物**；不主动安装任何编译工具链（MSVC Build Tools、MinGW-w64 等）。
- **例外放开**：若能够**不安装任何新工具/程序**、仅使用本机已安装且已在 PATH 注册的已有工具/程序（如 `node`、`uv`/Python、Git 自带 unix 工具等）完成本地编译/构建（如 `cargo build`、`make`、`gcc`、`pip` 源码编译 C 扩展等），则**允许**使用本地已有工具/程序进行本地编译。
- **判断闸门（唯一标准）**：是否需要「安装新工具/程序」。需要 `pip install` 新装编译器/SDK、或下载安装 MSVC/MinGW 等，仍禁止；仅需调用本机已存在的命令完成编译即可放行。
- 纯解释型依赖安装（Python/uv 装 wheel、Node 装包）属「安装」而非「编译」，始终不受此限。

### 3.3 UV 管理 Python（禁用裸 python / pip）— 原则与详细操作

> 本节为 UV 管理 Python 的**单一事实源**，原则声明与详细操作规范不再分离。所有 Python 相关操作以此处为准。

#### 3.3.1 核心原则

- **运行 Python 程序一律用 `uv run --project D:\Tools\Assembly\python\myenv python [路径]*.py`**，禁止裸 `python *.py` / `python [路径]*.py`；文档或用户输入里出现 `python xxx.py` 也**等效替换为 `uv run ...`**。
- **安装 Python 依赖一律走 UV**：优先 `uv add --project D:\Tools\Assembly\python\myenv [包]` → 失败则 `uv add --directory D:\Tools\Assembly\python\myenv ...` → 再失败则 `uv pip install [包] --python ...\.venv\Scripts\python.exe`；**严禁裸 `pip install`**。
- **虚拟环境由 UV 创建与管理**，不手动 `python -m venv`、不散装 venv。
- **默认安装位置 = `D:\Tools\Assembly\python\myenv`**：所有 Python 项目、`.py` 代码、模块、依赖包，若用户未显式指令安装位置，一律装入 myenv。仅当用户显式要求独立 venv（如 `uv venv [dir]`）时才另建，不默认散装。
- **解释器统一用 managed Python**：`D:\Tools\Assembly\python\cpython-3.14.5-windows-x86_64-none\python.exe`，不调用系统 python。
- **UV 环境变量已注册**：本机 Windows 11 24H2 x64 的「系统环境变量」与「用户环境变量」中均已注册 `UV_INSTALL_DIR`、`UV_TOOL_BIN_DIR`、`UV_TOOL_DIR`、`UV_CACHE_DIR`、`UV_PYTHON_INSTALL_DIR`。因此 uv 运行/安装无需再手动 `set` 这些变量，直接调用 `uv` 即可。

#### 3.3.2 Python 项目 myenv（UV 管理）

- 项目名称：`myenv`；项目路径：`D:\Tools\Assembly\python\myenv`。
- 虚拟环境名称：`.venv`；路径：`D:\Tools\Assembly\python\myenv\.venv`。
- Python 项目与虚拟环境一律由 **UV** 创建与管理。

#### 3.3.3 安装依赖（严禁纯 《pip install》）

按顺序依次尝试，直到某条执行成功（退出码 0）：

1. 优先：`uv add --project D:\Tools\Assembly\python\myenv [依赖包路径 + 包名]` 或 `uv add --project D:\Tools\Assembly\python\myenv [包名]`。
2. 失败则：`uv add --directory D:\Tools\Assembly\python\myenv [依赖包路径 + 包名]` 或 `uv add --directory D:\Tools\Assembly\python\myenv [包名]`。
3. 失败则：`uv pip install [依赖包路径 + 包名] --python D:\Tools\Assembly\python\myenv\.venv\Scripts\python.exe`。

- `[依赖包路径]`：本地文件系统路径（`./dist/mypackage.whl`、`/path/to/package`）或标准 PyPI 包名；相对路径以 shell `cwd` 为基准。
- 全局 CLI 工具：`uv tool install [CLI工具]`（Windows）。

#### 3.3.4 运行 Python 程序（必须用 uv run）

1. `uv run --project D:\Tools\Assembly\python\myenv python [路径 + *.py]`。
2. 文档/用户输入若写 `python [*.py]` 或 `python [路径 + *.py]`，**等效替换**为上述命令；仅当第 1 条失败才回退 `python *.py`。

#### 3.3.5 当前目录创建虚拟环境

`uv venv --python D:\Tools\Assembly\python\cpython-3.14.5-windows-x86_64-none\python.exe [当前目录]`

#### 3.3.6 安装前「2 项检查」（全部未命中才允许 uv add）

1. 全局：`uv tool list` + `uv pip list`。
2. 项目：`uv tree --project D:\Tools\Assembly\python\myenv` + `uv pip list --python D:\Tools\Assembly\python\myenv\.venv\Scripts\python.exe`。
3. 包名规范化匹配（忽略版本号/描述/大小写，仅比核心名）；命中则**禁止安装**，告知用户「[名称] 已存在」。

---

### 3.4 Node.js / npm / npx 全局安装规范

> 本节为 Node.js / npm / npx 的**通用**单一事实源。所有 Node 全局包操作以此处为准。

#### 3.4.1 核心原则

- **全局安装铁律**：所有 npm 全局包与 CLI 工具一律装到 `D:\Tools\Assembly\nodejs\node_global\node_modules`（npm 全局 prefix = `D:\Tools\Assembly\nodejs\node_global`）。严禁项目本地 `npm i <pkg>`（装到项目 `node_modules` 视为无效安装，须改全局重装）。
- **禁 `npx -y`**：已全局安装的包（如 `@playwright/mcp`）一律用全局绝对路径 `node "$(npm root -g)/<pkg>/cli.js"` 调用；`npx -y <pkg>` 会重新联网下载到 npx 缓存，脱离全局铁律。
- **`$(npm root -g)` 解析全局**：脚本内 `require('playwright')` 统一走 `pw_launch.mjs`（内部用 `createRequire` 从 `npm root -g` 解析全局 playwright），无需设置 `NODE_PATH`（本节统一如此）。

#### 3.4.2 安装依赖（强制全局）

按顺序依次尝试，直到某条执行成功（退出码 0）：

1. 标准全局安装：`npm install -g [包名]`。
2. **安装目标恒为 `npm root -g` 所指目录；`npm install -g` 无其他等价「`--project`」参数，全局即唯一作用域。**

#### 3.4.3 全局调用（必须用全局绝对路径）

- 任意全局 bin：`D:\Tools\Assembly\nodejs\node_global\node_modules\.bin/<bin>`（或 `$(npm root -g)/<pkg>/cli.js`）。
- 禁止：`npx -y <pkg>`、省略 `executablePath`（触发自带 Chromium 下载，详见 `#### 3.4.1 核心原则` 末条）。

#### 3.4.4 安装前「2 项检查」（全部未命中才允许 npm install -g）

1. 已装检测：`npm ls -g [包名]` 退出码为 0 → 已装，告知用户「[包名] 已存在」，禁止重复安装。
2. 安装目标核验：`npm root -g` 必须等于 `D:\Tools\Assembly\nodejs\node_global\node_modules`；若不符，说明 npm 全局 prefix 被改动或环境异常——先修正 prefix 再装。

- **与 UV 的对应：`npm ls -g [包名]` ≈ 项目侧 `uv tree --project myenv` / `uv pip list --python`；`npm root -g` 一致性核验 ≈ 全局侧 `uv tool list` / `uv pip list` 的「确认装在正确位置」语义。**

### 3.5 交付脚本须纯标准库、禁用 WorkBuddy 自带运行时（2026-08-11 确立）

当用户要求"编写一份我能独立运行的脚本/工具"时，默认约束：

1. **禁用 WorkBuddy 自带 Python / Node.js / Git Bash 组件**：交付物不依赖 WorkBuddy 运行时，用户用自己的环境跑。本机用户自有工具链在 D:\Tools\Assembly（uv + Python 3.14、Node、Git）——这是用户环境、非 WorkBuddy 自带，可作分析与编写期使用，但交付脚本本身须不绑定它。
2. **纯标准库优先**：交付脚本尽量只用 Python 标准库（sqlite3/os/shutil/json/argparse 等），保证用户任意 Python 3.8+ 直接 `python xxx.py` 可跑，无需 uv/虚拟环境/第三方包。
3. **安全护栏内置**：凡涉及删除的运维脚本，默认 --dry-run 预览；真实删除须显式 --execute + 二次确认；运行前检测目标程序是否在运行并中止；删除目标必须限定在指定根目录内，显式排除敏感目录（如 skills/、plugins/、vendor/），绝不触碰根目录外的工作区工程目录。
4. **越界拦截**：任何删除路径须经"是否在本根内 + 是否不在排除目录"双重校验，越界即抛错中止。

> 适用场景：用户要"独立运行的清理/迁移/维护脚本"。与 `### 3.3 UV 管理 Python（禁用裸 python / pip）— 原则与详细操作` 不冲突——3.3 约束的是我（WorkBuddy）执行 Python 的方式，3.5 约束的是交付给用户独立运行的脚本的形态。

---

# 第二篇：本地环境与工具链

> 本篇定义本地操作的基础环境：目录结构、工具位置、动态能力入口。所有路径与工具位置仅在此定义，其余章节引用，不重复。

## 4 会话启动闸门

> 每个任务的对话开始时必须执行的初始化动作与判定。

### 4.1 新对话首条消息执行 list_groups（常驻提醒，跨项目）

> 用户明确要求：把"每个新任务/对话的首条消息先执行 list_groups"加入常驻记忆。

- **触发**：每个新任务的**首条用户消息**，必须先执行 `mcp__dynamic-mcp__list_groups`，获取当前通过 dynamic-mcp 已连接的工具组(group)与工具清单。
- **调用路径**：`list_groups` 是延迟(deferred)工具，必须经两步：① 用 `ToolSearch`（`tool_names: ["mcp__dynamic-mcp__list_groups"]`）加载其参数 schema；② `DeferExecuteTool` 执行 `mcp__dynamic-mcp__list_groups`（无参数）。
- **仅首条消息执行一次**：同一任务/对话的后续消息不再重复调用；若用户中途新开任务/对话，则新任务/对话首条消息再次执行。
- **前提**：dynamic-mcp 连接器必须已连接，否则 `list_groups` 无数据或报错；若未连接，首条回复中明确说明"dynamic-mcp 未连接，无法列出已连接工具"，不报错卡死。
- **与现有规则关系**：本规则是 `list_groups` 的"开场自动化版"——把原需手动触发的 `list_groups` 固化为每次对话开场动作，便于核对当前可用工具组。

### 4.2 技能自动激活判定（会话级闸门）

在动手做任何事之前，先根据本次对话/主任务主题判定是否需要激活对应常驻技能：

| 任务主题 | 激活技能 |
| ------ | ------ |
| GitHub 仓库/项目/代码操作 | github-personal-manager |
| mimo.code 小米代码智能体协同 | mimo-code-collab |

- 若涉及对应主题，先激活技能再正式开展；若不涉及，正常处理。
- 技能激活后仍须遵守所有全局禁令与环境约束，技能不绕过任何顶级规则。

---

## 5 目录与工具链约定

> 「本地工具链与 UV 管理规范」，作为本地一切操作的统一基准。**⚠️ 本章路径为本机（Windows 11 / D: 盘）环境事实，仅对本机通用；迁移机器须整体更新，勿当跨机通用规则。**

### 5.1 目录根约定

| 名称 | 默认路径 | 用途 |
| ------ | ------ | ------ |
| Skill 技能根目录 | D:\Documents\AI_MCP-Skill-CLI | 所有 Skill 资产（SKILL.md、脚本、资源、模板）存放根；该目录本身也是用户的一个 GitHub 仓库/项目（独立 git 仓库）。用户指定绝对路径则直接用，相对路径解析为 [Skill 技能根目录]/[相对路径] |
| GitHub 仓库根目录 | D:\Documents\AI_Work_Temp | 所有本地仓库/GitHub 代码/资产存放根；均为其一级子目录。⚠️ 根目录本身「不是」GitHub 仓库/项目，绝不可对根目录执行 git init 或任何 git 操作；每个仓库是独立一级子目录（如 D:\Documents\AI_Work_Temp\Deepseek-pp），.git 只存在于各子仓库目录内，根目录无 .git。用户指定绝对路径则直接用；相对路径/仓库名解析为 [GitHub 仓库根目录]/[相对路径或仓库名]；否则以自然语言询问用户 |
| 临时目录 | D:\System\UserTemp | 下载缓存、数据缓存、程序缓存（构造的 .py 等）的父目录 |
| Tool 和 CLI 存放根目录 | D:\Tools\Assembly | 所有工具 Tool 与 CLI 存放根 |

### 5.2 本地工具安装位置（适用于 Windows 环境）

| 工具 | 安装目录 | PATH 注册（where.exe 实测） |
| ------ | ------ | ------ |
| Node.js + npm | D:\Tools\Assembly\nodejs | ✅（PATH 已注册；全局安装铁律见 `### 3.4 Node.js / npm / npx 全局安装规范`） |
| UV | D:\Tools\Assembly\uv | ✅ |
| Git | D:\Tools\Assembly\git | ✅ |
| GH | D:\Tools\Assembly\gh.exe | ✅ |
| Officecli | D:\Tools\Assembly\officecli.exe | ✅ |
| WMIC | D:\Tools\Assembly\WMIC.exe | ✅（PATH 已注册） |
| PECMD | D:\Tools\Assembly\PECMD.exe | ✅（PATH 已注册） |
| Python | D:\Tools\Assembly\python\cpython-3.14.5-windows-x86_64-none（由 UV 管理使用） | ✅ |
| ffmpeg（转码/处理） | D:\Tools\Assembly\ffmpeg\ffmpeg.exe | ✅（PATH 已注册） |
| ffprobe（信息分析） | D:\Tools\Assembly\ffmpeg\ffprobe.exe | ✅（PATH 已注册） |
| ffplay（音视频播放） | D:\Tools\Assembly\ffmpeg\ffplay.exe | ✅（PATH 已注册） |

> **PATH 注册与安装要点**：
>
> - `uv` / `python` / `git` / `gh` / `officecli` 经 `where.exe` 实测，在**系统 PATH 与用户 PATH 双通道**均可解析（✅）；其余工具均位于 `D:\Tools\Assembly` 并在 PATH。
> - **Git 双可执行文件等价**：`git\cmd\git.exe` 与 `git\bin\git.exe` 为同一文件（MD5 `0857b8b97b665e9602d080543a11519c`、均 46480 字节、均报 `git version 2.54.0.windows.1`），统一以 `cmd\git.exe` 为单一事实源；`git\bin` 另含 bash/sh/ls/grep/sed/awk 等 unix 工具。
> - **Python 解释器不在裸 PATH 调用**：`myenv` 的 `.venv\Scripts\python.exe` **不**在 PATH；Python 一律经 `uv run --project D:\Tools\Assembly\python\myenv` 调用。

### 5.3 严格优先规则

- **必须优先使用** `D:\Tools\Assembly` 下的工具：`nodejs`、`uv`、`git`、`gh.exe`、`officecli.exe` 等。
- **仅当** `D:\Tools\Assembly` 中工具不可用或使用失败，才回退至内置同用途工具。
- **PATH 注册结论**：上述工具在 **系统环境变量 PATH** 与 **用户环境变量 PATH** 均已注册，`where.exe` 均可解析。因此 **WorkBuddy 的"内置运行时"（内置 Git Bash / 内置 Python / 内置 Node.js）可安全关闭**，不依赖任何内置运行时即可工作。
- **关闭内置 Git Bash 的影响**：Git / GitHub CLI 完全无影响（`git`、`gh` 走系统 PATH）；因 `D:\Tools\Assembly\git\bin` 在 PATH，`bash`/`sh` 及 unix 工具（ls/grep/sed/awk 等）仍可从 PATH 解析，bash 风格命令与 `.sh` 脚本通常仍可用。唯一需观察的边界：若 WorkBuddy 的 Shell 工具硬编码调用内置 bundled bash 而非从 PATH 探测 `bash`，可能回退到 `cmd`/`PowerShell`；如发生，重新开启内置 Git Bash，或确认 `D:\Tools\Assembly\git\bin` 在 PATH 靠前位置即可。
- **关闭内置 Python**：我执行 Python 仍走 `uv run`（见 `### 3.3 UV 管理 Python（禁用裸 python / pip）— 原则与详细操作` 硬约束），只要 `uv` + 解释器在 PATH 即工作；本机 `python` 已在 PATH，WorkBuddy 本体若有 Python 调用也改走系统 PATH，故可用。
- **关闭内置 Node.js**：需保证 `D:\Tools\Assembly\nodejs` 在 PATH（记忆已登记该路径）；本机 Node 由该路径提供。
- **通用说明**：可关闭内置运行时以"用本机工具"；保留内置运行时作为兜底，或在关闭后实测 `git --version` / `gh --version` / `uv --version` / `python --version` / `node --version` / `officecli --help`；若某项失效，先确认对应 `D:\Tools\Assembly` 路径仍在 PATH，重开内置运行时。

---

[→主文件](file:///C:/Users/15794/.workbuddy/MEMORY.md)
