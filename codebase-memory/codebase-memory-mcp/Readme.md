# codebase-memory — DeusData 本地代码知识图谱 · 安装、运维与演进手册

> 上游项目（DeusData / codebase-memory-mcp）：[github.com/DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)

> 本文档给人看，也是接手 Agent 在**跟踪上游仓库、演进代码与版本**时的使用手册。任一不了解本项目/本 Skill 的 Agent 读完本目录 `README.md` + `SKILL.md` 后，应可自主、自动地完成安装、配置、验证与上游演进。
> Agent 日常调用的精简操作参考见同目录 `SKILL.md`（面向 WorkBuddy/Agent，非人读）。

---

## 0. 与 dynamic-mcp 的关系（说明性边界）

**DeusData 与 dynamic-mcp（dmcp）是两个相互独立的程序。**

- **DeusData / codebase-memory-mcp**：纯本地、只读的代码知识图谱（影响面分析）引擎，本手册的主体。只负责"理解本地代码结构 / 评估改动影响 / 追踪调用链"，不写代码、不执行 git、不连远程。
- **dynamic-mcp（dmcp）**：独立的 MCP 聚合器程序（本机为 Rust 实现的用户 Fork），职责是把多个 MCP server 组织成 `group` 并代理调用，让 WorkBuddy 按需加载工具描述。DeusData 是被它代理的其中一个 backend。

两者通过 `D:\Tools\MCP_Bridge\dynamic-mcp.json` 中的一个 backend 配置解耦连接：**DeusData 的本地部署路径、cache 目录、接入超时等，全部由该配置文件持有；DeusData 自身文档不耦合 dmcp 的实现细节。**

> dmcp 侧的初始化超时、group 枚举冻结、重连、补丁演进等，属于 dmcp 程序自身的运维，不在本文档范围。若经 dmcp 接入遇"backend 初始化超时 / 枚举冻结 / `group must be equal to allowed values`"等问题，参考 dmcp 项目文档（本机源码镜像 `D:\Documents\AI_Work_Temp\dynamic-mcp`）。

---

## 1. 概述

### 1.1 这是什么
**DeusData / codebase-memory-mcp** 是一个**纯本地、只读**的代码知识图谱（影响面分析）引擎。当前接入版本 **v0.10.2**。

- 形态：**纯 C 单二进制**（`codebase-memory-mcp.exe`，约 296MB），**零运行时依赖、无 API key、无外网**。
- 能力：158 种语言解析；构建调用图/使用图/导入图/继承图；影响面分析、调用链追踪、死代码定位、本地 git 变动爆炸半径（blast radius）映射。
- 接口：暴露 **15 个 MCP 工具**（stdio / 也可经 HTTP）。
- 性质：**只读**——不写文件、不 push、不改代码。

### 1.2 为什么本地优先
- 代码不出本机（隐私/合规适合中铁二院等内部代码场景）。
- 无云端配额/费率/网络抖动；大仓（如 Deepseek-pp ~9000 节点）秒级查询。
- 与远程 GitHub 操作解耦：远程变动走 `gh`，本地理解走 DeusData。

### 1.3 与 WorkBuddy 的关系（说明性）
WorkBuddy 不直接拉起 DeusData，而是经 **dynamic-mcp（dmcp）聚合代理** 路由。dmcp 把多个 MCP server 组织成 `group`，按需把某组的工具描述喂给 LLM，调用时再代理到上游。本机 DeusData 是 dmcp 的一个 backend `group`（注册名 `codebase-memory-mcp`）；该 backend 的 `command`/`env` 指向本手册部署的本地目录（见第 4 节）。

```
WorkBuddy (Agent)
   │  call_dynamic_tool(group="codebase-memory-mcp", name=<工具>, args=<…>)
   ▼
dynamic-mcp（dmcp 聚合器，独立的 group 路由层）
   │  按 dynamic-mcp.json 的 backend 配置拉起
   ▼
DeusData（codebase-memory-mcp.exe，纯本地只读图引擎）
```

### 1.4 适用场景与边界（深度挖掘）

DeusData 的本质是**纯本地、离线、只读**的代码知识图谱引擎（无 LLM、无 API key、无网络；15 工具全是"建图/读图"，无一是写代码、执行 git 或访问远程）。这决定了它的适用边界：**只覆盖"本地代码认知/评估"环节，不覆盖"写入动作"和"远程协作"**。

#### 1.4.0 激活原则（最关键）：按任务语义，而非术语关键词
用户的高频表述是**研发活动**，不会显式说出"理解现有代码、评估影响面、追踪调用链、定位死代码、本地改动 impact 自检"等底层术语。典型用户原话："分析一下这个 GitHub 仓库""改这段代码的 X""定位/修复这个 BUG""审计/审查一下代码""根据 PR 审查意见核查这里""接手这个项目"。**Agent 必须由"研发活动语义"推断并默认激活 DeusData**，把其图能力作为认知与导航的第一手段（替代盲目全仓 grep、逐文件 Read），从而：
- **提高定位精度**：调用链/影响面精确到符号级，避免 grep 噪声。
- **缩减 Agent 的 Token 消耗**：图谱返回结构化结果，比读几十个文件省 ~120× token。
- **降低开发成本**：改前看清影响、改后验证半径，避免"改一个炸一片"的回归。

⚠️ 反模式：把 `description` 写成术语关键词清单、等关键词出现才激活——用户根本不会说这些词，会导致 DeusData 永不激活。**正确做法：命中下列研发活动且目标是本地已索引代码，即默认激活。**

#### 1.4.1 适用场景矩阵（研发活动 → DeusData 底层能力）

| 研发任务 | DeusData 怎么用 | 关键工具 | 价值 |
|---|---|---|---|
| **修改现有代码 / 加功能** | 改前用 `trace_path`(inbound) 看"谁调了 X"、改动会波及哪些调用方；用 `get_code_snippet` 看 X 实现、`search_graph` 找全部调用点；改完用 `detect_changes` 验证爆炸半径是否在预期 | `trace_path` `search_graph` `get_code_snippet` `detect_changes` | 改前看清、改后验证，避免"改一个炸一片" |
| **重构（重命名/移动/拆分）** | 评估重命名/移动函数的影响半径；`search_graph` 找零调用者死代码（删除前确认无引用）；`get_architecture`(cycles) 看循环依赖、定位重构目标 | `trace_path` `search_graph` `get_architecture` | 安全重构，先量化影响再动手 |
| **修复 BUG** | `trace_path`(data_flow) 追踪"错误/异常从哪来"定位根因；`search_graph` 找相关符号理解上下文；`get_code_snippet` 看可疑实现；修复后 `detect_changes` 验证未引入回归 | `trace_path` `search_graph` `get_code_snippet` `detect_changes` | 静态图定位根因 + 验证修复波及 |
| **代码分析 / 代码阅读（理解陌生或大型代码库）** | `get_architecture` 看整体结构/入口点/依赖/热点；`search_graph` 找符号与关系（替代 grep 全仓扫）；`trace_path` 看控制流；`query_graph`(openCypher) 多跳聚合 | `get_architecture` `search_graph` `trace_path` `query_graph` | DeusData 主场：比逐文件 Read 省 ~120× token |
| **分析 GitHub 仓库内容 / 程序项目（多级目录嵌套的代码文件 + 技术文档）** | 已克隆到本地的仓库/项目：`get_architecture` 看模块边界与入口点、`search_graph` 按关键词/文件名定位实现与文档、`trace_path` 理解控制流 | `get_architecture` `search_graph` `trace_path` | 复杂项目快速建立结构认知，免逐目录翻读 |
| **审计代码 / 审查代码 / 代码评审** | 结构概览定位可疑实现；`query_graph` `NOT EXISTS { (f)<-[:CALLS]-() }` 找死代码；`get_architecture`(cycles/hotspots) 找循环依赖与热点；`get_code_snippet` 看具体实现 | `get_architecture` `query_graph` `get_code_snippet` | 结构化审视质量与风险 |
| **基于 PR 审查意见核查 / 定位代码问题** | 依审查意见中的符号/文件，用 `search_graph` 定位、`trace_path` 评估波及、`get_code_snippet` 看实现、`detect_changes` 看本地改动半径 | `search_graph` `trace_path` `get_code_snippet` `detect_changes` | 把文字意见映射到精确代码位置与影响 |
| **死代码 / 技术债务定位** | `query_graph` `NOT EXISTS { (f)<-[:CALLS]-() }` 找无调用者函数；`get_architecture`(clusters/cycles/hotspots) 找循环依赖、高复杂度热点、模块边界 | `query_graph` `get_architecture` | 量化债务，定位删除/优化候选 |
| **库 / API 迁移升级** | `search_graph`(name_pattern) 扫描某 API/类/方法的全部使用点；`trace_path` 评估迁移波及；`query_graph` 跨文件聚合 | `search_graph` `trace_path` `query_graph` | 迁移前量化工作量与风险 |
| **本地未提交 git 改动 impact 自检** | `detect_changes` 把未提交 diff 映射到受影响符号 + 爆炸半径（transitive impact） | `detect_changes` | 提交前自查"这次改动会动到哪些" |
| **新人接手 / onboarding 本地项目** | `get_architecture` + `search_graph` 快速建立心智模型 | `get_architecture` `search_graph` | 快速上手陌生代码库 |

#### 1.4.2 不适用场景与根因（务必规避）

| 任务 | 不适用根因 | 正确归属 |
|---|---|---|
| **纯新增代码**（从零写新文件，无既有图可查） | 图谱源于既有代码，新文件尚无图 → DeusData 帮不上 | 直接 Write/Edit |
| **实际写入文件**（Write/Edit 动作本体） | DeusData 只读，不写文件 | 文件系统 / Write-Edit 工具 |
| **git 写动作**（add/commit/push/branch/rebase/merge） | DeusData 不执行 git | git / gh CLI |
| **未克隆到本地的远程 GitHub 仓库浏览**（PR/CI/Issue/fork sync/远端 diff/未克隆仓库内容分析） | DeusData 纯本地、无"远程"概念，不连网 | `gh` + `github-personal-manager` |
| **运行时调试**（断点/日志/性能 profiler） | DeusData 是**静态**图，不运行代码，看不到动态行为 | 实际运行 + 调试器 |

⚠️ 常见误用：以为 DeusData 能 review 远程 PR 的 diff（错，不连远程）；以为改完代码它自动同步 GitHub（错，push 是 `gh` 的事）；把 DeusData 当万能 grep（图覆盖不足时 `check_index_coverage` 报 gap，仍需退化 grep/Read 确认精确实现）。⚠️ 另一大反模式：**等用户说出"调用链/影响面"等术语才激活**——用户只会说研发活动（见 1.4.0），不会说底层术语，按术语匹配会导致永不激活。

#### 1.4.3 激活决策表（Agent 用，按任务语义默认激活）
- 请求是下列研发活动、且目标是**本地已索引代码** → **默认激活**本 Skill，把图作为认知第一手段：分析本地代码/项目（含已克隆的 GitHub 仓库、多级目录嵌套代码+文档）、修改代码/加功能/重构、定位 BUG/修复 BUG/查找 BUG、审计代码/审查代码/代码评审、基于 PR 审查意见核查或定位问题、接手代码/项目。
- 请求是下列例外 → **不激活**，走对应工具：纯新增代码（Write/Edit）；写入/git 写动作本体；**未克隆**的远程 GitHub 仓库浏览（gh + github-personal-manager）；运行时调试。细分：已克隆到本地的仓库内容分析 → 激活；未克隆的远端仓库内容 → 不激活。

#### 1.4.4 协同闭环（三段分工）

```
DeusData（本地图：认知第一手段——理解结构 / 改前看清影响 / 改后验证半径）── 认知
   │ 产出"改什么、影响什么、问题在哪"
   ▼
Write/Edit + git（本地写入 + 本地版本动作）── 产生本地改动
   │
   ▼
gh + github-personal-manager（远程协作：未克隆仓库浏览 / PR / CI / sync）── 推到远程 / 查远端
```

DeusData 只负责第一段（认知）；命中 1.4.3 研发活动且目标是本地代码时**默认激活**，命中例外时不激活。

---

## 2. 系统架构与数据流（说明性）

```
┌─────────────────────┐      stdio / HTTP       ┌──────────────────────┐      stdio       ┌──────────────────────┐
│   WorkBuddy (Agent)  │ ───────────────────────▶│  dynamic-mcp (dmcp)  │ ────────────────▶│  DeusData (cbm exe)  │
│  call_dynamic_tool   │ ◀───────────────────────│  group=codebase-...  │ ◀────────────────│  15 MCP 工具 / 图谱  │
└─────────────────────┘      tool result         └──────────────────────┘      result       └──────────────────────┘
```

- **权威验证通道**：经 dmcp 暴露的 `list_groups` / `get_dynamic_tools` / `call_dynamic_tool`（由 WorkBuddy 连接器原生工具调用，绕过 dmcp 的 HTTP 代理层 session 机制）。
- DeusData 经 dmcp 路由；dmcp 内部实现（HTTP 端点、session、重连）属 dmcp 程序自身，不在本文档展开。

---

## 3. 安装与部署

### 3.1 获取 DeusData 二进制
- 上游：DeusData 官方发布页 / GitHub Releases，下载 **Windows exe**（v0.10.2）。
- 本机落点：`D:\codebase-memory-mcp\codebase-memory-mcp.exe`。
- ⚠️ **目录放置铁律**：必须放在"仅以卷根为祖先"的路径（如 `D:\codebase-memory-mcp`）。**切勿放 `D:\Tools\*` / `D:\Tools\Assembly\*`**——这些中间祖先目录给 Authenticated Users 授予了变更权，会触发 DeusData 的 `cache-private` 拒绝（见 3.3 与 9.2）。

### 3.2 Defender 误报处理
Windows Defender 可能把单二进制判为 `Wacatac` 误报。下载后执行：
```powershell
Unblock-File -Path 'D:\codebase-memory-mcp\codebase-memory-mcp.exe'
```
去掉 `Zone.Identifier` 备用数据流流，否则首次运行会被拦截。

### 3.3 三层私有锁（ACL）—— 缺一不可
DeusData 对 cache 目录强制私有锁（`cache-private` 拒绝会令 daemon 超时卡死）。三层校验：

**(a) `data` 目录自身 owner-only**
```powershell
icacls "D:\codebase-memory-mcp\data" /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"
```
要求：`AceCount==1` + `SE_DACL_PROTECTED` + 单用户 `FILE_ALL_ACCESS` 非继承。

**(b) `data` 内每个 `.db` 文件 owner-only**
`icacls /grant:r` 只替换授权、不删其他 ACE（残留 SYSTEM/Administrators）→ 仍判 `cache-private`。**可靠做法用 `.NET FileSecurity` 重建干净 DACL**：
```powershell
$path = "D:\codebase-memory-mcp\data\somedb.db"
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)   # 不继承 + 清继承 ACE
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $env:USERNAME, "FullControl",
    [System.Security.AccessControl.InheritanceFlags]::None,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($rule)
Set-Acl -Path $path -AclObject $acl
```
（所有 `.db` 均需此处理；可 `Get-ChildItem ... *.db | ForEach-Object { ... }` 批量。）

**(c) 祖先目录链**
沿 exe/cache 路径向上遍历，任一**中间祖先**给 Authenticated Users 授予变更权（`0x00010`）即拒绝；卷根 `D:\` 豁免。这也是"勿放 `D:\Tools\*`"的根因。

### 3.4 数据库迁移铁律
`.db` 绑定原 `CBM_CACHE_DIR`，复制到别处会 daemon 30s 超时卡死。**迁移 = 新位置建干净 `data` + 设 owner-only（3.3）+ 重新 `index_repository`**，绝不是复制数据库。

### 3.5 配置落点
- `CBM_CACHE_DIR=D:/codebase-memory-mcp/data`：cache 根（每项目一个 `.db`；`_config.db` 存配置；`logs/` 存 `cbm-daemon.log`）。
- `CBM_ALLOWED_ROOT=D:/Documents`：越界 `index_repository` 会被拒（兜底安全）。
- ⚠️ 上游 `install.ps1` 不识别 WorkBuddy，须**手动**编写 `dynamic-mcp.json` 的 `codebase-memory-mcp` backend（见第 4 节），不要依赖自动安装脚本；本机当前即手写配置。

### 3.6 全局用户配置文件与项目级配置文件

codebase-memory-mcp 除 3.5 的环境变量、第 4 节的 dmcp 接入、运行时 `_config.db` 之外，还有「全局用户配置文件」与「项目级配置文件」两层。**全局用户配置文件（config.json）**承载两类全局配置：扩展名映射（`extra_extensions`）与 UI 设置（`ui_enabled` / `ui_port`）。

#### 3.6.1 全局用户配置文件（config.json：单文件承载两类配置）

上游文档（docs/CONFIGURATION.md）在 Unix 上把该文件的两类职责拆成两个不同路径：

- **全局扩展名映射**（键 `extra_extensions`）：Unix 落在 `$XDG_CONFIG_HOME/codebase-memory-mcp/config.json`，回退 `~/.config/codebase-memory-mcp/config.json`；
- **UI 设置**（键 `ui_enabled` / `ui_port`）：Unix 落在 `${CBM_CACHE_DIR}/config.json`。

**Windows 实测落点（本机 v0.10.2，权威）**：Windows 没有 `~/.config` 与 `~/.cache` 之分，cbm 把这两类配置**合并到同一个文件**——

> **`%LOCALAPPDATA%\codebase-memory-mcp\config.json`**
> 即本机：`C:\Users\15794\AppData\Local\codebase-memory-mcp\config.json`

- ⚠️ 上游 Unix 文档写的 `~/.config/codebase-memory-mcp/config.json` **在 Windows 上不存在**（本机 `C:\Users\15794\.config` 整目录不存在）；本文档此前版本误将其当作 Windows 落点，已更正。
- ⚠️ 本机实测：UI 设置配置**未**随 `CBM_CACHE_DIR=D:/codebase-memory-mcp/data` 重定向到 data 目录，仍落在 `AppData\Local`（该文件创建于设置 CBM_CACHE_DIR 之前，且 Windows 默认用户数据根为 LOCALAPPDATA）。一切手工改配置均以 `AppData\Local` 下的该文件为准。
- 该目录与文件**默认不存在**，启用 UI 的二进制在发现已校验资源包且尚无 UI 配置时会自动创建并写入 `ui_enabled`/`ui_port`；**缺失则忽略**，不影响运行。

**支持的配置参数（全部写入同一个 config.json）**：

| 参数 | 类型 / 默认 | 用途 / 功能 | 配置方法 | 注意事项 |
|---|---|---|---|---|
| `extra_extensions` | 对象，默认无 | 把非标准扩展名映射到内置语言（如 `.blade.php→php`、`.mjs→javascript`、`.twig→html`），纳入索引与图谱解析 | 键=带前导点的扩展名，值=语言名（大小写不敏感） | 扩展名**必须带前导点**；未知语言名**静默跳过**（仅告警不报错）；文件缺失则忽略；与项目级冲突时**项目级优先** |
| `ui_enabled` | 布尔，默认 `false` | 是否启用内置图谱可视化 UI | `true` / `false` | 启用 UI 的二进制首次发现已校验资源包且无 UI 配置时自动启用；资源缺失则 UI 保持禁用，MCP/daemon 服务照常可用 |
| `ui_port` | 整数，默认 `9749` | UI 监听端口 | 任意可用端口号 | 与 `ui_enabled` 配合；修改后按需重启 UI |

**完整 JSON 示例（单文件同时含两类配置）**：
```json
{
  "ui_enabled": false,
  "ui_port": 9749,
  "extra_extensions": {
    ".blade.php": "php",
    ".mjs": "javascript",
    ".twig": "html"
  }
}
```


#### 3.6.2 项目级配置文件（覆盖全局）

放在**被索引仓库的根目录**（不是 cbm 程序目录），格式与全局 `extra_extensions` 相同：

- **`.codebase-memory.json`**：仓库级扩展名映射，覆盖冲突的全局条目。例：`{"extra_extensions": {".vue": "javascript"}}`。
- **`.cbmignore`**：仓库级索引排除（gitignore 语法，已在 5.5 说明），控制哪些文件/目录不进入图谱。

> 这两类文件属于**被索引的项目**，不属于 cbm 程序目录；随项目提交可团队共享，或列入项目 `.gitignore` 仅本地生效。

#### 3.6.3 配置层次总览（避免混淆）

| 配置 | 位置 | 管理方 | 作用 |
|---|---|---|---|
| 全局扩展映射 + UI 设置 | `%LOCALAPPDATA%\codebase-memory-mcp\config.json`（Win，本机 `C:\Users\15794\AppData\Local\codebase-memory-mcp\config.json`）；Unix `~/.config/codebase-memory-mcp/config.json` | 用户手写 | `extra_extensions` / `ui_enabled` / `ui_port` 全局默认 |
| 项目级扩展映射 | `<repo>/.codebase-memory.json` | 用户/项目手写 | 覆盖全局 `extra_extensions` |
| 项目级索引排除 | `<repo>/.cbmignore` | 用户/项目手写 | 控制索引范围 |
| 运行时设置 | `CBM_CACHE_DIR/_config.db` | `cbm config` 子命令 | `auto_index` 等运行时开关 |
| 运行参数 | 环境变量 `CBM_CACHE_DIR`/`CBM_ALLOWED_ROOT` | dmcp `dynamic-mcp.json` | cache 根 / 索引越界限制 |

---

## 4. dmcp 接入配置（dynamic-mcp.json）

位置：`D:\Tools\MCP_Bridge\dynamic-mcp.json`。`codebase-memory-mcp` backend 规格（这是 DeusData 经 dmcp 接入的**功能性配置**，须与本地部署路径一致）：

```json
"codebase-memory-mcp": {
  "description": "本地代码知识图谱（DeusData v0.10.2）：影响面/调用链/死代码/本地 git 变动 impact 分析，纯本地零运行时，158 语言。...",
  "command": "cmd.exe",
  "enabled": true,
  "args": ["/c", "D:/codebase-memory-mcp/codebase-memory-mcp.exe"],
  "env": {
    "CBM_CACHE_DIR": "D:/codebase-memory-mcp/data",
    "CBM_ALLOWED_ROOT": "D:/Documents"
  },
  "timeout": {
    "initialize": "120s",
    "tools": "5min",
    "resources": "60s",
    "prompts": "60s"
  }
}
```

> **说明（dmcp 侧，非 DeusData 范畴）**：`timeout.initialize` 给 cbm 冷启动留足时间；该字段是否生效取决于 dmcp 二进制是否支持可配置 initialize 超时（属 dmcp 程序演进）。若 cbm 经 dmcp 接入遇初始化超时，从 dmcp 侧排查，不在本文档。

### 4.1 group 注册名
dmcp 内注册名为 `codebase-memory-mcp`（保持稳定，作为逻辑标识，与本地物理目录名解耦）。调用统一走：
```
call_dynamic_tool(group="codebase-memory-mcp", name=<后端工具>, args=<…>)
```
参数键是 `args`（**不是** `arguments`）。

---

## 5. 监控模型与索引管理

### 5.1 两个监控根
- `D:\Documents\AI_Work_Temp`：所有本地 GitHub 仓库根；每个**一级子目录 = 一个独立项目**（git/非 git 混合），频繁增删。
- `D:\Documents\AI_MCP-Skill-CLI`：独立 git 仓库，单独维护。

### 5.2 逐子目录索引（整树崩溃）
**AI_Work_Temp 必须逐一级子目录 `index_repository`**。整树单一项目会在目录枚举阶段被顶层散落文件/嵌套 `.git` pack 硬崩。

### 5.3 对账例程（增删子目录零手动同步）
DeusData **不会自动发现新子目录**（`auto_index` 仅补齐已知项目）。会话启动/按需：
1. `list_projects` → 已索引集合 A。
2. `Get-ChildItem D:\Documents\AI_Work_Temp -Directory` → 磁盘集合 B。
3. 新增（b∈B, b∉A）→ `index_repository(repo_path=b, mode="moderate")`。
4. 删除（a∈A 且磁盘已不存在）→ 列清单请用户确认 → `delete_project`。
5. 变更：git 子目录靠 `auto_watch` 自动增量；非 git 子目录 `detect_changes` 看 `impacted_total` 非 0 才手动重索引。
6. 报告（新增 N / 删除 M / 重索引 K）。`_` 前缀探针目录默认不索引。

### 5.4 索引模式（mode）
- `full`：最全最慢，含 similarity/semantic 边。
- `moderate`：推荐默认（filtered + similarity/semantic）。
- `fast`：最快，无 similarity/semantic。
- `cross-repo-intelligence`：跨仓库关联 Routes/Channels（需 `target_projects`，前置各项目 fresh index）。

### 5.5 配置项
- `.cbmignore`：项目根忽略（同 `.gitignore` 语法）。⚠️ cli 手动建图时不读，仅 watcher 自动重索引生效。
- `auto_watch`（默认 true）：git 项目自动增量（仅 git 有效）。
- `auto_index`（本机 true）：补齐已知但未索引/过期项目，**不发现新子目录**。
- 配置入口：`codebase-memory-mcp config <list|get|set|reset> <键>`；存于 `CBM_CACHE_DIR/_config.db`。

### 5.6 覆盖可信度
- `index_status`：覆盖报告（`parse_partial` 已索引但部分行未解析；`skipped` 完全未索引；`not_indexed` 按设计排除）。
- `check_index_coverage`：精确路径/前缀范围的权威可信度（负向/穷举论断前必查）。
- `query_graph(graph="missed")`：查仅未全索引文件的结构（`f.kind='parse_partial'`）。
- ⚠️ 被标记的文件**务必再 grep 该范围**；"absence from graph" 不是完整性保证。

---

## 6. 完整 15 工具参考（权威，从 DeusData 实时校正）

> 校正（2026-08-14）：旧资料误列 `semantic_query` 为独立工具（实为 `search_graph` 的**数组参数**）；漏列 `check_index_coverage`；`trace_path` 无 `trace_call_path` 别名。以下为 `get_dynamic_tools` 实时拉取的 15 工具。

### 6.1 index_repository — 建/刷新索引（加项目的唯一方式）
- 必需：`repo_path`。可选：`mode`(full/moderate/fast/cross-repo-intelligence)、`name`、`persistence`(写 graph.db.zst 共享)、`target_projects`(cross-repo 模式)。
- 返回含覆盖报告：`skipped`(完全未索引)、`parse_partial`(索引但部分行未解析)、`not_indexed_files`/`excluded`(按设计排除)。

### 6.2 list_projects — 列出已索引项目
- 参数：无。返回每项 `name`/`root_path`/`branch`/`nodes`/`edges`/`size_bytes`。

### 6.3 delete_project — 删除项目
- 必需：`project`（list_projects 的 name）。

### 6.4 index_status — 索引状态 + 覆盖报告
- 必需：`project`。可选：`verbose`(含 git 上下文)。报告 `parse_partial`/`skipped`/`not_indexed`。

### 6.5 check_index_coverage — 权威覆盖元数据
- 必需：`project`；`paths`(精确文件，≤128) 或 `scopes`(前缀，`.`=根，≤32) 二选一。
- 返回覆盖状态（区别于文件系统新鲜度）+ 结构化解析错误范围 + 源码回退动作。**被引用/操作的文件、负向/穷举论断前必查**。

### 6.6 search_graph — 结构化图搜索（替代 grep）
- 必需：`project`。三模式可组合：
  - `query`：BM25 自然语言/关键词（camelCase 分词 + 结构加权：Function/Method +10、Route +8、Class/Interface +5）。
  - `name_pattern`：正则精确匹配（提供时忽略 query）。
  - `semantic_query`：**数组** of 关键词（向量余弦，桥接词汇）。结果在 `semantic_results` 字段。
- 可选：`label`/`file_pattern`/`qn_pattern`/`min_degree`/`max_degree`/`fields`(额外列)/`format`(tree/json)/`detail`(ids/default)/`exclude_entry_points`/`include_connected`/`relationship`。
- 分页：`limit`(默认 50) + `offset` + 响应 `total`/`has_more`；截断时递增 offset 直到 has_more=false。

### 6.7 trace_path — 调用链/数据流/跨服务追踪（替代 grep 找调用者）
- 必需：`function_name`、`project`。可选：`mode`(calls/data_flow/cross_service)、`direction`(inbound/outbound/both)、`depth`(默认 3)、`edge_types`、`limit`(默认 100)、`cursor`(分页)、`format`、`include_tests`、`include_evidence`(解析策略+置信度)、`risk_labels`、`parameter_name`(data_flow)。
- 返回前缀分组树 + 精确 `callees_total`/`callers_total`；`truncated`+`next` 用 cursor 翻页。
- ⚠️ 多匹配符号（如 `main`）返回 ambiguous 建议列表，需用 `qualified_name`。

### 6.8 detect_changes — git diff 爆炸半径
- 必需：`project`。可选：`base_branch`(默认 main)、`depth`(默认 2)、`direction`(inbound 默认/ outbound/ both)、`scope`(files/impact 默认)、`since`(如 HEAD~5)、`limit`、`format`。
- 返回 base/merge_base SHA、`changed_files`、`impacted`(transitive impact 树) + `impacted_modules` 汇总 + `impacted_total`(精确)。

### 6.9 query_graph — 只读 openCypher
- 必需：`query`、`project`。可选：`graph`(code/missed)、`max_rows`(100k 硬上限)。
- 复杂多跳/聚合/跨服务；`graph="missed"` 查未全索引文件结构。

### 6.10 get_graph_schema — 图 schema
- 必需：`project`。返回节点标签/边类型。

### 6.11 get_code_snippet — 读源码
- 必需：`qualified_name`(先 search_graph 取)、`project`。可选：`include_neighbors`。
- 带 `coverage_note` 时文件仅部分索引，该范围宜再 grep，返回源码以之为准。

### 6.12 get_architecture — 架构概览
- 必需：`project`。可选：`aspects`(all/overview/structure/dependencies/routes/languages/packages/entry_points/hotspots/boundaries/layers/file_tree/clusters/**cycles**)/`path`(目录前缀)。
- `clusters`：Leiden 社区检测，浮现跨越文件夹的真实模块边界；`cycles` 仅 opt-in。

### 6.13 search_code — 图增强 grep
- 必需：`pattern`、`project`。可选：`mode`(compact/full/files)、`file_pattern`、`path_filter`(正则)、`limit`(默认 10)、`context`、`regex`。
- 去重到函数 + 结构排序（定义优先、测试最后）；响应 `total_grep_matches`/`total_results` 检测截断（无 offset，靠 limit/path_filter 缩小）。

### 6.14 manage_adr — 架构决策记录 CRUD
- 必需：`project`。`mode`(get/update/sections)；`content`(update 时完整替换)。

### 6.15 ingest_traces — 摄取运行时追踪
- 必需：`project`、`traces`(数组：caller/callee/count)。验证 HTTP_CALLS/ASYNC_CALLS 边。

---

## 7. openCypher 查询参考
- 子句：`MATCH` `OPTIONAL MATCH` `WHERE` `WITH` `RETURN` `ORDER BY` `SKIP` `LIMIT` `DISTINCT` `UNWIND` `UNION` `CASE`。
- 节点标签：`Project` `Package` `Folder` `File` `Module` `Class` `Function` `Method` `Interface` `Enum` `Type` `Route` `Resource`。
- 边类型：`CONTAINS_*` `DEFINES` `IMPORTS` `CALLS` `CALL_REFERENCE` `USAGE` `IMPLEMENTS` `INHERITS` `MEMBER_OF` `TESTS` `USES_TYPE` `HTTP_CALLS` `ASYNC_CALLS` `SIMILAR_TO` `SEMANTICALLY_RELATED` `CROSS_*`。
- 示例：
  ```cypher
  MATCH (f:Function)-[:CALLS]->(g) WHERE f.name = 'main' RETURN g.name
  MATCH (f:Function) WHERE NOT EXISTS { (f)<-[:CALLS]-() } RETURN f.name LIMIT 50
  MATCH (f:File) WHERE f.kind = 'parse_partial' RETURN f.file_path, f.detail
  ```
- 不支持：写操作、`MERGE`、`CALL`、列表/映射字面量、参数（报 `unsupported …`）。

---

## 8. 运维与排错

### 8.1 日志位置
- `D:\codebase-memory-mcp\data\logs\cbm-daemon.log`（索引/守护进程日志）。

### 8.2 常见问题对照表
| 症状 | 根因 | 修复 |
|---|---|---|
| `cache-private` 拒绝 / daemon 30s 超时 | 三层 ACL 任一层不满足 / 目录在 `D:\Tools\*` | 见 3.3；移出 `D:\Tools\*` |
| 整树索引崩溃 | AI_Work_Temp 未逐子目录 | 改逐子目录索引（5.2） |
| `git status` 见 `?? nul` 且索引 Pipeline failed | Windows 保留名文件 | 移出/删除后再索引 |
| ⚠️ 经 dmcp 接入时 backend 初始化超时 / `group must be equal to allowed values` | 属 **dynamic-mcp 聚合器侧**问题（初始化超时、group 枚举冻结等） | 参考 dmcp 项目文档（本机 `D:\Documents\AI_Work_Temp\dynamic-mcp`），不在本文档范围 |

### 8.3 重启 dmcp（接入侧）
若需让 dmcp 重连并重拉 group 枚举：
```powershell
Stop-Process -Name dmcp -Force   # 终止后由 WorkBuddy 连接器重连重拉枚举
```
重连后 `list_groups` 应显示 `codebase-memory-mcp` = connected。

---

## 9. 接手 Agent 自主演进指南（DeusData 侧）

### 9.1 DeusData（cbm）发新版
- 下载新 exe → `Unblock-File`（3.2）→ 替换 `D:\codebase-memory-mcp\codebase-memory-mcp.exe` → 重新 `index_repository` 受影响项目（图谱 schema 可能变，旧 `.db` 建议删除重建）→ 验证（10.4）。
- ⚠️ 若新 cbm 冷启动更慢，经 dmcp 接入可能需调大 backend 的 `initialize` 超时（dmcp 侧配置，见第 4 节说明）。

### 9.2 本地路径变更（如换盘/改名）
- 同步改 `dynamic-mcp.json` 的 command/env 路径 + 三层 ACL 重新施加（3.3）+ 重新索引。

### 9.3 跟踪上游
- DeusData：官方发布页 / GitHub Releases（关注版本号、breaking change、schema 变更）。

### 9.4 验证清单（每次改动后必跑）
- [ ] `list_groups`：`codebase-memory-mcp` = connected。
- [ ] `list_projects`：返回已索引项目列表（数量随磁盘子目录增减）。
- [ ] `search_graph`（`project`, `query='skill'`）：`total>0`。
- [ ] `trace_path`（`function_name` 具体符号, `project`）：返回调用链。
- [ ] `detect_changes`（`project`）：git 变动 impact 正常返回。

---

## 10. 快速参考卡

### 路径
| 项 | 路径 |
|---|---|
| cbm exe | `D:\codebase-memory-mcp\codebase-memory-mcp.exe` |
| cbm cache | `D:\codebase-memory-mcp\data`（每项目 `.db`；`_config.db`；`logs/cbm-daemon.log`） |
| dmcp exe/config | `D:\Tools\MCP_Bridge\dmcp.exe` + `dynamic-mcp.json` |
| 监控根 | `D:\Documents\AI_Work_Temp`（逐一级子目录）+ `D:\Documents\AI_MCP-Skill-CLI` |

### 常用调用（经 dmcp）
```
call_dynamic_tool(group="codebase-memory-mcp", name="list_projects", args={})
call_dynamic_tool(group="codebase-memory-mcp", name="search_graph", args={"project": "<name>", "query": "keyword"})
call_dynamic_tool(group="codebase-memory-mcp", name="trace_path", args={"function_name": "<qn>", "project": "<name>"})
call_dynamic_tool(group="codebase-memory-mcp", name="detect_changes", args={"project": "<name>"})
call_dynamic_tool(group="codebase-memory-mcp", name="index_repository", args={"repo_path": "D:/Documents/AI_Work_Temp/<dir>", "mode": "moderate"})
```
> 参数键是 `args`（不是 `arguments`）；`search_graph`/`detect_changes`/`check_index_coverage` 等以 `project`(list_projects 名称) 为必需，非 `repo_path`。

### 重启 dmcp
```powershell
Stop-Process -Name dmcp -Force
```

---

*本手册与 `SKILL.md` 共同构成 DeusData（codebase-memory-mcp）接入的完整知识源。DeusData 与 dynamic-mcp 是相互独立的两个程序；涉及 dmcp 聚合器自身的初始化超时、group 枚举、重连与补丁演进，不在本文档范围，请参考 dmcp 项目文档。*
