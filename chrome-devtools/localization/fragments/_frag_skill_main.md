## 本地化用法（Windows + 360Chromex，全局安装，复用登录态，零下载）

本机已具备 360Chromex 浏览器（含登录态）。chrome-devtools-mcp 仅依赖 puppeteer-core，**不下载任何浏览器内核**。服务器**全局安装**到 `$(npm root -g)`（即 npm 全局根目录，随 Node 安装位置而定，切勿写死绝对路径），运行一律走全局 bin；本主副本文件夹保持最小化（拷贝即走，不含 node_modules/build）。

**前置**：Node.js ≥ 20.19（或 ≥ 22.12）；全局 bin 的 `node` 即系统 Node。

### 步骤 0：模式检测（MCP 服务模式 / CLI 模式 二选一，每次使用初始执行）

激活本技能后、调用任何浏览器能力之前，请**先判断当前使用模式**（不要默认 CLI，也不要默认 MCP）：

1. **检测是否已配置 MCP 服务模式**：读取 WorkBuddy 的 `~/.workbuddy/mcp.json`（或当前 Agent 的 MCP 配置），若其中已包含名为 `chrome-devtools` 的服务器条目（其 `command` 指向本全局包 bin），即视为"MCP 服务模式已安装"。
   - **若已安装 MCP 服务模式**：
     - 全程使用 MCP 工具，**禁止**走 CLI 子命令模式。
     - 询问用户："已检测到 MCP 服务模式配置。是否删除 CLI 模式相关的辅助脚本（本文件夹 `localization/cli_run.cjs`，仅 CLI 模式使用）？"
       - 用户明确回答"删除" → 删除 `localization/cli_run.cjs`（此文件仅为 CLI 模式辅助，删除不影响 MCP 模式）。
       - 用户回答"不删除"或忽略 → 保留，继续。
   - **若未检测到 MCP 服务模式**：
     - 询问用户："未检测到 MCP 服务模式。是否采用全局安装以使用 chrome-devtools CLI 模式（`npm install -g .`，位于 $(npm root -g)）？"
       - 用户明确回答"安装" → 执行 `node localization/deploy.cjs`（会全局安装并构建），随后以 CLI 模式继续（见步骤 3）。
       - 用户明确回答"不安装" → **立即终止本次任务**，不再继续任何浏览器操作。
2. 无论哪种模式，若全局 bin 不存在（未安装），均需先 `node localization/deploy.cjs` 完成全局安装与构建。

> 严禁使用 `npx -y chrome-devtools-mcp`。运行一律用 `node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"`（Windows 见下方 `for /f` 形式）。

### 步骤 1：浏览器自动检测与启动（Agent 自主执行，复用登录态，无需用户手动操作）

浏览器必须以远程调试端口运行，MCP/CLI 才能连接。本机已预置 360Chromex（含登录态）。**调用任何浏览器能力之前**，请按以下顺序由你自己（Agent）执行，不要要求用户手动敲命令：

1. **先检测端口是否已在监听**（避免重复启动导致 `user-data-dir` 锁冲突）：
   - Windows：`curl -s http://127.0.0.1:9222/json/version`
   - 若返回包含 `Browser` 字段的 JSON，说明浏览器已启动，**直接跳到步骤 2/3**。
2. **若端口无响应，自动检测并启动浏览器**：
   - 运行 `node localization/verify_browser.cjs`（自动搜索 360Chromex.exe / Chrome.exe：优先已注册安装，规避便携版；结果写入 `local-config.json`）。
   - 再运行 `node localization/start.cjs`（以 `--user-data-dir` 指向本机 User Data 启动，复用登录态）。
3. **确认就绪**：访问 `http://127.0.0.1:9222/json`，出现版本信息即成功。

> 浏览器路径与用户数据目录由 `verify_browser.cjs` 写入 `local-config.json`。注意：必须用 `--user-data-dir` 指向本机 User Data（或 `--browserUrl` 连接已运行的登录实例）以保留登录态；**切勿用 `--isolated`**（会生成临时 profile 丢登录态）。每次激活本技能都应先检测端口、仅在无响应时才启动，避免重复启动冲突。

### 步骤 2：MCP 服务模式连接（已信任 mcp.json 条目时）

MCP 服务器（stdio）配置示例（全局路径，仓库根指本主副本目录，仅作参考；实际以 `mcp-local-config.json` 为准）：

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

- 全局 bin 路径获取：
  - macOS / Linux / Git Bash：`"$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"`
  - Windows (cmd.exe)：`for /f "delims=" %i in ('npm root -g') do echo %i\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js`
  - Windows (PowerShell)：`(npm root -g) + '\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js'`
- 在 WorkBuddy 连接器管理页"信任" chrome-devtools 服务器即可使用29 个原生工具。

### 步骤 3：CLI 模式运行（二选一，未装 MCP 时使用）

直接用全局 bin 运行单工具（首参数为工具名）。各环境命令：

- macOS / Linux / Git Bash：
  ```bash
  node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" <tool> [参数] --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (cmd.exe)：
  ```bat
  for /f "delims=" %i in ('npm root -g') do node "%i\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js" <tool> [参数] --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (PowerShell)：
  ```powershell
  $g = npm root -g; node "$g/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" <tool> [参数] --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```

或等价使用 CLI 辅助脚本（仅 CLI 模式、可被删除）：`node localization/cli_run.cjs <tool> [参数]`。

例如：
```bash
node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" take_snapshot --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
```

### 核心操作速查（MCP 工具名保持英文）

- **页面/导航**：`list_pages`、`select_page`、`navigate_page --url`、`new_page`、`close_page`
- **结构/交互**：`take_snapshot`（文本快照，获取元素 `uid`）、`click <uid>`、`fill <uid> <文本>`、`hover`、`drag <src> <dst>`、`press_key`、`type_text`、`upload_file`
- **截图**：`take_screenshot`（可 `--fullPage`、`--filePath` 存盘）
- **控制台/日志**：`list_console_messages`、`get_console_message`
- **网络**：`list_network_requests`（可分页/过滤）、`get_network_request`
- **性能/内存**：`performance_start_trace` / `performance_stop_trace`（可存盘）、`performance_analyze_insight`、`take_heapsnapshot`
- **脚本**：`evaluate_script "() => document.title"`（页面执行 JS）

### 关键约束（本地化红线，任何操作不得违反）

- 复用登录态必须 `--browserUrl` 直连已启动实例；`--isolated` 默认临时 profile 会丢登录态。
- 浏览器用 `--executablePath` 而非 `--channel`（360Chromex 不在受支持 channel 列表）。
- 依赖安装务必 `PUPPETEER_SKIP_DOWNLOAD=1`，否则 puppeteer 会下载 Chromium（部署脚本已内置）。
- **严禁 `npx -y <pkg>`**：一律用 `node "$(npm root -g)/..."` 或 `npm install -g .` 全局安装；本机全局根即 `$(npm root -g)`（随 Node 安装位置而定，切勿写死绝对路径）。
- 本机中文路径会导致 node/npm 失败；跨机移植请以 ASCII 路径的主副本为准，脚本均按脚本所在目录相对解析。
- `--categoryExtensions` 仅 pipe 连接支持；`--browserUrl` 模式暂不支持扩展工具（待上游 #149）。
- 本地化段以哨兵 `LOCALIZED:360Chromex` 标记；`--strip` 再注入可刷新，直接重跑则仅保全不刷新（兜底）。
