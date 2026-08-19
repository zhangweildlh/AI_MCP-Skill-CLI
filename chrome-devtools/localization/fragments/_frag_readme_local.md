# 中文使用指南（本地化版 · 全局安装 · 拷贝即走）

> 本文为 chrome-devtools-mcp 的**中文本地化使用指南**，覆盖架构、安装、部署、使用与上游跟进。上方为上游英文原版 README（命令与英文术语保留供精确参考），日常以下方中文为准。
> 本文已做**模块化、结构化整理**，内容不删减；与旧版相比主要变化：① 服务器改为**全局安装**（`npm install -g`，位于 `$(npm root -g)`）；② 主副本文件夹**拷贝即走**（不含 node_modules/build）；③ 浏览器**自动检测并规避便携版**；④ 新增 **MCP 服务模式 / CLI 模式 二选一**的初始检测逻辑。

---

## 模块 0：架构总览与核心约定

- **服务器全局安装（符号链接模式）**：`npm install -g .` 会在 `$(npm root -g)`（npm 全局根目录，随 Node 安装位置而定）下创建名为 `chrome-devtools-mcp` 的**符号链接**，指向本文件夹；它**不拷贝、也不安装依赖**。运行时依赖与构建产物实际位于被链接的文件夹（`node_modules/` + `build/`）。调用方一律走全局 bin 目录 `$(npm root -g)/chrome-devtools-mcp/build/src/bin/`：其中 **CLI 模式用 `chrome-devtools.js`**、**MCP server 模式用 `chrome-devtools-mcp.js`**（两者经符号链接解析到本文件夹）。因此主副本文件夹本身保持最小化、可拷贝即走；依赖在激活后由 `deploy.cjs` 装到该文件夹。
- **拷贝即走**：把整个 `chrome-devtools/` 文件夹复制到任意电脑、激活主 `SKILL.md`，Agent 即可自主完成「全局安装 → 构建 → 浏览器检测/启动 → 暴露工具」，无需预装。
- **跨平台说明**：底层脚本（deploy / upstream / copyDir / verify_browser）均为跨平台实现；本地化默认面向 **Windows + 360Chromex（含登录态）**。在 macOS / Linux 上可改用本机 Chrome（去掉 360Chromex 相关步骤，`verify_browser.cjs` 会检测 Chrome 的注册表/PATH 候选），其余流程一致。
- **复用登录态、零下载**：仅依赖 puppeteer-core，**不下载任何浏览器内核**（`PUPPETEER_SKIP_DOWNLOAD=1` 由部署脚本内置）。
- **严禁 `npx -y <pkg>`**：一律用 `node "$(npm root -g)/..."` 运行，或用 `npm install -g .` 全局安装。各环境命令见下文「模块 4」。
- **本地化段标记**：以哨兵 `LOCALIZED:360Chromex` 标记；`apply_localize.cjs --strip` 再注入可刷新，直接重跑则仅保全不刷新（兜底）。

### 主副本目录结构（拷贝即走）

```
chrome-devtools/                ← 整个文件夹拷贝即走
├── SKILL.md                    ← 顶层自描述入口（由 apply_localize 从 skills/chrome-devtools/SKILL.md 同步）
├── README.md                   ← 本文（含本地化段）
├── package.json                ← 含 overrides.zod 固定（compat.cjs 维护）
├── package-lock.json           ├─ 上游源码镜像（self-evolution 参考 + 构建基线）
├── server.json / tsconfig.json / .npmrc / .nvmrc / .gitignore / LICENSE
├── src/  skills/  scripts/     ← 上游源码镜像（随上游升级刷新）
├── localization/               ← 自包含工具链（见模块 6）
│   ├── deploy.cjs              ← 全局安装 + 构建 + 生成 MCP 配置
│   ├── upstream.cjs            ← 纯网络上游升级（全局卸载/安装/构建）
│   ├── compat.cjs              ← 固定 zod 兼容版本（避免 v4 编译失败）
│   ├── apply_localize.cjs      ← 注入/剥离本地化段与中文 description
│   ├── verify_browser.cjs      ← 自动检测浏览器（规避便携版）
│   ├── start.cjs               ← 启动浏览器调试端口（复用登录态）
│   ├── cli_run.cjs             ← CLI 模式辅助脚本（仅 CLI 模式，可被删除）
│   └── fragments/              ← 本地化片段（README/SKILL 文本与 description）
├── local-config.json           ← 浏览器路径/用户数据/端口（verify_browser 生成）
├── mcp-local-config.json       ← 生成的 MCP 接入配置（全局 bin 路径）
└──（不含 node_modules / build）← 运行时依赖与构建产物由 `deploy.cjs` 在本文件夹安装（并经 $(npm root -g) 的符号链接暴露全局 bin）；拷贝即走的恰是此最小文件夹
```

---

## 模块 1：前置条件

- Node.js ≥ 20.19（本机 v24.18.0 已满足；全局 bin 的 `node` 即系统 Node）。
- 本机浏览器：360Chromex 安装目录可通过环境变量 `CHROME_DEVTOOLS_360_DIR` 覆盖（缺省 `D:\Tools\360Chrome`，仅本机有效；其它机器请设置该变量或依赖注册表/PATH 自动检测）；其它机器运行 `node localization/verify_browser.cjs` 自动检测并写入 `local-config.json`（优先已注册安装，规避便携版）。
- 依赖与构建：**不随文件夹携带**，首次激活由 `node localization/deploy.cjs` 全局安装并构建（恒跳过浏览器下载）。

---

## 模块 2：快速开始（一键部署 / 拷贝即走）

```
node localization/deploy.cjs
```

该命令会依次：① 自动检测浏览器（缺失则交互要求指定并写入配置）→ ② 全局安装依赖/构建（恒跳过浏览器下载，写入 `$(npm root -g)`）→ ③ 幂等重注入本地化 → ④ 生成 `mcp-local-config.json`（全局 bin 路径）并打印接入指引。

手动分步（等价于上述一键）：

1. 关闭已打开的浏览器（避免 user-data-dir 锁冲突）。
2. 启动调试端口：`node localization/start.cjs`（自动检测并复用登录态）。
3. 在 WorkBuddy 的 MCP 配置（`~/.workbuddy/mcp.json`）加入 `mcp-local-config.json` 内容：
   - command: `node`
   - args: `["<全局 bin 路径>", "--browserUrl=http://127.0.0.1:9222", "--no-usage-statistics"]`
   - env: `{ "CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS": "1" }`
4. 在 WorkBuddy 连接器管理页"信任" chrome-devtools 服务器。

> 全局 bin 路径获取：macOS/Linux/Git Bash 用 `$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js`；Windows(cmd) 用 `for /f "delims=" %i in ('npm root -g') do echo %i\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js`；Windows(PowerShell) 用 `(npm root -g) + '\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js'`。

---

## 模块 3：浏览器自动检测与启动（复用登录态，规避便携版）

`verify_browser.cjs` 自动检测本地浏览器，写入 `local-config.json`：

- **搜索范围（Windows）**：已知安装目录（`CHROME_DEVTOOLS_360_DIR` 指定的目录（缺省 `D:\Tools\360Chrome`）、`Program Files\Google\Chrome`、`Program Files\360Chrome`）、Windows 注册表（`App Paths` 与 `Uninstall` 项）；以及 `PATH` 中的候选。
- **规避便携版**：已注册安装（Program Files / 注册表 / 已知目录）优先采用；仅当只找到 `PATH` 中未注册/便携版时，会**提示用户确认**，不会静默误用（便携版登录态不可靠）。
- **优先 360Chromex**（保留登录态），其次 Chrome。用户数据目录默认取 `CHROME_DEVTOOLS_360_DIR` 目录下的 `User Data`（360Chromex）或 `%LOCALAPPDATA%\Google\Chrome\User Data`（Chrome），否则取 exe 同级 `User Data`。

`start.cjs` 以 `--remote-debugging-port` + `--user-data-dir` 启动（**禁用 `--isolated`**，避免丢登录态），并打印全局路径的 MCP 接入信息。

> Agent 每次激活技能、调用任何浏览器能力前，应先 `curl http://127.0.0.1:9222/json/version` 检测端口；仅当无响应才运行 `verify_browser.cjs` + `start.cjs`，避免重复启动锁冲突。

---

## 模块 4：两种使用模式（MCP 服务模式 / CLI 模式）与初始检测

chrome-devtools 可二选一使用，**严禁 `npx -y`**，一律走全局路径。

### 4.1 初始检测逻辑（每次使用开始时执行）

1. **检测是否已配置 MCP 服务模式**：读取 `~/.workbuddy/mcp.json`（或当前 Agent 的 MCP 配置），若含名为 `chrome-devtools` 的条目（command 指向本全局包 bin），即视为"MCP 服务模式已安装"。
   - **若已安装 MCP 服务模式**：全程使用 MCP 工具，**禁止**走 CLI 子命令。可询问用户是否删除 CLI 模式辅助脚本 `localization/cli_run.cjs`（仅 CLI 用，删除不影响 MCP）；用户拒绝则保留。
   - **若未检测到 MCP 服务模式**：询问用户是否采用全局安装以使用 CLI 模式（`npm install -g .`）。用户明确"安装" → 执行 `node localization/deploy.cjs` 后继续 CLI 模式；用户明确"不安装" → **立即终止任务**。
2. 若全局 bin 不存在（未安装），先 `node localization/deploy.cjs` 完成全局安装与构建。

### 4.2 MCP 服务模式（推荐，WorkBuddy 原生工具）

在 `~/.workbuddy/mcp.json` 加入（全局路径）：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["<全局 bin 路径>", "--browserUrl=http://127.0.0.1:9222", "--no-usage-statistics"],
      "env": { "CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS": "1" }
    }
  }
}
```

在 WorkBuddy 连接器管理页"信任"后即可使用 29 个原生工具（对应上游 chrome-devtools-mcp v1.7.0；工具数量随上游版本变化，请以实际 `list_tools` 返回为准）。

### 4.3 CLI 模式（不配 MCP 也可用，二选一）

直接用全局 bin 运行单工具（首参数为工具名）。**各环境命令形式**（严禁 npx）：

- macOS / Linux / Git Bash：
  ```bash
  node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" <tool> [参数] --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (cmd.exe)：
  ```bat
  for /f "delims=" %i in ('npm root -g') do node "%i\chrome-devtools-mcp\build\src\bin\chrome-devtools.js" <tool> [参数] --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (PowerShell)：
  ```powershell
  $g = npm root -g; node "$g/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" <tool> [参数] --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```

或等价使用 CLI 辅助脚本（仅 CLI 模式、可被删除）：`node localization/cli_run.cjs <tool> [参数]`。

例如 `node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" take_snapshot --browserUrl=http://127.0.0.1:9222 --no-usage-statistics`。

---

## 模块 5：常用操作速查（MCP 工具名保持英文）

- **页面/导航**：`list_pages`（列出页）、`select_page`（切换）、`navigate_page --url`（导航）、`new_page`（新建）、`close_page`
- **结构/交互**：`take_snapshot`（文本快照，获取元素 `uid`）、`click <uid>`、`fill <uid> <文本>`、`hover`、`drag <src> <dst>`、`press_key`、`type_text`、`upload_file`
- **截图**：`take_screenshot`（可 `--fullPage`、`--filePath` 存盘）
- **控制台/日志**：`list_console_messages`、`get_console_message`
- **网络**：`list_network_requests`（可分页/过滤）、`get_network_request`
- **性能/内存**：`performance_start_trace` / `performance_stop_trace`（可存盘）、`performance_analyze_insight`、`take_heapsnapshot`
- **脚本**：`evaluate_script "() => document.title"`（页面执行 JS）

**典型工作流**：导航（`navigate_page`）→ 等待（`wait_for`）→ 快照（`take_snapshot` 取 uid）→ 交互（`click`/`fill` 等）→ 必要时截图或读控制台/网络。可并行发起多个工具调用，但顺序保持 导航→等待→快照→交互。

---

## 模块 6：上游跟进与本地化更新（自演进，纯网络，保全本地化）

任一 Agent 阅读本文件后，可精准调用 `gh` / `npm` / 网络工具查询、下载、跟进 `ChromeDevTools/chrome-devtools-mcp` 上游演进/更新，**且全程不丧失本地化特性与约束**。本主副本**不含 .git**，故全部走纯网络方式。

### 1) 查询上游状态

- 最新版本：`npm view chrome-devtools-mcp version` 或 `gh release list -R ChromeDevTools/chrome-devtools-mcp`
- 发布详情：`gh api repos/ChromeDevTools/chrome-devtools-mcp/releases/latest`
- 仓库概览：`gh repo view ChromeDevTools/chrome-devtools-mcp`

### 2) 一键升级（推荐，全局）

```
node localization/upstream.cjs
```

自动完成：检测新版本 → `git clone --depth 1` 拉源码 → 剥离并覆盖本地目标文件（保留 localization/）→ 重注入本地化（保全约束）→ 重新固定 zod（compat.cjs）→ **全局卸载/安装/构建**（依赖位于 `$(npm root -g)`）→ 重新部署（生成全局路径 MCP 配置）。

### 3) 手动升级（纯命令，不依赖脚本）

> 注意：上游 npm 发布包仅含 `build/` 产物与 `README.md`，**不含 `src/` 与 `skills/`**；因此同步源码与 SKILL.md 必须从 GitHub 源码仓库获取，不能仅靠 `npm pack`。

```sh
git clone --depth 1 https://github.com/ChromeDevTools/chrome-devtools-mcp.git <临时目录>
# 将 <临时目录> 的 src/ skills/ scripts/ 以及 README.md package.json server.json puppeteer.config.cjs tsconfig.json .npmrc .nvmrc .gitignore 覆盖到本仓库（保留 localization/）
node localization/apply_localize.cjs --strip   # 剥离旧本地化段（还原纯上游原文基线）
node localization/apply_localize.cjs           # 重注入最新片段（含 description 中文化，幂等）
PUPPETEER_SKIP_DOWNLOAD=1 npm install          # 先在本文件夹装齐依赖（devDependencies，含 puppeteer-core 等运行时；注意 npm install -g . 不会装依赖）
PUPPETEER_SKIP_DOWNLOAD=1 npm install -g .      # 在 $(npm root -g) 建符号链接指向本文件夹（不拷贝、不装依赖）
npm run build                                  # 在本文件夹构建（tsc -> build/；其全局符号链接即 $(npm root -g)/chrome-devtools-mcp）
node localization/deploy.cjs                   # 重新部署（生成全局路径 MCP 配置）
```

### 4) 本地化保全红线（任何 Agent 操作不得违反）

- 依赖安装必须 `PUPPETEER_SKIP_DOWNLOAD=1`，否则 puppeteer 会下载 Chromium。
- 复用登录态必须 `--browserUrl` 直连已启动的浏览器；`--isolated` 默认临时 profile 会丢登录态。
- 浏览器用 `--executablePath` 不用 `--channel`。
- **严禁 `npx -y`**：一律 `node "$(npm root -g)/..."` 或 `npm install -g .`。
- 中文路径在本机会导致 node/npm 失败；跨机移植以 ASCII 路径主副本为准，脚本均按脚本所在目录相对解析。
- `--categoryExtensions` 仅 pipe 连接支持；`--browserUrl` 模式暂不支持（待上游 #149）。
- 本地化段以哨兵 `LOCALIZED:360Chromex` 标记；`--strip` 再注入可刷新，直接重跑则仅保全不刷新（兜底）。

---

## 模块 7：Agent 自主验证（全功能测试）与三大陷阱

将本主副本作为 Skill 部署后，可由 Agent 编写 MCP 客户端脚本（`@modelcontextprotocol/sdk` 的 `Client` + `StdioClientTransport`）直连**全局 bin**（`$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js`），连接 360Chromex 调试实例（端口 9222），逐项验证 `list_pages` / `navigate_page` / `take_snapshot` / `take_screenshot` / `evaluate_script` / `list_console_messages` / `list_network_requests` 等工具。验证中踩坑并修正的**三处陷阱**如下，供任何 Agent 自主验证时参考：

### 陷阱 1：MCP SDK 的 `Client` 没有 `EventEmitter.on`

`@modelcontextprotocol/sdk`（本机 1.29.0）的 `Client` 原型链为 `Client → Protocol → Object`，**没有 `EventEmitter.on`**。若写 `client.on('error', ...)` 会报 `client.on is not a function`。

- **修正**：不要监听 `error` 事件；用 `try/catch` 包裹 `client.connect(transport)` 与各 `client.callTool(...)`，错误信息从异常对象获取。

### 陷阱 2：写文件类工具默认被重定向到系统临时目录

`take_snapshot` / `take_screenshot` 等写文件工具，在 MCP 客户端**未协商 roots capability** 时，会被服务器强制重定向到 OS 临时目录，且日志提示 `File-writing tools will be restricted to the OS temp directory`，即使你传了其它路径也不落盘。

- **修正**：启动服务器时加 `--allow-unrestricted-paths`（mcp.json 的 args 中加入），关闭默认路径限制，文件才会落到你指定的目录。
- **触发条件**：仅当客户端未实现/未协商 MCP roots 时出现；若你的客户端已协商 roots，则无需此 flag。

### 陷阱 3：`take_snapshot` 的 `filePath` 是"保存目录"，文件名固定 `snapshot.txt`

- `take_snapshot` 的 `filePath` 实为**保存目录**，文件名由工具固定为 `snapshot.txt`（会忽略你给的文件名，例如给 `snapshot.html` 也会被忽略，落为 `snapshot.txt`）。返回内容同时会回显 `Saved snapshot to <目录>/snapshot.txt`。
- `take_screenshot` 的 `filePath` 则**正确作为完整文件路径**（含文件名与扩展名，如 `shot.png`）。

- **修正**：`take_snapshot` 传 `filePath` 时只给目录（如 `D:/tmp/_cdt_out`），检查该目录下生成的 `snapshot.txt`；`take_screenshot` 传完整文件路径。

---

## 模块 8：关键约束速查（本地化红线汇总）

- 复用登录态必须 `--browserUrl` 直连已启动实例；`--isolated` 默认临时 profile 会丢登录态。
- 浏览器用 `--executablePath` 而非 `--channel`（360Chromex 不在受支持 channel 列表）。
- 依赖安装务必 `PUPPETEER_SKIP_DOWNLOAD=1`，否则 puppeteer 会下载 Chromium（部署脚本已内置）。
- **严禁 `npx -y <pkg>`**：一律用 `node "$(npm root -g)/..."` 或 `npm install -g .`；本机全局根即 `$(npm root -g)`（随 Node 安装位置而定，切勿写死绝对路径）。
- 本机中文路径会导致 node/npm 失败；跨机移植请以 ASCII 路径的主副本为准，脚本均按脚本所在目录相对解析。
- `--categoryExtensions` 仅 pipe 连接支持；`--browserUrl` 模式暂不支持扩展工具（待上游 #149）。
- 本地化段以哨兵 `LOCALIZED:360Chromex` 标记；`--strip` 再注入可刷新，直接重跑则仅保全不刷新（兜底）。
