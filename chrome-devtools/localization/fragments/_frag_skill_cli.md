## 本地化用法（Windows + 360Chromex，全局安装，复用登录态，零下载）

本仓库已本地化，可直接复用本机 360Chromex 浏览器与登录态，无需下载任何浏览器内核。服务器**全局安装**到 `$(npm root -g)`。

**步骤 1：启动浏览器调试端口（复用登录态，Agent 自主执行）**

先检测端口（9222）是否已在监听；若无响应，运行 `node localization/verify_browser.cjs` 自动检测浏览器，再 `node localization/start.cjs` 以 `--user-data-dir` 指向本机 User Data 启动（禁用 `--isolated`）。

**步骤 2：以 CLI 模式运行（全局 bin，严禁 npx -y）**

全局 bin 路径：`$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js`

- macOS / Linux / Git Bash：
  ```bash
  node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (cmd.exe)：
  ```bat
  for /f "delims=" %i in ('npm root -g') do node "%i\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js" --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (PowerShell)：
  ```powershell
  $g = npm root -g; node "$g/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```

**替代：用 --executablePath 直接拉起（会生成临时 profile，登录态不保留）**

```
node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" --executablePath="<浏览器路径>" --user-data-dir="<浏览器用户数据目录>" --no-usage-statistics
```

或等价使用 CLI 辅助脚本（仅 CLI 模式、可被删除）：`node localization/cli_run.cjs <tool> [参数]`。

**约束**

- 360Chromex 须用 `--executablePath` 指定，不能用 `--channel`（官方仅识别 chrome / canary / edge 等）。
- `--isolated` 默认 `true`，会生成临时 profile 并丢失登录态；要复用登录态必须走 `--browserUrl` 直连已启动实例。
- `--categoryExtensions`（外部扩展）仅 pipe 连接支持，`--browserUrl` 模式暂不支持（待上游 issue #149）。
- `--no-usage-statistics` 关闭遥测。
- 严禁 `npx -y`：一律 `node "$(npm root -g)/..."` 或 `npm install -g .` 全局安装。
