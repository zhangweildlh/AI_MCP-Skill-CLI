# codebase-memory — DeusData 本地代码知识图谱 · 运维与上游演进手册

> 上游仓库：[github.com/DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
>
> 本文件面向两类读者：① 人——安装、运维、排错；② Agent——检查上游仓库状态、跟进演进并更新本 Skill。
> 本文件是**安装部署、运维排错、上游演进的唯一权威事源**；本 Skill 的**激活与调用行为不在本文件范围内**（该部分已自包含于同目录 `SKILL.md`，本文件不重复、不引用其章节）。
> 章节按"基础事实 → 操作 SOP"递进排列，后出现的章节只引用先出现的章节。

---

## 0. 速查索引

| 你要做的事 | 去哪一章 |
|---|---|
| 全新环境安装部署引擎 | `## 2. 安装与部署` |
| 配置 dmcp 接入 | `## 3. dmcp 接入配置` |
| 管理索引、配置扫描根目录 | `## 4. 索引管理与监控模型` |
| 查某个工具的参数 | `## 5. 工具参考（15 个）` |
| 写 openCypher 查询 | `## 6. openCypher 查询参考` |
| 判断改动该落在开发态还是部署态 | `## 7. 开发态与部署态（改动前必读）` |
| 改动后做验收 | `## 8. 验证清单（改动后必跑）` |
| 检查上游是否发了新版、有无 breaking change | `## 9. 上游状态检查 SOP` |
| 跟进上游演进并更新本 Skill | `## 10. 演进更新 SOP` |
| 出问题了要排错 | `## 11. 运维与排错` |

---

## 1. 概述

### 1.1 这是什么

**DeusData / codebase-memory-mcp** 是一个**纯本地、只读**的代码知识图谱（影响面分析）引擎。当前接入版本 **v0.10.8**。

- 形态：**纯 C 单二进制**（`codebase-memory-mcp.exe`，约 296MB），**零运行时依赖、无 API key、无外网**。
- 能力：158 种语言解析；构建调用图/使用图/导入图/继承图；影响面分析、调用链追踪、死代码定位、本地 git 变动爆炸半径映射。
- 接口：暴露 **15 个 MCP 工具**（stdio / 也可经 HTTP）。
- 性质：**只读**——不写文件、不执行 git、不连远程。

### 1.2 与 dynamic-mcp（dmcp）的关系

两者是**相互独立**的程序：

- **引擎本体**只负责"理解本地代码结构 / 评估改动影响 / 追踪调用链"。
- **dmcp** 是独立的 MCP 聚合器（本机为 Rust 实现的用户 Fork），把多个 MCP server 组织成 `group` 并代理调用。引擎是被它代理的其中一个 backend。

两者通过 `D:\Tools\MCP_Bridge\dynamic-mcp.json` 的一个 backend 配置解耦连接：**引擎的本地部署路径、cache 目录、接入超时全部由该配置文件持有**。

> dmcp 侧的初始化超时、group 枚举冻结、重连、补丁演进属 dmcp 程序自身运维，不在本文件范围；遇"backend 初始化超时 / 枚举冻结 / `group must be equal to allowed values`"参考 dmcp 项目文档（本机源码镜像 `D:\Documents\AI_Work_Temp\dynamic-mcp`）。

### 1.3 为什么本地优先

- 代码不出本机（隐私/合规，适合内部代码场景）。
- 无云端配额/费率/网络抖动；大仓（约 9000 节点）秒级查询。
- 与远程 GitHub 操作解耦：远程变动走 `gh`，本地理解走本引擎。

---

## 2. 安装与部署

### 2.1 获取引擎二进制

- 上游：DeusData 官方发布页 / GitHub Releases（[v0.10.8](https://github.com/DeusData/codebase-memory-mcp/releases/tag/v0.10.8)），下载 **Windows amd64** 包 `codebase-memory-mcp-windows-amd64.zip`，解压得 `codebase-memory-mcp.exe`。
- 官方 SHA-256（windows-amd64，v0.10.8）：`b4b403b1d7c4def3785f148b93f345ce8427858f4f5489ce28580c4387a336a6`。下载后务必 `sha256sum` 比对一致再替换。
- 本机落点：`D:\codebase-memory-mcp\codebase-memory-mcp.exe`（296,140,288 字节，约 296 MB）。
- **目录放置铁律**：必须放在"仅以卷根为祖先"的路径（如 `D:\codebase-memory-mcp`）。**切勿放 `D:\Tools\*` 或 `D:\Tools\Assembly\*`**——这些中间祖先目录给 Authenticated Users 授予了变更权，会触发引擎的 `cache-private` 拒绝（根因见 `### 2.3 三层私有锁（ACL）`）。

### 2.2 Defender 误报与区域标记

Windows Defender 可能把单二进制判为 `Wacatac` 误报。下载后执行：

```powershell
Unblock-File -Path 'D:\codebase-memory-mcp\codebase-memory-mcp.exe'
```

去掉 `Zone.Identifier` 备用数据流，否则首次运行会被拦截。

### 2.3 三层私有锁（ACL）

引擎对 cache 目录强制私有锁（`cache-private` 拒绝会令守护进程超时卡死）。三层校验缺一不可：

**(a) `data` 目录自身 owner-only**

```powershell
icacls "D:\codebase-memory-mcp\data" /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"
```

要求：`AceCount==1` + `SE_DACL_PROTECTED` + 单用户 `FILE_ALL_ACCESS` 非继承。

**(b) `data` 内每个 `.db` 文件 owner-only**

`icacls /grant:r` 只替换授权、不删其他 ACE（残留 SYSTEM/Administrators）→ 仍判 `cache-private`。可靠做法是用 `.NET FileSecurity` 重建干净 DACL：

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

所有 `.db` 均需此处理；可 `Get-ChildItem ... *.db | ForEach-Object { ... }` 批量。

**(c) 祖先目录链**

沿 exe/cache 路径向上遍历，任一**中间祖先**给 Authenticated Users 授予变更权（`0x00010`）即拒绝；卷根 `D:\` 豁免。这是"勿放 `D:\Tools\*`"的根因。

### 2.4 数据库迁移铁律

`.db` 绑定原 `CBM_CACHE_DIR`，复制到别处会令守护进程 30s 超时卡死。**迁移 = 新位置建干净 `data` + 设 owner-only（`### 2.3 三层私有锁（ACL）`）+ 重新 `index_repository`**，绝不是复制数据库。

### 2.5 环境变量与配置落点

- `CBM_CACHE_DIR=D:/codebase-memory-mcp/data`：cache 根（每项目一个 `.db`；`_config.db` 存配置；`logs/` 存 `cbm-daemon.log`）。
- `CBM_ALLOWED_ROOT=D:/Documents`：越界 `index_repository` 会被拒（兜底安全）。
- 上游 `install.ps1` 不识别 WorkBuddy，须**手动**编写 `dynamic-mcp.json` 的 backend（见 `## 3. dmcp 接入配置`），不要依赖自动安装脚本。

### 2.6 全局与项目级配置文件

#### 2.6.1 全局用户配置文件

**Windows 实测落点（本机 v0.10.8，权威）**：

> `%LOCALAPPDATA%\codebase-memory-mcp\config.json`
> 即本机：`C:\Users\15794\AppData\Local\codebase-memory-mcp\config.json`

- 上游 Unix 文档写的 `~/.config/codebase-memory-mcp/config.json` **在 Windows 上不存在**（本机 `C:\Users\15794\.config` 整目录不存在）。
- 本机实测：UI 设置**未**随 `CBM_CACHE_DIR` 重定向到 data 目录，仍落在 `AppData\Local`。一切手工改配置均以该文件为准。
- 该目录与文件**默认不存在**，启用 UI 的二进制在发现已校验资源包且尚无 UI 配置时自动创建并写入 `ui_enabled`/`ui_port`；**缺失则忽略**，不影响运行。

支持的参数（全部写入同一个 config.json）：

| 参数 | 类型 / 默认 | 用途 | 配置方法 | 注意事项 |
|---|---|---|---|---|
| `extra_extensions` | 对象，默认无 | 把非标准扩展名映射到内置语言（如 `.blade.php→php`、`.mjs→javascript`），纳入索引与图谱解析 | 键=带前导点的扩展名，值=语言名（大小写不敏感） | 扩展名**必须带前导点**；未知语言名**静默跳过**（仅告警不报错）；文件缺失则忽略；与项目级冲突时**项目级优先** |
| `ui_enabled` | 布尔，默认 `false` | 是否启用内置图谱可视化 UI | `true` / `false` | 资源缺失则 UI 保持禁用，MCP/守护进程服务照常可用 |
| `ui_port` | 整数，默认 `9749` | UI 监听端口 | 任意可用端口号 | 与 `ui_enabled` 配合 |

完整示例：

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

#### 2.6.2 项目级配置文件

放在**被索引仓库的根目录**（不是引擎程序目录）：

- **`.codebase-memory.json`**：仓库级扩展名映射，覆盖冲突的全局条目。例：`{"extra_extensions": {".vue": "javascript"}}`。
- **`.cbmignore`**：仓库级索引排除（gitignore 语法，见 `### 4.5 配置项`），控制哪些文件/目录不进入图谱。

这两类文件属于**被索引的项目**，随项目提交可团队共享，或列入项目 `.gitignore` 仅本地生效。

#### 2.6.3 配置层次总览

| 配置 | 位置 | 管理方 | 作用 |
|---|---|---|---|
| 全局扩展映射 + UI 设置 | `%LOCALAPPDATA%\codebase-memory-mcp\config.json`（本机 `C:\Users\15794\AppData\Local\codebase-memory-mcp\config.json`） | 用户手写 | `extra_extensions` / `ui_enabled` / `ui_port` 全局默认 |
| 项目级扩展映射 | `<repo>/.codebase-memory.json` | 用户/项目手写 | 覆盖全局 `extra_extensions` |
| 项目级索引排除 | `<repo>/.cbmignore` | 用户/项目手写 | 控制索引范围 |
| 运行时设置 | `CBM_CACHE_DIR/_config.db` | `codebase-memory-mcp config` 子命令 | `auto_index` 等运行时开关 |
| 运行参数 | 环境变量 `CBM_CACHE_DIR`/`CBM_ALLOWED_ROOT` | dmcp `dynamic-mcp.json` | cache 根 / 索引越界限制 |

---

## 3. dmcp 接入配置

### 3.1 backend 规格

位置：`D:\Tools\MCP_Bridge\dynamic-mcp.json`。`codebase-memory-mcp` backend 规格（功能性配置，须与本地部署路径一致）：

```json
"codebase-memory-mcp": {
  "description": "本地代码知识图谱（DeusData）：影响面/调用链/死代码/本地 git 变动 impact 分析，纯本地零运行时，158 语言。",
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

> `timeout.initialize` 给引擎冷启动留足时间；该字段是否生效取决于 dmcp 二进制是否支持可配置 initialize 超时（属 dmcp 程序演进）。

### 3.2 group 注册名与调用封装

dmcp 内注册名为 `codebase-memory-mcp`（保持稳定，作为逻辑标识，与本地物理目录名解耦）。调用统一走：

```
call_dynamic_tool(group="codebase-memory-mcp", name=<后端工具>, args=<…>)
```

参数键是 `args`（**不是** `arguments`）。

---

## 4. 索引管理与监控模型

### 4.1 两个监控根

- `D:\Documents\AI_Work_Temp`：所有本地 GitHub 仓库根；每个**一级子目录 = 一个独立项目**（git/非 git 混合），频繁增删。
- `D:\Documents\AI_MCP-Skill-CLI`：独立 git 仓库，单独维护。

### 4.2 逐子目录索引铁律

**AI_Work_Temp 必须逐一级子目录 `index_repository`**。整树单一项目会在目录枚举阶段被顶层散落文件/嵌套 `.git` pack 硬崩。

### 4.3 对账例程

引擎**不会自动发现新子目录**（`auto_index` 仅补齐已知项目）。会话启动或按需执行：

1. `list_projects` → 已索引集合 A。
2. `Get-ChildItem D:\Documents\AI_Work_Temp -Directory` → 磁盘集合 B。
3. 新增（b∈B, b∉A）→ `index_repository(repo_path=b, mode="moderate")`。
4. 删除（a∈A 且磁盘已不存在）→ 列清单请用户确认 → `delete_project`。
5. 变更：git 子目录靠 `auto_watch` 自动增量；非 git 子目录 `detect_changes` 看 `impacted_total` 非 0 才手动重索引。
6. 报告（新增 N / 删除 M / 重索引 K）。`_` 前缀探针目录默认不索引。

### 4.4 索引模式（mode）

| 模式 | 说明 |
|---|---|
| `full` | 最全最慢，含 similarity/semantic 边 |
| `moderate` | 推荐默认（filtered + similarity/semantic） |
| `fast` | 最快，无 similarity/semantic |
| `cross-repo-intelligence` | 跨仓库关联 Routes/Channels（需 `target_projects`，前置各项目 fresh index） |

### 4.5 配置项

- `.cbmignore`：项目根忽略（同 `.gitignore` 语法）。⚠️ cli 手动建图时不读，仅 watcher 自动重索引生效。
- `auto_watch`（默认 true）：git 项目自动增量（仅 git 有效）。
- `auto_index`（本机 true）：补齐已知但未索引/过期项目，**不发现新子目录**。
- 配置入口：`codebase-memory-mcp config <list|get|set|reset> <键>`；存于 `CBM_CACHE_DIR/_config.db`。

### 4.6 覆盖可信度

- `index_status`：覆盖报告（`parse_partial` 已索引但部分行未解析；`skipped` 完全未索引；`not_indexed` 按设计排除）。
- `check_index_coverage`：精确路径/前缀范围的权威可信度（负向/穷举论断前必查）。
- `query_graph(graph="missed")`：查仅未全索引文件的结构（`f.kind='parse_partial'`）。
- ⚠️ 被标记的文件**务必再 grep 该范围**；"absence from graph" 不是完整性保证。

### 4.7 一键扫描注册脚本

脚本是 `### 4.3 对账例程` 的自动化封装：递归扫描预设根目录（部署态默认含本地文档目录下的 GitHub 仓库根与独立仓库根，深度 3），发现未注册 git 仓库后**经 dmcp HTTP 通道注册**；dmcp 不可用时可改走直连 CLI（同目录 `codebase-memory-mcp.exe`），但两条路径**共享同一 OS 准入屏障**（同版本 / 同构建 / 同 ABI / 同 `CBM_CACHE_DIR`），CLI 仅在缓存根与守护进程一致时才可用，**非无条件兜底通道**。

**脚本位置**：部署态 `D:\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1`。

**调用方式**：

```powershell
PowerShell -ExecutionPolicy Bypass -File "D:\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1" -Log
```

**结果读取**：脚本在同目录写出 `.last_result.json`（含 `new_repos` / `registered` / `failed` / `skipped` 清单）与可选 `watch_git_repos.log`。

**退出码**：`0`=全部成功或无新仓库；`1`=部分成功（有仓库注册失败）；`2`=前置校验失败（无有效扫描根）。

**脚本自身合规性（v2.2.2 实测确认）**：脚本的 `initialized` 通知已正确使用 `"method":"notifications/initialized"`（带斜杠），与 `### 11.3 常见问题对照表` 的 422 处置一致；`initialize` 握手从响应实时解析协议版本，`Post-McpJson` 正确设置 `ContentLength` / `Accept` / `Mcp-Session-Id`。按上述调用方式真实运行一次（`PowerShell -ExecutionPolicy Bypass -File "D:\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1" -Log`），287ms 返回 `status=success`、`total_found=8`、`new_repos=[]`、`total_fail=0`，`watch_git_repos.log` 与 `.last_result.json` 正常写出——**脚本调用说明合格、充分、全面**。

**通道选择与实时探查机制（v0.10.8 校正）**：

1. 批量注册前先做一次分组实时探查（调用 dmcp 的 `list_groups`），确认目标 group 为 `connected`。
2. 探查通过（dmcp 在线且 group `connected`）→ 走 **dmcp HTTP 通道**；探查不通过（dmcp 离线）→ 可改走**直连 CLI**（同目录 `codebase-memory-mcp.exe`），但 CLI 同样受准入屏障约束：若 `CBM_CACHE_DIR` 与守护进程缓存根不一致，CLI 会立即失败。此时代理不重试、直接报错，**绝不静默假定"CLI 兜底可用"**——MCP 与 CLI 不是平行双通道。
3. dmcp HTTP 通道按 MCP Streamable HTTP 协议实现，握手有 5 条硬性要求（缺一即连锁失败）：
   - 带 `Accept: application/json, text/event-stream`；
   - 先 `initialize` 握手取 `Mcp-Session-Id` 响应头，**后续全部请求必须带该头**（漏带 → 401 `Session not found`）；
   - **`initialized` 通知的 method 必须是 `notifications/initialized`（带斜杠）**——写成 `"method":"initialized"`（无斜杠）会被 rmcp 状态机判为 `422 Unexpected message, expect initialize request`，当前 session 立即作废，后续所有调用连锁 401；
   - **每个 POST 必须带 `Content-Length: <body字节数>` 头**，否则 dmcp 返回 `415 Unsupported Media Type` / `fail to deserialize request body EOF`；
   - **协议版本从握手响应实时解析**，并用于后续全部请求。
   上游工具封装为 `call_dynamic_tool(group, name, args)`。完整握手规则与排错处置见 `### 11.3 常见问题对照表` 的 422/401/415 行。
4. 直连 CLI 调用同目录 `codebase-memory-mcp.exe` 的 CLI 模式，需该 exe 与同目录 `data` 缓存目录可用，且 `CBM_CACHE_DIR` 与守护进程一致。

**可配置参数（禁止硬编码，一律变量化）**：

| 参数 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| dmcp HTTP 端点 | `DMCP_BASE_URL` | `http://127.0.0.1:8082/dynamic-mcp` | 服务地址变更时设该变量，不改脚本 |
| dmcp group 名 | `DMCP_GROUP` | `codebase-memory-mcp` | group 重命名时设该变量 |
| 索引模式 | 脚本内 `$script:IndexMode` | `full` | 改此变量需走 `## 7. 开发态与部署态（改动前必读）` 的开发态提交流程 |

协议固有常量（`Accept` 头、façade 工具名 `call_dynamic_tool`、协议版本回退值 `2025-06-18`）集中定义在脚本配置区，不随环境变化。

---

## 5. 工具参考（15 个）

> 校正记录（2026-08-14）：旧资料误列 `semantic_query` 为独立工具（实为 `search_graph` 的**数组参数**）；漏列 `check_index_coverage`；`trace_path` 无 `trace_call_path` 别名。以下为 `get_dynamic_tools` 实时拉取的 15 工具。**上游演进后以实时拉取结果为准。**

### 5.1 index_repository — 建/刷新索引（加项目的唯一方式）

- 必需：`repo_path`。可选：`mode`(full/moderate/fast/cross-repo-intelligence)、`name`、`persistence`(写 graph.db.zst 共享)、`target_projects`(cross-repo 模式)。
- 返回含覆盖报告：`skipped`(完全未索引)、`parse_partial`(索引但部分行未解析)、`not_indexed_files`/`excluded`(按设计排除)。

### 5.2 list_projects — 列出已索引项目

- 参数：无（默认精简响应）。可选分页：`offset`(起始偏移)、`limit`(返回数量)、`include_details`(true 时返回完整字段 `name`/`root_path`/`branch`/`nodes`/`edges`/`size_bytes` 等)。v0.10.8 #1181：不传 `include_details` 时仅返回 `name`/`root_path` 等精简字段，脚本或手动对账需完整字段须显式传 `include_details=true`。

### 5.3 delete_project — 删除项目

- 必需：`project`（list_projects 的 name）。

### 5.4 index_status — 索引状态 + 覆盖报告

- 必需：`project`。可选：`verbose`(含 git 上下文)。报告 `parse_partial`/`skipped`/`not_indexed`。

### 5.5 check_index_coverage — 权威覆盖元数据

- 必需：`project`；`paths`(精确文件，≤128) 或 `scopes`(前缀，`.`=根，≤32) 二选一。
- 返回覆盖状态（区别于文件系统新鲜度）+ 结构化解析错误范围 + 源码回退动作。**被引用/操作的文件、负向/穷举论断前必查**。

### 5.6 search_graph — 结构化图搜索（替代 grep）

- 必需：`project`。三模式可组合：
  - `query`：BM25 自然语言/关键词（camelCase 分词 + 结构加权：Function/Method +10、Route +8、Class/Interface +5）。
  - `name_pattern`：正则精确匹配（提供时忽略 query）。
  - `semantic_query`：**数组** of 关键词（向量余弦，桥接词汇）。结果在 `semantic_results` 字段。
- 可选：`label`/`file_pattern`/`qn_pattern`/`min_degree`/`max_degree`/`fields`(额外列)/`format`(tree/json)/`detail`(ids/default)/`exclude_entry_points`/`include_connected`/`relationship`。
- 分页：`limit`(默认 50) + `offset` + 响应 `total`/`has_more`；截断时递增 offset 直到 has_more=false。

### 5.7 trace_path — 调用链/数据流/跨服务追踪

- 必需：`function_name`、`project`。可选：`mode`(calls/data_flow/cross_service)、`direction`(inbound/outbound/both)、`depth`(默认 3)、`edge_types`、`limit`(默认 100)、`cursor`(分页)、`format`、`include_tests`、`include_evidence`(解析策略+置信度)、`risk_labels`、`parameter_name`(data_flow)。
- 返回前缀分组树 + 精确 `callees_total`/`callers_total`；`truncated`+`next` 用 cursor 翻页。
- ⚠️ 多匹配符号（如 `main`）返回 ambiguous 候选列表，需用 `qualified_name`。

### 5.8 detect_changes — git diff 爆炸半径

- 必需：`project`。可选：`base_branch`(默认 main)、`depth`(默认 2)、`direction`(inbound 默认/ outbound/ both)、`scope`(files/impact 默认)、`since`(如 HEAD~5)、`limit`、`format`。
- 返回 base/merge_base SHA、`changed_files`、`impacted`(transitive impact 树) + `impacted_modules` 汇总 + `impacted_total`(精确)。

### 5.9 query_graph — 只读 openCypher

- 必需：`query`、`project`。可选：`graph`(code/missed)、`max_rows`(100k 硬上限)。
- 复杂多跳/聚合/跨服务；`graph="missed"` 查未全索引文件结构。

### 5.10 get_graph_schema — 图 schema

- 必需：`project`。返回节点标签/边类型。

### 5.11 get_code_snippet — 读源码

- 必需：`qualified_name`(先 search_graph 取)、`project`。可选：`include_neighbors`。
- 带 `coverage_note` 时文件仅部分索引，该范围宜再 grep，返回源码以之为准。

### 5.12 get_architecture — 架构概览

- 必需：`project`。可选：`aspects`(all/overview/structure/dependencies/routes/languages/packages/entry_points/hotspots/boundaries/layers/file_tree/clusters/**cycles**)/`path`(目录前缀)。
- `clusters`：Leiden 社区检测，浮现跨越文件夹的真实模块边界；`cycles` 仅 opt-in。

### 5.13 search_code — 图增强 grep

- 必需：`pattern`、`project`。可选：`mode`(compact/full/files)、`file_pattern`、`path_filter`(正则)、`limit`(默认 10)、`context`、`regex`。
- 去重到函数 + 结构排序（定义优先、测试最后）；响应 `total_grep_matches`/`total_results` 检测截断（无 offset，靠 limit/path_filter 缩小）。

### 5.14 manage_adr — 架构决策记录 CRUD

- 必需：`project`。`mode`(get/update/sections)；`content`(update 时完整替换)。

### 5.15 ingest_traces — 摄取运行时追踪

- 必需：`project`、`traces`(数组：caller/callee/count)。验证 HTTP_CALLS/ASYNC_CALLS 边。

---

## 6. openCypher 查询参考

- 子句：`MATCH` `OPTIONAL MATCH` `WHERE` `WITH` `RETURN` `ORDER BY` `SKIP` `LIMIT` `DISTINCT` `UNWIND` `UNION` `CASE`。
- 节点标签：`Project` `Package` `Folder` `File` `Module` `Class` `Function` `Method` `Interface` `Enum` `Type` `Route` `Resource`。
- 边类型：`CONTAINS_*` `DEFINES` `IMPORTS` `CALLS` `CALL_REFERENCE` `USAGE` `IMPLEMENTS` `INHERITS` `MEMBER_OF` `TESTS` `USES_TYPE` `HTTP_CALLS` `ASYNC_CALLS` `SIMILAR_TO` `SEMANTICALLY_RELATED` `CROSS_*` `EMITS` `LISTENS_ON` `DATA_FLOWS`（跨服务事件/消息/数据流边，v0.10.8 确认）。
- 示例：

  ```cypher
  MATCH (f:Function)-[:CALLS]->(g) WHERE f.name = 'main' RETURN g.name
  MATCH (f:Function) WHERE NOT EXISTS { (f)<-[:CALLS]-() } AND NOT f:EntryPoint AND NOT f.is_exported RETURN f.name LIMIT 50  // 须排除入口点，否则 main/路由处理器/导出 API 被误判为死代码
  MATCH (f:File) WHERE f.kind = 'parse_partial' RETURN f.file_path, f.detail
  ```

- 不支持：写操作、`MERGE`、`CALL`、列表/映射字面量、参数（报 `unsupported …`）。

---

## 7. 开发态与部署态（改动前必读）

### 7.1 两套状态的定义

| 状态 | 含义 | 位置 | 是否受 git 管控 |
|---|---|---|---|
| **开发态** | 本 Skill 的源码与文档真身，所有改动先落在这里 | git 仓库 `D:\Documents\AI_MCP-Skill-CLI` 的 `codebase-memory\` 目录 | 是（须走 worktree 分支） |
| **部署态** | 引擎实际运行、被 dmcp 拉起、被脚本调用的地方 | `D:\codebase-memory-mcp\` | 否（独立目录，不在仓库内） |
| **部署态 B** | WorkBuddy 实际加载的技能副本（由开发态 `SKILL.md` 同步生成） | `C:\Users\Administrator\.workbuddy\skills\codebase-memory\` | 否（部署态副本，不参与开发，改完开发态后同步覆盖此处） |

### 7.2 文件映射表

| 内容 | 开发态路径 | 部署态路径 | 同步方向 |
|---|---|---|---|
| 扫描注册脚本 | `<仓库>\codebase-memory\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1` | `D:\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1` | **开发态 → 部署态（改动后必须同步）** |
| 权限修复脚本 | `<仓库>\codebase-memory\codebase-memory-mcp\修复codebase-memory-mcp的目录权限.ps1` | `D:\codebase-memory-mcp\修复codebase-memory-mcp的目录权限.ps1` | 开发态 → 部署态 |
| 本运维手册 | `<仓库>\codebase-memory\README.md` | `D:\codebase-memory-mcp\Readme.md`（旧版遗留副本，非权威） | 仅存档，不作为权威 |
| 激活与调用定义 | `<仓库>\codebase-memory\SKILL.md` | 不部署到运行目录 | 开发态 → WorkBuddy 技能目录 |
| 引擎二进制 | 仅占位说明文件 `codebase-memory-mcp.exe.请自行下载真实文件.txt`（不入库） | `D:\codebase-memory-mcp\codebase-memory-mcp.exe`（约 296MB） | 上游发布 → 部署态 |
| 索引缓存 | 无 | `D:\codebase-memory-mcp\data\` | 运行时产物，不入库 |
| 运行状态文件 | 无 | `.last_result.json`、`.watch_git_repos_state.json`、`watch_git_repos.log` | 运行时产物，不入库 |

### 7.3 改动边界铁律

1. **改脚本先改开发态**：脚本的任何修改先落在开发态 worktree 分支，验证通过后再复制到部署态。禁止只在部署态改而不回写开发态。
2. **目录型 Skill 须走 worktree**：`codebase-memory\` 是目录型 Skill，只能在 worktree 中改动（`worktrees\<name>-<topic>-<时间戳>\` + 分支 `feat\<name>-<topic>-<时间戳>`，二者时间戳一致），禁止在主工作树直接改。
3. **二进制不入库**：`codebase-memory-mcp.exe` 约 296MB，绝不提交到 git；仓库内只有占位说明文件。
4. **运行时产物不入库**：`data\`、`.last_result.json`、状态文件、日志文件均不提交。
5. **推送与合并须用户显式授权**：向远端推送、开 PR、合并属公开动作，未获授权不得执行。

### 7.4 副本陷阱清单

本手册在历史演进中产生了多个副本，**均非权威**，改文档前先认清哪一份是真身：

| 副本位置 | 性质 | 正确处置 |
|---|---|---|
| `D:\codebase-memory-mcp\Readme.md` | 部署态旧版遗留副本，内容早于开发态当前版本 | 只读存档；不修改、不作为依据 |
| `<仓库>\codebase-memory\codebase-memory-mcp\Readme.md` | 开发态子目录内的旧版手册副本 | 只读存档；修改手册时改 `<仓库>\codebase-memory\README.md` |
| 只改部署态脚本 | 改动会随下次从开发态同步而丢失 | 按 `### 7.3 改动边界铁律` 第 1 条，先改开发态再同步 |
| 在部署态目录执行 git 命令 | `D:\codebase-memory-mcp\` 不是 git 仓库 | git 操作一律在 `D:\Documents\AI_MCP-Skill-CLI` 及其 worktree 内执行 |

---

## 8. 验证清单（改动后必跑）

- [ ] `list_groups`：`codebase-memory-mcp` = connected。
- [ ] `list_projects`：返回已索引项目列表（数量随磁盘子目录增减）。
- [ ] `search_graph`（`project`, `query='skill'`）：`total>0`。
- [ ] `trace_path`（`function_name` 具体符号, `project`）：返回调用链。
- [ ] `detect_changes`（`project`）：git 变动 impact 正常返回。
- [ ] 扫描脚本：运行后 `.last_result.json` 的 `total_fail` 为 0，且 `watch_git_repos.log` 出现分组探查行与 `注册成功 [dmcp_http]`（通道判据见 `### 4.7 一键扫描注册脚本`）。

### 8.1 双渠道端到端实测（v2.2.2，2026-09-06）

两个调用渠道均已端到端实测通过，共享同一套握手规则：

- **渠道 1（直连 stdio）**：`Popen([EXE], stdin/stdout PIPE)` → `initialize` → `notifications/initialized` → `tools/list` → `tools/call`。实测通过：`list_projects`（8 项目）、`index_status`（8/8 全部 `status=ready`）、`get_graph_schema`。Windows pipe 不支持 `select.select`，须用 `threading.Thread` + `queue.Queue` 异步读 `proc.stdout.readline()`。
- **渠道 2（dmcp HTTP 中转）**：`http.client` 持久连接 → `initialize`（取 `Mcp-Session-Id`）→ `notifications/initialized`（带 session 头）→ `list_groups`（facade-direct）→ `get_dynamic_tools`（facade-direct）→ `call_dynamic_tool(index_status / list_projects / search_graph / trace_path / get_architecture / check_index_coverage)`。实测通过：8 项目全部 `status=ready`，节点 4,908–23,475 / 边 4,339–124,995；`search_graph` 返回 15 条命中；`get_architecture` 返回 14 类节点标签 / 20 类边类型。
- **双层信封解包**：渠道 2 的 `call_dynamic_tool` 返回 `result.content[0].text`，其内可能再包一层 `{"content":[{"text":...}]}`。解包时先整块 `json.loads`，失败再逐行回退（SSE `data:` 行 / 逐行 `{` 起始）。`initialize` 响应无 `content` 字段，直接取 `result`。
- **`index_status` / `check_index_coverage` / `search_graph` / `trace_path` 均需 `project` 参数**（从 `list_projects` 取到的项目名，如 `D-Documents-AI_MCP-Skill-CLI`），漏传报 `missing required argument: project`。

---

## 9. 上游状态检查 SOP（Agent 定期执行）

本章供 Agent 在**不依赖任何前置知识**的前提下，自主检查上游仓库状态。

### 9.1 前置确认

1. 确认 `gh` 已安装且已登录：执行 `gh auth status`，返回已认证方可继续；未认证则停止并报告用户。
2. 上游仓库标识：`DeusData/codebase-memory-mcp`。

### 9.2 检查上游发布与版本

```bash
gh release list --repo DeusData/codebase-memory-mcp --limit 5
gh release view --repo DeusData/codebase-memory-mcp
```

- 取最新 release 的 tag（即上游版本号）。
- 本机版本见 `### 1.1 这是什么` 记录的当前接入版本（v0.10.8）。
- **校验官方 SHA-256（升级前必做）**：从 release 说明的 *Security Verification* 表或 `checksums.txt` 取 `windows-amd64` 哈希（v0.10.8 为 `b4b403b1d7c4def3785f148b93f345ce8427858f4f5489ce28580c4387a336a6`），下载后 `sha256sum` 比对一致方可替换；哈希不符一律弃用并报告用户。
- **落后判定阈值**：本机落后上游 ≥1 个版本即应跟进；release 说明含 `breaking` / `schema` / `migration` 关键字或图谱 schema 变更时，必须重建全部索引（见 `### 10.2 步骤一`）。

### 9.3 检查上游变更内容

```bash
gh api repos/DeusData/codebase-memory-mcp/releases/latest --jq '.body'
gh api repos/DeusData/codebase-memory-mcp/commits --paginate -X GET -f per_page=20 --jq '.[].commit.message'
```

重点识别三类信号：

| 信号 | 识别方法 | 含义 |
|---|---|---|
| 版本号变化 | release tag 与本机版本不同 | 有新版本可跟进 |
| breaking change | release 说明含 `breaking` / `migration` / `schema` 关键字 | 图谱 schema 可能变，旧 `.db` 需重建 |
| 工具增删改 | release/提交信息涉及 tool、MCP 接口 | 本文件 `## 5. 工具参考（15 个）` 需校正 |

### 9.4 跟进判定矩阵

| 条件 | 判定 | 后续动作 |
|---|---|---|
| 上游版本 == 本机版本 | 无更新 | 结束，报告"已是最新" |
| 上游版本 > 本机版本，且无 breaking change | 常规跟进 | 执行 `## 10. 演进更新 SOP` |
| 上游版本 > 本机版本，且含 breaking change 或 schema 变更 | 重点跟进 | 执行 `## 10. 演进更新 SOP`，并**额外**在步骤二后重建全部索引（见 `### 10.2 步骤一：更新引擎二进制（部署态）`） |
| 上游版本 < 本机版本 | 异常 | 停止并报告用户，不得自行降级 |

---

## 10. 演进更新 SOP（Agent 执行）

本章每一步都标注落在开发态还是部署态。

### 10.1 流程总览

```
步骤一 更新引擎二进制        → 部署态
步骤二 更新本手册与激活定义  → 开发态（worktree 分支）
步骤三 更新扫描注册脚本      → 开发态 → 同步部署态
步骤四 更新后验证            → 部署态
```

### 10.2 步骤一：更新引擎二进制（部署态）

1. **停守护进程**：替换前先停止 dmcp / 守护进程，避免 exe 文件被进程持有导致替换失败（注：Agent 工具无法启动本地 exe 属独立环境约束，与守护进程是否运行无关；但替换文件前仍须确保无进程持有该文件句柄）。
2. 从上游 release 下载 Windows exe，落点见 `### 2.1 获取引擎二进制`，并校验 SHA-256（见 `### 9.2`）。
3. 按 `### 2.2 Defender 误报与区域标记` 解除区域标记。
4. 替换 `D:\codebase-memory-mcp\codebase-memory-mcp.exe`；新文件 ACL 需重置，重跑 `### 2.3 三层私有锁（ACL）`。
5. 重新对受影响项目执行 `index_repository`；**图谱 schema 变更时删除旧 `.db` 后重建**（迁移铁律见 `### 2.4 数据库迁移铁律`）。升级后须**重建索引并去重**：消除 MCP 通道（`D-Documents-…-dynamic-mcp`）与 CLI 通道（`dynamic-mcp`）并存导致的重复 project，以及中文路径项目名被十六进制转义（如 `WorkBuddye887aae5…`）的问题，统一命名口径。
6. 重启 dmcp，确认 `list_groups` 中 `codebase-memory-mcp` = `connected`。
7. 若新二进制冷启动更慢，经 dmcp 接入需调大 backend 的 `initialize` 超时（属 dmcp 侧配置，见 `### 3.1 backend 规格`）。

### 10.3 步骤二：更新本手册与激活定义（开发态）

1. 在 worktree 中改动（分支与目录命名见 `### 7.3 改动边界铁律` 第 2 条）。
2. 按 `### 9.3 检查上游变更内容` 的校正信号更新本文件对应章节：
   - 工具增删改 → 更新 `## 5. 工具参考（15 个）`；
   - 版本号变化 → 更新 `### 1.1 这是什么` 的当前接入版本；
   - 破坏性变更 → 在 `## 11. 运维与排错` 增补对应症状与修复。
3. 若上游变更影响激活边界（新增/移除能力），同步修订同目录 `SKILL.md` 的适用场景与不适用场景矩阵，使两份文件的**能力事实保持一致**（激活判定仍以 `SKILL.md` 为唯一事源，本文件不复述）。
4. 按 `## 8. 验证清单（改动后必跑）` 跑通验证后再提交。

### 10.4 步骤三：更新扫描注册脚本（开发态 → 部署态）

1. 在开发态修改 `<仓库>\codebase-memory\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1`（映射关系见 `### 7.2 文件映射表`）。
2. 复制到部署态 `D:\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1`（覆盖前先备份为 `.bak`）。
3. 改动若涉及 dmcp HTTP 通道，须复测分组探查与 HTTP/CLI 两条路径（二者共享准入屏障，非平行兜底，判据见 `### 4.7 一键扫描注册脚本`）。

### 10.5 步骤四：更新后验证

按 `## 8. 验证清单（改动后必跑）` 逐项执行；任一项不通过即回退到改动前版本并报告用户，不得带病交付。

---

## 11. 运维与排错

### 11.1 日志位置

- `D:\codebase-memory-mcp\data\logs\cbm-daemon.log`（索引/守护进程日志）。
- `D:\codebase-memory-mcp\watch_git_repos.log`（扫描注册脚本日志，仅带 `-Log` 运行时写出）。

### 11.2 重启 dmcp

```powershell
Stop-Process -Name dmcp -Force   # 终止后由 WorkBuddy 连接器重连重拉枚举
```

重连后 `list_groups` 应显示 `codebase-memory-mcp` = connected。

### 11.3 常见问题对照表

| 症状 | 根因 | 修复 |
|---|---|---|
| `cache-private` 拒绝 / 守护进程 30s 超时 | 三层 ACL 任一层不满足 / 目录在 `D:\Tools\*` | 见 `### 2.3 三层私有锁（ACL）`；移出 `D:\Tools\*` |
| CLI 直连报 `cache-private` / `different cache directory` | CLI 与守护进程 `CBM_CACHE_DIR` 不一致，触发**准入屏障**拒绝（MCP 与 CLI 共享同一屏障） | 确认二者用同一 `CBM_CACHE_DIR`（本机 `D:\codebase-memory-mcp\data`）；脚本已固定导出该变量，手动直连 CLI 须自行 `$env:CBM_CACHE_DIR` 导出同值，否则 CLI 启动即失败，并非"换 CLI 就能绕过" |
| 整树索引崩溃 | AI_Work_Temp 未逐子目录 | 改逐子目录索引（`### 4.2 逐子目录索引铁律`） |
| `git status` 见 `?? nul` 且索引 Pipeline failed | Windows 保留名文件 | 移出/删除后再索引 |
| 经 dmcp 接入时 backend 初始化超时 / `group must be equal to allowed values` | 属 **dmcp 聚合器侧**问题 | 参考 dmcp 项目文档（本机 `D:\Documents\AI_Work_Temp\dynamic-mcp`），不在本文件范围 |
| 扫描脚本全部仓库走 CLI 通道 | dmcp 分组探查未通过 | 看 `watch_git_repos.log` 的探查行；确认 dmcp 在运行且 group 为 `connected`，否则执行 `### 11.2 重启 dmcp` |
| `422 Unexpected message, expect initialize request` | **`initialized` 通知的 method 写错**：写成 `"method":"initialized"`（无斜杠）会被 rmcp 状态机拒收 | **必须用 `"method":"notifications/initialized"`**（MCP 规范全称，带斜杠）；通知本身也要带 `Mcp-Session-Id` 头。收到 422 后当前 session 已废，须重新 `initialize` 取新 session 再走完整握手 |
| `401 Unauthorized: Session not found` | 上游 422 的连锁反应，或 `initialize` 后未发 `notifications/initialized` 就直接调工具，或漏带 `Mcp-Session-Id` 头 | 按上一行修好 method 即可；若仍 401，检查是否漏发 initialized 通知、或是否漏带 `Mcp-Session-Id` 头 |
| `415 Unsupported Media Type` / `fail to deserialize request body EOF` | 请求缺 `Content-Length` 头，dmcp 无法解析 body | 每个 POST 都必须带 `Content-Length: <body字节数>` |

### 11.4 历史问题：dmcp HTTP 通道 406（已修复，留档备查）

**状态：已于 2026-09-05 修复。** 修复后脚本经 HTTP 通道注册成功（运行日志判据：`注册成功 [dmcp_http]`）。以下内容留档，用于理解机制与排查同类问题。

**现象**：扫描脚本通道 1 对全部仓库返回 `(406) 不可接受`，随后由 CLI 通道补注册。

**根因（经 dmcp 源码核实）**：406 是 **MCP Streamable HTTP 传输层的"内容协商"拒绝**，发生在请求体被解析之前。原实现存在两处协议错配：

1. **缺少必需的 `Accept` 头**。dmcp 的 HTTP 端点由 `rmcp::transport::streamable_http_server::StreamableHttpService` 提供（`src/main.rs` `start_http_server`），是**标准 MCP Streamable HTTP 端点**，要求客户端带 `Accept: application/json, text/event-stream`。原实现调用 `Invoke-RestMethod` 未设 `Accept`（PowerShell 默认发 `Accept: */*`），rmcp 服务端内容协商失败返回 406。
2. **工具名封装错误**。原实现以 `params:{name:"index_repository", ...}` 直接把**上游后端工具名**打给 dmcp façade；而 façade 只暴露 `list_groups` / `get_dynamic_tools` / `call_dynamic_tool` 三个工具，收到 `index_repository` 会返回 `Unknown tool` 的结构化错误。

**旧结论为何不成立**：曾归因于"缺 `group` 导致 406"——façade 的 `call_dynamic_tool` 在 `group` 缺失时返回的是 `CallToolResult{is_error:true}` 信封，HTTP 状态是 **200**，不是 406。406 只能来自 rmcp 的内容协商，与 `group` 字段无关。

**当前实现**：见 `### 4.7 一键扫描注册脚本` 的通道选择与实时探查机制，以及可配置参数表。

### 11.5 路径速查与常用调用

| 项 | 路径 |
|---|---|
| 引擎 exe | `D:\codebase-memory-mcp\codebase-memory-mcp.exe` |
| 引擎 cache | `D:\codebase-memory-mcp\data`（每项目 `.db`；`_config.db`；`logs/cbm-daemon.log`） |
| 扫描注册脚本 | `D:\codebase-memory-mcp\codebase-memory扫描注册脚本.ps1` |
| dmcp exe/config | `D:\Tools\MCP_Bridge\dmcp.exe` + `dynamic-mcp.json` |
| 监控根 | `D:\Documents\AI_Work_Temp`（逐一级子目录）+ `D:\Documents\AI_MCP-Skill-CLI` |
| 开发态本 Skill | `<仓库>\codebase-memory\`（`SKILL.md` + `README.md` + `codebase-memory-mcp\`） |

常用调用（经 dmcp）：

```
call_dynamic_tool(group="codebase-memory-mcp", name="list_projects", args={})
call_dynamic_tool(group="codebase-memory-mcp", name="search_graph", args={"project": "<name>", "query": "keyword"})
call_dynamic_tool(group="codebase-memory-mcp", name="trace_path", args={"function_name": "<qn>", "project": "<name>"})
call_dynamic_tool(group="codebase-memory-mcp", name="detect_changes", args={"project": "<name>"})
call_dynamic_tool(group="codebase-memory-mcp", name="index_repository", args={"repo_path": "D:/Documents/AI_Work_Temp/<dir>", "mode": "moderate"})
```

> 参数键是 `args`（不是 `arguments`）；`search_graph`/`detect_changes`/`check_index_coverage` 等以 `project`(list_projects 名称) 为必需，非 `repo_path`。
