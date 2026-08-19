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

> 严禁使用 `npx -y chrome-devtools-mcp`。MCP 服务模式用 `node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"`；CLI 模式（见步骤 3）用 `node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools.js"`（Windows 见下方 `for /f` 形式）。

### 步骤 1：浏览器自动检测与启动（Agent 自主执行，复用登录态，无需用户手动操作）

浏览器必须以远程调试端口运行，MCP/CLI 才能连接。本机已预置 360Chromex（含登录态）。**调用任何浏览器能力之前**，请按以下顺序由你自己（Agent）执行，不要要求用户手动敲命令：

1. **先检测端口是否已在监听**（避免重复启动导致 `user-data-dir` 锁冲突）：
   - Windows：`curl -s http://127.0.0.1:9222/json/version`
   - 若返回包含 `Browser` 字段的 JSON，说明浏览器已启动，**直接跳到步骤 2/3**。
2. **若端口无响应，自动检测并启动浏览器**（这两个脚本位于技能目录的 `localization/` 下；调用时**务必在技能目录内**——先 `cd` 到技能根目录，或使用脚本绝对路径如 `node "<技能根目录>/localization/verify_browser.cjs"`，**不要在非技能目录用相对路径 `node localization/...`**，否则会因找不到文件而误报"脚本缺失"）：
   - 运行 `node localization/verify_browser.cjs`（自动搜索 360Chromex.exe / Chrome.exe：优先已注册安装，规避便携版；结果写入技能目录的 `local-config.json`）。
   - 再运行 `node localization/start.cjs`（以 `--user-data-dir` 指向本机 User Data 启动，复用登录态；脚本依赖 `local-config.json` 中的浏览器路径）。
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

CLI 采用「常驻服务（daemon）+ 工具命令」两段式。首参数必须是子命令名（`start` / `status` / `stop` 或工具名）；**`--browserUrl` 与 `--no-usage-statistics` 仅属于 `start` 子命令（常驻服务的连接参数），不能跟在工具命令后面**，否则报 `Unknown argument`。

**第一段：启动常驻服务并连接浏览器**（仅需一次，之后复用；若 daemon 已在运行，`start` 会先停后启以应用新参数）：

- macOS / Linux / Git Bash：
  ```bash
  node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" start --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (cmd.exe)：
  ```bat
  for /f "delims=" %i in ('npm root -g') do node "%i\chrome-devtools-mcp\build\src\bin\chrome-devtools.js" start --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (PowerShell)：
  ```powershell
  $g = npm root -g; node "$g/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" start --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```

> 启动后可用 `chrome-devtools status`（即上面的 bin 加 `status`）核验，输出含 `pid` / `version` / `args`。前提是浏览器已以远程调试端口运行（见步骤 1）。

**第二段：调用工具**（daemon 已在运行时，工具命令直接与之通信，**不要**再带 `--browserUrl`）：

- macOS / Linux / Git Bash：
  ```bash
  node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" <tool> [参数]
  ```
- Windows (cmd.exe)：
  ```bat
  for /f "delims=" %i in ('npm root -g') do node "%i\chrome-devtools-mcp\build\src\bin\chrome-devtools.js" <tool> [参数]
  ```
- Windows (PowerShell)：
  ```powershell
  $g = npm root -g; node "$g/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" <tool> [参数]
  ```

例如（先 `start` 连接，再调用）：
```bash
node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" start --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" take_snapshot
```

或等价使用 CLI 辅助脚本（仅 CLI 模式、可被删除）：`node localization/cli_run.cjs <tool> [参数]`（`cli_run.cjs` 已封装「先 `start` 连接、再调工具」的两段式，无需手动先 start；其内部使用 CLI 入口 `chrome-devtools.js`）。

> **更新提示与遥测说明**：
> - **更新检查**：手动在终端直接运行 CLI 命令时，若未设置环境变量 `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`，程序会联网检查更新并可能打印 `Update available` 提示（属正常行为，不影响功能）。不想看到提示，运行前先导出该变量：Linux/macOS/Git Bash 用 `export CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`；Windows PowerShell 用 `$env:CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS='1'`；Windows cmd 用 `set CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`。通过 WorkBuddy 的 MCP 服务模式（步骤 2 配置已含该 env）调用时不会显示。若此前显示过且想立即消除，删除缓存文件 `~/.cache/chrome-devtools-mcp/latest.json` 即可。
> - **使用统计遥测**：`--no-usage-statistics` 是 `start` 子命令（及 MCP server）的选项，用于关闭 Google 使用统计收集；对应环境变量为 `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1`。它与上面的 `NO_UPDATE_CHECKS`（更新检查）是**两个独立开关**，变量名不可混淆（不要写 `NO_UPDATE_CHECKS`）。

### 核心操作速查（MCP 工具名保持英文）

- **页面/导航**：`list_pages`、`select_page`、`navigate_page --url`、`new_page`、`close_page`、`resize_page <宽> <高>`（调整选中页面窗口尺寸）
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
- **扩展工具（`--categoryExtensions`）**：MCP server 模式默认不含（`categoryExtensions=false`），如需扩展工具须在 mcp.json 的 args 显式加 `--categoryExtensions`；而 **CLI `start` 模式默认已启用扩展**（`start` 子命令把 `--categoryExtensions` 默认值置为 `true`），故 `start --browserUrl` 连接下扩展工具可用（如 `install_extension` / `list_extensions`）。历史上「browserUrl 模式不支持扩展」的限制（上游 #149）已在 1.6.0 的 CLI start 路径解除。
- **动用户日常浏览器需谨慎（安全红线）**：本技能经 `--browserUrl` 直连你**正在使用的**浏览器实例（复用登录态与 profile）。自动化前确认无未保存编辑；收尾用 `close_page` 关掉过程中开出的临时标签页，避免遗留干扰。优先用独立测试 profile 验证破坏性操作。
- 本地化段以哨兵 `LOCALIZED:360Chromex` 标记；`--strip` 再注入可刷新，直接重跑则仅保全不刷新（兜底）。

### 本地化补充注意（上游 prose 的本地化改写与增补）

> **全局 bin 调用参考（对应上游 "Browser lifecycle" 本地化改写——一律走 `$(npm root -g)` 全局安装，禁用 `npx -y`）**：查看全部选项：
> - macOS / Linux / Git Bash：`node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" --help`
> - Windows (cmd.exe)：`for /f "delims=" %i in ('npm root -g') do node "%i\chrome-devtools-mcp\build\src\bin\chrome-devtools.js" --help`
> - Windows (PowerShell)：`$g = npm root -g; node "$g/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" --help`
>
> 附加工具开关：扩展工具用 `--categoryExtensions`；内存调试用 `--memoryDebugging`。

> **落盘路径约束**：`take_screenshot` 等写文件工具受 daemon `--no-allow-unrestricted-paths` 约束，`--filePath` 必须落在已配置的工作区根内。若需自由路径，省略 `--filePath`，截图会落入 daemon 临时目录（如 `chrome-devtools-mcp-<random>/`），再用普通文件操作复制到目标位置。

> **校验元素可见性**：用 `evaluate_script` 判断某元素是否对用户可见时，须用 `document.elementFromPoint(cx,cy)` 命中测试回查是否命中元素或其后代；仅看 `getBoundingClientRect().width>0` / `display` / `hidden` 会被祖先 `overflow` 裁剪误导（几何存在但视觉不可见）。

> **先探测、后降级（CDP `Extensions` 域）**：运行 `list_extensions` 前先确认浏览器 CDP 是否提供 `Extensions` 域。若返回 `Extensions.getExtensions wasn't found`，说明该浏览器（常见于 360Chromex 等**定制 Chromium 构建**）裁掉了该域，此时 `install_extension` / `trigger_extension_action` / `reload_extension` 均不可用。请降级处理：用 `new_page chrome://extensions/?id=<id>` 截图证明扩展已加载启用，并在目标站点页面截图证明内容脚本注入；依赖侧边栏的交互给出手动操作流程交由用户补图。**切勿反复重试 `trigger_extension_action` 浪费时间。**

> **验证已构建扩展禁 `file://`**：验证已构建/打包的扩展必须用 `chrome-extension://<id>/...`，**严禁 `file://`** 直接打开 dist 里的 html（vite 等产物用绝对 `/assets/` 引用脚本，在 `file://` 下解析失败导致 JS 不加载、按钮全部点不动的假阳性）。
